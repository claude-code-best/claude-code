/**
 * UDS Messaging Layer — Unix Domain Socket IPC for Claude Code instances.
 *
 * Each session auto-creates a UDS server so peer sessions can send messages.
 * Protocol: newline-delimited JSON (NDJSON), one message per line.
 *
 * Socket path defaults to a tmpdir-based path derived from the session PID,
 * but can be overridden via --messaging-socket-path.
 */

import { createServer, type Server, type Socket } from 'net'
import { mkdir, unlink } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { registerCleanup } from './cleanupRegistry.js'
import { logForDebugging } from './debug.js'
import { errorMessage } from './errors.js'
import { attachNdjsonFramer } from './ndjsonFramer.js'
import { jsonParse, jsonStringify } from './slowOperations.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UdsMessageType =
  | 'text'
  | 'notification'
  | 'query'
  | 'response'
  | 'ping'
  | 'pong'

export type UdsMessage = {
  /** Discriminator */
  type: UdsMessageType
  /** Payload text / JSON content */
  data?: string
  /** Sender socket path (so the receiver can reply) */
  from?: string
  /** ISO timestamp */
  ts?: string
  /** Optional metadata */
  meta?: Record<string, unknown>
}

export type UdsInboxEntry = {
  id: string
  message: UdsMessage
  receivedAt: number
  status: 'pending' | 'processed'
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let server: Server | null = null
let socketPath: string | null = null
let onEnqueueCb: (() => void) | null = null
const clients = new Set<Socket>()
const inbox: UdsInboxEntry[] = []
let nextId = 1

// ---------------------------------------------------------------------------
// Public API — socket path helpers
// ---------------------------------------------------------------------------

/**
 * Default socket path based on PID, placed in a tmpdir subdirectory so it
 * survives across config-home changes and avoids polluting ~/.claude.
 *
 * On Windows, Node.js requires named pipe paths in the `\\.\pipe\` namespace;
 * file-system paths like `C:\...\Temp\x.sock` cause EACCES. Bun handles both
 * transparently, but we use the pipe format on Windows for Node.js compat.
 */
export function getDefaultUdsSocketPath(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\claude-code-${process.pid}`
  }
  return join(tmpdir(), 'claude-code-socks', `${process.pid}.sock`)
}

/**
 * Returns the socket path of the currently running server, or undefined
 * if the server has not been started.
 */
export function getUdsMessagingSocketPath(): string | undefined {
  return socketPath ?? undefined
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

/**
 * Register a callback invoked whenever a message is enqueued into the inbox.
 * Used by the print/SDK query loop to kick off processing.
 */
export function setOnEnqueue(cb: (() => void) | null): void {
  onEnqueueCb = cb
}

/**
 * Drain all pending inbox messages, marking them processed.
 */
export function drainInbox(): UdsInboxEntry[] {
  const pending = inbox.filter(e => e.status === 'pending')
  for (const entry of pending) {
    entry.status = 'processed'
  }
  return pending
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

/**
 * Start the UDS messaging server on the given socket path.
 *
 * Exports `CLAUDE_CODE_MESSAGING_SOCKET` into `process.env` so child
 * processes (hooks, spawned agents) can discover and connect back.
 */
export async function startUdsMessaging(
  path: string,
  opts?: { isExplicit?: boolean },
): Promise<void> {
  if (server) {
    logForDebugging('[udsMessaging] server already running, skipping start')
    return
  }

  // Ensure parent directory exists (skip on Windows — pipe paths aren't files)
  if (process.platform !== 'win32') {
    await mkdir(dirname(path), { recursive: true })
  }

  // Clean up stale socket file (skip on Windows — pipe paths aren't files)
  if (process.platform !== 'win32') {
    try {
      await unlink(path)
    } catch {
      // ENOENT is fine
    }
  }

  socketPath = path

  await new Promise<void>((resolve, reject) => {
    const srv = createServer(socket => {
      clients.add(socket)
      logForDebugging(
        `[udsMessaging] client connected (total: ${clients.size})`,
      )

      attachNdjsonFramer<UdsMessage>(
        socket,
        msg => {
          // Handle ping with automatic pong
          if (msg.type === 'ping') {
            const pong: UdsMessage = {
              type: 'pong',
              from: socketPath ?? undefined,
              ts: new Date().toISOString(),
            }
            if (!socket.destroyed) {
              socket.write(jsonStringify(pong) + '\n')
            }
            return
          }

          // Enqueue into inbox
          const entry: UdsInboxEntry = {
            id: `uds-${nextId++}`,
            message: msg,
            receivedAt: Date.now(),
            status: 'pending',
          }
          inbox.push(entry)
          logForDebugging(
            `[udsMessaging] enqueued message type=${msg.type} from=${msg.from ?? 'unknown'}`,
          )
          onEnqueueCb?.()
        },
        text => jsonParse(text) as UdsMessage,
      )

      socket.on('close', () => {
        clients.delete(socket)
      })

      socket.on('error', err => {
        clients.delete(socket)
        logForDebugging(`[udsMessaging] client error: ${errorMessage(err)}`)
      })
    })

    srv.on('error', reject)

    srv.listen(path, () => {
      server = srv
      // Export so child processes can discover the socket
      process.env.CLAUDE_CODE_MESSAGING_SOCKET = path
      logForDebugging(
        `[udsMessaging] server listening on ${path}${opts?.isExplicit ? ' (explicit)' : ''}`,
      )
      resolve()
    })
  })

  // Register cleanup so the socket file is removed on exit
  registerCleanup(async () => {
    await stopUdsMessaging()
  })
}

/**
 * Stop the UDS messaging server and clean up the socket file.
 */
export async function stopUdsMessaging(): Promise<void> {
  if (!server) return

  // Close all connected clients
  for (const socket of clients) {
    socket.destroy()
  }
  clients.clear()

  await new Promise<void>(resolve => {
    server!.close(() => resolve())
  })
  server = null

  // Remove socket file (skip on Windows — pipe paths aren't files)
  if (socketPath) {
    if (process.platform !== 'win32') {
      try {
        await unlink(socketPath)
      } catch {
        // Already gone
      }
    }
    delete process.env.CLAUDE_CODE_MESSAGING_SOCKET
    logForDebugging(
      `[udsMessaging] server stopped, socket removed: ${socketPath}`,
    )
    socketPath = null
  }
}

/**
 * Send a UDS message to a specific socket path (outbound — used when this
 * session wants to push a message to a peer's server).
 */
export async function sendUdsMessage(
  targetSocketPath: string,
  message: UdsMessage,
): Promise<void> {
  const { createConnection } = await import('net')
  message.from = message.from ?? socketPath ?? undefined
  message.ts = message.ts ?? new Date().toISOString()

  return new Promise<void>((resolve, reject) => {
    const conn = createConnection(targetSocketPath, () => {
      conn.write(jsonStringify(message) + '\n', err => {
        conn.end()
        if (err) reject(err)
        else resolve()
      })
    })
    conn.on('error', reject)
    // Timeout so we don't hang on unreachable sockets
    conn.setTimeout(5000, () => {
      conn.destroy(new Error('Connection timed out'))
    })
  })
}
