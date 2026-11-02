const DEFAULT_IDLE_TIMEOUT_MS = 90_000

/**
 * Raised when the upstream stops emitting events without closing the
 * connection. Retryable: the request is re-issued from scratch.
 */
export class OpenAIStreamIdleTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `OpenAI stream stalled: no events received for ${Math.round(timeoutMs / 1000)}s`,
    )
    this.name = 'OpenAIStreamIdleTimeoutError'
  }
}

export function getOpenAIStreamIdleTimeoutMs(): number {
  const raw = process.env.OPENAI_STREAM_IDLE_TIMEOUT_MS?.trim()
  if (!raw) return DEFAULT_IDLE_TIMEOUT_MS
  if (raw === '0' || raw.toLowerCase() === 'off') return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_IDLE_TIMEOUT_MS
}

export interface StreamIdleWatchdogOptions {
  timeoutMs: number
  /** Must release the source — the pending read stays blocked otherwise. */
  onTimeout: (timeoutMs: number) => void
  onWarning?: (warningMs: number) => void
}

/**
 * Fails the read when the source goes quiet for `timeoutMs`. The SDK's request
 * timeout only covers the initial fetch, so an upstream that answers with
 * headers and then stalls would otherwise block forever.
 */
export async function* watchStreamIdle<T>(
  source: AsyncIterable<T>,
  options: StreamIdleWatchdogOptions,
): AsyncGenerator<T> {
  const { timeoutMs } = options
  if (timeoutMs <= 0) {
    yield* source
    return
  }

  const warningMs = Math.floor(timeoutMs / 2)
  const iterator = source[Symbol.asyncIterator]()
  let warningTimer: ReturnType<typeof setTimeout> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  const clearTimers = (): void => {
    if (warningTimer !== null) {
      clearTimeout(warningTimer)
      warningTimer = null
    }
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  try {
    while (true) {
      clearTimers()
      const stalled = new Promise<never>((_, reject) => {
        if (options.onWarning) {
          warningTimer = setTimeout(
            () => options.onWarning?.(warningMs),
            warningMs,
          )
        }
        idleTimer = setTimeout(() => {
          options.onTimeout(timeoutMs)
          reject(new OpenAIStreamIdleTimeoutError(timeoutMs))
        }, timeoutMs)
      })

      const next = iterator.next()
      next.catch(() => {})
      const result = await Promise.race([next, stalled])
      if (result.done) return
      yield result.value
    }
  } finally {
    clearTimers()
  }
}
