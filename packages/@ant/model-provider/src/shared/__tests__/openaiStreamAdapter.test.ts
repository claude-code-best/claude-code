import { describe, expect, test } from 'bun:test'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions/completions.mjs'
import { adaptOpenAIStreamToAnthropic } from '../openaiStreamAdapter.js'

/** Helper to create a mock async iterable from chunk array */
function mockStream(
  chunks: ChatCompletionChunk[],
): AsyncIterable<ChatCompletionChunk> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0
      return {
        async next() {
          if (i >= chunks.length) return { done: true, value: undefined }
          return { done: false, value: chunks[i++] }
        },
      }
    },
  }
}

/** Create a minimal ChatCompletionChunk */
function makeChunk(
  overrides: Partial<ChatCompletionChunk> & any = {},
): ChatCompletionChunk {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 1234567890,
    model: 'gpt-4o',
    choices: [],
    ...overrides,
  } as ChatCompletionChunk
}

/** Collect all emitted Anthropic events from the stream adapter for assertion */
async function collectEvents(chunks: ChatCompletionChunk[]) {
  const events: any[] = []
  for await (const event of adaptOpenAIStreamToAnthropic(
    mockStream(chunks),
    'gpt-4o',
  )) {
    events.push(event)
  }
  return events
}

describe('adaptOpenAIStreamToAnthropic', () => {
  test('emits message_start on first chunk', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: '' },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { content: 'hello' },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    ])

    expect(events[0].type).toBe('message_start')
    expect(events[0].message.role).toBe('assistant')
    expect(events[0].message.model).toBe('gpt-4o')
  })

  test('converts text content stream', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [
          { index: 0, delta: { content: 'Hello' }, finish_reason: null },
        ],
      }),
      makeChunk({
        choices: [
          { index: 0, delta: { content: ' world' }, finish_reason: null },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
    ])

    const types = events.map(e => e.type)
    expect(types).toContain('message_start')
    expect(types).toContain('content_block_start')
    expect(types.filter(t => t === 'content_block_delta').length).toBe(2)
    expect(types).toContain('content_block_stop')
    expect(types).toContain('message_delta')
    expect(types).toContain('message_stop')

    const textDeltas = events.filter(
      e => e.type === 'content_block_delta',
    ) as any[]
    expect(textDeltas[0].delta.text).toBe('Hello')
    expect(textDeltas[1].delta.text).toBe(' world')
  })

  test('converts tool_calls stream', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_abc',
                  type: 'function',
                  function: { name: 'bash', arguments: '' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '{"comm' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: 'and":"ls"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      }),
    ])

    const blockStart = events.find(e => e.type === 'content_block_start') as any
    expect(blockStart.content_block.type).toBe('tool_use')
    expect(blockStart.content_block.name).toBe('bash')

    const jsonDeltas = events.filter(
      e =>
        e.type === 'content_block_delta' && e.delta.type === 'input_json_delta',
    ) as any[]
    const fullArgs = jsonDeltas.map(d => d.delta.partial_json).join('')
    expect(fullArgs).toBe('{"command":"ls"}')
  })

  test('maps finish_reason stop to end_turn', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
    ])

    const msgDelta = events.find(e => e.type === 'message_delta') as any
    expect(msgDelta.delta.stop_reason).toBe('end_turn')
  })

  test('forces tool_use stop_reason when tool_calls present but finish_reason is stop', async () => {
    // Some backends (e.g., certain OpenAI-compatible endpoints) incorrectly
    // return finish_reason "stop" when they actually made tool calls.
    const events = await collectEvents([
      makeChunk({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'bash', arguments: '{"cmd":"ls"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
    ])

    const msgDelta = events.find(e => e.type === 'message_delta') as any
    expect(msgDelta.delta.stop_reason).toBe('tool_use')
  })

  test('maps finish_reason tool_calls to tool_use', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'bash', arguments: '{}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      }),
    ])

    const msgDelta = events.find(e => e.type === 'message_delta') as any
    expect(msgDelta.delta.stop_reason).toBe('tool_use')
  })

  test('maps finish_reason length to max_tokens', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [
          { index: 0, delta: { content: 'truncated' }, finish_reason: null },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
      }),
    ])

    const msgDelta = events.find(e => e.type === 'message_delta') as any
    expect(msgDelta.delta.stop_reason).toBe('max_tokens')
  })

  test('handles mixed text and tool_calls', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [
          { index: 0, delta: { content: 'Thinking...' }, finish_reason: null },
        ],
      }),
      makeChunk({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'grep', arguments: '{"p":"test"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      }),
    ])

    const blockStarts = events.filter(
      e => e.type === 'content_block_start',
    ) as any[]
    expect(blockStarts.length).toBe(2)
    expect(blockStarts[0].content_block.type).toBe('text')
    expect(blockStarts[1].content_block.type).toBe('tool_use')
  })
})

