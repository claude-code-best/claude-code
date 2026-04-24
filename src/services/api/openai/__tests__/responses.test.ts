import { afterEach, describe, expect, test } from 'bun:test'
import type { ResponseStreamEvent } from 'openai/resources/responses/responses.mjs'
import {
  adaptResponsesStreamToAnthropic,
  buildOpenAIResponsesRequestBody,
  resolveOpenAIWireAPI,
} from '../responses.js'

const originalWireAPI = process.env.OPENAI_WIRE_API

afterEach(() => {
  if (originalWireAPI === undefined) {
    delete process.env.OPENAI_WIRE_API
  } else {
    process.env.OPENAI_WIRE_API = originalWireAPI
  }
})

async function collectAdaptedEvents(events: ResponseStreamEvent[]) {
  async function* stream() {
    for (const event of events) {
      yield event
    }
  }

  const result = []
  for await (const event of adaptResponsesStreamToAnthropic(
    stream() as any,
    'test-model',
  )) {
    result.push(event)
  }
  return result
}

describe('resolveOpenAIWireAPI', () => {
  test('defaults to chat completions', () => {
    delete process.env.OPENAI_WIRE_API
    expect(resolveOpenAIWireAPI()).toBe('chat_completions')
  })

  test('accepts responses env override', () => {
    process.env.OPENAI_WIRE_API = 'responses'
    expect(resolveOpenAIWireAPI()).toBe('responses')
  })
})

describe('buildOpenAIResponsesRequestBody', () => {
  test('converts messages, tools, and tool choice', () => {
    const body = buildOpenAIResponsesRequestBody({
      model: 'gpt-test',
      messages: [
        {
          type: 'user',
          message: { content: 'hello' },
        },
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'toolu_123',
                name: 'bash',
                input: { command: 'ls' },
              },
            ],
          },
        },
        {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_123',
                content: 'ok',
              },
              {
                type: 'text',
                text: 'next',
              },
            ],
          },
        },
      ] as any,
      systemPrompt: ['system prompt'] as any,
      tools: [
        {
          type: 'custom',
          name: 'bash',
          description: 'Run shell commands',
          input_schema: {
            type: 'object',
            properties: {
              command: { const: 'ls' },
            },
          },
          strict: true,
        },
      ] as any,
      toolChoice: { type: 'tool', name: 'bash' },
      enableThinking: false,
      maxTokens: 4096,
      temperatureOverride: 0.2,
    })

    expect(body.instructions).toBe('system prompt')
    expect(body.max_output_tokens).toBe(4096)
    expect(body.tool_choice).toEqual({ type: 'function', name: 'bash' })
    expect(body.tools).toEqual([
      {
        type: 'function',
        name: 'bash',
        description: 'Run shell commands',
        parameters: {
          type: 'object',
          properties: {
            command: { enum: ['ls'] },
          },
        },
        strict: true,
      },
    ])
    expect(body.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'hello' }],
      },
      {
        type: 'function_call',
        call_id: 'toolu_123',
        name: 'bash',
        arguments: '{"command":"ls"}',
      },
      {
        type: 'function_call_output',
        call_id: 'toolu_123',
        output: 'ok',
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'next' }],
      },
    ])
  })
})

describe('adaptResponsesStreamToAnthropic', () => {
  test('maps streamed function calls and terminal usage', async () => {
    const events = await collectAdaptedEvents([
      {
        type: 'response.created',
        sequence_number: 1,
        response: {
          id: 'resp_1',
          object: 'response',
          created_at: 0,
          model: 'test-model',
          output: [],
          output_text: '',
          tools: [],
          tool_choice: 'auto',
          parallel_tool_calls: false,
          temperature: null,
          top_p: null,
          error: null,
          incomplete_details: null,
          instructions: null,
          metadata: null,
          usage: null,
        },
      } as any,
      {
        type: 'response.output_item.added',
        sequence_number: 2,
        output_index: 0,
        item: {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'toolu_123',
          name: 'bash',
          arguments: '',
          status: 'in_progress',
        },
      } as any,
      {
        type: 'response.function_call_arguments.delta',
        sequence_number: 3,
        output_index: 0,
        item_id: 'fc_1',
        delta: '{"command":"ls"}',
      } as any,
      {
        type: 'response.completed',
        sequence_number: 4,
        response: {
          usage: {
            input_tokens: 11,
            output_tokens: 7,
            total_tokens: 18,
            input_tokens_details: { cached_tokens: 2 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
        },
      } as any,
    ])

    expect(events).toEqual([
      expect.objectContaining({ type: 'message_start' }),
      expect.objectContaining({
        type: 'content_block_start',
        content_block: expect.objectContaining({
          type: 'tool_use',
          id: 'toolu_123',
          name: 'bash',
        }),
      }),
      expect.objectContaining({
        type: 'content_block_delta',
        delta: {
          type: 'input_json_delta',
          partial_json: '{"command":"ls"}',
        },
      }),
      expect.objectContaining({ type: 'content_block_stop' }),
      expect.objectContaining({
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 2,
        },
      }),
      expect.objectContaining({ type: 'message_stop' }),
    ])
  })
})
