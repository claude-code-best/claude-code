/**
 * Reactive Compaction — auto-compress on prompt_too_long (413) errors.
 *
 * Unlike proactive autocompact (which runs before the API call), reactive
 * compact fires AFTER the API rejects with 413. It compresses the conversation
 * and retries, transparently recovering from context overflow.
 *
 * Also handles media_size_error — when an image/file is too large for the
 * context, the media block is stripped and the request retried.
 */
import { feature } from 'bun:bundle'
import type { Message } from 'src/types/message'
import type { CompactionResult } from './compact.js'
import { logForDebugging } from 'src/utils/debug.js'

// ---------------------------------------------------------------------------
// Gate helpers
// ---------------------------------------------------------------------------

/**
 * Whether reactive compact is enabled at runtime.
 */
export function isReactiveCompactEnabled(): boolean {
  if (feature('REACTIVE_COMPACT')) {
    return true
  }
  return false
}

/**
 * Whether the compact system operates in reactive-only mode (no proactive
 * autocompact). When true, /compact routes through reactiveCompactOnPromptTooLong
 * instead of compactConversation.
 */
export function isReactiveOnlyMode(): boolean {
  return false
}

// ---------------------------------------------------------------------------
// Withholding — detect 413/media errors in the stream
// ---------------------------------------------------------------------------

/**
 * Check if a streamed message is a prompt_too_long error that should be
 * withheld from the user (reactive compact will handle it).
 */
export function isWithheldPromptTooLong(message: Message): boolean {
  if (!isReactiveCompactEnabled()) return false
  const msg = message as Record<string, unknown>
  if (msg.type !== 'assistant') return false

  const error = msg.error as string | undefined
  if (error === 'prompt_too_long' || error === 'invalid_request') {
    const content = msg.content
    if (typeof content === 'string' && content.includes('prompt is too long')) {
      return true
    }
    if (Array.isArray(content)) {
      for (const block of content) {
        const text = (block as Record<string, unknown>).text
        if (typeof text === 'string' && text.includes('prompt is too long')) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * Check if a streamed message is a media_size_error that should be
 * withheld (reactive compact will strip the media and retry).
 */
export function isWithheldMediaSizeError(message: Message): boolean {
  if (!isReactiveCompactEnabled()) return false
  const msg = message as Record<string, unknown>
  if (msg.type !== 'assistant') return false

  const error = msg.error as string | undefined
  return error === 'media_size_error' || error === 'request_too_large'
}

// ---------------------------------------------------------------------------
// Core reactive compact
// ---------------------------------------------------------------------------

/**
 * Try reactive compaction after a 413 / media_size error.
 *
 * Called from query.ts when a withheld error is detected. Invokes the
 * existing compactConversation and returns the result for query.ts to
 * continue the turn with compressed context.
 */
export async function tryReactiveCompact(params: {
  hasAttempted: boolean
  querySource: string
  aborted: boolean
  messages: Message[]
  cacheSafeParams: Record<string, unknown>
}): Promise<CompactionResult | null> {
  const { hasAttempted, aborted, messages } = params

  if (hasAttempted || aborted) {
    logForDebugging('ReactiveCompact: skipping (already attempted or aborted)')
    return null
  }

  if (messages.length < 3) {
    logForDebugging('ReactiveCompact: too few messages to compact')
    return null
  }

  logForDebugging(
    `ReactiveCompact: attempting compaction of ${messages.length} messages`,
  )

  try {
    const { compactConversation } = await import('./compact.js')

    const result = await compactConversation(
      messages,
      params.cacheSafeParams as never, // ToolUseContext
      {} as never, // cacheSafeParams — empty, let compactConversation rebuild
      true, // suppressFollowUpQuestions
      undefined, // customInstructions
      true, // isAutoCompact
    )

    logForDebugging(
      `ReactiveCompact: succeeded, summaryMessages=${result.summaryMessages?.length ?? 0}`,
    )

    const { runPostCompactCleanup } = await import('./postCompactCleanup.js')
    runPostCompactCleanup()

    return result
  } catch (error) {
    logForDebugging(
      `ReactiveCompact: failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

/**
 * Reactive compact triggered by /compact command in reactive-only mode.
 */
export async function reactiveCompactOnPromptTooLong(
  messages: Message[],
  cacheSafeParams: Record<string, unknown>,
  options: { customInstructions?: string; trigger?: string },
): Promise<{
  ok: boolean
  reason?: string
  result?: CompactionResult
}> {
  if (messages.length < 3) {
    return { ok: false, reason: 'too_few_groups' }
  }

  try {
    const { compactConversation } = await import('./compact.js')

    const result = await compactConversation(
      messages,
      cacheSafeParams as never,
      {} as never,
      true,
      options.customInstructions,
      options.trigger === 'auto',
    )

    const { runPostCompactCleanup } = await import('./postCompactCleanup.js')
    runPostCompactCleanup()

    return { ok: true, result }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logForDebugging(
      `ReactiveCompact: reactiveCompactOnPromptTooLong failed: ${msg}`,
    )

    if (msg.includes('not enough messages') || msg.includes('NOT_ENOUGH')) {
      return { ok: false, reason: 'too_few_groups' }
    }
    if (msg.includes('canceled') || msg.includes('abort')) {
      return { ok: false, reason: 'aborted' }
    }
    return { ok: false, reason: 'error' }
  }
}
