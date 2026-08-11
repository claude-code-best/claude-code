import { z } from 'zod/v4'
import {
  buildTool,
  findToolByName,
  type Tool,
  type ToolDef,
  type ToolUseContext,
  type ToolResult,
  type Tools,
} from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { createUserMessage } from 'src/utils/messages.js'
import { formatZodValidationError } from 'src/utils/toolErrors.js'
import {
  extractDiscoveredToolNames,
  isSearchExtraToolsEnabledOptimistic,
  isSearchExtraToolsToolAvailable,
} from 'src/utils/searchExtraTools.js'
import { DESCRIPTION, getPrompt } from './prompt.js'
import { EXECUTE_TOOL_NAME } from './constants.js'
import { isDeferredTool } from '../SearchExtraToolsTool/prompt.js'

export const inputSchema = lazySchema(() =>
  z.object({
    tool_name: z
      .string()
      .describe(
        'The exact name of the target tool to execute (e.g., "CronCreate", "mcp__server__action")',
      ),
    params: z
      .record(z.string(), z.unknown())
      .describe('The parameters to pass to the target tool'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export const outputSchema = lazySchema(() =>
  z.object({
    result: z.unknown(),
    tool_name: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ExecuteTool = buildTool({
  name: EXECUTE_TOOL_NAME,
  searchHint: 'execute run invoke call a deferred tool by name with parameters',
  maxResultSizeChars: 100_000,
  isConcurrencySafe() {
    return false
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return getPrompt()
  },
  async call(input, context, canUseTool, parentMessage, onProgress) {
    const tools: Tools = context.options.tools ?? []

    const targetTool = findToolByName(tools, input.tool_name)
    if (!targetTool) {
      return {
        data: {
          result: null,
          tool_name: input.tool_name,
        },
        newMessages: [
          createUserMessage({
            content: `Tool "${input.tool_name}" not found. Use SearchExtraTools to discover available tools.`,
          }),
        ],
      }
    }

    // Guard: block execution of undiscovered deferred tools.
    // When tool search is active, deferred tools must be discovered via
    // SearchExtraTools first so the model has seen their schemas and knows
    // the correct parameters.  Executing an undiscovered tool almost always
    // fails with parameter validation errors.
    if (
      isSearchExtraToolsEnabledOptimistic() &&
      isSearchExtraToolsToolAvailable(tools) &&
      isDeferredTool(targetTool)
    ) {
      const discovered = extractDiscoveredToolNames(context.messages)
      if (!discovered.has(input.tool_name)) {
        return {
          data: {
            result: null,
            tool_name: input.tool_name,
          },
          newMessages: [
            createUserMessage({
              content: `Tool "${input.tool_name}" has not been discovered yet. You must first use SearchExtraTools to discover this tool before executing it.\n\nUsage: SearchExtraTools("select:${input.tool_name}")`,
            }),
          ],
        }
      }
    }

    // Check if the target tool is currently enabled
    if (!targetTool.isEnabled()) {
      return {
        data: {
          result: null,
          tool_name: input.tool_name,
        },
        newMessages: [
          createUserMessage({
            content: `工具 "${input.tool_name}" 当前不可用：Remote Control 未连接。`,
          }),
        ],
      }
    }

    // Schema-validate params against the target tool BEFORE delegating.
    // ExecuteExtraTool passes raw params straight from the model to
    // validateInput/call without re-running the target's zod schema, so a
    // wrong field name (e.g. 'schedule' instead of 'cron') or a missing
    // required field reaches the tool as undefined and the first
    // .trim()/.length/.split() crashes with "undefined is not an object".
    // CronCreateTool's .trim() crash was the reported symptom; centralizing
    // the check here covers every deferred tool without relying on each one
    // to defensively guard its own validateInput. Duck-typed so MCP tools
    // (whose schema is inputJSONSchema, not zod) skip this branch.
    const targetSchema = targetTool.inputSchema as
      | { safeParse?: (data: unknown) => unknown }
      | undefined
    if (targetSchema?.safeParse) {
      const parsed = targetSchema.safeParse(input.params) as
        | { success: true; data: Record<string, unknown> }
        | { success: false; error: z.ZodError }
      if (!parsed.success) {
        return {
          data: {
            result: null,
            tool_name: input.tool_name,
          },
          newMessages: [
            createUserMessage({
              content: formatZodValidationError(input.tool_name, parsed.error),
            }),
          ],
        }
      }
      // Use parsed params going forward — picks up .default() values and
      // strips unknown keys for strictObject schemas so validateInput/call
      // never see fields they don't expect.
      input.params = parsed.data
    }

    // Validate input before delegating — prevents crashes when the model
    // omits required params (e.g. TeamCreate without team_name →
    // sanitizeName(undefined).replace() TypeError).
    if (targetTool.validateInput) {
      const validation = await targetTool.validateInput(
        input.params as Record<string, unknown>,
        context,
      )
      if (!validation.result) {
        return {
          data: {
            result: null,
            tool_name: input.tool_name,
          },
          newMessages: [
            createUserMessage({
              content: `Invalid parameters for tool "${input.tool_name}": ${validation.message}`,
            }),
          ],
        }
      }
    }

    // Check permissions on the target tool
    const permResult = await targetTool.checkPermissions?.(
      input.params as Record<string, unknown>,
      context,
    )
    if (permResult && permResult.behavior === 'deny') {
      return {
        data: {
          result: null,
          tool_name: input.tool_name,
        },
        newMessages: [
          createUserMessage({
            content: `Permission denied for tool "${input.tool_name}": ${permResult.message ?? 'Permission denied'}`,
          }),
        ],
      }
    }

    // Delegate execution to the target tool
    const targetResult: ToolResult<unknown> = await targetTool.call(
      input.params as Record<string, unknown>,
      context,
      canUseTool,
      parentMessage,
      onProgress,
    )

    return {
      ...targetResult,
      data: {
        result: targetResult.data,
        tool_name: input.tool_name,
      },
    }
  },
  async checkPermissions() {
    return {
      behavior: 'passthrough',
      message: 'ExecuteExtraTool delegates permission to the target tool.',
    }
  },
  renderToolUseMessage(input) {
    return `${input.tool_name}`
  },
  userFacingName() {
    return 'ExecuteExtraTool'
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: JSON.stringify(content),
    }
  },
  // Output shape: { result: <inner tool output>, tool_name: string }.
  // Delegate rendering to the inner tool when it defines its own
  // renderToolResultMessage so deferred tools can show their own UI
  // (e.g. ArtifactTool displays its uploaded URL). Without this, the
  // ExecuteExtraTool tool_result row renders nothing below the tool_use
  // line. The inner tool expects its own input shape, so unwrap params.
  //
  // Inline the lookup rather than calling findToolByName — deferred tools
  // are matched by exact name (no aliases needed), and avoiding the
  // shared helper keeps this method resilient to src/Tool.js mocks in
  // co-located test files (process-global mock.module pollution).
  renderToolResultMessage(content, progressMessages, options) {
    const innerTool = options.tools.find(t => t.name === content.tool_name)
    if (!innerTool?.renderToolResultMessage) return null
    // Guard against null/undefined result — several error branches in this
    // tool (tool-not-found, validation-failed, permission-denied, etc.) set
    // result: null, and delegating null to the inner tool's UI would crash
    // on any property access (e.g. output.worktreeBranch).
    if (content.result == null || typeof content.result !== 'object')
      return null
    const innerInput = (options.input as { params?: unknown } | undefined)
      ?.params
    return innerTool.renderToolResultMessage(
      content.result as never,
      progressMessages,
      {
        ...options,
        input: innerInput,
      },
    )
  },
} satisfies ToolDef<InputSchema, Output>)
