/**
 * Context Collapse — span-based message compression for long conversations.
 *
 * Instead of rewriting the entire conversation (like compact), context collapse
 * identifies and compresses individual message spans. The REPL keeps the full
 * history; projectView() replays the commit log to produce a compressed view
 * that the API sees.
 *
 * Lifecycle:
 *   1. Stage: mark a span (startUuid→endUuid) for potential collapse
 *   2. Commit: generate summary, record the collapse
 *   3. projectView: on every query, replace committed spans with summaries
 *   4. persist: serialize commit log + staged queue to session transcript
 */
import type { Message } from '../../types/message.js'
import type { ToolUseContext } from '../../Tool.js'
import type { QuerySource } from '../../constants/querySource.js'
import { logForDebugging } from '../../utils/debug.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextCollapseHealth {
  totalSpawns: number
  totalErrors: number
  lastError: string | null
  emptySpawnWarningEmitted: boolean
  totalEmptySpawns: number
}

export interface ContextCollapseStats {
  collapsedSpans: number
  collapsedMessages: number
  stagedSpans: number
  health: ContextCollapseHealth
}

export interface CollapseResult {
  messages: Message[]
}

export interface DrainResult {
  committed: number
  messages: Message[]
}

interface CommittedCollapse {
  collapseId: string
  summaryUuid: string
  summaryContent: string
  summary: string
  firstArchivedUuid: string
  lastArchivedUuid: string
  archived: Message[]
}

interface StagedSpan {
  startUuid: string
  endUuid: string
  summary: string
  risk: number
  stagedAt: number
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let commitLog: CommittedCollapse[] = []
let stagedQueue: StagedSpan[] = []
let enabled = false
let nextCollapseId = 1
const subscribers = new Set<() => void>()

const health: ContextCollapseHealth = {
  totalSpawns: 0,
  totalErrors: 0,
  lastError: null,
  emptySpawnWarningEmitted: false,
  totalEmptySpawns: 0,
}

function notify(): void {
  for (const cb of subscribers) {
    try {
      cb()
    } catch {
      // subscriber errors must not crash the collapse engine
    }
  }
}

function generateCollapseId(): string {
  return String(nextCollapseId++).padStart(16, '0')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getStats(): ContextCollapseStats {
  let collapsedMessages = 0
  for (const c of commitLog) {
    collapsedMessages += c.archived.length
  }
  return {
    collapsedSpans: commitLog.length,
    collapsedMessages,
    stagedSpans: stagedQueue.length,
    health: { ...health },
  }
}

export function isContextCollapseEnabled(): boolean {
  return enabled
}

export function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

/**
 * Apply committed collapses to the message array and optionally commit
 * staged spans if token pressure is high enough.
 *
 * This is the main entry point called from query.ts before each API call.
 */
export async function applyCollapsesIfNeeded(
  messages: Message[],
  _toolUseContext: ToolUseContext,
  _querySource: QuerySource,
): Promise<CollapseResult> {
  if (!enabled || commitLog.length === 0) {
    return { messages }
  }

  const projected = projectMessages(messages)
  return { messages: projected }
}

/**
 * Check if a message is a withheld prompt-too-long that was collapsed.
 */
export function isWithheldPromptTooLong(
  _message: Message,
  _isPromptTooLongMessage: (msg: Message) => boolean,
  _querySource: QuerySource,
): boolean {
  // In the current implementation, we don't withhold prompt-too-long
  // messages through collapse — they go through the normal overflow path.
  return false
}

/**
 * Emergency drain: commit all staged spans immediately to recover from
 * a context overflow. Called when the API returns prompt_too_long.
 */
export function recoverFromOverflow(
  messages: Message[],
  _querySource: QuerySource,
): DrainResult {
  if (stagedQueue.length === 0) {
    return { committed: 0, messages }
  }

  const committed = commitStagedSpans(messages)
  const projected = projectMessages(messages)
  notify()

  return { committed, messages: projected }
}

export function resetContextCollapse(): void {
  commitLog = []
  stagedQueue = []
  nextCollapseId = 1
  health.totalSpawns = 0
  health.totalErrors = 0
  health.lastError = null
  health.emptySpawnWarningEmitted = false
  health.totalEmptySpawns = 0
  notify()
  logForDebugging('ContextCollapse: reset')
}

export function initContextCollapse(): void {
  enabled = true
  logForDebugging('ContextCollapse: initialized')
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Project committed collapses onto a message array: replace archived spans
 * with their summary placeholder messages.
 */
function projectMessages(messages: Message[]): Message[] {
  if (commitLog.length === 0) return messages

  // Build a set of archived UUIDs for O(1) lookup
  const archivedUuids = new Set<string>()
  const summaryInsertPoints = new Map<
    string,
    { summary: string; summaryContent: string; summaryUuid: string }
  >()

  for (const commit of commitLog) {
    // Find the span in the messages
    let inSpan = false
    for (const msg of messages) {
      const uuid = (msg as Record<string, unknown>).uuid as string | undefined
      if (!uuid) continue

      if (uuid === commit.firstArchivedUuid) {
        inSpan = true
        // Insert summary before the first archived message
        summaryInsertPoints.set(uuid, {
          summary: commit.summary,
          summaryContent: commit.summaryContent,
          summaryUuid: commit.summaryUuid,
        })
      }

      if (inSpan) {
        archivedUuids.add(uuid)
        commit.archived.push(msg)
      }

      if (uuid === commit.lastArchivedUuid) {
        inSpan = false
        break
      }
    }
  }

  // Build projected view: skip archived messages, insert summaries
  const result: Message[] = []
  for (const msg of messages) {
    const uuid = (msg as Record<string, unknown>).uuid as string | undefined
    if (uuid && summaryInsertPoints.has(uuid)) {
      const info = summaryInsertPoints.get(uuid)!
      // Insert a system-like summary message
      result.push({
        type: 'assistant',
        uuid: info.summaryUuid,
        content: [{ type: 'text', text: info.summaryContent }],
        role: 'assistant',
        costUSD: 0,
        durationMs: 0,
        model: '',
      } as unknown as Message)
    }
    if (uuid && archivedUuids.has(uuid)) {
      continue // Skip archived messages
    }
    result.push(msg)
  }

  return result
}

/**
 * Commit all currently staged spans, producing collapse entries.
 */
function commitStagedSpans(messages: Message[]): number {
  let committed = 0
  for (const span of stagedQueue) {
    const collapseId = generateCollapseId()
    const summaryUuid = `collapse-summary-${collapseId}`
    const summaryContent = `<collapsed id="${collapseId}">${span.summary}</collapsed>`

    commitLog.push({
      collapseId,
      summaryUuid,
      summaryContent,
      summary: span.summary,
      firstArchivedUuid: span.startUuid,
      lastArchivedUuid: span.endUuid,
      archived: [],
    })
    committed++
    logForDebugging(
      `ContextCollapse: committed span ${span.startUuid}→${span.endUuid} as ${collapseId}`,
    )
  }
  stagedQueue = []
  return committed
}

// ---------------------------------------------------------------------------
// Exports for persist.ts and operations.ts
// ---------------------------------------------------------------------------

export function _getCommitLog(): readonly CommittedCollapse[] {
  return commitLog
}

export function _getStagedQueue(): readonly StagedSpan[] {
  return stagedQueue
}

export function _restoreState(
  commits: CommittedCollapse[],
  staged: StagedSpan[],
  maxId: number,
): void {
  commitLog = commits
  stagedQueue = staged
  nextCollapseId = maxId + 1
  enabled = true
  notify()
}
