import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type {
  GeminiFunctionCallingConfig,
  GeminiTool,
} from './types.js'

const GEMINI_JSON_SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
])

function normalizeGeminiJsonSchemaType(
  value: unknown,
): string | string[] | undefined {
  if (typeof value === 'string') {
    return GEMINI_JSON_SCHEMA_TYPES.has(value) ? value : undefined
  }

  if (Array.isArray(value)) {
    const normalized = value.filter(
      (item): item is string =>
        typeof item === 'string' && GEMINI_JSON_SCHEMA_TYPES.has(item),
    )
    const unique = Array.from(new Set(normalized))
    if (unique.length === 0) return undefined
    return unique.length === 1 ? unique[0] : unique
  }

  return undefined
}

function inferGeminiJsonSchemaTypeFromValue(value: unknown): string | undefined {
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

function inferGeminiJsonSchemaTypeFromEnum(
  values: unknown[],
): string | string[] | undefined {
  const inferred = values
    .map(inferGeminiJsonSchemaTypeFromValue)
    .filter((value): value is string => value !== undefined)
  const unique = Array.from(new Set(inferred))
  if (unique.length === 0) return undefined
  return unique.length === 1 ? unique[0] : unique
}

function addNullToGeminiJsonSchemaType(
  value: string | string[] | undefined,
): string | string[] | undefined {
  if (value === undefined) return ['null']
  if (Array.isArray(value)) {
    return value.includes('null') ? value : [...value, 'null']
  }
  return value === 'null' ? value : [value, 'null']
}

function sanitizeGeminiJsonSchemaProperties(
  value: unknown,
): Record<string, Record<string, unknown>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const sanitizedEntries = Object.entries(value as Record<string, unknown>)
    .map(([key, schema]) => [key, sanitizeGeminiJsonSchema(schema)] as const)
    .filter(([, schema]) => Object.keys(schema).length > 0)

  if (sanitizedEntries.length === 0) {
    return undefined
  }

  return Object.fromEntries(sanitizedEntries)
}

function sanitizeGeminiJsonSchemaArray(
  value: unknown,
): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined

  const sanitized = value
    .map(item => sanitizeGeminiJsonSchema(item))
    .filter(item => Object.keys(item).length > 0)

  return sanitized.length > 0 ? sanitized : undefined
}

function sanitizeGeminiJsonSchema(
  schema: unknown,
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return {}
  }

  const source = schema as Record<string, unknown>
  const result: Record<string, unknown> = {}

  let type = normalizeGeminiJsonSchemaType(source.type)

  if (source.const !== undefined) {
    result.enum = [source.const]
    type = type ?? inferGeminiJsonSchemaTypeFromValue(source.const)
  } else if (Array.isArray(source.enum) && source.enum.length > 0) {
    result.enum = source.enum
    type = type ?? inferGeminiJsonSchemaTypeFromEnum(source.enum)
  }

  if (!type) {
    if (source.properties && typeof source.properties === 'object') {
      type = 'object'
    } else if (source.items !== undefined || source.prefixItems !== undefined) {
      type = 'array'
    }
  }

  if (source.nullable === true) {
    type = addNullToGeminiJsonSchemaType(type)
  }

  if (type) {
    result.type = type
  }

  if (typeof source.title === 'string') {
    result.title = source.title
  }
  if (typeof source.description === 'string') {
    result.description = source.description
  }
  if (typeof source.format === 'string') {
    result.format = source.format
  }
  if (typeof source.pattern === 'string') {
    result.pattern = source.pattern
  }
  if (typeof source.minimum === 'number') {
    result.minimum = source.minimum
  } else if (typeof source.exclusiveMinimum === 'number') {
    result.minimum = source.exclusiveMinimum
  }
  if (typeof source.maximum === 'number') {
    result.maximum = source.maximum
  } else if (typeof source.exclusiveMaximum === 'number') {
    result.maximum = source.exclusiveMaximum
  }
  if (typeof source.minItems === 'number') {
    result.minItems = source.minItems
  }
  if (typeof source.maxItems === 'number') {
    result.maxItems = source.maxItems
  }
  if (typeof source.minLength === 'number') {
    result.minLength = source.minLength
  }
  if (typeof source.maxLength === 'number') {
    result.maxLength = source.maxLength
  }
  if (typeof source.minProperties === 'number') {
    result.minProperties = source.minProperties
  }
  if (typeof source.maxProperties === 'number') {
    result.maxProperties = source.maxProperties
  }

  const properties = sanitizeGeminiJsonSchemaProperties(source.properties)
  if (properties) {
    result.properties = properties
    result.propertyOrdering = Object.keys(properties)
  }

  if (Array.isArray(source.required)) {
    const required = source.required.filter(
      (item): item is string => typeof item === 'string',
    )
    if (required.length > 0) {
      result.required = required
    }
  }

  if (typeof source.additionalProperties === 'boolean') {
    result.additionalProperties = source.additionalProperties
  } else {
    const additionalProperties = sanitizeGeminiJsonSchema(
      source.additionalProperties,
    )
    if (Object.keys(additionalProperties).length > 0) {
      result.additionalProperties = additionalProperties
    }
  }

  const items = sanitizeGeminiJsonSchema(source.items)
  if (Object.keys(items).length > 0) {
    result.items = items
  }

  const prefixItems = sanitizeGeminiJsonSchemaArray(source.prefixItems)
  if (prefixItems) {
    result.prefixItems = prefixItems
  }

  const anyOf = sanitizeGeminiJsonSchemaArray(source.anyOf ?? source.oneOf)
  if (anyOf) {
    result.anyOf = anyOf
  }

  return result
}

function sanitizeGeminiFunctionParameters(
  schema: unknown,
): Record<string, unknown> {
  const sanitized = sanitizeGeminiJsonSchema(schema)
  if (Object.keys(sanitized).length > 0) {
    return sanitized
  }

  return {
    type: 'object',
    properties: {},
  }
}

export function anthropicToolsToGemini(tools: BetaToolUnion[]): GeminiTool[] {
  const functionDeclarations = tools
    .filter(tool => {
      const toolType = (tool as unknown as { type?: string }).type
      return tool.type === 'custom' || !('type' in tool) || toolType !== 'server'
    })
    .map(tool => {
      const anyTool = tool as unknown as Record<string, unknown>
      const name = (anyTool.name as string) || ''
      const description = (anyTool.description as string) || ''
      const inputSchema =
        (anyTool.input_schema as Record<string, unknown> | undefined) ?? {
          type: 'object',
          properties: {},
        }

      return {
        name,
        description,
        parametersJsonSchema: sanitizeGeminiFunctionParameters(inputSchema),
      }
    })

  return functionDeclarations.length > 0
    ? [{ functionDeclarations }]
    : []
}

export function anthropicToolChoiceToGemini(
  toolChoice: unknown,
): GeminiFunctionCallingConfig | undefined {
  if (!toolChoice || typeof toolChoice !== 'object') return undefined

  const tc = toolChoice as Record<string, unknown>
  const type = tc.type as string

  switch (type) {
    case 'auto':
      return { mode: 'AUTO' }
    case 'any':
      return { mode: 'ANY' }
    case 'tool':
      return {
        mode: 'ANY',
        allowedFunctionNames:
          typeof tc.name === 'string' ? [tc.name] : undefined,
      }
    default:
      return undefined
  }
}
