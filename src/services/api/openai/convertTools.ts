import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions.mjs'

/**
 * Convert Anthropic tool schemas to OpenAI function calling format.
 *
 * Anthropic: { name, description, input_schema }
 * OpenAI:    { type: "function", function: { name, description, parameters } }
 *
 * Anthropic-specific fields (cache_control, defer_loading, etc.) are stripped.
 */
export function anthropicToolsToOpenAI(
  tools: BetaToolUnion[],
): ChatCompletionTool[] {
  return tools
    .filter(tool => {
      // Only convert standard tools (skip server tools like computer_use, etc.)
      const toolType = (tool as unknown as { type?: string }).type
      return tool.type === 'custom' || !('type' in tool) || toolType !== 'server'
    })
    .map(tool => {
      // Handle the various tool shapes from Anthropic SDK
      const anyTool = tool as unknown as Record<string, unknown>
      const name = (anyTool.name as string) || ''
      const description = (anyTool.description as string) || ''
      const inputSchema = anyTool.input_schema as Record<string, unknown> | undefined

      return {
        type: 'function' as const,
        function: {
          name,
          description,
          parameters: sanitizeJsonSchema(inputSchema || { type: 'object', properties: {} }),
        },
      } satisfies ChatCompletionTool
    })
}

/**
 * Recursively sanitize a JSON Schema for OpenAI-compatible providers.
 *
 * Many OpenAI-compatible endpoints (Ollama, DeepSeek, vLLM, etc.) do not
 * support the `const` keyword in JSON Schema. Convert it to `enum` with a
 * single-element array, which is semantically equivalent.
 */
function sanitizeJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema

  const result = { ...schema }

  // Convert `const` → `enum: [value]`
  if ('const' in result) {
    result.enum = [result.const]
    delete result.const
  }

  // Recursively process nested schemas
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

  // Recursively process single-schema keys
  const singleKeys = ['items', 'additionalProperties', 'not', 'if', 'then', 'else', 'contains', 'propertyNames'] as const
  for (const key of singleKeys) {
    const nested = result[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      result[key] = sanitizeJsonSchema(nested as Record<string, unknown>)
    }
  }

  // Recursively process array-of-schemas keys
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

/**
 * Map Anthropic tool_choice to OpenAI tool_choice format.
 *
 * Anthropic → OpenAI:
 * - { type: "auto" } → "auto"
 * - { type: "any" }  → "required"
 * - { type: "tool", name } → { type: "function", function: { name } }
 * - undefined → undefined (use provider default)
 */
export function anthropicToolChoiceToOpenAI(
  toolChoice: unknown,
): string | { type: 'function'; function: { name: string } } | undefined {
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
        function: { name: tc.name as string },
      }
    default:
      return undefined
  }
}
