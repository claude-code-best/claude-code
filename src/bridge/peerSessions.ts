import axios from 'axios'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { getReplBridgeHandle } from './replBridgeHandle.js'
import { toCompatSessionId } from './sessionIdCompat.js'

/**
 * Send a plain-text message to another Claude session via the bridge API.
 *
 * Called by SendMessageTool when the target address scheme is "bridge:".
 * Uses the current ReplBridgeHandle to derive the sender identity and
 * the session ingress URL for the POST request.
 *
 * @param target - Target session ID (from the "bridge:<sessionId>" address)
 * @param message - Plain text message content (structured messages are rejected upstream)
 * @returns { ok: true } on success, { ok: false, error } on failure. Never throws.
 */
export async function postInterClaudeMessage(
  target: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const handle = getReplBridgeHandle()
    if (!handle) {
      return { ok: false, error: 'Bridge not connected' }
    }

    if (!target) {
      return { ok: false, error: 'No target session specified' }
    }

    const compatTarget = toCompatSessionId(target)
    const from = toCompatSessionId(handle.bridgeSessionId)
    const baseUrl = handle.sessionIngressUrl

    const url = `${baseUrl}/v1/sessions/${compatTarget}/messages`

    const response = await axios.post(
      url,
      {
        type: 'peer_message',
        from,
        content: message,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        timeout: 10_000,
        validateStatus: (s: number) => s < 500,
      },
    )

    if (response.status === 200 || response.status === 204) {
      logForDebugging(
        `[bridge:peer] Message sent to ${compatTarget} (${response.status})`,
      )
      return { ok: true }
    }

    const detail =
      typeof response.data === 'object' && response.data?.error?.message
        ? response.data.error.message
        : `HTTP ${response.status}`
    logForDebugging(`[bridge:peer] Send failed: ${detail}`)
    return { ok: false, error: detail }
  } catch (err: unknown) {
    const msg = errorMessage(err)
    logForDebugging(`[bridge:peer] postInterClaudeMessage error: ${msg}`)
    return { ok: false, error: msg }
  }
}
