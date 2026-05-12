import { promises as fsPromises } from 'fs'
import { createConnection } from 'net'
import type { Socket } from 'net'
import { platform } from 'os'
import { dirname } from 'path'

import type {
  ClaudeForChromeContext,
  PermissionMode,
  PermissionOverrides,
} from './types.js'

export class SocketConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SocketConnectionError'
  }
}

interface ToolRequest {
  method: string // "execute_tool"
  params?: {
    client_id?: string // "desktop" | "claude-code"
    tool?: string
    args?: Record<string, unknown>
  }
}

interface ToolResponse {
  result?: unknown
  error?: string
}

interface Notification {
  method: string
  params?: Record<string, unknown>
}

type SocketMessage = ToolResponse | Notification

function isToolResponse(message: SocketMessage): message is ToolResponse {
  return 'result' in message || 'error' in message
}

function isNotification(message: SocketMessage): message is Notification {
  return 'method' in message && typeof message.method === 'string'
}

class McpSocketClient {
  private socket: Socket | null = null
  private connected = false
  private connecting = false
  private responseCallback: ((response: ToolResponse) => void) | null = null
  private notificationHandler: ((notification: Notification) => void) | null =
    null
  private responseBuffer = Buffer.alloc(0)
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private reconnectTimer: NodeJS.Timeout | null = null
  private context: ClaudeForChromeContext
  // When true, disables automatic reconnection. Used by McpSocketPool which
  // manages reconnection externally by rescanning available sockets.
  public disableAutoReconnect = false

  constructor(context: ClaudeForChromeContext) {
    this.context = context
  }

  private async connect(): Promise<void> {
    const { serverName, logger } = this.context

    if (this.connecting) {
      logger.info(
        `[${serverName}] Already connecting, skipping duplicate attempt`,
      )
      return
    }

    this.closeSocket()
    this.connecting = true

    const socketPath = this.context.getSocketPath?.() ?? this.context.socketPath
    logger.info(`[${serverName}] Attempting to connect to: ${socketPath}`)

    try {
      await this.validateSocketSecurity(socketPath)
    } catch (error) {
      this.connecting = false
      logger.info(`[${serverName}] Security validation failed:`, error)
      // Don't retry on security failures (wrong perms/owner) - those won't
      // self-resolve. Only the error handler retries on transient errors.
      return
    }

    this.socket = createConnection(socketPath)

    // Timeout the initial connection attempt - if socket file exists but native
    // host is dead, the connect can hang indefinitely
    const connectTimeout = setTimeout(() => {
      if (!this.connected) {
        logger.info(`[${serverName}] Connection attempt timed out after 5000ms`)
        this.closeSocket()
        this.scheduleReconnect()
      }
    }, 5000)

    this.socket.on('connect', () => {
      clearTimeout(connectTimeout)
      this.connected = true
      this.connecting = false
      this.reconnectAttempts = 0
      logger.info(`[${serverName}] Successfully connected to bridge server`)
    })

    this.socket.on('data', (data: Buffer) => {
      this.responseBuffer = Buffer.concat([this.responseBuffer, data])

      while (this.responseBuffer.length >= 4) {
        const length = this.responseBuffer.readUInt32LE(0)

        if (this.responseBuffer.length < 4 + length) {
          break
        }

        const messageBytes = this.responseBuffer.slice(4, 4 + length)
        this.responseBuffer = this.responseBuffer.slice(4 + length)

        try {
          const message = JSON.parse(
            messageBytes.toString('utf-8'),
          ) as SocketMessage

          if (isNotification(message)) {
            logger.info(
              `[${serverName}] Received notification: ${message.method}`,
            )
            if (this.notificationHandler) {
              this.notificationHandler(message)
            }
          } else if (isToolResponse(message)) {
            logger.info(`[${serverName}] Received tool response: ${message}`)
            this.handleResponse(message)
          } else {
            logger.info(`[${serverName}] Received unknown message: ${message}`)
          }
        } catch (error) {
          logger.info(`[${serverName}] Failed to parse message:`, error)
        }
      }
    })

    this.socket.on('error', (error: Error & { code?: string }) => {
      clearTimeout(connectTimeout)
      logger.info(`[${serverName}] Socket error (code: ${error.code}):`, error)
      this.connected = false
      this.connecting = false

      if (
        error.code &&
        [
          'ECONNREFUSED', // Native host not listening (stale socket)
          'ECONNRESET', // Connection reset by peer
          'EPIPE', // Broken pipe (native host died mid-write)
          'ENOENT', // Socket file was deleted
          'EOPNOTSUPP', // Socket file exists but is not a valid socket
          'ECONNABORTED', // Connection aborted
        ].includes(error.code)
      ) {
        this.scheduleReconnect()
      }
    })

    this.socket.on('close', () => {
      clearTimeout(connectTimeout)
      this.connected = false
      this.connecting = false
      this.scheduleReconnect()
    })
  }

