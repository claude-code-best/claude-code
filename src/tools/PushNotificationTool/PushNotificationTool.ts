import { z } from 'zod/v4'
import type { ToolResultBlockParam } from '../../Tool.js'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const PUSH_NOTIFICATION_TOOL_NAME = 'PushNotification'

const inputSchema = lazySchema(() =>
  z.strictObject({
    title: z
      .string()
      .describe('Title of the push notification.'),
    body: z
      .string()
      .describe('Body text of the push notification.'),
    priority: z
      .enum(['normal', 'high'])
      .optional()
      .describe('Notification priority. Use "high" for blockers or permission prompts.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type PushInput = z.infer<InputSchema>

type PushOutput = { sent: boolean }

export const PushNotificationTool = buildTool({
  name: PUSH_NOTIFICATION_TOOL_NAME,
  searchHint: 'push notification mobile alert notify user',
  maxResultSizeChars: 1_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return 'Send a push notification to the user\'s mobile device'
  },
  async prompt() {
    return `Send a push notification to the user's mobile device via Remote Control.

Use this when:
- A long-running task completes and the user may not be watching
- A permission prompt is waiting and you need user input
- Something urgent requires the user's attention

Requires Remote Control to be configured. Respects user notification settings (taskCompleteNotifEnabled, inputNeededNotifEnabled, agentPushNotifEnabled).`
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },

  userFacingName() {
    return 'Notify'
  },

  renderToolUseMessage(input: Partial<PushInput>) {
    return `Push: ${input.title ?? '...'}`
  },

  mapToolResultToToolResultBlockParam(
    content: PushOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: content.sent ? 'Notification sent.' : 'Failed to send notification.',
    }
  },

  async call(_input: PushInput) {
    // Push delivery is handled by the Remote Control / KAIROS transport layer.
    // Without the KAIROS runtime, this tool is not available.
    return {
      data: {
        sent: false,
        error: 'PushNotification requires the KAIROS transport layer.',
      },
    }
  },
})
