import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

export type OpenAIResponsesTool = {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
}

export function anthropicToolsToOpenAIResponses(
  tools: BetaToolUnion[],
): OpenAIResponsesTool[] {
  return tools
    .filter(tool => {
      const toolType = (tool as unknown as { type?: string }).type
      return tool.type === 'custom' || !('type' in tool) || toolType !== 'server'
    })
    .map(tool => {
      const anyTool = tool as unknown as Record<string, unknown>
      const name = (anyTool.name as string) || ''
      const description = (anyTool.description as string) || ''
      const inputSchema = anyTool.input_schema as Record<string, unknown> | undefined

      return {
        type: 'function',
        name,
        description,
        parameters: sanitizeJsonSchema(inputSchema || { type: 'object', properties: {} }),
      }
    })
}

export function anthropicToolChoiceToOpenAIResponses(
  toolChoice: unknown,
): 'auto' | 'required' | { type: 'function'; name: string } | undefined {
  if (!toolChoice || typeof toolChoice !== 'object') return undefined

  const tc = toolChoice as Record<string, unknown>
  const type = tc.type as string

  switch (type) {
    case 'auto':
      return 'auto'
    case 'any':
      return 'required'
    case 'tool':
      return {
        type: 'function',
        name: tc.name as string,
      }
    default:
      return undefined
  }
}

function sanitizeJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema

  const result = { ...schema }

  if ('const' in result) {
    result.enum = [result.const]
    delete result.const
  }

  const objectKeys = ['properties', 'definitions', '$defs', 'patternProperties'] as const
  for (const key of objectKeys) {
    const nested = result[key]
    if (nested && typeof nested === 'object') {
      const sanitized: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(nested as Record<string, unknown>)) {
        sanitized[k] = v && typeof v === 'object' ? sanitizeJsonSchema(v as Record<string, unknown>) : v
      }
      result[key] = sanitized
    }
  }

  const singleKeys = ['items', 'additionalProperties', 'not', 'if', 'then', 'else', 'contains', 'propertyNames'] as const
  for (const key of singleKeys) {
    const nested = result[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      result[key] = sanitizeJsonSchema(nested as Record<string, unknown>)
    }
  }

  const arrayKeys = ['anyOf', 'oneOf', 'allOf'] as const
  for (const key of arrayKeys) {
    const nested = result[key]
    if (Array.isArray(nested)) {
      result[key] = nested.map(item =>
        item && typeof item === 'object' ? sanitizeJsonSchema(item as Record<string, unknown>) : item
      )
    }
  }

  return result
}