  private scheduleReconnect(): void {
    const { serverName, logger } = this.context

    if (this.disableAutoReconnect) {
      return
    }

    if (this.reconnectTimer) {
      logger.info(`[${serverName}] Reconnect already scheduled, skipping`)
      return
    }

    this.reconnectAttempts++

    // Give up after extended polling (~50 min). A new ensureConnected() call
    // from a tool request will restart the cycle if needed.
    const maxTotalAttempts = 100
    if (this.reconnectAttempts > maxTotalAttempts) {
      logger.info(
        `[${serverName}] Giving up after ${maxTotalAttempts} attempts. Will retry on next tool call.`,
      )
      this.reconnectAttempts = 0
      return
    }

    // Use aggressive backoff for first 10 attempts, then slow poll every 30s.
    const delay = Math.min(
      this.reconnectDelay * 1.5 ** (this.reconnectAttempts - 1),
      30000,
    )

    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      logger.info(
        `[${serverName}] Reconnecting in ${Math.round(delay)}ms (attempt ${
          this.reconnectAttempts
        })`,
      )
    } else if (this.reconnectAttempts % 10 === 0) {
      // Log every 10th slow-poll attempt to avoid log spam
      logger.info(
        `[${serverName}] Still polling for native host (attempt ${this.reconnectAttempts})`,
      )
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  private handleResponse(response: ToolResponse): void {
    if (this.responseCallback) {
      const callback = this.responseCallback
      this.responseCallback = null
      callback(response)
    }
  }

  public setNotificationHandler(
    handler: (notification: Notification) => void,
  ): void {
    this.notificationHandler = handler
  }

  public async ensureConnected(): Promise<boolean> {
    const { serverName } = this.context

    if (this.connected && this.socket) {
      return true
    }

    if (!this.socket && !this.connecting) {
      await this.connect()
    }

    // Wait for connection with timeout
    return new Promise((resolve, reject) => {
      let checkTimeoutId: NodeJS.Timeout | null = null

      const timeout = setTimeout(() => {
        if (checkTimeoutId) {
          clearTimeout(checkTimeoutId)
        }
        reject(
          new SocketConnectionError(
            `[${serverName}] Connection attempt timed out after 5000ms`,
          ),
        )
      }, 5000)

      const checkConnection = () => {
        if (this.connected) {
          clearTimeout(timeout)
          resolve(true)
        } else {
          checkTimeoutId = setTimeout(checkConnection, 500)
        }
      }
      checkConnection()
    })
  }

  private async sendRequest(
    request: ToolRequest,
    timeoutMs = 30000,
  ): Promise<ToolResponse> {
    const { serverName } = this.context

    if (!this.socket) {
      throw new SocketConnectionError(
        `[${serverName}] Cannot send request: not connected`,
      )
    }

    const socket = this.socket

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseCallback = null
        reject(
          new SocketConnectionError(
            `[${serverName}] Tool request timed out after ${timeoutMs}ms`,
          ),
        )
      }, timeoutMs)

      this.responseCallback = response => {
        clearTimeout(timeout)
        resolve(response)
      }

      const requestJson = JSON.stringify(request)
      const requestBytes = Buffer.from(requestJson, 'utf-8')

      const lengthPrefix = Buffer.allocUnsafe(4)
      lengthPrefix.writeUInt32LE(requestBytes.length, 0)

