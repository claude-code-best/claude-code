import { describe, expect, test } from 'bun:test'
import { anthropicToolsToOllama } from '../convertTools.js'

describe('anthropicToolsToOllama', () => {
  test('converts basic tools to Ollama function tools', () => {
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

    expect(anthropicToolsToOllama(tools as any)).toEqual([
      {
        type: 'function',
        function: {
          name: 'bash',
          description: 'Run a bash command',
          parameters: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command'],
          },
        },
      },
    ])
  })

  test('keeps WebFetch parameters in Ollama-compatible schema subset', () => {
    const tools = [
      {
        type: 'custom',
        name: 'WebFetch',
        description: 'Fetch a URL',
        input_schema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {
            url: {
              type: 'string',
              format: 'uri',
              description: 'The URL to fetch content from',
            },
            prompt: {
              type: 'string',
              description: 'The prompt to run on the fetched content',
            },
          },
          required: ['url', 'prompt'],
          additionalProperties: false,
        },
      },
    ]

    expect(
      anthropicToolsToOllama(tools as any)[0]?.function.parameters,
    ).toEqual({
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch content from',
        },
        prompt: {
          type: 'string',
          description: 'The prompt to run on the fetched content',
        },
      },
      required: ['url', 'prompt'],
    })
  })

  test('converts const and strips unsupported schema keywords recursively', () => {
    const tools = [
      {
        type: 'custom',
        name: 'complex',
        description: 'Complex schema',
        input_schema: {
          type: 'object',
          patternProperties: {
            '^x-': { type: 'string' },
          },
          properties: {
            mode: { const: 'strict' },
            metadata: {
              type: 'object',
              additionalProperties: { type: 'string' },
              propertyNames: { pattern: '^[a-z]+$' },
            },
          },
          required: ['mode'],
        },
      },
    ]

    expect(
      anthropicToolsToOllama(tools as any)[0]?.function.parameters,
    ).toEqual({
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['strict'],
        },
        metadata: {
          type: 'object',
        },
      },
      required: ['mode'],
    })
  })
})
