import { describe, expect, test } from 'bun:test'
import {
  anthropicToolChoiceToGemini,
  anthropicToolsToGemini,
} from '../convertTools.js'

describe('anthropicToolsToGemini', () => {
  test('converts basic tool to parametersJsonSchema', () => {
    const tools = [
      {
        type: 'custom',
        name: 'bash',
        description: 'Run a bash command',
        input_schema: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command'],
        },
      },
    ]

    expect(anthropicToolsToGemini(tools as any)).toEqual([
      {
        functionDeclarations: [
          {
            name: 'bash',
            description: 'Run a bash command',
            parametersJsonSchema: {
              type: 'object',
              properties: { command: { type: 'string' } },
              propertyOrdering: ['command'],
              required: ['command'],
            },
          },
        ],
      },
    ])
  })

  test('sanitizes unsupported JSON Schema fields for Gemini', () => {
    const tools = [
      {
        type: 'custom',
        name: 'complex',
        description: 'Complex schema',
        input_schema: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          additionalProperties: false,
          propertyNames: { pattern: '^[a-z]+$' },
          properties: {
            mode: { const: 'strict' },
            retries: {
              type: 'integer',
              exclusiveMinimum: 0,
            },
            metadata: {
              type: 'object',
              additionalProperties: {
                type: 'string',
                propertyNames: { pattern: '^[a-z]+$' },
              },
            },
          },
          required: ['mode'],
        },
      },
    ]

    expect(anthropicToolsToGemini(tools as any)).toEqual([
      {
        functionDeclarations: [
          {
            name: 'complex',
            description: 'Complex schema',
            parametersJsonSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                mode: {
                  type: 'string',
                  enum: ['strict'],
                },
                retries: {
                  type: 'integer',
                  minimum: 0,
                },
                metadata: {
                  type: 'object',
                  additionalProperties: {
                    type: 'string',
                  },
                },
              },
              propertyOrdering: ['mode', 'retries', 'metadata'],
              required: ['mode'],
            },
          },
        ],
      },
    ])
  })

  test('returns empty array when no tools are provided', () => {
    expect(anthropicToolsToGemini([])).toEqual([])
  })
})

describe('anthropicToolChoiceToGemini', () => {
  test('maps auto', () => {
    expect(anthropicToolChoiceToGemini({ type: 'auto' })).toEqual({
      mode: 'AUTO',
    })
  })

  test('maps any', () => {
    expect(anthropicToolChoiceToGemini({ type: 'any' })).toEqual({
      mode: 'ANY',
    })
  })

  test('maps explicit tool choice', () => {
    expect(
      anthropicToolChoiceToGemini({ type: 'tool', name: 'bash' }),
    ).toEqual({
      mode: 'ANY',
      allowedFunctionNames: ['bash'],
    })
  })
})
