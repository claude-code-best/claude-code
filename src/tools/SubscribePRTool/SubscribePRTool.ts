import { z } from 'zod/v4'
import type { ToolResultBlockParam } from '../../Tool.js'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const SUBSCRIBE_PR_TOOL_NAME = 'SubscribePR'

const inputSchema = lazySchema(() =>
  z.strictObject({
    repo: z
      .string()
      .describe('Repository in owner/repo format.'),
    pr_number: z
      .number()
      .describe('Pull request number to subscribe to.'),
    events: z
      .array(z.enum(['comment', 'review', 'ci', 'merge', 'close']))
      .optional()
      .describe('Event types to subscribe to. Defaults to all events.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type SubscribeInput = z.infer<InputSchema>

type SubscribeOutput = { subscribed: boolean; subscription_id: string }

export const SubscribePRTool = buildTool({
  name: SUBSCRIBE_PR_TOOL_NAME,
  searchHint: 'subscribe pull request github webhook events watch',
  maxResultSizeChars: 5_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return 'Subscribe to pull request events via GitHub webhooks'
  },
  async prompt() {
    return `Subscribe to events on a GitHub pull request. You'll receive notifications when selected events occur (comments, reviews, CI status changes, merge, close).

Use this to monitor PRs you've created or are reviewing. Events are delivered as messages you can act on.`
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },

  userFacingName() {
    return 'SubscribePR'
  },

  renderToolUseMessage(input: Partial<SubscribeInput>) {
    const pr = input.repo && input.pr_number
      ? `${input.repo}#${input.pr_number}`
      : '...'
    return `Subscribe PR: ${pr}`
  },

  mapToolResultToToolResultBlockParam(
    content: SubscribeOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: content.subscribed
        ? `Subscribed to PR events (id: ${content.subscription_id})`
        : 'Failed to subscribe to PR events.',
    }
  },

  async call(_input: SubscribeInput) {
    // Webhook subscription is managed by the KAIROS GitHub webhook subsystem.
    // Without the KAIROS runtime, this tool is not available.
    return {
      data: {
        subscribed: false,
        subscription_id: '',
        error: 'SubscribePR requires the KAIROS GitHub webhook subsystem.',
      },
    }
  },
})
