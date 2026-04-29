import type { Message } from 'src/types/message.js'

/**
 * Estimated characters per token (conservative for mixed code/text).
 */
const CHARS_PER_TOKEN = 4

/**
 * Minimum message count before nudging the model to consider snipping.
 */
const SNIP_NUDGE_THRESHOLD = 30

/**
 * Text shown to the model as a nudge when the conversation is long enough
 * to benefit from snipping.
 */
export const SNIP_NUDGE_TEXT: string =
  'The conversation history is getting long. Consider using the /force-snip command or the snip tool to compress older messages, freeing context window space for continued work.'

/**
 * Check whether a message is an internal snip marker (not user-facing).
 * Snip markers are system messages injected by the snip tool to track
 * which messages have been registered for future removal.
 */
export function isSnipMarkerMessage(message: Message): boolean {
  if (message.type !== 'system') return false
  return (message as Record<string, unknown>).subtype === 'snip_marker'
}

/**
 * Estimate the token count of a single message by serialising its content.
 * This is a rough heuristic (~4 chars per token) used to report
 * tokensFreed; it does not need to be exact.
 */
function estimateMessageTokens(message: Message): number {
  const content = message.message?.content
  let chars = 0
  if (typeof content === 'string') {
    chars = content.length
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === 'string') {
        chars += (block as string).length
      } else if (block && typeof block === 'object') {
        const obj = block as unknown as Record<string, unknown>
        const text = obj.text ?? obj.content
        if (typeof text === 'string') {
          chars += text.length
        } else {
          chars += JSON.stringify(block).length
        }
      }
    }
  } else if (content !== null && content !== undefined) {
    chars = JSON.stringify(content).length
  }
  return Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN))
}

/**
 * Scan the message array for the last `snip_boundary` system message and,
 * if found, remove all messages whose UUIDs appear in its
 * `snipMetadata.removedUuids`.
 *
 * This is the core memory-saving function. When a snip boundary exists:
 * 1. All messages listed in `removedUuids` are filtered out.
 * 2. The boundary message itself is kept (it records what was removed).
 * 3. Messages not in `removedUuids` (including post-boundary messages)
 *    are preserved.
 *
 * Called from:
 * - `query.ts` — strips snipped messages from the model-facing array
 *   before sending to the API.
 * - `QueryEngine.ts` `snipReplay` — trims `mutableMessages` so the
 *   in-memory store does not grow without bound in long SDK sessions.
 *
 * @param messages  Full message array (may contain a snip_boundary).
 * @param options   `force` — if true, always execute when a boundary is
 *                  present. Without `force`, the function still executes
 *                  if a boundary is found (the "if needed" refers to
 *                  whether a boundary exists, not a token threshold).
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
  // Find the last snip_boundary message
  let boundaryIdx = -1
  let removedUuids: string[] | undefined

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!
    if (
      msg.type === 'system' &&
      (msg as Record<string, unknown>).subtype === 'snip_boundary'
    ) {
      boundaryIdx = i
      const meta = (msg as Record<string, unknown>).snipMetadata as
        | { removedUuids?: string[] }
        | undefined
      removedUuids = meta?.removedUuids
      break
    }
  }

  if (boundaryIdx === -1) {
    return { messages, executed: false, tokensFreed: 0 }
  }

  const boundaryMessage = messages[boundaryIdx]!

  // No removedUuids metadata — fallback: keep boundary + everything after
  if (!removedUuids || removedUuids.length === 0) {
    const kept = messages.slice(boundaryIdx)
    return {
      messages: kept,
      executed: true,
      tokensFreed: 0,
      boundaryMessage,
    }
  }

  // Filter out messages whose UUIDs are listed in removedUuids
  const removedSet = new Set(removedUuids)
  const kept: Message[] = []
  let tokensFreed = 0

  for (const msg of messages) {
    if (removedSet.has(msg.uuid)) {
      tokensFreed += estimateMessageTokens(msg)
      continue
    }
    kept.push(msg)
  }

  return {
    messages: kept,
    executed: true,
    tokensFreed,
    boundaryMessage,
  }
}

/**
 * Returns true when the snip runtime is active.
 * Because this module is only loaded when the HISTORY_SNIP feature flag
 * is enabled, this always returns true.
 */
export function isSnipRuntimeEnabled(): boolean {
  return true
}

/**
 * Determine whether the conversation is long enough to warrant a nudge
 * to the model to consider snipping. Uses a simple message-count
 * threshold rather than an expensive token count.
 */
export function shouldNudgeForSnips(messages: Message[]): boolean {
  return messages.length >= SNIP_NUDGE_THRESHOLD
}
