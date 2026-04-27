import axios from 'axios'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { validateBridgeId } from './bridgeApi.js'
import { getBridgeAccessToken } from './bridgeConfig.js'
import { getReplBridgeHandle } from './replBridgeHandle.js'
import { toCompatSessionId } from './sessionIdCompat.js'

export type BridgePeerSession = {
  address: string
  name?: string
  cwd?: string
  pid?: number
}

/**
 * List locally registered sessions that have published a Remote Control
 * session ID. The PID registry is the local source of truth for bridge peers
 * already known to this machine; SendMessage can use these bridge:<id>
 * addresses when the current process has an active bridge handle.
 */
export async function listBridgePeers(): Promise<BridgePeerSession[]> {
  const { listAllLiveSessions } = await import('../utils/udsClient.js')
  const sessions = await listAllLiveSessions()
  const peers: BridgePeerSession[] = []

  for (const session of sessions) {
    if (session.pid === process.pid || !session.bridgeSessionId) continue
    const compatId = toCompatSessionId(session.bridgeSessionId)
    peers.push({
      address: `bridge:${compatId}`,
      name: session.name ?? session.kind,
      cwd: session.cwd,
      pid: session.pid,
    })
  }

  return peers
}

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
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const handle = getReplBridgeHandle()
    if (!handle) {
      return { ok: false, error: 'Bridge not connected' }
    }

    const normalizedTarget = target.trim()
    if (!normalizedTarget) {
      return { ok: false, error: 'No target session specified' }
    }

    const accessToken = getBridgeAccessToken()
    if (!accessToken) {
      return { ok: false, error: 'No access token available' }
    }

    const compatTarget = toCompatSessionId(normalizedTarget)
    // Validate against path traversal — same allowlist as bridgeApi.ts
    validateBridgeId(compatTarget, 'target sessionId')
    const from = toCompatSessionId(handle.bridgeSessionId)
    const baseUrl = handle.sessionIngressUrl

    const url = `${baseUrl}/v1/sessions/${encodeURIComponent(compatTarget)}/messages`

    const response = await axios.post(
      url,
      {
        type: 'peer_message',
        from,
        content: message,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
