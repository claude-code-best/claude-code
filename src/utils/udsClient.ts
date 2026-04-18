/**
 * UDS Client — connect to peer Claude Code sessions via Unix Domain Sockets.
 *
 * Peers are discovered by reading the PID-file registry in ~/.claude/sessions/
 * (written by concurrentSessions.ts) and checking each entry's
 * `messagingSocketPath` field. A peer is "alive" if its PID is running and
 * its socket accepts a ping/pong round-trip.
 */

import { createConnection, type Socket } from 'net'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { logForDebugging } from './debug.js'
import { errorMessage, isFsInaccessible } from './errors.js'
import { isProcessRunning } from './genericProcessUtils.js'
import { jsonParse, jsonStringify } from './slowOperations.js'
import type { SessionKind } from './concurrentSessions.js'
import type { UdsMessage } from './udsMessaging.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PeerSession = {
  pid: number
  sessionId?: string
  cwd?: string
  startedAt?: number
  kind?: SessionKind
  name?: string
  messagingSocketPath?: string
  entrypoint?: string
  bridgeSessionId?: string | null
  alive: boolean
}

// ---------------------------------------------------------------------------
// Session directory
// ---------------------------------------------------------------------------

function getSessionsDir(): string {
  return join(getClaudeConfigHomeDir(), 'sessions')
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * List all live sessions from the PID registry, optionally probing their
 * UDS sockets for liveness. Sessions whose PID is no longer running are
 * excluded (and their stale files cleaned up).
 */
export async function listAllLiveSessions(): Promise<PeerSession[]> {
  const dir = getSessionsDir()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch (e) {
    if (!isFsInaccessible(e)) {
      logForDebugging(`[udsClient] readdir failed: ${errorMessage(e)}`)
    }
    return []
  }

  const results: PeerSession[] = []

  for (const file of files) {
    if (!/^\d+\.json$/.test(file)) continue
    const pid = parseInt(file.slice(0, -5), 10)

    if (!isProcessRunning(pid)) {
      // Stale — skip (concurrentSessions handles cleanup)
      continue
    }

    try {
      const raw = await readFile(join(dir, file), 'utf8')
      const data = jsonParse(raw) as Record<string, unknown>
      results.push({
        pid,
        sessionId: data.sessionId as string | undefined,
        cwd: data.cwd as string | undefined,
        startedAt: data.startedAt as number | undefined,
        kind: data.kind as SessionKind | undefined,
        name: data.name as string | undefined,
        messagingSocketPath: data.messagingSocketPath as string | undefined,
        entrypoint: data.entrypoint as string | undefined,
        bridgeSessionId: data.bridgeSessionId as string | null | undefined,
        alive: true,
      })
    } catch {
      // Corrupted file — skip
    }
  }

  return results
}

/**
 * List peer sessions that have a UDS messaging socket (i.e. can receive
 * messages). Excludes the current process.
 */
export async function listPeers(): Promise<PeerSession[]> {
  const all = await listAllLiveSessions()
  return all.filter(s => s.pid !== process.pid && s.messagingSocketPath != null)
}

// ---------------------------------------------------------------------------
// Connection helpers
// ---------------------------------------------------------------------------

/**
 * Probe a UDS socket to check if a server is listening (ping/pong).
 * Returns true if the peer responds within the timeout.
 */
export async function isPeerAlive(
  socketPath: string,
  timeoutMs = 3000,
): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const conn = createConnection(socketPath, () => {
      const ping: UdsMessage = { type: 'ping', ts: new Date().toISOString() }
      conn.write(jsonStringify(ping) + '\n')
    })

    let resolved = false

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        conn.destroy()
        resolve(false)
      }
    }, timeoutMs)

    let buffer = ''
    conn.on('data', chunk => {
      buffer += chunk.toString()
      if (buffer.includes('"pong"')) {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          conn.end()
          resolve(true)
        }
      }
    })

    conn.on('error', () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        resolve(false)
      }
    })
  })
}

/**
 * Send a text message to a peer's UDS socket. This is the high-level helper
 * used by SendMessageTool for `uds:<path>` addresses.
 */
export async function sendToUdsSocket(
  targetSocketPath: string,
  message: string | Record<string, unknown>,
): Promise<void> {
  const data = typeof message === 'string' ? message : jsonStringify(message)
  const udsMsg: UdsMessage = {
    type: 'text',
    data,
    ts: new Date().toISOString(),
  }

  // Lazily import to avoid circular dep at module-load time
  const { getUdsMessagingSocketPath } = await import('./udsMessaging.js')
  udsMsg.from = getUdsMessagingSocketPath()

  return new Promise<void>((resolve, reject) => {
    const conn = createConnection(targetSocketPath, () => {
      conn.write(jsonStringify(udsMsg) + '\n', err => {
        conn.end()
        if (err) reject(err)
        else resolve()
      })
    })
    conn.on('error', err => {
      reject(
        new Error(
          `Failed to connect to peer at ${targetSocketPath}: ${errorMessage(err)}`,
        ),
      )
    })
    conn.setTimeout(5000, () => {
      conn.destroy(new Error('Connection timed out'))
    })
  })
}

/**
 * Connect to a peer and return the raw socket for bidirectional communication.
 * The caller is responsible for managing the connection lifecycle.
 */
export function connectToPeer(socketPath: string): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const conn = createConnection(socketPath, () => {
      resolve(conn)
    })
    conn.on('error', reject)
    conn.setTimeout(5000, () => {
      conn.destroy(new Error('Connection timed out'))
    })
  })
}

/**
 * Disconnect a previously connected peer socket.
 */
export function disconnectPeer(socket: Socket): void {
  if (!socket.destroyed) {
    socket.end()
  }
}
