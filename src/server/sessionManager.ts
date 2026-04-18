/**
 * SessionManager — manages concurrent Claude CLI sessions for `claude server`.
 *
 * Each session is a spawned `claude --print --input-format stream-json --output-format stream-json`
 * child process. The manager handles lifecycle (create, attach via WS, destroy)
 * and enforces concurrency limits.
 */
import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { resolve } from 'path'
import type { ServerBackend } from './backends/dangerousBackend.js'
import type { SessionInfo, SessionState } from './types.js'
import { buildCliLaunch, spawnCli } from '../utils/cliLaunch.js'
import { logForDebugging } from '../utils/debug.js'

interface SessionManagerOpts {
  idleTimeoutMs?: number
  maxSessions?: number
}

export class SessionManager {
  private sessions = new Map<string, SessionInfo>()
  private backend: ServerBackend
  private idleTimeoutMs: number
  private maxSessions: number

  constructor(backend: ServerBackend, opts?: SessionManagerOpts) {
    this.backend = backend
    this.idleTimeoutMs = opts?.idleTimeoutMs ?? 0
    this.maxSessions = opts?.maxSessions ?? 10
  }

  /**
   * Create a new session. Spawns a CLI child process in stream-json mode.
   *
   * @returns Session info including the session ID and child process.
   */
  createSession(cwd?: string): SessionInfo {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Maximum sessions (${this.maxSessions}) reached. Destroy a session first.`,
      )
    }

    const sessionId = randomUUID()
    const workDir = cwd ? resolve(cwd) : process.cwd()

    const launch = buildCliLaunch(
      [
        '--print',
        '--verbose',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--permission-mode',
        this.backend.permissionMode,
      ],
      { env: process.env },
    )

    const child = spawnCli(launch, {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const session: SessionInfo = {
      id: sessionId,
      status: 'running',
      createdAt: Date.now(),
      workDir,
      process: child,
    }

    this.sessions.set(sessionId, session)

    child.on('exit', () => {
      const s = this.sessions.get(sessionId)
      if (s) {
        s.status = 'stopped'
        s.process = null
      }
    })

    logForDebugging(
      `SessionManager: created session ${sessionId} pid=${child.pid}`,
    )
    return session
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * List all active sessions.
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values())
  }

  /**
   * Destroy a specific session.
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.status = 'stopping'
    if (session.process && !session.process.killed) {
      session.process.kill('SIGTERM')
      // Wait briefly for graceful exit
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => {
          if (session.process && !session.process.killed) {
            session.process.kill('SIGKILL')
          }
          resolve()
        }, 5000)
        session.process?.on('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }

    session.status = 'stopped'
    session.process = null
    this.sessions.delete(sessionId)
    logForDebugging(`SessionManager: destroyed session ${sessionId}`)
  }

  /**
   * Destroy all sessions. Called during server shutdown.
   */
  async destroyAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys())
    await Promise.all(ids.map(id => this.destroySession(id)))
    logForDebugging(`SessionManager: destroyed all ${ids.length} sessions`)
  }
}
