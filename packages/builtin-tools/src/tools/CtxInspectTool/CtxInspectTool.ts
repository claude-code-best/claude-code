import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { tokenCountWithEstimation } from 'src/utils/tokens.js'
import {
  getStats,
  isContextCollapseEnabled,
} from 'src/services/contextCollapse/index.js'
import { isSessionMemoryInitialized } from 'src/services/SessionMemory/sessionMemoryUtils.js'

const CTX_INSPECT_TOOL_NAME = 'CtxInspect'

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z
      .string()
      .optional()
      .describe(
        'Optional query to filter context entries. If omitted, returns a summary of all context.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type CtxInput = z.infer<InputSchema>

type CtxOutput = {
  total_tokens: number
  message_count: number
  context_window_model: string
  prompt_caching_enabled: boolean
  session_memory_enabled: boolean
  context_collapse_enabled: boolean
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

  async call(input: CtxInput, context) {
    const messages = context.messages ?? []
    const model = context.options?.mainLoopModel ?? 'unknown'
    const totalTokens = tokenCountWithEstimation(messages)
    const collapseEnabled = isContextCollapseEnabled()
    const collapseStats = getStats()
    const focused = input.query?.trim()

    const sessionMemoryEnabled = isSessionMemoryInitialized()
    // Prompt caching is an API-level feature controlled by the provider, not
    // a user-facing toggle. Report as enabled only for providers known to
    // support Anthropic-style prompt caching (first-party, Bedrock, Vertex).
    const promptCachingEnabled =
      !model.startsWith('openai/') &&
      !model.startsWith('grok/') &&
      !model.startsWith('gemini/')

    const summaryParts = [
      focused ? `Focus: ${focused}` : 'Overall context summary',
      `Model context: ${model}`,
      `Prompt caching: ${promptCachingEnabled ? 'enabled' : 'disabled'}`,
      `Session memory: ${sessionMemoryEnabled ? 'enabled' : 'disabled'}`,
      `Context collapse: ${collapseEnabled ? 'enabled' : 'disabled'}`,
    ]

    if (collapseEnabled) {
      summaryParts.push(
        `Collapse spans: ${collapseStats.collapsedSpans} committed, ${collapseStats.stagedSpans} staged, ${collapseStats.collapsedMessages} messages summarized`,
      )
    }

    return {
      data: {
        total_tokens: totalTokens,
        message_count: messages.length,
        context_window_model: model,
        prompt_caching_enabled: promptCachingEnabled,
        session_memory_enabled: sessionMemoryEnabled,
        context_collapse_enabled: collapseEnabled,
        summary: summaryParts.join('\n'),
      },
    }
  },
})
