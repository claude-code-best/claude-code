import { describe, expect, test } from 'bun:test'
import {
  anthropicMessagesToOpenAIResponses,
  extractOpenAIResponsesReasoningItemsFromResponse,
} from '../openaiResponsesConvertMessages.js'

describe('anthropicMessagesToOpenAIResponses', () => {
  test('converts tool results and preserves reasoning items', () => {
    const result = anthropicMessagesToOpenAIResponses([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'call_1',
              name: 'bash',
              input: { command: 'ls' },
            },
          ],
        },
        openaiReasoningItems: [
          {
            type: 'reasoning',
            encrypted_content: 'enc123',
          },
        ],
      } as any,
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_1',
              content: 'done',
            },
            {
              type: 'text',
              text: 'next',
            },
          ],
        },
      } as any,
    ])

    expect(result[0]).toEqual({
      type: 'reasoning',
      encrypted_content: 'enc123',
    })
    expect(result[1]).toEqual({
      type: 'function_call',
      call_id: 'call_1',
      name: 'bash',
      arguments: JSON.stringify({ command: 'ls' }),
    })
    expect(result[2]).toEqual({
      type: 'function_call_output',
      call_id: 'call_1',
      output: 'done',
    })
    expect(result[3]).toEqual({
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'next' }],
    })
  })

  test('extracts encrypted reasoning items from completed responses', () => {
    const reasoningItems = extractOpenAIResponsesReasoningItemsFromResponse({
      output: [
        { type: 'message' },
        { type: 'reasoning', encrypted_content: 'enc456' },
      ],
    })

    expect(reasoningItems).toEqual([
      { type: 'reasoning', encrypted_content: 'enc456' },
    ])
  })
})
