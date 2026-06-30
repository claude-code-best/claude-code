import type { WSContext } from 'hono/ws'
import type { JsonRpc2ClientMessage } from '../ws-message.js'
import { handlePermissionResponse } from './acp-client.js'
import { send, sendJsonRpcError, sendJsonRpcRaw } from './client-send.js'
import {
  handleCancel,
  handleListSessions,
  handleLoadSession,
  handleNewSession,
  handlePrompt,
  handleResumeSession,
  handleSetSessionModel,
} from './handlers-session.js'
import { handleConnect, handleDisconnect } from './handlers-agent.js'
import {
  isRecord,
  optionalPayloadRecord,
  optionalRecord,
  optionalString,
  optionalStringField,
  payloadRecord,
  decodeContentBlocks,
} from './payload-decode.js'
import { clients, logWs } from './runtime-state.js'
import {
  JSONRPC_INTERNAL_ERROR,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_METHOD_NOT_FOUND,
  type ProxyMessage,
} from './types.js'

export async function dispatchClientMessage(
  ws: WSContext,
  data: ProxyMessage,
): Promise<void> {
  switch (data.type) {
    case 'connect':
      await handleConnect(ws)
      break
    case 'disconnect':
      handleDisconnect(ws)
      break
    case 'new_session':
      await handleNewSession(ws, data.payload)
      break
    case 'prompt':
      await handlePrompt(ws, data.payload)
      break
    case 'permission_response':
      handlePermissionResponse(ws, data.payload)
      break
    case 'cancel':
      await handleCancel(ws)
      break
    case 'set_session_model':
      await handleSetSessionModel(ws, data.payload)
      break
    case 'list_sessions':
      await handleListSessions(ws, data.payload)
      break
    case 'load_session':
      await handleLoadSession(ws, data.payload)
      break
    case 'resume_session':
      await handleResumeSession(ws, data.payload)
      break
    case 'ping':
      send(ws, 'pong')
      break
  }
}

// JSON-RPC method wrappers that accept `params: unknown` and forward to the
// existing handlers with the decoded payload.
async function handleJsonRpcNewSession(
  ws: WSContext,
  params: unknown,
): Promise<void> {
  const payload = optionalPayloadRecord(params, 'session/new')
  await handleNewSession(ws, {
    cwd: optionalStringField(payload, 'cwd', 'session/new.cwd'),
    permissionMode: optionalStringField(
      payload,
      'permissionMode',
      'session/new.permissionMode',
    ),
  })
}

async function handleJsonRpcPrompt(
  ws: WSContext,
  params: unknown,
): Promise<void> {
  const payload = payloadRecord(params, 'session/prompt')
  // ACP session/prompt params: { sessionId, prompt: ContentBlock[] }
  // Accept either `prompt` (spec) or `content` (legacy) for compatibility.
  const content = payload.prompt ?? payload.content
  await handlePrompt(ws, { content: decodeContentBlocks(content) })
}

async function handleJsonRpcListSessions(
  ws: WSContext,
  params: unknown,
): Promise<void> {
  const payload = optionalRecord(params)
  await handleListSessions(ws, {
    cwd: optionalString(payload.cwd),
    cursor: optionalString(payload.cursor),
  })
}

async function handleJsonRpcLoadSession(
  ws: WSContext,
  params: unknown,
): Promise<void> {
  const payload = payloadRecord(params, 'session/load')
  if (typeof payload.sessionId !== 'string') {
    throw new Error('Invalid session/load payload')
  }
  await handleLoadSession(ws, {
    sessionId: payload.sessionId,
    cwd: optionalString(payload.cwd),
  })
}

async function handleJsonRpcResumeSession(
  ws: WSContext,
  params: unknown,
): Promise<void> {
  const payload = payloadRecord(params, 'session/resume')
  if (typeof payload.sessionId !== 'string') {
    throw new Error('Invalid session/resume payload')
  }
  await handleResumeSession(ws, {
    sessionId: payload.sessionId,
    cwd: optionalString(payload.cwd),
  })
}

async function handleJsonRpcSetSessionModel(
  ws: WSContext,
  params: unknown,
): Promise<void> {
  const payload = payloadRecord(params, 'session/set_model')
  if (typeof payload.modelId !== 'string') {
    throw new Error('Invalid session/set_model payload')
  }
  await handleSetSessionModel(ws, { modelId: payload.modelId })
}

/**
 * Pass-through handlers for v1 baseline methods that the proprietary
 * whitelist previously dropped (audit §8.4). They forward the call to the
 * underlying SDK ClientSideConnection and surface the result.
 */
export async function handleJsonRpcSetSessionMode(
  ws: WSContext,
  params: unknown,
): Promise<void> {
  const state = clients.get(ws)
  if (!state?.connection) {
    throw new Error('Not connected to agent')
  }
  const result = await state.connection.setSessionMode(
    params as { sessionId: string; modeId: string },
  )
  send(ws, 'session_mode_set', result ?? {})
}

export async function handleJsonRpcCloseSession(
  ws: WSContext,
  params: unknown,
): Promise<void> {
  const state = clients.get(ws)
  if (!state?.connection) {
    throw new Error('Not connected to agent')
  }
  const result = await state.connection.unstable_closeSession(
    params as { sessionId: string },
  )
  send(ws, 'session_closed', result ?? {})
}

