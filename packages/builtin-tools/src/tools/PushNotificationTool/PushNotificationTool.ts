import { feature } from 'bun:bundle'
import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { logForDebugging } from 'src/utils/debug.js'
import { isBridgeEnabled } from 'src/bridge/bridgeEnabled.js'

const PUSH_NOTIFICATION_TOOL_NAME = 'PushNotification'

const inputSchema = lazySchema(() =>
  z.strictObject({
    title: z.string().describe('Title of the push notification.'),
    body: z.string().describe('Body text of the push notification.'),
    priority: z
      .enum(['normal', 'high'])
      .optional()
      .describe(
        'Notification priority. Use "high" for blockers or permission prompts.',
      ),
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
    return "Send a push notification to the user's mobile device"
  },
  async prompt() {
    return `Send a push notification to the user's mobile device via Remote Control.

Use this when:
- A long-running task completes and the user may not be watching
- A permission prompt is waiting and you need user input
- Something urgent requires the user's attention

Requires Remote Control to be configured. Respects user notification settings (taskCompleteNotifEnabled, inputNeededNotifEnabled, agentPushNotifEnabled).`
  },

  isEnabled() {
    return isBridgeEnabled()
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
      content: content.sent
        ? 'Notification sent.'
        : 'Failed to send notification.',
    }
  },

  async call(input: PushInput, context) {
    const appState = context.getAppState()

    // Try bridge delivery first (for remote/mobile viewers)
    if (appState.replBridgeEnabled) {
      if (feature('BRIDGE_MODE')) {
        try {
          const { getBridgeAccessToken, getBridgeBaseUrl } = await import(
            'src/bridge/bridgeConfig.js'
          )
          const { getSessionId } = await import('src/bootstrap/state.js')
          const token = getBridgeAccessToken()
          const sessionId = getSessionId()
          if (token && sessionId) {
            const baseUrl = getBridgeBaseUrl()
            const axios = (await import('axios')).default
            const response = await axios.post(
              `${baseUrl}/v1/sessions/${sessionId}/events`,
              {
                events: [
                  {
                    type: 'push_notification',
                    title: input.title,
                    body: input.body,
                    priority: input.priority ?? 'normal',
                  },
                ],
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                  'anthropic-version': '2023-06-01',
                },
                timeout: 10_000,
                validateStatus: (s: number) => s < 500,
              },
            )
            if (response.status >= 200 && response.status < 300) {
              logForDebugging(
                `[PushNotification] delivered via bridge session=${sessionId}`,
              )
              return { data: { sent: true } }
            }
            logForDebugging(
              `[PushNotification] bridge delivery failed: status=${response.status}`,
            )
          }
        } catch (e) {
          logForDebugging(`[PushNotification] bridge delivery error: ${e}`)
        }
      }
    }

    // Fallback: no bridge available, push was not delivered to a remote device.
    logForDebugging(
      `[PushNotification] no bridge available, not delivered: ${input.title}`,
    )
    return {
      data: {
        sent: false,
        error:
          'No Remote Control bridge configured. Notification not delivered.',
      },
    }
  },
})
