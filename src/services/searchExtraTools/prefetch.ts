import type { Attachment } from '../../utils/attachments.js'
import type { Message } from '../../types/message.js'
import type { Tools } from '../../Tool.js'
import {
  getToolIndex,
  searchTools,
  type SearchExtraToolsResult,
} from './toolIndex.js'
import { logForDebugging } from '../../utils/debug.js'
import { extractQueryFromMessages } from '../skillSearch/prefetch.js'

export type ToolDiscoveryResult = {
  name: string
  description: string
  searchHint: string | undefined
  score: number
  isMcp: boolean
  isDeferred: boolean
  inputSchema: object | undefined
}

const SESSION_TRACKING_MAX = 500
const SESSION_TRACKING_TRIM_TO = 400
const discoveredToolsThisSession = new Set<string>()

// Latest prefetch result for UI subscription (useSyncExternalStore)
let latestPrefetchResult: ToolDiscoveryResult[] = []
const prefetchListeners = new Set<() => void>()

function notifyPrefetchListeners(): void {
  for (const listener of prefetchListeners) listener()
}

export function subscribeToSearchExtraToolsPrefetch(
  listener: () => void,
): () => void {
  prefetchListeners.add(listener)
  return () => {
    prefetchListeners.delete(listener)
  }
}

export function getSearchExtraToolsPrefetchSnapshot(): ToolDiscoveryResult[] {
  return latestPrefetchResult
}

export function clearSearchExtraToolsPrefetchResults(): void {
  latestPrefetchResult = []
  notifyPrefetchListeners()
}

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

function toDiscoveryResult(r: SearchExtraToolsResult): ToolDiscoveryResult {
  return {
    name: r.name,
    description: r.description,
    searchHint: r.searchHint,
    score: r.score,
    isMcp: r.isMcp,
    isDeferred: r.isDeferred,
    inputSchema: r.inputSchema,
  }
}

export function buildToolDiscoveryAttachment(
  tools: ToolDiscoveryResult[],
  trigger: 'assistant_turn' | 'user_input',
  queryText: string,
  durationMs: number,
  indexSize: number,
): Attachment {
  return {
    type: 'tool_discovery',
    tools,
    trigger,
    queryText: queryText.slice(0, 200),
    durationMs,
    indexSize,
  } as Attachment
}

export async function startSearchExtraToolsPrefetch(
  tools: Tools,
  messages: Message[],
): Promise<Attachment[]> {
  const startedAt = Date.now()
  const queryText = extractQueryFromMessages(null, messages)
  if (!queryText.trim()) return []

  try {
    const index = await getToolIndex(tools)
    const results = searchTools(queryText, index, 3)

    const newResults = results.filter(
      r => !discoveredToolsThisSession.has(r.name),
    )
    if (newResults.length === 0) return []

    for (const r of newResults)
      addBoundedSessionEntry(discoveredToolsThisSession, r.name)

    const durationMs = Date.now() - startedAt
    logForDebugging(
      `[search-extra-tools] prefetch found ${newResults.length} tools in ${durationMs}ms`,
    )

    const discoveryResults = newResults.map(toDiscoveryResult)
    latestPrefetchResult = discoveryResults
    notifyPrefetchListeners()

    return [
      buildToolDiscoveryAttachment(
        discoveryResults,
        'assistant_turn',
        queryText,
        durationMs,
        index.length,
      ),
    ]
  } catch (error) {
    logForDebugging(`[search-extra-tools] prefetch error: ${error}`)
    return []
  }
}

export async function getTurnZeroSearchExtraToolsPrefetch(
  _input: string,
  _tools: Tools,
): Promise<Attachment | null> {
  // Disabled: turn-zero user-input tool recommendations caused frequent
  // popups. Inter-turn discovery (startSearchExtraToolsPrefetch) is still
  // active and provides non-intrusive suggestions during assistant turns.
  return null
}

export async function collectSearchExtraToolsPrefetch(
  pending: Promise<Attachment[]>,
): Promise<Attachment[]> {
  try {
    return await pending
  } catch {
    return []
  }
}
