/**
 * Snip Compaction — user-driven message pruning.
 *
 * A "snip" removes messages before a snip_boundary from the model-facing view.
 * The REPL keeps full history for scrollback; the model only sees messages
 * after the most recent snip boundary.
 *
 * Flow:
 *   1. User runs /force-snip → inserts a snip_boundary system message
 *   2. Next query → snipCompactIfNeeded detects boundary → strips old messages
 *   3. projectSnippedView filters the view for context counting
 */
import { feature } from 'bun:bundle'
import type { Message } from 'src/types/message'
import { logForDebugging } from 'src/utils/debug.js'

/**
 * Check if a message is a snip marker (the boundary inserted by /force-snip).
 */
export function isSnipMarkerMessage(message: Message): boolean {
  const msg = message as Record<string, unknown>
  return msg.subtype === 'snip_boundary' || msg.type === 'snip_boundary'
}

/**
 * Whether the HISTORY_SNIP runtime feature is enabled.
 */
export function isSnipRuntimeEnabled(): boolean {
  if (feature('HISTORY_SNIP')) {
    return true
  }
  return false
}

/**
 * Process messages for snip compaction. If a snip boundary is found,
 * remove all messages before it from the model-facing view.
 *
 * @returns The filtered messages, whether compaction happened, and tokens freed.
 */
export function snipCompactIfNeeded(
  messages: Message[],
  options?: { force?: boolean },
): {
  messages: Message[]
  executed: boolean
  tokensFreed: number
  boundaryMessage?: Message
} {
  if (!isSnipRuntimeEnabled() && !options?.force) {
    return { messages, executed: false, tokensFreed: 0 }
  }

  // Find the LAST snip boundary (most recent snip wins)
  let lastBoundaryIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isSnipMarkerMessage(messages[i]!)) {
      lastBoundaryIndex = i
      break
    }
  }

  if (lastBoundaryIndex === -1) {
    return { messages, executed: false, tokensFreed: 0 }
  }

  const boundaryMessage = messages[lastBoundaryIndex]!
  // Keep the boundary message and everything after it
  const kept = messages.slice(lastBoundaryIndex)
  const removed = messages.slice(0, lastBoundaryIndex)

  // Rough token estimate: ~4 chars per token
  const tokensFreed = removed.reduce((sum, msg) => {
    const content = (msg as Record<string, unknown>).content
    if (typeof content === 'string') return sum + Math.ceil(content.length / 4)
    if (Array.isArray(content)) {
      return (
        sum +
        content.reduce((s: number, c: unknown) => {
          const text = (c as Record<string, unknown>).text
          return s + (typeof text === 'string' ? Math.ceil(text.length / 4) : 0)
        }, 0)
      )
    }
    return sum
  }, 0)

  logForDebugging(
    `SnipCompact: snipped ${removed.length} messages (~${tokensFreed} tokens freed)`,
  )

  return {
    messages: kept,
    executed: true,
    tokensFreed,
    boundaryMessage,
  }
}

/**
 * Whether we should nudge the model to suggest using /snip.
 * Triggered when conversation is getting long but no snips have been done.
 */
export function shouldNudgeForSnips(messages: Message[]): boolean {
  // Don't nudge if there's already a snip boundary
  if (messages.some(m => isSnipMarkerMessage(m))) return false
  // Nudge when conversation exceeds ~100 messages
  return messages.length > 100
}

/**
 * Nudge text injected into system context when snip would be helpful.
 */
export const SNIP_NUDGE_TEXT =
  'This conversation is getting long. Consider using the Snip tool to remove older messages from context, freeing up space for new work. Snipped messages are replaced with a compact summary.'
