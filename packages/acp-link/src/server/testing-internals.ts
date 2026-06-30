import type { ChildProcess } from 'node:child_process'
import * as acp from '@agentclientprotocol/sdk'
import type { WSContext } from 'hono/ws'
import type { JsonRpc2ClientMessage } from '../ws-message.js'
import { dispatchClientMessage, dispatchJsonRpcMessage } from './dispatch.js'
import { clients, setDefaultPermissionMode } from './runtime-state.js'
import { createClientState, type ProxyMessage } from './types.js'

export function assertTestingInternalsEnabled(): void {
  if (process.env.ACP_LINK_TEST_INTERNALS === '1') {
    return
  }

  throw new Error(
    'acp-link test internals are disabled outside test execution.',
  )
}

export const __testing = {
  dispatchClientMessage(ws: WSContext, data: unknown): Promise<void> {
    assertTestingInternalsEnabled()
    return dispatchClientMessage(ws, data as ProxyMessage)
  },
  dispatchJsonRpcMessage(ws: WSContext, data: unknown): Promise<void> {
    assertTestingInternalsEnabled()
    return dispatchJsonRpcMessage(ws, data as JsonRpc2ClientMessage)
  },
  registerClient(
    ws: WSContext,
    state: {
      connection?: unknown
      process?: ChildProcess | null
      sessionId?: string | null
      clientInfo?: { name: string; version: string }
      clientCapabilities?: Record<string, unknown>
      jsonRpc?: boolean
    },
  ): () => void {
    assertTestingInternalsEnabled()
    const full = createClientState()
    full.process = state.process ?? null
    full.connection = (state.connection ??
      null) as acp.ClientSideConnection | null
    full.sessionId = state.sessionId ?? null
    if (state.clientInfo) full.clientInfo = state.clientInfo
    if (state.clientCapabilities)
      full.clientCapabilities = state.clientCapabilities
    if (typeof state.jsonRpc === 'boolean') full.jsonRpc = state.jsonRpc
    clients.set(ws, full)
    return () => {
      clients.delete(ws)
    }
  },
  getClientSessionId(ws: WSContext): string | null | undefined {
    assertTestingInternalsEnabled()
    return clients.get(ws)?.sessionId
  },
  setDefaultPermissionMode(mode: string | undefined): () => void {
    assertTestingInternalsEnabled()
    const previous = setDefaultPermissionMode(mode)
    return () => {
      setDefaultPermissionMode(previous)
    }
  },
}
