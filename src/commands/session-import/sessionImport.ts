import { randomUUID, type UUID } from 'crypto'
import { mkdir, stat, writeFile } from 'fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { getOriginalCwd } from '../../bootstrap/state.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import type {
  ContentReplacementEntry,
  LogOption,
  SerializedMessage,
  TranscriptMessage,
} from '../../types/logs.js'
import {
  buildConversationChain,
  getProjectDir,
  getTranscriptPathForSession,
  loadTranscriptFile,
  saveCustomTitle,
  searchSessionsByCustomTitle,
} from '../../utils/sessionStorage.js'
import type { ContentReplacementRecord } from '../../utils/toolResultStorage.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { escapeRegExp } from '../../utils/stringUtils.js'

type ImportedTranscriptEntry = TranscriptMessage & {
  importedFrom?: {
    path: string
  }
}

// The compact summary embeds the transcript path captured at compact time
// ("read the full transcript at: <path>"). The import carries the full
// pre-compact chain, so repoint the hint at the imported file — the original
// absolute path is usually dead on another machine (and 30-day cleanup can
// remove it even on the same one). Path runs to end of line because the
// suffixes appended after it (e.g. "Recent messages are preserved verbatim.")
// always start on a new line.
const COMPACT_TRANSCRIPT_PATH_RE = /read the full transcript at: [^\n]+/g

function rewriteCompactSummaryPath(
  entry: TranscriptMessage,
  importPath: string,
): TranscriptMessage {
  const message = entry.message
  if (!message) return entry
  const rewrite = (text: string): string =>
    text.replace(
      COMPACT_TRANSCRIPT_PATH_RE,
      `read the full transcript at: ${importPath}`,
    )
  let content = message.content
  if (typeof content === 'string') {
    content = rewrite(content)
  } else if (Array.isArray(content)) {
    content = content.map(block =>
      block && typeof block === 'object' && block.type === 'text'
        ? { ...block, text: rewrite(block.text) }
        : block,
    )
  } else {
    return entry
  }
  return { ...entry, message: { ...message, content } }
}

function resolveSourcePath(raw: string): string {
  const expanded =
    raw === '~' || raw.startsWith('~/') ? join(homedir(), raw.slice(1)) : raw
  return resolve(getOriginalCwd(), expanded)
}

/**
 * Derive a single-line title base from the first user message.
 * Collapses whitespace — multiline first messages (pasted stacks, code)
 * otherwise flow into the saved title and break the resume hint.
 */
function deriveFirstPrompt(
  firstUserMessage: Extract<SerializedMessage, { type: 'user' }> | undefined,
): string {
  const content = (firstUserMessage as any)?.message?.content
  if (!content) return 'Imported conversation'
  const raw =
    typeof content === 'string'
      ? content
      : content.find(
          (block: {
            type: string
            text?: string
          }): block is { type: 'text'; text: string } => block.type === 'text',
        )?.text
  if (!raw) return 'Imported conversation'
  return (
    raw.replace(/\s+/g, ' ').trim().slice(0, 100) || 'Imported conversation'
  )
}

/**
 * Imports a conversation from an external JSONL transcript as a new session
 * in the current project dir.
 *
 * Unlike /branch (which copies every main-chain entry in file order and
 * re-threads parentUuid linearly), this walks the ACTIVE chain — newest
 * non-sidechain leaf back via parentUuid — so rewind/branch dead branches in
 * the source file are dropped, and parallel tool_use DAG structure is
 * preserved. Original uuid/parentUuid are kept (self-consistent within the
 * chain); only sessionId is rewritten to the fresh import id, which avoids
 * collisions when the source session already exists on this machine.
 */
