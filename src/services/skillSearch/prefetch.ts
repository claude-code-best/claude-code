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
import { normalizeQueryIntent } from './intentNormalize.js'
import { logForDebugging } from '../../utils/debug.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseFrontmatter } from '../../utils/frontmatterParser.js'

/**
 * Per-session memoization to avoid re-emitting the same skill discovery /
 * gap signal twice. Each Set is bounded to keep long-running sessions from
 * monotonically accumulating skill names and signal keys forever (which
 * was the original session-scoped-but-unbounded design).
 *
 * FIFO eviction by insertion order — once the cap is hit, the oldest
 * entries roll off and may be re-recorded if rediscovered, which is the
 * correct degraded behaviour: at worst we re-emit a duplicate signal,
 * never silently drop a real one.
 */
const SESSION_TRACKING_MAX = 1000
const SESSION_TRACKING_TRIM_TO = 750
const discoveredThisSession = new Set<string>()
const recordedGapSignals = new Set<string>()

function addBoundedSessionEntry(set: Set<string>, value: string): void {
  set.add(value)
  if (set.size > SESSION_TRACKING_MAX) {
    const toDrop = set.size - SESSION_TRACKING_TRIM_TO
    const iter = set.values()
    for (let i = 0; i < toDrop; i++) {
      const next = iter.next()
      if (next.done) break
      set.delete(next.value)
    }
  }
}

const AUTO_LOAD_MIN_SCORE = Number(
  process.env.SKILL_SEARCH_AUTOLOAD_MIN_SCORE ?? '0.30',
)
const AUTO_LOAD_LIMIT = Number(process.env.SKILL_SEARCH_AUTOLOAD_LIMIT ?? '2')
const AUTO_LOAD_MAX_CHARS = Number(
  process.env.SKILL_SEARCH_AUTOLOAD_MAX_CHARS ?? '12000',
)

export function extractQueryFromMessages(
  input: string | null,
  messages: Message[],
): string {
  const parts: string[] = []

  if (input) parts.push(input)

  // Walk backward. In inter-turn prefetch the most recent 'user' message is
  // typically a tool_result (no text block), so we must keep walking until we
  // find a real user utterance with string content or a text block.
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>
    if (msg.type !== 'user') continue
    const content = msg.content
    if (typeof content === 'string') {
      parts.push(content.slice(0, 500))
      break
    }
    if (Array.isArray(content)) {
      let foundText = false
      for (const block of content) {
        const entry = block as Record<string, unknown>
        // Skip tool_result and other non-text blocks — they carry no discovery
        // signal and would return undefined here regardless.
        if (entry.type && entry.type !== 'text') continue
        const text = entry.text
        if (typeof text === 'string' && text.trim()) {
          parts.push(text.slice(0, 500))
          foundText = true
          break
        }
      }
      if (foundText) break
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
  status: 'pending' | 'draft' | 'active'
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
        content: parseFrontmatter(raw).content.slice(0, AUTO_LOAD_MAX_CHARS),
      }
    } catch {
      // Try next candidate.
    }
  }
  return null
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
    // Best effort only.
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
  addBoundedSessionEntry(recordedGapSignals, gapSignalKey)

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
    const status = gap.status
    if (status !== 'pending' && status !== 'draft' && status !== 'active') {
      return undefined
    }
    return {
      key: gap.key,
      status,
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

    const newResults = results.filter(r => !discoveredThisSession.has(r.name))
    if (newResults.length === 0) return []

    for (const r of newResults)
      addBoundedSessionEntry(discoveredThisSession, r.name)

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

    return [
      buildDiscoveryAttachment(
        await enrichResultsForAutoLoad(newResults, toolUseContext),
        signal,
      ),
    ]
  } catch (error) {
    logForDebugging(`[skill-search] prefetch error: ${error}`)
    return []
  }
}

export async function collectSkillDiscoveryPrefetch(
  pending: Promise<Attachment[]>,
): Promise<Attachment[]> {
  try {
    return await pending
  } catch {
    return []
  }
}

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
    // Intent normalization (feature-flagged, ASCII-only fast path, graceful
    // fallback to original). Turn-zero is the one blocking entry — acceptable
    // to add a Haiku call here since a bad match here pollutes the LLM's
    // context for the entire session.
    const searchQuery = await normalizeQueryIntent(input)
    const results = searchSkills(searchQuery, index)
    const enriched = await enrichResultsForAutoLoad(results, context)
    const gap = enriched.some(result => result.autoLoaded)
      ? undefined
      : await maybeRecordSkillGap(input, results, context, 'user_input')

    if (results.length === 0 && !gap) return null

    for (const r of results)
      addBoundedSessionEntry(discoveredThisSession, r.name)

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
