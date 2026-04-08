import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  type JSONRPCMessage,
  JSONRPCMessageSchema,
} from '@modelcontextprotocol/sdk/types.js'

type WebSocketLike = {
  readyState: number
  send(data: string, callback?: (error?: Error) => void): void
  close(): void
  on(event: 'message', listener: (data: Buffer | string) => void): void
  on(event: 'close', listener: () => void): void
  on(event: 'error', listener: (error: Error) => void): void
  off(event: 'message', listener: (data: Buffer | string) => void): void
  off(event: 'close', listener: () => void): void
  off(event: 'error', listener: (error: Error) => void): void
}

const WS_OPEN = 1

export class ServerWebSocketTransport implements Transport {
  private started = false

  constructor(private readonly socket: WebSocketLike) {
    this.socket.on('message', this.handleMessage)
    this.socket.on('close', this.handleClose)
    this.socket.on('error', this.handleError)
  }

  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void

  async start(): Promise<void> {
    if (this.started) {
      throw new Error('Start can only be called once per transport.')
    }
    if (this.socket.readyState !== WS_OPEN) {
      throw new Error('WebSocket is not open. Cannot start transport.')
    }
    this.started = true
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.socket.readyState !== WS_OPEN) {
      throw new Error('WebSocket is not open. Cannot send message.')
    }

    await new Promise<void>((resolve, reject) => {
      this.socket.send(JSON.stringify(message), error => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WS_OPEN) {
      this.socket.close()
      return
    }
    this.cleanup()
  }

  private handleMessage = (data: Buffer | string) => {
    try {
      const raw = typeof data === 'string' ? data : data.toString('utf8')
      const parsed = JSONRPCMessageSchema.parse(JSON.parse(raw))
      this.onmessage?.(parsed)
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private handleClose = () => {
    this.cleanup()
    this.onclose?.()
  }

  private handleError = (error: Error) => {
    this.onerror?.(error)
  }

  private cleanup() {
    this.socket.off('message', this.handleMessage)
    this.socket.off('close', this.handleClose)
    this.socket.off('error', this.handleError)
  }
}
