import { describe, expect, test } from 'bun:test'
import { adaptGeminiStreamToAnthropic } from '../streamAdapter.js'
import type { GeminiStreamChunk } from '../types.js'

function mockStream(
  chunks: GeminiStreamChunk[],
): AsyncIterable<GeminiStreamChunk> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        async next() {
          if (index >= chunks.length) {
            return { done: true, value: undefined }
          }
          return { done: false, value: chunks[index++] }
        },
      }
    },
  }
}

async function collectEvents(chunks: GeminiStreamChunk[]) {
  const events: any[] = []
  for await (const event of adaptGeminiStreamToAnthropic(
    mockStream(chunks),
    'gemini-2.5-flash',
  )) {
    events.push(event)
  }
  return events
}

describe('adaptGeminiStreamToAnthropic', () => {
  test('converts text chunks', async () => {
    const events = await collectEvents([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello' }],
            },
          },
        ],
      },
      {
        candidates: [
          {
            content: {
              parts: [{ text: ' world' }],
            },
            finishReason: 'STOP',
          },
        ],
      },
    ])

    const textDeltas = events.filter(
      event =>
        event.type === 'content_block_delta' && event.delta.type === 'text_delta',
    )

    expect(events[0].type).toBe('message_start')
    expect(textDeltas).toHaveLength(2)
    expect(textDeltas[0].delta.text).toBe('Hello')
    expect(textDeltas[1].delta.text).toBe(' world')

    const messageDelta = events.find(event => event.type === 'message_delta')
    expect(messageDelta.delta.stop_reason).toBe('end_turn')
  })

  test('converts thinking chunks and signatures', async () => {
    const events = await collectEvents([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Think', thought: true }],
            },
          },
        ],
      },
      {
        candidates: [
          {
            content: {
              parts: [{ thought: true, thoughtSignature: 'sig-123' }],
            },
            finishReason: 'STOP',
          },
        ],
      },
    ])

    const blockStart = events.find(event => event.type === 'content_block_start')
    expect(blockStart.content_block.type).toBe('thinking')

    const signatureDelta = events.find(
      event =>
        event.type === 'content_block_delta' &&
        event.delta.type === 'signature_delta',
    )
    expect(signatureDelta.delta.signature).toBe('sig-123')
  })

  test('converts function calls to tool_use blocks', async () => {
    const events = await collectEvents([
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'bash',
                    args: { command: 'ls' },
                  },
                  thoughtSignature: 'sig-tool',
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
      },
    ])

    const blockStart = events.find(event => event.type === 'content_block_start')
    expect(blockStart.content_block.type).toBe('tool_use')
    expect(blockStart.content_block.name).toBe('bash')

    const signatureDelta = events.find(
      event =>
        event.type === 'content_block_delta' &&
        event.delta.type === 'signature_delta',
    )
    expect(signatureDelta.delta.signature).toBe('sig-tool')

    const inputDelta = events.find(
      event =>
        event.type === 'content_block_delta' &&
        event.delta.type === 'input_json_delta',
    )
    expect(inputDelta.delta.partial_json).toBe('{"command":"ls"}')

    const messageDelta = events.find(event => event.type === 'message_delta')
    expect(messageDelta.delta.stop_reason).toBe('tool_use')
  })

  test('maps usage metadata into output tokens', async () => {
    const events = await collectEvents([
      {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          thoughtsTokenCount: 2,
        },
      },
    ])

    const messageStart = events.find(event => event.type === 'message_start')
    expect(messageStart.message.usage.input_tokens).toBe(10)

    const messageDelta = events.find(event => event.type === 'message_delta')
    expect(messageDelta.usage.output_tokens).toBe(7)
  })
})
