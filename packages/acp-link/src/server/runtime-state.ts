import type { WSContext } from 'hono/ws'
import { createLogger } from '../logger.js'
import type { RcsUpstreamClient } from '../rcs-upstream.js'
import type { ClientState } from './types.js'

// Module-level state (set when server starts)
let AGENT_COMMAND: string
let AGENT_ARGS: string[]
let AGENT_CWD: string
let SERVER_PORT: number
let SERVER_HOST: string
let AUTH_TOKEN: string | undefined
let DEFAULT_PERMISSION_MODE: string | undefined

export const clients = new Map<WSContext, ClientState>()

// Module-scoped child loggers
export const logWs = createLogger('ws')
export const logAgent = createLogger('agent')
export const logSession = createLogger('session')
export const logPrompt = createLogger('prompt')
export const logPerm = createLogger('perm')
export const logRelay = createLogger('relay')
export const logServer = createLogger('server')

// RCS upstream client (optional — enabled via ACP_RCS_URL env var)
let rcsUpstream: RcsUpstreamClient | null = null

// Permission request timeout (5 minutes)
export const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000

// Heartbeat interval for WebSocket ping/pong (30 seconds)
export const HEARTBEAT_INTERVAL_MS = 30_000

export interface ServerConfigFields {
  command: string
  args: string[]
  cwd: string
  port: number
  host: string
  token?: string
  permissionMode?: string
}

export function setServerConfig(fields: ServerConfigFields): void {
  AGENT_COMMAND = fields.command
  AGENT_ARGS = fields.args
  AGENT_CWD = fields.cwd
  SERVER_PORT = fields.port
  SERVER_HOST = fields.host
  AUTH_TOKEN = fields.token
  DEFAULT_PERMISSION_MODE = fields.permissionMode
}

export interface ServerConfigSnapshot {
  command: string
  args: string[]
  cwd: string
  port: number
  host: string
  token?: string
}

export function getServerConfig(): ServerConfigSnapshot {
  return {
    command: AGENT_COMMAND,
    args: AGENT_ARGS,
    cwd: AGENT_CWD,
    port: SERVER_PORT,
    host: SERVER_HOST,
    token: AUTH_TOKEN,
  }
}

export function getAgentConfig(): ServerConfigSnapshot {
  return getServerConfig()
}

export function getAuthToken(): string | undefined {
  return AUTH_TOKEN
}

export function getDefaultPermissionMode(): string | undefined {
  return DEFAULT_PERMISSION_MODE
}

export function setDefaultPermissionMode(
  mode: string | undefined,
): string | undefined {
  const previous = DEFAULT_PERMISSION_MODE
  DEFAULT_PERMISSION_MODE = mode
  return previous
}

export function getRcsUpstream(): RcsUpstreamClient | null {
  return rcsUpstream
}

export function setRcsUpstream(client: RcsUpstreamClient | null): void {
  rcsUpstream = client
}

/**
 * Create a virtual WSContext for RCS relay messages.
 * Responses via send() go to RCS upstream (not a local WS).
 */
export function createRelayWs(): WSContext {
  return {
    get readyState() {
      return 1
    }, // always OPEN
    send: () => {}, // no-op — responses go through rcsUpstream.send()
    close: () => {},
    raw: null,
    isInner: false,
    url: '',
    origin: '',
    protocol: '',
  } as unknown as WSContext
}

// Generate unique request ID
export function generateRequestId(): string {
  return `perm_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}