export async function sessionImport(sourcePath: string): Promise<{
  sessionId: UUID
  importPath: string
  serializedMessages: SerializedMessage[]
  contentReplacementRecords: ContentReplacementRecord[]
}> {
  const resolvedPath = resolveSourcePath(sourcePath)
  try {
    await stat(resolvedPath)
  } catch {
    throw new Error(`File not found: ${resolvedPath}`)
  }

  const { messages, leafUuids, contentReplacements } =
    await loadTranscriptFile(resolvedPath)

  // Newest non-sidechain leaf = the live conversation tip. Dead-branch tips
  // are also leaves, but a rewind always writes the continuation afterwards,
  // so the newest timestamp wins. Same walk as loadMessagesFromJsonlPath.
  let tip: TranscriptMessage | null = null
  let tipTs = 0
  for (const m of messages.values()) {
    if (m.isSidechain || !leafUuids.has(m.uuid)) continue
    const ts = new Date(m.timestamp).getTime()
    if (ts > tipTs) {
      tipTs = ts
      tip = m
    }
  }
  if (!tip) throw new Error('No messages to import')

  const chain = buildConversationChain(messages, tip)
  const replacementRecords = [...contentReplacements.values()].flat()

  const importSessionId = randomUUID() as UUID
  const projectDir = getProjectDir(getOriginalCwd())
  const importPath = getTranscriptPathForSession(importSessionId)

  await mkdir(projectDir, { recursive: true, mode: 0o700 })

  const lines: string[] = []
  const serializedMessages: SerializedMessage[] = []

  for (const [index, entry] of chain.entries()) {
    const rewritten =
      entry.type === 'user' && entry.isCompactSummary
        ? rewriteCompactSummaryPath(entry, importPath)
        : entry
    const importedEntry: ImportedTranscriptEntry = {
      ...rewritten,
      sessionId: importSessionId,
      isSidechain: false,
      ...(index === 0 ? { importedFrom: { path: resolvedPath } } : {}),
    }
    serializedMessages.push({ ...rewritten, sessionId: importSessionId })
    lines.push(jsonStringify(importedEntry))
  }

  // Content-replacement entries record which tool_result blocks were replaced
  // with previews by the per-message budget. Without them, resume reconstructs
  // state with an empty replacements Map → previously-replaced results are
  // classified as FROZEN and sent as full content (prompt cache miss +
  // permanent overage). Written as a SINGLE entry so loadTranscriptFile's
  // content-replacement branch picks it up.
  if (replacementRecords.length > 0) {
    const replacementEntry: ContentReplacementEntry = {
      type: 'content-replacement',
      sessionId: importSessionId,
      replacements: replacementRecords,
    }
    lines.push(jsonStringify(replacementEntry))
  }

  await writeFile(importPath, lines.join('\n') + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  })

  return {
    sessionId: importSessionId,
    importPath,
    serializedMessages,
    contentReplacementRecords: replacementRecords,
  }
}

/**
 * Generates a unique import name by checking for collisions with existing
 * session names. If "baseName (Imported)" already exists, tries
 * "baseName (Imported 2)", "baseName (Imported 3)", etc.
 */
async function getUniqueImportName(baseName: string): Promise<string> {
  const candidateName = `${baseName} (Imported)`

  const existingWithExactName = await searchSessionsByCustomTitle(
    candidateName,
    { exact: true },
  )
  if (existingWithExactName.length === 0) {
    return candidateName
  }

  const existingImports = await searchSessionsByCustomTitle(
    `${baseName} (Imported`,
  )
  const usedNumbers = new Set<number>([1])
  const importNumberPattern = new RegExp(
    `^${escapeRegExp(baseName)} \\(Imported(?: (\\d+))?\\)$`,
  )
  for (const session of existingImports) {
    const match = session.customTitle?.match(importNumberPattern)
    if (match) {
      if (match[1]) {
        usedNumbers.add(parseInt(match[1], 10))
      } else {
        usedNumbers.add(1)
      }
    }
  }

  let nextNumber = 2
  while (usedNumbers.has(nextNumber)) {
    nextNumber++
  }
  return `${baseName} (Imported ${nextNumber})`
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const sourcePath = args?.trim()

  if (!sourcePath) {
    onDone(
      [
        'Usage: /session-import <path-to-jsonl>',
        '',
        'Imports a conversation transcript (e.g. a session file copied from ~/.claude/projects)',
        'as a new session and continues it.',
      ].join('\n'),
    )
    return null
  }

  try {
    const {
      sessionId,
      importPath,
      serializedMessages,
      contentReplacementRecords,
    } = await sessionImport(sourcePath)

    const now = new Date()
    const firstPrompt = deriveFirstPrompt(
      serializedMessages.find(m => m.type === 'user') as
        | Extract<SerializedMessage, { type: 'user' }>
        | undefined,
    )

    // Title the imported session so /status and /resume show the same name.
    // " (Imported)" suffix marks provenance; numbered suffix resolves collisions.
    const effectiveTitle = await getUniqueImportName(firstPrompt)
    await saveCustomTitle(sessionId, effectiveTitle, importPath)

    logEvent('tengu_conversation_imported', {
      message_count: serializedMessages.length,
    })

    const importLog: LogOption = {
      date: now.toISOString().split('T')[0]!,
      messages: serializedMessages,
      fullPath: importPath,
      value: now.getTime(),
      created: now,
      modified: now,
      firstPrompt,
      messageCount: serializedMessages.length,
      isSidechain: false,
      sessionId,
      customTitle: effectiveTitle,
      contentReplacements: contentReplacementRecords,
    }

    const successMessage = `Imported ${serializedMessages.length} messages. You are now in the imported session.\nTo resume later: claude -r ${sessionId}`

    if (context.resume) {
      await context.resume(sessionId, importLog, 'fork')
      onDone(successMessage, { display: 'system' })
    } else {
      onDone(
        `Imported ${serializedMessages.length} messages. Resume with: /resume ${sessionId}`,
      )
    }
    return null
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred'
    onDone(`Failed to import conversation: ${message}`)
    return null
  }
}
