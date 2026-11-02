import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  allowsIncompleteOpenAIStream,
  OpenAIStreamIncompleteError,
} from '@ant/model-provider'
import { sleep } from '../../../utils/sleep.js'
import {
  getOpenAIStreamIdleTimeoutMs,
  OpenAIStreamIdleTimeoutError,
  watchStreamIdle,
} from './streamIdleTimeout.js'

type RetryableError = Error & {
  cause?: unknown
  code?: string
  status?: number
}

type StreamFactory = (
  signal: AbortSignal,
) => Promise<AsyncIterable<BetaRawMessageStreamEvent>>

export interface ResumableOpenAIStreamEvent {
  attempt: number
  event: BetaRawMessageStreamEvent
  outputEvent?: BetaRawMessageStreamEvent
}

export interface OpenAIStreamRetryOptions {
  maxRetries: number
  signal: AbortSignal
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
  onIdle?: (phase: 'warning' | 'timeout', ms: number) => void
  idleTimeoutMs?: number
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>
}

/**
 * A stall is rarely transient in the same way a dropped socket is, so idle
 * timeouts get a smaller budget than the provider's retry count.
 */
const MAX_IDLE_TIMEOUT_RETRIES = 2

/**
 * A stream that ends with no events at all is safe to re-issue: nothing was
 * emitted to the caller, so no prefix has to be reconciled.
 */
const MAX_EMPTY_STREAM_RETRIES = 2

/**
 * Resuming assumes the re-issued request regenerates the emitted prefix
 * verbatim. When it does not, the prefix is abandoned and the request is
 * re-issued from scratch — at the cost of re-rendering what the caller saw.
 */
const MAX_RESUME_RESTARTS = 1

export class OpenAIStreamResumeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenAIStreamResumeError'
  }
}

class OpenAIStreamResumeState {
  private messageStarted = false
  private readonly blockDescriptors = new Map<number, string>()
  private readonly stoppedBlocks = new Set<number>()
  private readonly emittedValues = new Map<string, string>()
  private readonly attemptStartedBlocks = new Set<number>()
  private readonly attemptValues = new Map<string, string>()

  startAttempt(): void {
    this.attemptStartedBlocks.clear()
    this.attemptValues.clear()
  }

  reset(): void {
    this.messageStarted = false
    this.blockDescriptors.clear()
    this.stoppedBlocks.clear()
    this.emittedValues.clear()
    this.attemptStartedBlocks.clear()
    this.attemptValues.clear()
  }

  filter(
    event: BetaRawMessageStreamEvent,
  ): BetaRawMessageStreamEvent | undefined {
    switch (event.type) {
      case 'message_start': {
        if (this.messageStarted) return undefined
        this.messageStarted = true
        return event
      }
      case 'content_block_start': {
        const descriptor = JSON.stringify({
          type: event.content_block.type,
          ...('name' in event.content_block
            ? { name: event.content_block.name }
            : {}),
        })
        const previous = this.blockDescriptors.get(event.index)
        this.attemptStartedBlocks.add(event.index)
        if (previous === undefined) {
          this.blockDescriptors.set(event.index, descriptor)
          return event
        }
        if (previous !== descriptor) {
          throw new OpenAIStreamResumeError(
            `OpenAI stream changed content block ${event.index} while resuming`,
          )
        }
        return undefined
      }
      case 'content_block_delta':
        return this.filterDelta(event)
      case 'content_block_stop': {
        this.assertBlockCaughtUp(event.index)
        if (this.stoppedBlocks.has(event.index)) return undefined
        this.stoppedBlocks.add(event.index)
        return event
      }
      case 'message_stop':
        this.assertAttemptCaughtUp()
        return event
      default:
        return event
    }
  }

