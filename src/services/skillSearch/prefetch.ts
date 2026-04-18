/**
 * Skill Search Prefetch — auto-discovery pipeline.
 *
 * Runs alongside API calls to discover relevant skills without blocking
 * the main query loop. Results are injected as 'skill_discovery' attachments.
 */
import type { Attachment } from '../../utils/attachments.js'
import type { Message } from '../../types/message.js'
import type { ToolUseContext } from '../../Tool.js'
import type { DiscoverySignal } from './signals.js'
import { isSkillSearchEnabled } from './featureCheck.js'
import {
  getSkillIndex,
  searchSkills,
  type SearchResult,
} from './localSearch.js'
import { logForDebugging } from '../../utils/debug.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Track skills already discovered this session to avoid repeats
const discoveredThisSession = new Set<string>()
const recordedGapSignals = new Set<string>()

const AUTO_LOAD_MIN_SCORE = Number(
  process.env.SKILL_SEARCH_AUTOLOAD_MIN_SCORE ?? '0.18',
)
const AUTO_LOAD_LIMIT = Number(process.env.SKILL_SEARCH_AUTOLOAD_LIMIT ?? '2')
const AUTO_LOAD_MAX_CHARS = Number(
  process.env.SKILL_SEARCH_AUTOLOAD_MAX_CHARS ?? '12000',
)

/**
 * Extract query text from recent messages for skill matching.
 */
function extractQueryFromMessages(
  input: string | null,
  messages: Message[],
): string {
  const parts: string[] = []

  if (input) parts.push(input)

  // Last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>
    if (msg.type === 'user') {
      const content = msg.content
      if (typeof content === 'string') {
        parts.push(content.slice(0, 500))
      } else if (Array.isArray(content)) {
        for (const block of content) {
          const text = (block as Record<string, unknown>).text
          if (typeof text === 'string') {
            parts.push(text.slice(0, 500))
            break
          }
        }
      }
      break
    }
  }

  return parts.join(' ')
}

function buildDiscoveryAttachment(
  skills: SkillDiscoveryResult[],
  signal: DiscoverySignal,
  gap?: SkillDiscoveryGap,
): Attachment {
  return {
    type: 'skill_discovery',
    skills,
    signal,
    source: 'native',
    gap,
  } as Attachment
}

type SkillDiscoveryResult = {
  name: string
  description: string
  shortId?: string
  score?: number
  autoLoaded?: boolean
  content?: string
  path?: string
}

type SkillDiscoveryGap = {
  key: string
  status: 'pending' | 'draft' | 'active' | 'rejected'
  draftName?: string
  draftPath?: string
  activeName?: string
  activePath?: string
}

async function enrichResultsForAutoLoad(
  results: SearchResult[],
  context: ToolUseContext,
): Promise<SkillDiscoveryResult[]> {
  let loadedCount = 0
  const enriched: SkillDiscoveryResult[] = []

  for (const result of results) {
    const base: SkillDiscoveryResult = {
      name: result.name,
      description: result.description,
      score: result.score,
    }

    if (loadedCount >= AUTO_LOAD_LIMIT || result.score < AUTO_LOAD_MIN_SCORE) {
      enriched.push(base)
      continue
    }

    const loaded = await loadSkillContent(result)
    if (!loaded) {
      enriched.push(base)
      continue
    }

    loadedCount++
    await markAutoLoadedSkill(result.name, loaded.path, loaded.content, context)
    await maybeRecordDraftHit(loaded.path, context)
    enriched.push({
      ...base,
      autoLoaded: true,
      content: loaded.content,
      path: loaded.path,
    })
  }

  return enriched
}

async function loadSkillContent(
  result: SearchResult,
): Promise<{ path: string; content: string } | null> {
  if (!result.skillRoot) return null

  const candidates = [
    join(result.skillRoot, 'SKILL.md'),
    join(result.skillRoot, 'skill.md'),
  ]

  for (const path of candidates) {
    try {
      const raw = await readFile(path, 'utf8')
      return {
        path,
        content: stripFrontmatter(raw).slice(0, AUTO_LOAD_MAX_CHARS),
      }
    } catch {
      // Try next candidate.
    }
  }
  return null
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content
  const end = content.indexOf('\n---', 3)
  if (end < 0) return content
  return content.slice(end + 4).trimStart()
}

async function markAutoLoadedSkill(
  name: string,
  path: string,
  content: string,
  context: ToolUseContext,
): Promise<void> {
  try {
    const { addInvokedSkill } = await import('../../bootstrap/state.js')
    addInvokedSkill(name, path, content, context.agentId ?? null)
  } catch {
    // Best effort only. The attachment still carries the loaded content.
  }
}

function isDraftSkillPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return normalized.includes('/.claude/skills/.drafts/')
}

async function maybeRecordDraftHit(
  skillPath: string,
  context: ToolUseContext,
): Promise<void> {
  if (!isDraftSkillPath(skillPath)) return
  try {
    const [{ isSkillLearningEnabled }, gapStore, projectCtx] =
      await Promise.all([
        import('../skillLearning/featureCheck.js'),
        import('../skillLearning/skillGapStore.js'),
        import('../skillLearning/projectContext.js'),
      ])
    if (!isSkillLearningEnabled()) return
    const cwd =
      ((context as Record<string, unknown>).cwd as string) ?? process.cwd()
    const project = projectCtx.resolveProjectContext(cwd)
    const rootDir = process.env.CLAUDE_SKILL_LEARNING_HOME
    const key = await gapStore.findGapKeyByDraftPath(
      skillPath,
      project,
      rootDir,
    )
    if (!key) return
    const sessionId =
      ((context as Record<string, unknown>).sessionId as string) ??
      'unknown-session'
    await gapStore.recordDraftHit(key, project, rootDir, sessionId)
  } catch (error) {
    logForDebugging(`[skill-search] draft hit recording error: ${error}`)
  }
}

