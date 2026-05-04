import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { OllamaTool } from './types.js'

const OLLAMA_JSON_SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
])

export function anthropicToolsToOllama(tools: BetaToolUnion[]): OllamaTool[] {
  return tools
    .filter(tool => {
      const toolType = (tool as unknown as { type?: string }).type
      return (
        tool.type === 'custom' || !('type' in tool) || toolType !== 'server'
      )
    })
    .map(tool => {
      const anyTool = tool as unknown as Record<string, unknown>
      return {
        type: 'function',
        function: {
          name: (anyTool.name as string) || '',
          description: (anyTool.description as string) || '',
          parameters: sanitizeOllamaFunctionParameters(
            (anyTool.input_schema as Record<string, unknown> | undefined) || {
              type: 'object',
              properties: {},
            },
          ),
        },
      }
    })
}

function normalizeJsonSchemaType(
  value: unknown,
): string | string[] | undefined {
  if (typeof value === 'string') {
    return OLLAMA_JSON_SCHEMA_TYPES.has(value) ? value : undefined
  }

  if (Array.isArray(value)) {
    const normalized = value.filter(
      (item): item is string =>
        typeof item === 'string' && OLLAMA_JSON_SCHEMA_TYPES.has(item),
    )
    const unique = Array.from(new Set(normalized))
    if (unique.length === 0) return undefined
    return unique.length === 1 ? unique[0] : unique
  }

  return undefined
}

function inferJsonSchemaTypeFromValue(value: unknown): string | undefined {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number'
  }
  if (typeof value === 'object') return 'object'
  return undefined
}

function inferJsonSchemaTypeFromEnum(
  values: unknown[],
): string | string[] | undefined {
  const inferred = values
    .map(inferJsonSchemaTypeFromValue)
    .filter((value): value is string => value !== undefined)
  const unique = Array.from(new Set(inferred))
  if (unique.length === 0) return undefined
  return unique.length === 1 ? unique[0] : unique
}

function sanitizeProperties(
  value: unknown,
): Record<string, Record<string, unknown>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, schema]) => [key, sanitizeOllamaJsonSchema(schema)] as const)
    .filter(([, schema]) => Object.keys(schema).length > 0)

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function sanitizeSchemaArray(
  value: unknown,
): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined

  const sanitized = value
    .map(item => sanitizeOllamaJsonSchema(item))
    .filter(item => Object.keys(item).length > 0)

  return sanitized.length > 0 ? sanitized : undefined
}

function sanitizeOllamaJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return {}
  }

  const source = schema as Record<string, unknown>
  const result: Record<string, unknown> = {}
  let type = normalizeJsonSchemaType(source.type)

  if (source.const !== undefined) {
    result.enum = [source.const]
    type = type ?? inferJsonSchemaTypeFromValue(source.const)
  } else if (Array.isArray(source.enum) && source.enum.length > 0) {
    result.enum = source.enum
    type = type ?? inferJsonSchemaTypeFromEnum(source.enum)
  }

  if (!type) {
    if (source.properties && typeof source.properties === 'object') {
      type = 'object'
    } else if (source.items !== undefined || source.prefixItems !== undefined) {
      type = 'array'
    }
  }

  if (type) {
    result.type = type
  }

  if (typeof source.description === 'string') {
    result.description = source.description
  }

  const properties = sanitizeProperties(source.properties)
  if (properties) {
    result.properties = properties
  }

  if (Array.isArray(source.required)) {
    const required = source.required.filter(
      (item): item is string => typeof item === 'string',
    )
    if (required.length > 0) {
      result.required = required
    }
  }

  const items = sanitizeOllamaJsonSchema(source.items)
  if (Object.keys(items).length > 0) {
    result.items = items
  }

  const anyOf = sanitizeSchemaArray(source.anyOf ?? source.oneOf)
  if (anyOf) {
    result.anyOf = anyOf
  }

  const allOf = sanitizeSchemaArray(source.allOf)
  if (allOf) {
    result.allOf = allOf
  }

  return result
}

function sanitizeOllamaFunctionParameters(
  schema: unknown,
): Record<string, unknown> {
  const sanitized = sanitizeOllamaJsonSchema(schema)
  if (Object.keys(sanitized).length > 0) {
    if (sanitized.type !== 'object') {
      return {
        type: 'object',
        properties: {},
      }
    }
    return sanitized
  }

  return {
    type: 'object',
    properties: {},
  }
}
