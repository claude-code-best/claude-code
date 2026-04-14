import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'

const CTX_INSPECT_TOOL_NAME = 'CtxInspect'

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z
      .string()
      .optional()
      .describe('Optional query to filter context entries. If omitted, returns a summary of all context.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type CtxInput = z.infer<InputSchema>

type CtxOutput = {
  total_tokens: number
  message_count: number
  summary: string
}

export const CtxInspectTool = buildTool({
  name: CTX_INSPECT_TOOL_NAME,
  searchHint: 'context inspect tokens usage messages window collapse',
  maxResultSizeChars: 50_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return 'Inspect the current context window contents and token usage'
  },
  async prompt() {
    return `Inspect the current conversation context. Shows token usage, message count, and a breakdown of what's consuming context space.

Use this to understand your context budget before deciding whether to snip old messages or adjust your approach.`
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },

  userFacingName() {
    return 'CtxInspect'
  },

  renderToolUseMessage() {
    return 'Context Inspect'
  },

  mapToolResultToToolResultBlockParam(
    content: CtxOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Context: ${content.total_tokens} tokens, ${content.message_count} messages\n${content.summary}`,
    }
  },

  async call() {
    // Context inspection is wired into the context collapse system.
    return {
      data: {
        total_tokens: 0,
        message_count: 0,
        summary: 'Context inspection requires the CONTEXT_COLLAPSE runtime.',
      },
    }
  },
})
