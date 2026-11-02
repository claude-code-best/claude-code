import { describe, expect, test } from 'bun:test'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions/completions.mjs'
import {
  adaptOpenAIStreamToAnthropic,
  OpenAIStreamIncompleteError,
} from '@ant/model-provider'
import {
  isRetryableOpenAIStreamError,
  OpenAIStreamResumeError,
  retryOpenAIStream,
} from '../streamRetry.js'
import { OpenAIStreamIdleTimeoutError } from '../streamIdleTimeout.js'

function messageStart(): BetaRawMessageStreamEvent {
  return {
    type: 'message_start',
    message: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'test-model',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 0 },
    },
  } as unknown as BetaRawMessageStreamEvent
}

function blockStart(index = 0): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_start',
    index,
    content_block: { type: 'text', text: '' },
  } as BetaRawMessageStreamEvent
}

function textDelta(text: string, index = 0): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text },
  } as BetaRawMessageStreamEvent
}

function toolStart(index = 0): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_start',
    index,
    content_block: {
      type: 'tool_use',
      id: 'toolu_test',
      name: 'Bash',
      input: {},
    },
  } as BetaRawMessageStreamEvent
}

function inputDelta(json: string, index = 0): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_delta',
    index,
    delta: { type: 'input_json_delta', partial_json: json },
  } as BetaRawMessageStreamEvent
}

function blockStop(index = 0): BetaRawMessageStreamEvent {
  return { type: 'content_block_stop', index } as BetaRawMessageStreamEvent
}

function messageStop(): BetaRawMessageStreamEvent {
  return { type: 'message_stop' } as BetaRawMessageStreamEvent
}

function collectText(events: BetaRawMessageStreamEvent[]): string {
  return events
    .filter(
      event =>
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta',
    )
    .map(event =>
      event.type === 'content_block_delta' && event.delta.type === 'text_delta'
        ? event.delta.text
        : '',
    )
    .join('')
}

async function* truncatedStream() {
  yield messageStart()
  yield blockStart()
  yield textDelta('Hello ')
}

async function* interruptedStream() {
  yield messageStart()
  yield blockStart()
  yield textDelta('Hello ')
  throw new Error('terminated')
}

async function* resumedStream(text: string) {
  yield messageStart()
  yield blockStart()
  yield textDelta('Hel')
  yield textDelta(text)
  yield blockStop()
  yield messageStop()
}

async function* completedStream() {
  yield messageStart()
  yield blockStart()
  yield textDelta('Hello ')
  yield textDelta('world')
  yield blockStop()
  yield messageStop()
}

async function* emptyStream() {}

/**
 * Mirrors how the SDK behaves when the caller aborts: the pending read
 * resolves and the iterator ends cleanly instead of throwing.
 */