describe('thinking support (reasoning_content)', () => {
  test('converts reasoning_content to thinking block', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { reasoning_content: 'Let me analyze this...' },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { reasoning_content: ' step by step.' },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
    ])

    // Should have a thinking content block
    const blockStart = events.find(e => e.type === 'content_block_start') as any
    expect(blockStart.content_block.type).toBe('thinking')
    expect(blockStart.content_block.signature).toBe('')

    // Should have thinking_delta events
    const thinkingDeltas = events.filter(
      e =>
        e.type === 'content_block_delta' && e.delta.type === 'thinking_delta',
    ) as any[]
    expect(thinkingDeltas.length).toBe(2)
    expect(thinkingDeltas[0].delta.thinking).toBe('Let me analyze this...')
    expect(thinkingDeltas[1].delta.thinking).toBe(' step by step.')
  })

  test('converts reasoning then content (DeepSeek-style)', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { reasoning_content: 'Thinking about the answer...' },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { content: 'Here is my answer.' },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
    ])

    // Should have two content blocks: thinking + text
    const blockStarts = events.filter(
      e => e.type === 'content_block_start',
    ) as any[]
    expect(blockStarts.length).toBe(2)
    expect(blockStarts[0].content_block.type).toBe('thinking')
    expect(blockStarts[1].content_block.type).toBe('text')

    // Thinking block should be closed before text block starts
    const blockStops = events.filter(
      e => e.type === 'content_block_stop',
    ) as any[]
    expect(blockStops[0].index).toBe(0) // thinking block closed at index 0
    expect(blockStarts[1].index).toBe(1) // text block starts at index 1

    // Verify text delta
    const textDelta = events.find(
      e => e.type === 'content_block_delta' && e.delta.type === 'text_delta',
    ) as any
    expect(textDelta.delta.text).toBe('Here is my answer.')
  })

  test('handles reasoning then tool_calls', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { reasoning_content: 'I need to run a command.' },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'bash', arguments: '{"c":"ls"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      }),
    ])

    const blockStarts = events.filter(
      e => e.type === 'content_block_start',
    ) as any[]
    expect(blockStarts.length).toBe(2)
    expect(blockStarts[0].content_block.type).toBe('thinking')
    expect(blockStarts[1].content_block.type).toBe('tool_use')
  })

  test('opens thinking block on empty reasoning_content (DeepSeek v4 direct-answer)', async () => {
    // DeepSeek v4 thinking mode sometimes streams reasoning_content: ""
    // before answering directly. We must still open a thinking block so the
    // resulting assistant message carries an (empty) thinking block — that
    // round-trips back as reasoning_content: "" in the next request,
    // satisfying DeepSeek's requirement (see issue #399).
    const events = await collectEvents([
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { reasoning_content: '' },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { content: 'Direct answer.' },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
    ])

    // A thinking block was opened (and closed before the text block starts)
    const blockStarts = events.filter(
      e => e.type === 'content_block_start',
    ) as any[]
    expect(blockStarts.length).toBe(2)
    expect(blockStarts[0].content_block.type).toBe('thinking')
    expect(blockStarts[0].content_block.thinking).toBe('')
    expect(blockStarts[1].content_block.type).toBe('text')

    // No empty thinking_delta should be emitted — the empty string is
    // already conveyed by the thinking block's initial value.
    const thinkingDeltas = events.filter(
      e =>
        e.type === 'content_block_delta' && e.delta.type === 'thinking_delta',
    )
    expect(thinkingDeltas.length).toBe(0)
  })

  test('thinking block index is 0, text block index is 1', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { reasoning_content: 'reason' },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { content: 'answer' },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
    ])

    const blockStarts = events.filter(
      e => e.type === 'content_block_start',
    ) as any[]
    expect(blockStarts[0].index).toBe(0)
    expect(blockStarts[1].index).toBe(1)
  })
})

