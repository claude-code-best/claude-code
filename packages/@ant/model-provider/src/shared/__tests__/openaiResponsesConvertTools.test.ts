import { describe, expect, test } from 'bun:test'
import {
  anthropicToolChoiceToOpenAIResponses,
  anthropicToolsToOpenAIResponses,
} from '../openaiResponsesConvertTools.js'

describe('anthropicToolsToOpenAIResponses', () => {
  test('converts tools to flat Responses API shape', () => {
    const result = anthropicToolsToOpenAIResponses([
      {
        name: 'bash',
        description: 'Run a shell command',
        input_schema: {
          type: 'object',
          properties: {
            command: { const: 'ls' },
          },
        },
      } as any,
    ])

    expect(result).toEqual([
      {
        type: 'function',
        name: 'bash',
        description: 'Run a shell command',
        parameters: {
          type: 'object',
          properties: {
            command: { enum: ['ls'] },
          },
        },
      },
    ])
  })

  test('maps tool choice to responses shape', () => {
    expect(anthropicToolChoiceToOpenAIResponses({ type: 'auto' })).toBe('auto')
    expect(anthropicToolChoiceToOpenAIResponses({ type: 'any' })).toBe('required')
    expect(anthropicToolChoiceToOpenAIResponses({ type: 'tool', name: 'bash' })).toEqual({
      type: 'function',
      name: 'bash',
    })
  })
})