  private filterDelta(
    event: Extract<BetaRawMessageStreamEvent, { type: 'content_block_delta' }>,
  ): BetaRawMessageStreamEvent | undefined {
    const value = getDeltaValue(event)
    if (value === undefined) return event

    const key = `${event.index}:${event.delta.type}`
    if (event.delta.type === 'signature_delta') {
      const previous = this.emittedValues.get(key)
      this.attemptValues.set(key, value)
      if (previous === undefined) {
        this.emittedValues.set(key, value)
        return event
      }
      if (previous !== value) {
        throw new OpenAIStreamResumeError(
          `OpenAI stream changed signature for content block ${event.index} while resuming`,
        )
      }
      return undefined
    }

    const attemptValue = (this.attemptValues.get(key) ?? '') + value
    const emittedValue = this.emittedValues.get(key) ?? ''
    this.attemptValues.set(key, attemptValue)

    if (emittedValue.startsWith(attemptValue)) return undefined
    if (!attemptValue.startsWith(emittedValue)) {
      throw new OpenAIStreamResumeError(
        `OpenAI stream content diverged at content block ${event.index} while resuming`,
      )
    }

    const suffix = attemptValue.slice(emittedValue.length)
    this.emittedValues.set(key, attemptValue)
    return suffix.length > 0 ? withDeltaValue(event, suffix) : undefined
  }

  private assertBlockCaughtUp(index: number): void {
    for (const [key, emittedValue] of this.emittedValues) {
      if (!key.startsWith(`${index}:`)) continue
      if (this.attemptValues.get(key) !== emittedValue) {
        throw new OpenAIStreamResumeError(
          `OpenAI stream ended content block ${index} before reaching the previous output`,
        )
      }
    }
  }

  private assertAttemptCaughtUp(): void {
    for (const index of this.blockDescriptors.keys()) {
      if (!this.attemptStartedBlocks.has(index)) {
        throw new OpenAIStreamResumeError(
          `OpenAI stream ended before replaying content block ${index}`,
        )
      }
      this.assertBlockCaughtUp(index)
    }
  }
}

function getDeltaValue(
  event: Extract<BetaRawMessageStreamEvent, { type: 'content_block_delta' }>,
): string | undefined {
  switch (event.delta.type) {
    case 'text_delta':
      return event.delta.text
    case 'input_json_delta':
      return event.delta.partial_json
    case 'thinking_delta':
      return event.delta.thinking
    case 'signature_delta':
      return event.delta.signature
    default:
      return undefined
  }
}

function withDeltaValue(
  event: Extract<BetaRawMessageStreamEvent, { type: 'content_block_delta' }>,
  value: string,
): BetaRawMessageStreamEvent {
  switch (event.delta.type) {
    case 'text_delta':
      return { ...event, delta: { ...event.delta, text: value } }
    case 'input_json_delta':
      return { ...event, delta: { ...event.delta, partial_json: value } }
    case 'thinking_delta':
      return { ...event, delta: { ...event.delta, thinking: value } }
    default:
      return event
  }
}

function getErrorChain(error: unknown): RetryableError[] {
  const chain: RetryableError[] = []
  let current = error
  const seen = new Set<unknown>()
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    chain.push(current as RetryableError)
    current = (current as RetryableError).cause
  }
  return chain
}

export function isRetryableOpenAIStreamError(error: unknown): boolean {
  const chain = getErrorChain(error)
  if (
    chain.some(
      item => item.name === 'AbortError' || item.name === 'APIUserAbortError',
    )
  ) {
    return false
  }

  if (
    chain.some(
      item =>
        item instanceof OpenAIStreamIncompleteError ||
        item instanceof OpenAIStreamIdleTimeoutError,
    )
  ) {
    return true
  }

  return chain.some(item => {
    if (item.status !== undefined) {
      return (
        item.status === 408 ||
        item.status === 409 ||
        item.status === 429 ||
        item.status >= 500
      )
    }
    if (
      item.name === 'APIConnectionError' ||
      item.name === 'APIConnectionTimeoutError'
    ) {
      return true
    }
    const code = item.code?.toUpperCase()
    if (
      code === 'ECONNRESET' ||
      code === 'EPIPE' ||
      code === 'ETIMEDOUT' ||
      code === 'UND_ERR_SOCKET'
    ) {
      return true
    }
    return /\bterminated\b|fetch failed|socket connection was closed|other side closed/i.test(
      item.message,
    )
  })
}