async function* stallingStream(
  signal: AbortSignal,
  emitFirst: boolean,
): AsyncGenerator<BetaRawMessageStreamEvent> {
  if (emitFirst) {
    yield messageStart()
    yield blockStart()
  }
  await new Promise<void>(resolve => {
    if (signal.aborted) {
      resolve()
      return
    }
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

describe('retryOpenAIStream', () => {
  test('retries an interrupted stream and emits only the new suffix', async () => {
    let calls = 0
    let waits = 0
    const outputEvents: BetaRawMessageStreamEvent[] = []

    for await (const item of retryOpenAIStream(
      async () => {
        calls++
        return calls === 1 ? interruptedStream() : resumedStream('lo world')
      },
      {
        maxRetries: 3,
        signal: new AbortController().signal,
        wait: async () => {
          waits++
        },
      },
    )) {
      if (item.outputEvent) outputEvents.push(item.outputEvent)
    }

    const text = outputEvents
      .filter(
        event =>
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta',
      )
      .map(event =>
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
          ? event.delta.text
          : '',
      )
      .join('')

    expect(calls).toBe(2)
    expect(waits).toBe(1)
    expect(text).toBe('Hello world')
    expect(
      outputEvents.filter(event => event.type === 'message_start'),
    ).toHaveLength(1)
    expect(
      outputEvents.filter(event => event.type === 'content_block_start'),
    ).toHaveLength(1)
  })

  test('restarts from scratch when the retried stream diverges', async () => {
    let calls = 0
    const attempts = new Map<number, { text: string; stopped: boolean }>()

    for await (const item of retryOpenAIStream(
      async () => {
        calls++
        return calls === 1 ? interruptedStream() : resumedStream('p')
      },
      {
        maxRetries: 3,
        signal: new AbortController().signal,
        wait: async () => {},
      },
    )) {
      const current = attempts.get(item.attempt) ?? { text: '', stopped: false }
      attempts.set(item.attempt, current)
      if (item.outputEvent) {
        current.text += collectText([item.outputEvent])
        if (item.outputEvent.type === 'message_stop') current.stopped = true
      }
    }

    expect(calls).toBe(3)
    expect([...attempts].map(([n, a]) => [n, a.text, a.stopped])).toEqual([
      [1, 'Hello ', false],
      [2, '', false],
      [3, 'Help', true],
    ])
  })

  test('reports divergence instead of restarting when no retry is left', async () => {
    let calls = 0
    const stream = retryOpenAIStream(
      async () => {
        calls++
        return calls === 1 ? interruptedStream() : resumedStream('p')
      },
      {
        maxRetries: 1,
        signal: new AbortController().signal,
        wait: async () => {},
      },
    )

    await expect(async () => {
      for await (const _item of stream) {
      }
    }).toThrow(OpenAIStreamResumeError)
    expect(calls).toBe(2)
  })

  test('stops restarting once the restart budget is spent', async () => {
    let calls = 0
    async function* emitThenFail(text: string) {
      yield messageStart()
      yield blockStart()
      yield textDelta(text)
      throw new Error('terminated')
    }
    const next = [
      () => emitThenFail('Hello '),
      () => resumedStream('p'),
      () => emitThenFail('Help'),
      () => resumedStream('q'),
    ]

    const stream = retryOpenAIStream(
      async () => {
        calls++
        return next[Math.min(calls, next.length) - 1]()
      },
      {
        maxRetries: 5,
        signal: new AbortController().signal,
        wait: async () => {},
      },
    )

    await expect(async () => {
      for await (const _item of stream) {
      }
    }).toThrow(OpenAIStreamResumeError)
    expect(calls).toBe(4)
  })

  test('resumes partial tool input without duplicating JSON', async () => {
    let calls = 0
    const outputEvents: BetaRawMessageStreamEvent[] = []
    async function* firstAttempt() {
      yield messageStart()
      yield toolStart()
      yield inputDelta('{"command":"ec')
      throw new Error('terminated')
    }
    async function* secondAttempt() {
      yield messageStart()
      yield toolStart()
      yield inputDelta('{"command":')
      yield inputDelta('"echo hi"}')
      yield blockStop()
      yield messageStop()
    }

    for await (const item of retryOpenAIStream(
      async () => {
        calls++
        return calls === 1 ? firstAttempt() : secondAttempt()
      },
      {
        maxRetries: 3,
        signal: new AbortController().signal,
        wait: async () => {},
      },
    )) {
      if (item.outputEvent) outputEvents.push(item.outputEvent)
    }

    const json = outputEvents
      .filter(
        event =>
          event.type === 'content_block_delta' &&
          event.delta.type === 'input_json_delta',
      )
      .map(event =>
        event.type === 'content_block_delta' &&
        event.delta.type === 'input_json_delta'
          ? event.delta.partial_json
          : '',
      )
      .join('')

    expect(json).toBe('{"command":"echo hi"}')
    expect(
      outputEvents.filter(event => event.type === 'content_block_start'),
    ).toHaveLength(1)
  })

  test('does not retry failures before the stream emits progress', async () => {
    let calls = 0
    const stream = retryOpenAIStream(
      async () => {
        calls++
        throw new Error('terminated')
      },
      {
        maxRetries: 3,
        signal: new AbortController().signal,
        wait: async () => {},
      },
    )

    await expect(async () => {
      for await (const _item of stream) {
      }
    }).toThrow('terminated')
    expect(calls).toBe(1)
  })

  test('retries a truncated stream that emitted nothing', async () => {
    let calls = 0
    let waits = 0
    const outputEvents: BetaRawMessageStreamEvent[] = []

    for await (const item of retryOpenAIStream(
      async () => {
        calls++
        return calls === 1 ? emptyStream() : completedStream()
      },
      {
        maxRetries: 3,
        signal: new AbortController().signal,
        wait: async () => {
          waits++
        },
      },
    )) {
      if (item.outputEvent) outputEvents.push(item.outputEvent)
    }

    expect(calls).toBe(2)
    expect(waits).toBe(1)
    expect(collectText(outputEvents)).toBe('Hello world')
    expect(
      outputEvents.filter(event => event.type === 'message_stop'),
    ).toHaveLength(1)
  })

  test('gives up once the empty stream budget is spent', async () => {
    let calls = 0

    const stream = retryOpenAIStream(
      async () => {
        calls++
        return emptyStream()
      },
      {
        maxRetries: 10,
        signal: new AbortController().signal,
        wait: async () => {},
      },
    )

    await expect(async () => {
      for await (const _item of stream) {
      }
    }).toThrow(OpenAIStreamIncompleteError)
    expect(calls).toBe(3)
  })

  test('honors the configured retry count after progress', async () => {
    let calls = 0
    const stream = retryOpenAIStream(
      async () => {
        calls++
        return interruptedStream()
      },
      {
        maxRetries: 3,
        signal: new AbortController().signal,
        wait: async () => {},
      },
    )

    await expect(async () => {
      for await (const _item of stream) {
      }
    }).toThrow('terminated')
    expect(calls).toBe(4)
  })

  test('retries a stream that ends without a terminal event', async () => {
    let calls = 0
    let waits = 0
    const outputEvents: BetaRawMessageStreamEvent[] = []

    for await (const item of retryOpenAIStream(
      async () => {
        calls++
        return calls === 1 ? truncatedStream() : completedStream()
      },
      {
        maxRetries: 3,
        signal: new AbortController().signal,
        wait: async () => {
          waits++
        },
      },
    )) {
      if (item.outputEvent) outputEvents.push(item.outputEvent)
    }

    expect(calls).toBe(2)
    expect(waits).toBe(1)
    expect(collectText(outputEvents)).toBe('Hello world')
    expect(
      outputEvents.filter(event => event.type === 'message_stop'),
    ).toHaveLength(1)
  })

  test('gives up after the configured retries when no terminal event arrives', async () => {
    let calls = 0
    const stream = retryOpenAIStream(
      async () => {
        calls++
        return truncatedStream()
      },
      {
        maxRetries: 2,
        signal: new AbortController().signal,
        wait: async () => {},
      },
    )

    await expect(async () => {
      for await (const _item of stream) {
      }
    }).toThrow(OpenAIStreamIncompleteError)
    expect(calls).toBe(3)
  })

  test('returns a tolerated incomplete stream when OPENAI_ALLOW_INCOMPLETE_STREAM is set', async () => {
    process.env.OPENAI_ALLOW_INCOMPLETE_STREAM = '1'
    try {
      const outputEvents: BetaRawMessageStreamEvent[] = []
      for await (const item of retryOpenAIStream(
        async () => truncatedStream(),
        {
          maxRetries: 2,
          signal: new AbortController().signal,
          wait: async () => {},
        },
      )) {
        if (item.outputEvent) outputEvents.push(item.outputEvent)
      }

      expect(collectText(outputEvents)).toBe('Hello ')
      expect(
        outputEvents.filter(event => event.type === 'message_stop'),
      ).toHaveLength(0)
    } finally {
      delete process.env.OPENAI_ALLOW_INCOMPLETE_STREAM
    }
  })

  test('retries a stream that stalls without closing the connection', async () => {
    let calls = 0
    let waits = 0
    const outputEvents: BetaRawMessageStreamEvent[] = []

    for await (const item of retryOpenAIStream(
      async (signal: AbortSignal) => {
        calls++
        return calls === 1
          ? stallingStream(signal, true)
          : resumedStream('lo world')
      },
      {
        maxRetries: 3,
        idleTimeoutMs: 20,
        signal: new AbortController().signal,
        wait: async () => {
          waits++
        },
      },
    )) {
      if (item.outputEvent) outputEvents.push(item.outputEvent)
    }

    expect(calls).toBe(2)
    expect(waits).toBe(1)
    expect(collectText(outputEvents)).toBe('Hello world')
    expect(
      outputEvents.filter(event => event.type === 'message_stop'),
    ).toHaveLength(1)
  })

  test('retries a stall that happens before the first event', async () => {
    let calls = 0
    const outputEvents: BetaRawMessageStreamEvent[] = []

    for await (const item of retryOpenAIStream(
      async (signal: AbortSignal) => {
        calls++
        return calls === 1
          ? stallingStream(signal, false)
          : resumedStream('lo world')
      },
      {
        maxRetries: 3,
        idleTimeoutMs: 20,
        signal: new AbortController().signal,
        wait: async () => {},
      },
    )) {
      if (item.outputEvent) outputEvents.push(item.outputEvent)
    }

    expect(calls).toBe(2)
    expect(collectText(outputEvents)).toBe('Hello world')
  })

  test('stops once the idle timeout budget is spent', async () => {
    let calls = 0
    const stream = retryOpenAIStream(
      async (signal: AbortSignal) => {
        calls++
        return stallingStream(signal, true)
      },
      {
        maxRetries: 10,
        idleTimeoutMs: 20,
        signal: new AbortController().signal,
        wait: async () => {},
      },
    )

    await expect(async () => {
      for await (const _item of stream) {
      }
    }).toThrow(OpenAIStreamIdleTimeoutError)
    expect(calls).toBe(3)
  })

  test('ends quietly when the caller aborts a stalled stream', async () => {
    const controller = new AbortController()
    const outputEvents: BetaRawMessageStreamEvent[] = []
    let calls = 0

    const consume = async () => {
      for await (const item of retryOpenAIStream(
        async (signal: AbortSignal) => {
          calls++
          return stallingStream(signal, true)
        },
        {
          maxRetries: 3,
          idleTimeoutMs: 5_000,
          signal: controller.signal,
          wait: async () => {},
        },
      )) {
        if (item.outputEvent) outputEvents.push(item.outputEvent)
        if (item.event.type === 'content_block_start') controller.abort()
      }
    }

    await expect(consume()).resolves.toBeUndefined()
    expect(calls).toBe(1)
    expect(
      outputEvents.filter(event => event.type === 'message_stop'),
    ).toHaveLength(0)
  })
})

describe('isRetryableOpenAIStreamError', () => {
  test('recognizes terminated and nested socket errors', () => {
    expect(isRetryableOpenAIStreamError(new Error('terminated'))).toBe(true)
    expect(
      isRetryableOpenAIStreamError(
        new Error('stream failed', {
          cause: Object.assign(new Error('other side closed'), {
            code: 'UND_ERR_SOCKET',
          }),
        }),
      ),
    ).toBe(true)
  })

  test('retries streams that ended without a terminal event', () => {
    expect(
      isRetryableOpenAIStreamError(
        new OpenAIStreamIncompleteError('ended without finish_reason'),
      ),
    ).toBe(true)
    expect(
      isRetryableOpenAIStreamError(
        new Error('wrapper', {
          cause: new OpenAIStreamIncompleteError('ended without finish_reason'),
        }),
      ),
    ).toBe(true)
  })

  test('retries streams that stalled', () => {
    expect(
      isRetryableOpenAIStreamError(new OpenAIStreamIdleTimeoutError(90_000)),
    ).toBe(true)
    expect(
      isRetryableOpenAIStreamError(
        new Error('wrapper', {
          cause: new OpenAIStreamIdleTimeoutError(90_000),
        }),
      ),
    ).toBe(true)
  })

  test('does not retry user aborts or ordinary API errors', () => {
    expect(
      isRetryableOpenAIStreamError(
        Object.assign(new Error('Request was aborted'), {
          name: 'APIUserAbortError',
        }),
      ),
    ).toBe(false)
    expect(
      isRetryableOpenAIStreamError(
        Object.assign(new Error('bad request'), { status: 400 }),
      ),
    ).toBe(false)
    expect(
      isRetryableOpenAIStreamError(
        Object.assign(new Error('terminated'), { status: 400 }),
      ),
    ).toBe(false)
  })
})

describe('truncated upstream response', () => {
  function chunks(
    items: Array<{ content?: string; finishReason?: string | null }>,
  ) {
    return items.map(
      item =>
        ({
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              delta:
                item.content === undefined ? {} : { content: item.content },
              finish_reason: item.finishReason ?? null,
            },
          ],
        }) as unknown as ChatCompletionChunk,
    )
  }

  function chunkStream(
    items: ChatCompletionChunk[],
  ): AsyncIterable<ChatCompletionChunk> {
    return {
      [Symbol.asyncIterator](): AsyncIterator<ChatCompletionChunk> {
        let index = 0
        return {
          async next(): Promise<IteratorResult<ChatCompletionChunk>> {
            if (index >= items.length) return { done: true, value: undefined }
            return { done: false, value: items[index++] }
          },
        }
      },
    }
  }

  const firstAttempt = chunks([{ content: 'Hello ' }, { content: 'wor' }])
  const secondAttempt = chunks([
    { content: 'Hello ' },
    { content: 'wor' },
    { content: 'ld' },
    { finishReason: 'stop' },
  ])

  test('retries the cut connection and finishes the answer', async () => {
    let attempts = 0
    let waits = 0
    const outputEvents: BetaRawMessageStreamEvent[] = []

    for await (const item of retryOpenAIStream(
      async () => {
        attempts++
        return adaptOpenAIStreamToAnthropic(
          chunkStream(attempts === 1 ? firstAttempt : secondAttempt),
          'gpt-4o',
        )
      },
      {
        maxRetries: 3,
        signal: new AbortController().signal,
        wait: async () => {
          waits++
        },
      },
    )) {
      if (item.outputEvent) outputEvents.push(item.outputEvent)
    }

    expect(attempts).toBe(2)
    expect(waits).toBe(1)
    expect(collectText(outputEvents)).toBe('Hello world')
    expect(
      outputEvents.filter(event => event.type === 'message_stop'),
    ).toHaveLength(1)
    expect(
      outputEvents.filter(event => event.type === 'content_block_start'),
    ).toHaveLength(1)
  })

  test('reports a terminal error when every attempt is cut', async () => {
    let attempts = 0
    const stream = retryOpenAIStream(
      async () => {
        attempts++
        return adaptOpenAIStreamToAnthropic(chunkStream(firstAttempt), 'gpt-4o')
      },
      {
        maxRetries: 2,
        signal: new AbortController().signal,
        wait: async () => {},
      },
    )

    await expect(async () => {
      for await (const _item of stream) {
      }
    }).toThrow(OpenAIStreamIncompleteError)
    expect(attempts).toBe(3)
  })
})