/**
 * Handle the JSON-RPC standard cancellation primitive `$/cancel_request`
 * (audit §8.5). Unlike the ACP-specific `session/cancel` notification, this
 * cancels an in-flight request by id. We forward to the ACP cancel path and
 * also clear any pending permission request.
 */
export async function handleJsonRpcCancelRequest(
  ws: WSContext,
  params: unknown,
): Promise<void> {
  const payload = optionalRecord(params)
  logWs.info({ cancelledId: payload.id }, '$/cancel_request received')
  await handleCancel(ws)
}

/**
 * Maps JSON-RPC method names to their legacy handler + the legacy response
 * type the handler emits via send(). Used by dispatchJsonRpcMessage to route
 * standard ACP methods (audit §8.1, §8.4).
 */
export const JSONRPC_METHOD_HANDLERS: Record<
  string,
  {
    responseType: string
    handle: (ws: WSContext, params: unknown) => Promise<void> | void
  }
> = {
  initialize: { responseType: 'status', handle: handleConnect },
  'session/new': {
    responseType: 'session_created',
    handle: handleJsonRpcNewSession,
  },
  'session/prompt': {
    responseType: 'prompt_complete',
    handle: handleJsonRpcPrompt,
  },
  'session/cancel': { responseType: '', handle: handleCancel },
  'session/list': {
    responseType: 'session_list',
    handle: handleJsonRpcListSessions,
  },
  'session/load': {
    responseType: 'session_loaded',
    handle: handleJsonRpcLoadSession,
  },
  'session/resume': {
    responseType: 'session_resumed',
    handle: handleJsonRpcResumeSession,
  },
  'session/set_model': {
    responseType: 'model_changed',
    handle: handleJsonRpcSetSessionModel,
  },
  'session/set_mode': {
    responseType: 'session_mode_set',
    handle: handleJsonRpcSetSessionMode,
  },
  'session/close': {
    responseType: 'session_closed',
    handle: handleJsonRpcCloseSession,
  },
}

/**
 * Route a JSON-RPC 2.0 message. Requests get a response with the echoed id;
 * notifications (no id) are dispatched without a response. Unknown methods
 * yield a JSON-RPC -32601 error (audit §8.4). `$/cancel_request` is handled
 * specially (audit §8.5).
 */
export async function dispatchJsonRpcMessage(
  ws: WSContext,
  msg: JsonRpc2ClientMessage,
): Promise<void> {
  const state = clients.get(ws)
  // Mark this client as JSON-RPC from the first framed message.
  if (state) state.jsonRpc = true

  // Capture client identity/capabilities from initialize (audit §8.7).
  if (msg.method === 'initialize' && state) {
    const params = isRecord(msg.params) ? msg.params : {}
    if (isRecord(params.clientInfo)) {
      const ci = params.clientInfo
      if (typeof ci.name === 'string' && typeof ci.version === 'string') {
        state.clientInfo = { name: ci.name, version: ci.version }
      }
    }
    if (isRecord(params.clientCapabilities)) {
      state.clientCapabilities = params.clientCapabilities
    }
  }

  // Notification (no id) — dispatch without a response.
  if (!('id' in msg) || msg.id === undefined) {
    if (msg.method === '$/cancel_request') {
      await handleJsonRpcCancelRequest(ws, msg.params)
      return
    }
    if (msg.method === 'session/cancel') {
      await handleCancel(ws)
      return
    }
    // Unknown notification — silently ignore per JSON-RPC 2.0 (notifications
    // cannot be responded to).
    logWs.debug({ method: msg.method }, 'ignoring unknown notification')
    return
  }

  // Request (has id) — dispatch and the handler will emit a response.
  if (msg.method === '$/cancel_request') {
    await handleJsonRpcCancelRequest(ws, msg.params)
    // Cancellation is itself a notification-style request; respond with null.
    if (state) state.pendingJsonRpc = { id: msg.id, responseType: '' }
    sendJsonRpcRaw(ws, { jsonrpc: '2.0', id: msg.id, result: null })
    if (state) state.pendingJsonRpc = null
    return
  }

  const entry = JSONRPC_METHOD_HANDLERS[msg.method]
  if (!entry) {
    sendJsonRpcError(
      ws,
      state,
      msg.id,
      JSONRPC_METHOD_NOT_FOUND,
      `Method not found: ${msg.method}`,
    )
    return
  }

  // Track the in-flight request so the handler's send() emits a JSON-RPC
  // response with the echoed id (audit §8.2).
  if (state)
    state.pendingJsonRpc = { id: msg.id, responseType: entry.responseType }
  try {
    await entry.handle(ws, msg.params)
    // If the handler did not emit the expected response (e.g. it short
    // circuited with an error already), still clear the pending slot.
    if (state?.pendingJsonRpc) {
      sendJsonRpcRaw(ws, {
        jsonrpc: '2.0',
        id: msg.id,
        result: {},
      })
      state.pendingJsonRpc = null
    }
  } catch (error) {
    const code = (error as Error).message.startsWith('Invalid ')
      ? JSONRPC_INVALID_PARAMS
      : JSONRPC_INTERNAL_ERROR
    sendJsonRpcError(ws, state, msg.id, code, (error as Error).message)
  }
}
