import { describe, expect, test } from 'bun:test'
import {
  getOpenAIStreamIdleTimeoutMs,
  OpenAIStreamIdleTimeoutError,
  watchStreamIdle,
} from '../streamIdleTimeout.js'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function* paced<T>(
  items: Array<{ delayMs: number; value: T }>,
): AsyncGenerator<T> {
  for (const item of items) {
    await delay(item.delayMs)
    yield item.value
  }
}

function stalled<T>(): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return { next: () => new Promise<IteratorResult<T>>(() => {}) }
    },
  }
}

async function drain<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of stream) values.push(value)
  return values
}

describe('watchStreamIdle', () => {
  test('passes events through while they keep arriving', async () => {
    const stream = watchStreamIdle(
      paced([
        { delayMs: 40, value: 1 },
        { delayMs: 40, value: 2 },
        { delayMs: 40, value: 3 },
      ]),
      {
        timeoutMs: 60,
        onTimeout: () => {
          throw new Error('watchdog fired on a healthy stream')
        },
      },
    )

    expect(await drain(stream)).toEqual([1, 2, 3])
  })

  test('warns at half the timeout and fails a read that stays quiet', async () => {
    const phases: string[] = []
    const stream = watchStreamIdle(stalled<number>(), {
      timeoutMs: 60,
      onTimeout: () => phases.push('timeout'),
      onWarning: () => phases.push('warning'),
    })

    await expect(drain(stream)).rejects.toThrow(OpenAIStreamIdleTimeoutError)
    expect(phases).toEqual(['warning', 'timeout'])
  })

  test('reports the timeout in the error message', () => {
    expect(new OpenAIStreamIdleTimeoutError(90_000).message).toContain('90s')
  })

  test('yields the source unchanged when the watchdog is disabled', async () => {
    const stream = watchStreamIdle(paced([{ delayMs: 30, value: 'a' }]), {
      timeoutMs: 0,
      onTimeout: () => {
        throw new Error('watchdog fired while disabled')
      },
    })

    expect(await drain(stream)).toEqual(['a'])
  })

  test('disarms the timer when the consumer stops early', async () => {
    let timeouts = 0
    const stream = watchStreamIdle(
      paced([
        { delayMs: 5, value: 'a' },
        { delayMs: 5, value: 'b' },
      ]),
      {
        timeoutMs: 30,
        onTimeout: () => {
          timeouts++
        },
      },
    )

    for await (const value of stream) {
      if (value === 'a') break
    }
    await delay(50)

    expect(timeouts).toBe(0)
  })
})

describe('getOpenAIStreamIdleTimeoutMs', () => {
  test('defaults to 90s and honors overrides and disables', () => {
    const previous = process.env.OPENAI_STREAM_IDLE_TIMEOUT_MS
    try {
      delete process.env.OPENAI_STREAM_IDLE_TIMEOUT_MS
      expect(getOpenAIStreamIdleTimeoutMs()).toBe(90_000)

      process.env.OPENAI_STREAM_IDLE_TIMEOUT_MS = '5000'
      expect(getOpenAIStreamIdleTimeoutMs()).toBe(5000)

      process.env.OPENAI_STREAM_IDLE_TIMEOUT_MS = '0'
      expect(getOpenAIStreamIdleTimeoutMs()).toBe(0)

      process.env.OPENAI_STREAM_IDLE_TIMEOUT_MS = 'off'
      expect(getOpenAIStreamIdleTimeoutMs()).toBe(0)

      process.env.OPENAI_STREAM_IDLE_TIMEOUT_MS = 'nonsense'
      expect(getOpenAIStreamIdleTimeoutMs()).toBe(90_000)
    } finally {
      if (previous === undefined) {
        delete process.env.OPENAI_STREAM_IDLE_TIMEOUT_MS
      } else {
        process.env.OPENAI_STREAM_IDLE_TIMEOUT_MS = previous
      }
    }
  })
})
