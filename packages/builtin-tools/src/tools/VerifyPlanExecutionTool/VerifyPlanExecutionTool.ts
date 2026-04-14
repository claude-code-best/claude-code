import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { VERIFY_PLAN_EXECUTION_TOOL_NAME } from './constants.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    plan_summary: z
      .string()
      .describe('A summary of the plan that was executed.'),
    verification_notes: z
      .string()
      .optional()
      .describe(
        'Notes on what was verified and any issues found during verification.',
      ),
    all_steps_completed: z
      .boolean()
      .describe('Whether all planned steps were completed successfully.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type VerifyInput = z.infer<InputSchema>

type VerifyOutput = { verified: boolean; summary: string }

export const VerifyPlanExecutionTool = buildTool({
  name: VERIFY_PLAN_EXECUTION_TOOL_NAME,
  searchHint: 'verify plan execution check completion',
  maxResultSizeChars: 10_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return 'Verify that a plan was executed correctly before exiting plan mode'
  },
  async prompt() {
    return `Verify that a plan has been executed correctly. Call this tool before exiting plan mode to confirm all steps were completed.

Guidelines:
- Summarize the plan that was executed
- Note whether all steps completed successfully
- Include any verification notes (tests passed, files created, etc.)
- If steps were skipped or failed, explain why in verification_notes`
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },

  userFacingName() {
    return 'VerifyPlan'
  },

  renderToolUseMessage(input: Partial<VerifyInput>) {
    if (input.all_steps_completed === true) {
      return 'Verify Plan: all steps completed'
    }
    if (input.all_steps_completed === false) {
      return 'Verify Plan: incomplete'
    }
    return 'Verify Plan'
  },

  mapToolResultToToolResultBlockParam(
    content: VerifyOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: content.verified
        ? `Plan verified: ${content.summary}`
        : `Plan verification failed: ${content.summary}`,
    }
  },

  async call(input: VerifyInput) {
    return {
      data: {
        verified: input.all_steps_completed,
        summary: input.plan_summary,
      },
    }
  },
})
