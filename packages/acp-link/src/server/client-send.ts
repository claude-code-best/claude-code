import type { WSContext } from 'hono/ws'
import { clients, getRcsUpstream } from './runtime-state.js'
import type { ClientState } from './types.js'

// Maps legacy notification type strings to their JSON-RPC method names so
// agent→client notifications are also emitted as JSON-RPC notifications for
// JSON-RPC 2.0 clients (audit §8.1). Notifications have no id.
export const LEGACY_NOTIFICATION_TO_JSONRPC: Record<string, string> = {
  session_update: 'session/update',
  permission_request: 'session/request_permission',
}

// Send a notification/response to the WebSocket client.
//
// For legacy `{type, payload}` clients this emits the proprietary envelope.
// For JSON-RPC 2.0 clients this additionally emits a JSON-RPC response that
// echoes the in-flight request id when the message type matches the pending
// request's expected response type (audit §8.2). Agent→client notifications
// (`session_update`, `permission_request`) are emitted as JSON-RPC
// notifications without an id.
export function send(ws: WSContext, type: string, payload?: unknown): void {
  if (ws.readyState === 1) {
    // WebSocket.OPEN
    ws.send(JSON.stringify({ type, payload }))
  }
  // Forward to RCS upstream if connected
  const rcsUpstream = getRcsUpstream()
  if (rcsUpstream?.isRegistered()) {
    rcsUpstream.send({ type, payload })
  }

  const state = clients.get(ws)
  if (!state?.jsonRpc) return

  // If this is the response to an in-flight JSON-RPC request, emit the
  // standard JSON-RPC result with the preserved id.
  if (state.pendingJsonRpc?.responseType === type) {
    sendJsonRpcRaw(ws, {
      jsonrpc: '2.0',
      id: state.pendingJsonRpc.id,
      result: payload ?? {},
    })
    state.pendingJsonRpc = null
    return
  }

  // Agent→client notifications are also emitted as JSON-RPC notifications
  // (no id) so JSON-RPC clients receive them in their native format.
  const notificationMethod = LEGACY_NOTIFICATION_TO_JSONRPC[type]
  if (notificationMethod) {
    sendJsonRpcRaw(ws, {
      jsonrpc: '2.0',
      method: notificationMethod,
      params: payload ?? {},
    })
  }
}

// Serialize a JSON-RPC 2.0 message and send it to a connected WS client.
export function sendJsonRpcRaw(ws: WSContext, message: object): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message))
  }
}

/**
 * Send a JSON-RPC 2.0 error response with a reserved -32xxx code (audit §8.3).
 * Also emits the legacy `{type: 'error', payload: {message}}` envelope for
 * backwards compatibility.
 */
export function sendJsonRpcError(
  ws: WSContext,
  state: ClientState | undefined,
  id: string | number | null,
  code: number,
  message: string,
): void {
  if (state?.jsonRpc) {
    sendJsonRpcRaw(ws, {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    })
  } else {
    send(ws, 'error', { message, code: String(code) })
  }
  // Error consumed the in-flight request, if any.
  if (state) state.pendingJsonRpc = null
}
