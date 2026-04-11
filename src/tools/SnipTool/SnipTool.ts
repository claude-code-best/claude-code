import { z } from 'zod/v4'
import type { ToolResultBlockParam } from '../../Tool.js'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { SNIP_TOOL_NAME } from './prompt.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    message_ids: z
      .array(z.string())
      .describe(
        'IDs of the messages to snip from history. Snipped messages are replaced with a short summary.',
      ),
    reason: z
      .string()
      .optional()
      .describe(
        'Why these messages are being snipped. Used in the summary replacement.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type SnipInput = z.infer<InputSchema>

type SnipOutput = { snipped_count: number; summary: string }

export const SnipTool = buildTool({
  name: SNIP_TOOL_NAME,
  searchHint: 'snip trim history remove old messages compact context',
  maxResultSizeChars: 5_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return 'Snip messages from conversation history to free up context'
  },
  async prompt() {
    return `Snip messages from your conversation history to free up context window space. Snipped messages are replaced with a compact summary so you retain awareness of what happened without the full content.

Use this when:
- Your context is getting full and you need to make room
- Earlier messages contain large tool outputs you no longer need in full
- You want to compact a long exploration sequence into a summary

Guidelines:
- Only snip messages you're confident you won't need verbatim again
- The summary replacement preserves key facts (file paths, decisions, errors found)
- You cannot un-snip — the original content is gone from context`
  },

  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },

  userFacingName() {
    return 'Snip'
  },

  renderToolUseMessage(input: Partial<SnipInput>) {
    const count = input.message_ids?.length ?? 0
    return `Snip: ${count} message${count !== 1 ? 's' : ''}`
  },

  mapToolResultToToolResultBlockParam(
    content: SnipOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Snipped ${content.snipped_count} messages. Summary: ${content.summary}`,
    }
  },

  async call(input: SnipInput) {
    // Snip implementation is handled by the query engine's projection system.
    // The tool call itself records the intent; the query engine intercepts
    // snip tool results and adjusts its message projection accordingly.
    return {
      data: {
        snipped_count: input.message_ids.length,
        summary: input.reason ?? `Snipped ${input.message_ids.length} messages`,
      },
    }
  },
})