      const message = Buffer.concat([lengthPrefix, requestBytes])
      socket.write(message)
    })
  }

  public async callTool(
    name: string,
    args: Record<string, unknown>,
    _permissionOverrides?: PermissionOverrides,
  ): Promise<unknown> {
    const request: ToolRequest = {
      method: 'execute_tool',
      params: {
        client_id: this.context.clientTypeId,
        tool: name,
        args,
      },
    }

    return this.sendRequestWithRetry(request)
  }

  /**
   * Send a request with automatic retry on connection errors.
   *
   * On connection error or timeout, the native host may be a zombie (connected
   * to dead Chrome). Force reconnect to pick up a fresh native host process
   * and retry once.
   */
  private async sendRequestWithRetry(request: ToolRequest): Promise<unknown> {
    const { serverName, logger } = this.context

    try {
      return await this.sendRequest(request)
    } catch (error) {
      if (!(error instanceof SocketConnectionError)) {
        throw error
      }

      logger.info(
        `[${serverName}] Connection error, forcing reconnect and retrying: ${error.message}`,
      )

      this.closeSocket()
      await this.ensureConnected()

      return await this.sendRequest(request)
    }
  }

  public async setPermissionMode(
    _mode: PermissionMode,
    _allowedDomains?: string[],
  ): Promise<void> {
    // No-op: permission mode is only supported over the bridge (WebSocket) transport
  }

  public isConnected(): boolean {
    return this.connected
  }

  private closeSocket(): void {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.end()
      this.socket.destroy()
      this.socket = null
    }
    this.connected = false
    this.connecting = false
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.closeSocket()
    this.reconnectAttempts = 0
    this.responseBuffer = Buffer.alloc(0)
    this.responseCallback = null
  }

  public disconnect(): void {
    this.cleanup()
  }

  private async validateSocketSecurity(socketPath: string): Promise<void> {
    const { serverName, logger } = this.context
    if (platform() === 'win32') {
      return
    }
    try {
      // Validate the parent directory permissions if it's the socket directory
      // (not /tmp itself, which has mode 1777 for legacy single-socket paths)
      const dirPath = dirname(socketPath)
      const dirBasename = dirPath.split('/').pop() || ''
      const isSocketDir = dirBasename.startsWith('claude-mcp-browser-bridge-')
      if (isSocketDir) {
        try {
          const dirStats = await fsPromises.stat(dirPath)
          if (dirStats.isDirectory()) {
            const dirMode = dirStats.mode & 0o777
            if (dirMode !== 0o700) {
              throw new Error(
                `[${serverName}] Insecure socket directory permissions: ${dirMode.toString(
                  8,
                )} (expected 0700). Directory may have been tampered with.`,
              )
            }
            const currentUid = process.getuid?.()
            if (currentUid !== undefined && dirStats.uid !== currentUid) {
              throw new Error(
                `Socket directory not owned by current user (uid: ${currentUid}, dir uid: ${dirStats.uid}). ` +
                  `Potential security risk.`,
              )
            }
          }
        } catch (dirError) {
          if ((dirError as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw dirError
          }
          // Directory doesn't exist yet - native host will create it
        }
      }

      const stats = await fsPromises.stat(socketPath)

      if (!stats.isSocket()) {
        throw new Error(
          `[${serverName}] Path exists but it's not a socket: ${socketPath}`,
        )
      }

      const mode = stats.mode & 0o777
      if (mode !== 0o600) {
        throw new Error(
          `[${serverName}] Insecure socket permissions: ${mode.toString(
            8,
          )} (expected 0600). Socket may have been tampered with.`,
        )
      }

      const currentUid = process.getuid?.()
      if (currentUid !== undefined && stats.uid !== currentUid) {
        throw new Error(
          `Socket not owned by current user (uid: ${currentUid}, socket uid: ${stats.uid}). ` +
            `Potential security risk.`,
        )
      }

      logger.info(`[${serverName}] Socket security validation passed`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info(
          `[${serverName}] Socket not found, will be created by server`,
        )
        return
      }
      throw error
    }
  }
}

export function createMcpSocketClient(
  context: ClaudeForChromeContext,
): McpSocketClient {
  return new McpSocketClient(context)
}

export type { McpSocketClient }
