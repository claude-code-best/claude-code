import { describe, expect, test } from 'bun:test'
import { adaptOllamaStreamToAnthropic } from '../streamAdapter.js'
import type { OllamaChatChunk } from '../types.js'

async function collect(chunks: OllamaChatChunk[]) {
  const events = []
  async function* stream(): AsyncGenerator<OllamaChatChunk, void> {
    for (const chunk of chunks) {
      yield chunk
    }
  }
  for await (const event of adaptOllamaStreamToAnthropic(
    stream(),
    'qwen3-coder',
  )) {
    events.push(event as any)
  }
  return events
}

describe('adaptOllamaStreamToAnthropic', () => {
  test('streams thinking, text, tool calls, and usage', async () => {
    const events = await collect([
      { message: { thinking: 'think' } },
      { message: { content: 'hello' } },
      {
        message: {
          tool_calls: [
            {
              function: {
                name: 'get_weather',
                arguments: { city: 'Paris' },
              },
            },
          ],
        },
      },
      {
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 12,
        eval_count: 5,
      },
    ])

    expect(events[0].type).toBe('message_start')
    expect(
      events.some(
        event =>
          event.type === 'content_block_delta' &&
          event.delta.type === 'thinking_delta' &&
          event.delta.thinking === 'think',
      ),
    ).toBe(true)
    expect(
      events.some(
        event =>
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta' &&
          event.delta.text === 'hello',
      ),
    ).toBe(true)
    expect(
      events.some(
        event =>
          event.type === 'content_block_start' &&
          event.content_block.type === 'tool_use' &&
          event.content_block.name === 'get_weather',
      ),
    ).toBe(true)

    const messageDelta = events.find(event => event.type === 'message_delta')
    expect(messageDelta).toBeDefined()
    expect(messageDelta.delta.stop_reason).toBe('tool_use')
    expect(messageDelta.usage.input_tokens).toBe(12)
    expect(messageDelta.usage.output_tokens).toBe(5)
  })

  test('throws explicit errors from Ollama stream chunks', async () => {
    await expect(collect([{ error: 'model not found' }])).rejects.toThrow(
      'Ollama stream error: model not found',
    )
  })
})