describe('prompt caching support', () => {
  test('maps cached_tokens to cache_read_input_tokens', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [
          {
            index: 0,
            delta: { content: 'hi' },
            finish_reason: null,
          },
        ],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 0,
          total_tokens: 1000,
          prompt_tokens_details: { cached_tokens: 800 },
        } as any,
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 50,
          total_tokens: 1050,
          prompt_tokens_details: { cached_tokens: 800 },
        } as any,
      }),
    ])

    const msgStart = events.find(e => e.type === 'message_start') as any
    expect(msgStart.message.usage.cache_read_input_tokens).toBe(800)
    expect(msgStart.message.usage.input_tokens).toBe(1000)
  })

  test('defaults cache_read_input_tokens to 0 when no cached_tokens', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
        usage: { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 },
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
    ])

    const msgStart = events.find(e => e.type === 'message_start') as any
    expect(msgStart.message.usage.cache_read_input_tokens).toBe(0)
    expect(msgStart.message.usage.cache_creation_input_tokens).toBe(0)
  })

  test('updates cached_tokens from later chunks', async () => {
    const events = await collectEvents([
      makeChunk({
        choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 0,
          total_tokens: 500,
        } as any,
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 10,
          total_tokens: 510,
          prompt_tokens_details: { cached_tokens: 300 },
        } as any,
      }),
    ])

    const msgStart = events.find(e => e.type === 'message_start') as any
    // First chunk had no cached_tokens, so initially 0
    // But the message_start usage reflects the first chunk's data
    expect(msgStart.message.usage.cache_read_input_tokens).toBe(0)
    expect(msgStart.message.usage.input_tokens).toBe(500)
  })

  test('captures output_tokens and input_tokens from trailing chunk sent after finish_reason', async () => {
    // Many OpenAI-compatible endpoints (e.g. DeepSeek) send usage in a separate
    // final chunk AFTER the finish_reason chunk, with choices: [].
    // message_delta must carry both input_tokens and output_tokens so that
    // queryModelOpenAI's spread can override the zeros from message_start — which is
    // emitted before the trailing chunk and always has input_tokens=0.
    const events = await collectEvents([
      makeChunk({
        choices: [
          { index: 0, delta: { content: 'hello' }, finish_reason: null },
        ],
      }),
      // finish_reason chunk — usage not yet available
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
      // trailing usage-only chunk (choices: [])
      makeChunk({
        choices: [],
        usage: { prompt_tokens: 123, completion_tokens: 45, total_tokens: 168 },
      }),
    ])

    // message_start emits on the first chunk before trailing usage arrives
    const msgStart = events.find(e => e.type === 'message_start') as any
    expect(msgStart.message.usage.input_tokens).toBe(0)

    // message_delta is emitted after stream loop ends with final real values
    const msgDelta = events.find(e => e.type === 'message_delta') as any
    expect(msgDelta.usage.input_tokens).toBe(123)
    expect(msgDelta.usage.output_tokens).toBe(45)
    expect(msgDelta.delta.stop_reason).toBe('end_turn')
  })

  test('captures input_tokens from trailing chunk (used by tokenCountWithEstimation for autocompact)', async () => {
    // input_tokens is the dominant term in tokenCountWithEstimation. Without it,
    // getTokenCountFromUsage returns only output_tokens (~100-700), which is far below
    // the autocompact threshold (~33k), so compaction never fires.
    const events = await collectEvents([
      makeChunk({
        choices: [
          { index: 0, delta: { content: 'answer' }, finish_reason: null },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
      makeChunk({
        choices: [],
        usage: {
          prompt_tokens: 800,
          completion_tokens: 200,
          total_tokens: 1000,
        },
      }),
    ])

    const msgDelta = events.find(e => e.type === 'message_delta') as any
    expect(msgDelta.usage.input_tokens).toBe(800)
    expect(msgDelta.usage.output_tokens).toBe(200)
  })

  test('trailing usage chunk with tool_calls: stop_reason stays tool_use', async () => {
    // Verifies that deferring message_delta does not break stop_reason mapping
    // when the model made tool calls and usage arrives in a trailing chunk.
    const events = await collectEvents([
      makeChunk({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_x',
                  function: { name: 'bash', arguments: '{"cmd":"ls"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      }),
      // trailing usage-only chunk
      makeChunk({
        choices: [],
        usage: { prompt_tokens: 500, completion_tokens: 30, total_tokens: 530 },
      }),
    ])

    const msgDelta = events.find(e => e.type === 'message_delta') as any
    expect(msgDelta.delta.stop_reason).toBe('tool_use')
    expect(msgDelta.usage.output_tokens).toBe(30)
  })

  test('message_delta always comes before message_stop', async () => {
    // Verifies event ordering is preserved after deferring to post-loop emission.
    const events = await collectEvents([
      makeChunk({
        choices: [{ index: 0, delta: { content: 'x' }, finish_reason: null }],
      }),
      makeChunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
      makeChunk({
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    ])

    const types = events.map(e => e.type)
    const deltaIdx = types.lastIndexOf('message_delta')
    const stopIdx = types.lastIndexOf('message_stop')
    expect(deltaIdx).toBeGreaterThanOrEqual(0)
    expect(stopIdx).toBeGreaterThan(deltaIdx)
  })

  // ── cache_read_input_tokens in message_delta (the core bug fix) ──────────

  test('message_delta carries cache_read_input_tokens from trailing usage chunk', async () => {
    // Real-world case: DeepSeek-V3 returns cached_tokens=19904
    // in a trailing chunk with choices:[]. Previously message_delta only carried
    // input_tokens and output_tokens, so cache_read_input_tokens stayed 0 after
    // queryModelOpenAI's spread — even though cachedTokens was captured internally.
    const events = await collectEvents([
      makeChunk({
        choices: [
          { index: 0, delta: { content: 'answer' }, finish_reason: null },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
      // trailing usage chunk matching the observed server response format
      makeChunk({
        choices: [],
        usage: {
          prompt_tokens: 30011,
          completion_tokens: 190,
          total_tokens: 30201,
          prompt_tokens_details: { audio_tokens: 0, cached_tokens: 19904 },
        } as any,
      }),
    ])

    // message_start is emitted before trailing chunk — cache fields are 0
    const msgStart = events.find(e => e.type === 'message_start') as any
    expect(msgStart.message.usage.cache_read_input_tokens).toBe(0)

    // message_delta carries the real values from the trailing chunk
    const msgDelta = events.find(e => e.type === 'message_delta') as any
    expect(msgDelta.usage.input_tokens).toBe(30011)
    expect(msgDelta.usage.output_tokens).toBe(190)
    expect(msgDelta.usage.cache_read_input_tokens).toBe(19904)
    expect(msgDelta.usage.cache_creation_input_tokens).toBe(0)
  })

  test('cache_read_input_tokens=0 in message_delta when cached_tokens is absent', async () => {
    // Non-caching requests should still have the field present and zero.
    const events = await collectEvents([
      makeChunk({
        choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
      makeChunk({
        choices: [],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      }),
    ])

    const msgDelta = events.find(e => e.type === 'message_delta') as any
    expect(msgDelta.usage.cache_read_input_tokens).toBe(0)
    expect(msgDelta.usage.cache_creation_input_tokens).toBe(0)
  })

  test('cache_read_input_tokens=0 in message_delta when cached_tokens is 0', async () => {
    // Explicit cached_tokens:0 should not be treated differently from absent.
    const events = await collectEvents([
      makeChunk({
        choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }),
      makeChunk({
        choices: [],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 50,
          total_tokens: 550,
          prompt_tokens_details: { cached_tokens: 0 },
        } as any,
      }),
    ])

    const msgDelta = events.find(e => e.type === 'message_delta') as any
    expect(msgDelta.usage.cache_read_input_tokens).toBe(0)
  })

  test('cache_read_input_tokens updated when cached_tokens arrives in same chunk as finish_reason', async () => {
    // Some endpoints send usage in the finish_reason chunk instead of a trailing chunk.
    const events = await collectEvents([
      makeChunk({
        choices: [
          { index: 0, delta: { content: 'result' }, finish_reason: null },
        ],
      }),
      makeChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 2000,
          completion_tokens: 100,
          total_tokens: 2100,
          prompt_tokens_details: { cached_tokens: 1500 },
        } as any,
      }),
    ])

    const msgDelta = events.find(e => e.type === 'message_delta') as any
    expect(msgDelta.usage.cache_read_input_tokens).toBe(1500)
    expect(msgDelta.usage.input_tokens).toBe(2000)
    expect(msgDelta.usage.output_tokens).toBe(100)
  })
})
