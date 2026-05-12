import { z } from 'zod/v4'
import { buildTool, type ToolDef } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import {
  completeGoal,
  formatGoalStatus,
  getActiveElapsedMs,
  getGoal,
  setGoal,
} from 'src/services/goal/goalState.js'
import { DESCRIPTION, generatePrompt } from './prompt.js'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z
      .enum(['get', 'set', 'complete'])
      .describe('The action to perform on the goal.'),
    objective: z
      .string()
      .optional()
      .describe('The goal objective. Required for "set" action.'),
    message: z
      .string()
      .optional()
      .describe('Completion message for "complete" action.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    action: z.string(),
    goal: z
      .object({
        objective: z.string(),
        status: z.string(),
        tokensUsed: z.number(),
        tokenBudget: z.number().nullable(),
        elapsedSeconds: z.number(),
      })
      .optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Input = z.infer<InputSchema>
export type Output = z.infer<OutputSchema>

export const GoalTool = buildTool({
  name: 'goal',
  searchHint: 'manage long-running task goals',
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
    return input.action === 'get'
  },
  toAutoClassifierInput(input) {
    if (input.action === 'get') return 'get goal status'
    if (input.action === 'set') return `set goal: ${input.objective}`
    return `complete goal: ${input.message ?? ''}`
  },
  async checkPermissions(input: Input) {
    if (input.action === 'get') {
      return { behavior: 'allow' as const, updatedInput: input }
    }
    return {
      behavior: 'ask' as const,
      message:
        input.action === 'set'
          ? `Set goal: ${input.objective}`
          : `Complete goal${input.message ? `: ${input.message}` : ''}`,
    }
  },
  async call({ action, objective, message }: Input): Promise<{ data: Output }> {
    if (action === 'get') {
      const goal = getGoal()
      if (!goal) {
        return { data: { success: true, action, message: 'No active goal.' } }
      }
      const elapsedSeconds = Math.floor(getActiveElapsedMs(goal) / 1000)
      return {
        data: {
          success: true,
          action,
          goal: {
            objective: goal.objective,
            status: goal.status,
            tokensUsed: goal.tokensUsed,
            tokenBudget: goal.tokenBudget,
            elapsedSeconds,
          },
        },
      }
    }

    if (action === 'set') {
      if (!objective) {
        return {
          data: {
            success: false,
            action,
            error: 'objective is required for set action.',
          },
        }
      }
      setGoal(objective)
      return {
        data: {
          success: true,
          action,
          message: `Goal set: ${objective}`,
          goal: {
            objective,
            status: 'active',
            tokensUsed: 0,
            tokenBudget: null,
            elapsedSeconds: 0,
          },
        },
      }
    }

    if (action === 'complete') {
      if (!completeGoal()) {
        return {
          data: {
            success: false,
            action,
            error: 'No active goal to complete.',
          },
        }
      }
      return {
        data: {
          success: true,
          action,
          message: message
            ? `Goal completed: ${message}`
            : 'Goal marked as complete.',
        },
      }
    }

    return {
      data: { success: false, action, error: `Unknown action: ${action}` },
    }
  },
  renderToolUseMessage(input: Partial<Input>) {
    if (input.action === 'get') return 'Getting goal status'
    if (input.action === 'set') return `Setting goal: ${input.objective ?? ''}`
    if (input.action === 'complete') return 'Completing goal'
    return 'Managing goal'
  },
  renderToolResultMessage(content: Output) {
    if (!content.success) return `Error: ${content.error}`
    if (content.action === 'get' && content.goal) {
      const g = content.goal
      return `Goal: ${g.objective} [${g.status}]`
    }
    return content.message ?? 'Done.'
  },
  mapToolResultToToolResultBlockParam(
    content: Output,
    toolUseID: string,
  ): ToolResultBlockParam {
    if (!content.success) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result' as const,
        content: `Error: ${content.error}`,
        is_error: true,
      }
    }

    if (content.action === 'get' && content.goal) {
      const g = content.goal
      return {
        tool_use_id: toolUseID,
        type: 'tool_result' as const,
        content: `Goal: ${g.objective}\nStatus: ${g.status}\nTokens: ${g.tokensUsed}${g.tokenBudget !== null ? ` / ${g.tokenBudget}` : ''}\nElapsed: ${g.elapsedSeconds}s`,
      }
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: content.message ?? 'Done.',
    }
  },
} satisfies ToolDef<InputSchema, Output>)
