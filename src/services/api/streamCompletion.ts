/**
 * Stream-completion classification helpers for the streaming API client.
 *
 * Extracted as pure functions so the tricky "was this stream truncated?"
 * decision can be unit-tested without standing up a full network stream.
 *
 * Background: on gateway-fronted providers a long
 * extended-thinking pause or a large tool_use `input_json_delta` (e.g. a big
 * Write payload) can leave the SSE idle past the gateway's proxy_read_timeout
 * (~180s). The gateway then closes the connection gracefully — the async
 * iterator just ends with no exception, no `content_block_stop` for the open
 * block and no `message_delta` carrying a terminal `stop_reason`. Without
 * explicit detection the partial output is misreported as a completed
 * `end_turn` and the turn silently stops half-done.
 */

/**
 * Minimal shape needed to decide whether a completed assistant message already
 * contains a tool_use block. Kept structural so callers can pass their richer
 * AssistantMessage type without conversion.
 */
export interface CompletionMessageLike {
  message?: {
    content?: unknown
  }
}

/**
 * True if any completed message already carries a (server_)tool_use block.
 *
 * Used to guard against inc-4258: a tool_use that already closed may have begun
 * executing via the streaming tool executor, so re-issuing the request through
 * the non-streaming fallback would double-execute it. When a tool_use has
 * completed we must NOT treat a subsequent truncation as recoverable here.
 */
export function hasCompletedToolUse(
  messages: readonly CompletionMessageLike[],
): boolean {
  return messages.some(m => {
    const content = m.message?.content
    return (
      Array.isArray(content) &&
      content.some(b => {
        const t = (b as { type?: string }).type
        return t === 'tool_use' || t === 'server_tool_use'
      })
    )
  })
}

/** Inputs describing the final state of a streamed response. */
export interface StreamTruncationInput {
  /** Whether a `message_start` event was ever received (partialMessage set). */
  hasPartialMessage: boolean
  /** Terminal stop_reason from `message_delta`, or null if none arrived. */
  stopReason: string | null
  /** Count of content blocks that were opened via `content_block_start`. */
  startedBlockCount: number
  /** Count of assistant messages emitted (one per `content_block_stop`). */
  completedMessageCount: number
  /** Whether any completed message already contains a tool_use block. */
  hasCompletedToolUse: boolean
}

/**
 * Detect a stream that was cut mid-turn by an intermediary (gateway idle
 * timeout), as opposed to a legitimately completed or legitimately empty
 * response.
 *
 * Signature of the truncation we recover from:
 * - a `message_start` was received (`hasPartialMessage`), AND
 * - no terminal `stop_reason` ever arrived (`stopReason === null`), AND
 * - at least one content block was opened but never closed
 *   (`startedBlockCount > completedMessageCount`), AND
 * - no tool_use block has already completed (avoids inc-4258 double execution).
 *
 * The unclosed-block check is the key discriminator: a well-behaved provider
 * that merely omits `stop_reason` still emits `content_block_stop` for every
 * block it opened, so it won't false-positive here — only a genuinely truncated
 * stream leaves a block open.
 */
export function isPrematureStreamTruncation(
  input: StreamTruncationInput,
): boolean {
  return (
    input.hasPartialMessage &&
    input.stopReason === null &&
    input.startedBlockCount > input.completedMessageCount &&
    !input.hasCompletedToolUse
  )
}