async function maybeRecordSkillGap(
  queryText: string,
  results: SearchResult[],
  context: ToolUseContext,
  trigger: DiscoverySignal['trigger'],
): Promise<SkillDiscoveryGap | undefined> {
  if (trigger !== 'user_input') return undefined
  if (!queryText.trim()) return undefined

  const gapSignalKey = `${trigger}:${queryText.trim().toLowerCase()}`
  if (recordedGapSignals.has(gapSignalKey)) return undefined
  recordedGapSignals.add(gapSignalKey)

  try {
    const [{ isSkillLearningEnabled }, { recordSkillGap }] = await Promise.all([
      import('../skillLearning/featureCheck.js'),
      import('../skillLearning/skillGapStore.js'),
    ])
    if (!isSkillLearningEnabled()) return undefined
    const gap = await recordSkillGap({
      prompt: queryText,
      cwd:
        ((context as Record<string, unknown>).cwd as string) ?? process.cwd(),
      sessionId:
        ((context as Record<string, unknown>).sessionId as string) ??
        'unknown-session',
      recommendations: results,
    })
    return {
      key: gap.key,
      status: gap.status,
      draftName: gap.draft?.name,
      draftPath: gap.draft?.skillPath,
      activeName: gap.active?.name,
      activePath: gap.active?.skillPath,
    }
  } catch (error) {
    logForDebugging(`[skill-search] skill gap learning error: ${error}`)
    return undefined
  }
}

/**
 * Start skill discovery prefetch — runs in parallel with API call.
 * Called from query.ts before streaming begins.
 */
export async function startSkillDiscoveryPrefetch(
  input: string | null,
  messages: Message[],
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (!isSkillSearchEnabled()) return []

  const startedAt = Date.now()
  const queryText = extractQueryFromMessages(input, messages)
  if (!queryText.trim()) return []

  try {
    const cwd =
      ((toolUseContext as Record<string, unknown>).cwd as string) ??
      process.cwd()
    const index = await getSkillIndex(cwd)
    const results = searchSkills(queryText, index)

    // Filter out already-discovered skills
    const newResults = results.filter(r => !discoveredThisSession.has(r.name))
    if (newResults.length === 0) return []

    // Mark as discovered
    for (const r of newResults) discoveredThisSession.add(r.name)

    const signal: DiscoverySignal = {
      trigger: 'assistant_turn',
      queryText: queryText.slice(0, 200),
      startedAt,
      durationMs: Date.now() - startedAt,
      indexSize: index.length,
      method: 'tfidf',
    }

    logForDebugging(
      `[skill-search] prefetch found ${newResults.length} skills in ${signal.durationMs}ms`,
    )

    const enriched = await enrichResultsForAutoLoad(newResults, toolUseContext)
    // If later-turn prefetch found no auto-loadable match, that is still a
    // legitimate gap — the assistant is trying to do something the current
    // skill set doesn't directly cover. Record it with the user_input trigger
    // so the gap-state-machine can observe repetition over turns (codex
    // review Q1 follow-up). Turn-zero already records via a separate path.
    const anyAutoLoaded = enriched.some(result => result.autoLoaded)
    const gap = anyAutoLoaded
      ? undefined
      : await maybeRecordSkillGap(
          queryText,
          results,
          toolUseContext,
          'user_input',
        )

    return [buildDiscoveryAttachment(enriched, signal, gap)]
  } catch (error) {
    logForDebugging(`[skill-search] prefetch error: ${error}`)
    return []
  }
}

/**
 * Collect prefetch results — await the pending promise, swallow errors.
 * Called from query.ts after tool calls.
 */
export async function collectSkillDiscoveryPrefetch(
  pending: Promise<Attachment[]>,
): Promise<Attachment[]> {
  try {
    return await pending
  } catch {
    return []
  }
}

/**
 * Turn-zero skill discovery — analyze initial user input.
 * Called from attachments.ts for the first message.
 */
export async function getTurnZeroSkillDiscovery(
  input: string,
  messages: Message[],
  context: ToolUseContext,
): Promise<Attachment | null> {
  if (!isSkillSearchEnabled()) return null
  if (!input.trim()) return null

  const startedAt = Date.now()

  try {
    const cwd =
      ((context as Record<string, unknown>).cwd as string) ?? process.cwd()
    const index = await getSkillIndex(cwd)
    const results = searchSkills(input, index)
    const enriched = await enrichResultsForAutoLoad(results, context)
    const gap = enriched.some(result => result.autoLoaded)
      ? undefined
      : await maybeRecordSkillGap(input, results, context, 'user_input')

    if (results.length === 0 && !gap) return null

    for (const r of results) discoveredThisSession.add(r.name)

    const signal: DiscoverySignal = {
      trigger: 'user_input',
      queryText: input.slice(0, 200),
      startedAt,
      durationMs: Date.now() - startedAt,
      indexSize: index.length,
      method: 'tfidf',
    }

    logForDebugging(
      `[skill-search] turn-zero found ${results.length} skills in ${signal.durationMs}ms`,
    )

    return buildDiscoveryAttachment(enriched, signal, gap)
  } catch (error) {
    logForDebugging(`[skill-search] turn-zero error: ${error}`)
    return null
  }
}
