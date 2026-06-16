import { z } from 'zod/v4'
import { buildTool, type ToolDef } from 'src/Tool.js'
import { jsonStringify } from 'src/utils/slowOperations.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import {
  completeGoal,
  formatGoalElapsed,
  formatGoalStatusLabel,
  getGoal,
  recordBlockedAttempt,
} from 'src/services/goal/goalState.js'
import { persistCurrentGoal } from 'src/services/goal/goalStorage.js'
import { GOAL_TOOL_NAME } from './constants.js'
import { DESCRIPTION, generatePrompt } from './prompt.js'

function toolLog(msg: string): void {
  try {
    const { logForDebugging } =
      require('src/utils/debug.js') as typeof import('src/utils/debug.js')
    logForDebugging(`[goal] tool: ${msg}`)
  } catch {
    /* debug not available */
  }
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z
      .enum(['get', 'update'])
      .optional()
      .describe(
        'Action to perform: "get" to read status, "update" to mark complete or blocked. Defaults to "update" if status is provided, otherwise "get".',
      ),
    status: z
      .enum(['complete', 'blocked'])
      .optional()
      .describe(
        'Required for "update". Only "complete" or "blocked" are accepted.',
      ),
    reason: z
      .string()
      .optional()
      .describe('Explanation for the status change. Required for "update".'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    goal: z
      .object({
        objective: z.string(),
        status: z.string(),
        tokensUsed: z.number(),
        tokenBudget: z.number().nullable(),
        elapsed: z.string(),
        turnsExecuted: z.number(),
      })
      .optional(),
    message: z.string().optional(),
    report: z.string().optional(),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Input = z.infer<InputSchema>
export type Output = z.infer<OutputSchema>

function buildGoalSnapshot() {
  const goal = getGoal()
  if (!goal) return undefined
  return {
    objective: goal.objective,
    status: formatGoalStatusLabel(goal.status),
    tokensUsed: goal.tokensUsed,
    tokenBudget: goal.tokenBudget,
    elapsed: formatGoalElapsed(goal),
    turnsExecuted: goal.turnsExecuted,
  }
}

function buildCompletionReport(): string {
  const goal = getGoal()
  if (!goal) return ''
  const budget =
    goal.tokenBudget !== null
      ? `Token usage: ${goal.tokensUsed} / ${goal.tokenBudget}`
      : `Token usage: ${goal.tokensUsed}`
  return [
    'Goal achieved — usage report:',
    `  ${budget}`,
    `  Active time: ${formatGoalElapsed(goal)}`,
    `  Continuation turns: ${goal.turnsExecuted}`,
  ].join('\n')
}

export const GoalTool = buildTool({
  name: GOAL_TOOL_NAME,
  searchHint: 'get or update the active goal (complete/blocked)',
  maxResultSizeChars: 10_000,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return generatePrompt()
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'Goal'
  },
  shouldDefer: true,
  isConcurrencySafe() {
    return true
  },
  isReadOnly(input: Input) {
    const action = input.action ?? (input.status ? 'update' : 'get')
    return action === 'get'
  },
  toAutoClassifierInput(input: Input) {
    const action = input.action ?? (input.status ? 'update' : 'get')
    if (action === 'get') return 'get goal status'
    return `update goal: ${input.status} — ${input.reason ?? ''}`
  },
  async checkPermissions(input: Input) {
    return { behavior: 'allow' as const, updatedInput: input }
  },
  renderToolUseMessage(input: Input) {
    const action = input.action ?? (input.status ? 'update' : 'get')
    if (action === 'get') return 'Checking goal status…'
    return `Updating goal: ${input.status}${input.reason ? ` — ${input.reason}` : ''}`
  },
  renderToolResultMessage(output: Output) {
    if (output.error) return `Goal error: ${output.error}`
    if (output.report) return output.report
    if (output.goal) {
      return `Goal "${output.goal.objective}" — ${output.goal.status}`
    }
    return output.message ?? 'Done'
  },
  renderToolUseRejectedMessage() {
    return 'Goal operation rejected'
  },
  async call(input: Input): Promise<{ data: Output }> {
    const action = input.action ?? (input.status ? 'update' : 'get')
    toolLog(
      `called: action=${action}${input.status ? ` status=${input.status}` : ''}${input.reason ? ` reason="${input.reason.slice(0, 60)}"` : ''}`,
    )
    if (action === 'get') {
      const snapshot = buildGoalSnapshot()
      if (!snapshot) {
        return {
          data: {
            success: true,
            message:
              'No active goal. The user can set one with `/goal <objective>`.',
          },
        }
      }
      return { data: { success: true, goal: snapshot } }
    }

    // action === 'update'
    if (!input.status) {
      return {
        data: {
          success: false,
          error:
            'The "status" field is required for update. Use "complete" or "blocked".',
        },
      }
    }

    const goal = getGoal()
    if (!goal) {
      return {
        data: {
          success: false,
          error: 'No active goal to update.',
        },
      }
    }

    if (input.status === 'complete') {
      const report = buildCompletionReport()
      completeGoal()
      persistCurrentGoal()
      return {
        data: {
          success: true,
          goal: buildGoalSnapshot(),
          report,
        },
      }
    }

    // status === 'blocked'
    const reason = input.reason ?? 'unspecified blocker'
    const result = recordBlockedAttempt(reason)
    if (!result) {
      return {
        data: {
          success: false,
          error: 'Goal is not in a state that accepts blocked attempts.',
        },
      }
    }
    persistCurrentGoal()

    if (result.status === 'blocked') {
      return {
        data: {
          success: true,
          goal: buildGoalSnapshot(),
          message: `Goal marked as blocked after ${result.attempts} consecutive attempts. Reason: ${reason}`,
        },
      }
    }

    return {
      data: {
        success: true,
        goal: buildGoalSnapshot(),
        message: `Blocked attempt ${result.attempts} recorded. The goal remains active — the same condition must persist for 3 consecutive turns before it is marked blocked.`,
      },
    }
  },
  mapToolResultToToolResultBlockParam(content: Output, toolUseID: string) {
    if (content.error) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result' as const,
        content: `Error: ${content.error}`,
        is_error: true,
      }
    }
    const parts: string[] = []
    if (content.message) parts.push(content.message)
    if (content.report) parts.push(content.report)
    if (content.goal) parts.push(jsonStringify(content.goal))
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: parts.join('\n') || 'Done',
    }
  },
} satisfies ToolDef<InputSchema, Output>)
