import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { Tool as CodexTool } from 'openai/resources/responses/responses.mjs'

function isClientFunctionTool(
  tool: BetaToolUnion,
): tool is BetaToolUnion & {
  name: string
  description?: string
  input_schema?: { [key: string]: unknown }
  strict?: boolean
  defer_loading?: boolean
} {
  const value = tool as unknown as Record<string, unknown>
  return typeof value.name === 'string'
}

export function anthropicToolsToCodex(
  tools: BetaToolUnion[],
): CodexTool[] {
  return tools.flatMap(tool => {
    const value = tool as unknown as Record<string, unknown>
    if (
      value.type === 'advisor_20260301' ||
      value.type === 'computer_20250124' ||
      !isClientFunctionTool(tool)
    ) {
      return []
    }

    return [{
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema ?? {},
      strict: tool.strict ?? null,
      ...(tool.defer_loading && { defer_loading: true }),
    }]
  })
}
