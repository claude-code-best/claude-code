import { describe, expect, test } from 'bun:test'
import { anthropicMessagesToOllama } from '../convertMessages.js'
import type { SystemPrompt } from '../../../types/systemPrompt.js'

describe('anthropicMessagesToOllama', () => {
  test('converts system, text, tool use, and tool result messages', () => {
    const result = anthropicMessagesToOllama(
      [
        {
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'weather?' }],
          },
        } as any,
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_1',
                name: 'get_weather',
                input: { city: 'Paris' },
              },
            ],
          },
        } as any,
        {
          type: 'user',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_1',
                content: 'sunny',
              },
            ],
          },
        } as any,
      ],
      ['You are concise.'] as unknown as SystemPrompt,
    )

    expect(result).toEqual([
      { role: 'system', content: 'You are concise.' },
      { role: 'user', content: 'weather?' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            type: 'function',
            function: {
              index: 0,
              name: 'get_weather',
              arguments: { city: 'Paris' },
            },
          },
        ],
      },
      { role: 'tool', tool_name: 'get_weather', content: 'sunny' },
    ])
  })
})
