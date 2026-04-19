import { describe, expect, test } from 'bun:test'
import {
  adaptOpenAIResponsesStreamToAnthropic,
  type OpenAIResponsesMetadataEvent,
} from '../openaiResponsesStreamAdapter.js'

function mockStream(events: any[]): AsyncIterable<any> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0
      return {
        async next() {
          if (i >= events.length) return { done: true, value: undefined }
          return { done: false, value: events[i++] }
        },
      }
    },
  }
}

async function collectEvents(events: any[]) {
  const collected: any[] = []
  for await (const event of adaptOpenAIResponsesStreamToAnthropic(mockStream(events), 'gpt-5.4')) {
    collected.push(event)
  }
  return collected
}

describe('adaptOpenAIResponsesStreamToAnthropic', () => {
  test('converts text output and completed usage', async () => {
    const events = await collectEvents([
      {
        type: 'response.output_item.added',
        item: { id: 'msg_1', type: 'message', role: 'assistant' },
      },
      {
        type: 'response.output_text.delta',
        item_id: 'msg_1',
        delta: 'Hello',
      },
      {
        type: 'response.output_item.done',
        item: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello' }],
        },
      },
      {
        type: 'response.completed',
        response: {
          usage: {
            input_tokens: 12,
            output_tokens: 3,
            input_tokens_details: { cached_tokens: 7 },
          },
          output: [],
        },
      },
    ])

    const textDelta = events.find(event => event.type === 'content_block_delta')
    const messageDelta = events.find(event => event.type === 'message_delta')

    expect(textDelta.delta.text).toBe('Hello')
    expect(messageDelta.delta.stop_reason).toBe('end_turn')
    expect(messageDelta.usage.cache_read_input_tokens).toBe(7)
  })

  test('converts function calls and exposes reasoning metadata', async () => {
    const events = await collectEvents([
      {
        type: 'response.output_item.added',
        item: {
          id: 'reason_1',
          type: 'reasoning',
        },
      },
      {
        type: 'response.reasoning_summary_text.delta',
        item_id: 'reason_1',
        delta: 'Thinking',
      },
      {
        type: 'response.output_item.done',
        item: {
          id: 'reason_1',
          type: 'reasoning',
          encrypted_content: 'enc789',
        },
      },
      {
        type: 'response.output_item.added',
        item: {
          id: 'fc_1',
          type: 'function_call',
          call_id: 'call_123',
          name: 'bash',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: 'fc_1',
        delta: '{"command":"ls"}',
      },
      {
        type: 'response.output_item.done',
        item: {
          id: 'fc_1',
          type: 'function_call',
          call_id: 'call_123',
          name: 'bash',
          arguments: '{"command":"ls"}',
        },
      },
      {
        type: 'response.completed',
        response: {
          usage: {
            input_tokens: 20,
            output_tokens: 5,
            prompt_tokens_details: { cached_tokens: 9 },
          },
          output: [{ type: 'reasoning', encrypted_content: 'enc789' }],
        },
      },
    ])

    const toolStart = events.find(
      event => event.type === 'content_block_start' && event.content_block.type === 'tool_use',
    )
    const messageDelta = events.find(event => event.type === 'message_delta')
    const metadata = events.find(
      event => event.type === 'openai_responses_metadata',
    ) as OpenAIResponsesMetadataEvent

    expect(toolStart.content_block.id).toBe('call_123')
    expect(messageDelta.delta.stop_reason).toBe('tool_use')
    expect(messageDelta.usage.cache_read_input_tokens).toBe(9)
    expect(metadata.reasoningItems).toEqual([
      { id: 'reason_1', type: 'reasoning', encrypted_content: 'enc789' },
    ])
  })
})
