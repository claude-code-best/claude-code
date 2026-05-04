import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'

const SUGGEST_BACKGROUND_PR_TOOL_NAME = 'SuggestBackgroundPR'

const inputSchema = lazySchema(() =>
  z.strictObject({
    title: z.string().describe('Suggested title for the background PR.'),
    description: z
      .string()
      .describe('Description of the changes to make in the background PR.'),
    branch: z
      .string()
      .optional()
      .describe('Branch name for the PR. Auto-generated if omitted.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type SuggestInput = z.infer<InputSchema>

type SuggestOutput = { suggested: boolean; suggestion_id: string }

export const SuggestBackgroundPRTool = buildTool({
  name: SUGGEST_BACKGROUND_PR_TOOL_NAME,
  searchHint: 'suggest background pr pull request create',
  maxResultSizeChars: 5_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return 'Suggest creating a background PR for follow-up changes'
  },
  async prompt() {
    return `Suggest creating a pull request in the background for follow-up work. Use this when you identify improvements or cleanup that should be done but aren't part of the current task.

The suggestion is presented to the user who can approve or dismiss it. If approved, a background agent creates the PR.`
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },

  userFacingName() {
    return 'SuggestPR'
  },

  renderToolUseMessage(input: Partial<SuggestInput>) {
    return `Suggest PR: ${input.title ?? '...'}`
  },

  mapToolResultToToolResultBlockParam(
    content: SuggestOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: content.suggested
        ? `PR suggestion recorded (id: ${content.suggestion_id})`
        : 'Failed to record PR suggestion.',
    }
  },

  async call(_input: SuggestInput) {
    // Background PR suggestion requires the KAIROS runtime.
    return {
      data: {
        suggested: false,
        suggestion_id: '',
        error: 'SuggestBackgroundPR requires the KAIROS runtime.',
      },
    }
  },
})