export function getOpenAIStreamRetryDelay(attempt: number): number {
  const baseDelay = Math.min(500 * 2 ** (attempt - 1), 8000)
  return baseDelay + Math.random() * 0.25 * baseDelay
}

export async function* retryOpenAIStream(
  createStream: StreamFactory,
  options: OpenAIStreamRetryOptions,
): AsyncGenerator<ResumableOpenAIStreamEvent> {
  const resumeState = new OpenAIStreamResumeState()
  const idleTimeoutMs = options.idleTimeoutMs ?? getOpenAIStreamIdleTimeoutMs()
  let hasProgress = false
  let idleTimeouts = 0
  let emptyStreams = 0
  let restarts = 0

  for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
    if (options.signal.aborted) throw new Error('Request was aborted')
    resumeState.startAttempt()
    let completed = false
    let restart = false

    // Each attempt owns a controller so the idle watchdog can kill a stalled
    // request without aborting the caller's signal, which means "user
    // interrupted the whole turn".
    const attemptController = new AbortController()
    const abortAttempt = (): void => attemptController.abort()
    options.signal.addEventListener('abort', abortAttempt, { once: true })

    try {
      const source = await createStream(attemptController.signal)
      const stream = watchStreamIdle(source, {
        timeoutMs: idleTimeoutMs,
        onTimeout: () => {
          abortAttempt()
          options.onIdle?.('timeout', idleTimeoutMs)
        },
        ...(options.onIdle && {
          onWarning: (warningMs: number) =>
            options.onIdle?.('warning', warningMs),
        }),
      })

      for await (const event of stream) {
        hasProgress = true
        let outputEvent: BetaRawMessageStreamEvent | undefined
        try {
          outputEvent = resumeState.filter(event)
        } catch (error) {
          if (
            !(error instanceof OpenAIStreamResumeError) ||
            restarts >= MAX_RESUME_RESTARTS ||
            attempt > options.maxRetries
          ) {
            throw error
          }
          // The re-issued request regenerated a different prefix, so the
          // resume is unsound: discard what was emitted and start over.
          restarts++
          resumeState.reset()
          restart = true
          options.onRetry?.(error, attempt, 0)
          abortAttempt()
          break
        }
        if (event.type === 'message_stop') completed = true
        yield { attempt, event, ...(outputEvent && { outputEvent }) }
      }

      if (restart) continue
      if (!completed) {
        // The SDK swallows abort errors and ends the iterator cleanly, so an
        // aborted read is indistinguishable from a truncated stream here.
        if (options.signal.aborted) return
        if (!allowsIncompleteOpenAIStream()) {
          throw new OpenAIStreamIncompleteError(
            'OpenAI stream ended without a terminal event',
          )
        }
      }
      return
    } catch (error) {
      if (completed) return
      if (options.signal.aborted) throw error
      const idleTimeout = error instanceof OpenAIStreamIdleTimeoutError
      if (idleTimeout) idleTimeouts++
      // A stream that produced nothing can be re-issued even though the SDK
      // reports its truncation as a normal end, so it bypasses the progress
      // gate for the same reason a stall does.
      const emptyStream =
        error instanceof OpenAIStreamIncompleteError && !hasProgress
      if (emptyStream) emptyStreams++
      // A stall can hit before the first event, so idle timeouts bypass the
      // progress gate that otherwise defers to the SDK's own retries.
      const hasBudget = idleTimeout
        ? idleTimeouts <= MAX_IDLE_TIMEOUT_RETRIES
        : emptyStream
          ? emptyStreams <= MAX_EMPTY_STREAM_RETRIES
          : hasProgress
      if (
        !hasBudget ||
        attempt > options.maxRetries ||
        !isRetryableOpenAIStreamError(error)
      ) {
        throw error
      }
      const delayMs = getOpenAIStreamRetryDelay(attempt)
      options.onRetry?.(error, attempt, delayMs)
      await (options.wait ?? waitForRetry)(delayMs, options.signal)
    } finally {
      options.signal.removeEventListener('abort', abortAttempt)
    }
  }
}

async function waitForRetry(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  await sleep(delayMs, signal, { throwOnAbort: true })
}
