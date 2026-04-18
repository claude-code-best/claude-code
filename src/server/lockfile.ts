/**
 * Server lockfile — prevents multiple `claude server` instances and allows
 * `probeRunningServer()` to discover a running server from other CLI processes.
 *
 * Lock file location: ~/.claude/server.lock
 */
import { join } from 'path'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { logForDebugging } from '../utils/debug.js'

export interface ServerLockInfo {
  pid: number
  port: number
  host: string
  httpUrl: string
  startedAt: number
}

function getLockPath(): string {
  return join(getClaudeConfigHomeDir(), 'server.lock')
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Write the server lock file. Called after the server starts listening.
 */
export async function writeServerLock(info: ServerLockInfo): Promise<void> {
  const lockPath = getLockPath()
  await mkdir(join(lockPath, '..'), { recursive: true })
  await writeFile(lockPath, JSON.stringify(info, null, 2), 'utf-8')
  logForDebugging(`Server: wrote lock file at ${lockPath}`)
}

/**
 * Remove the server lock file. Called during graceful shutdown.
 */
export async function removeServerLock(): Promise<void> {
  try {
    await unlink(getLockPath())
    logForDebugging('Server: removed lock file')
  } catch {
    // File may not exist — that's fine
  }
}

/**
 * Probe for a running server by reading the lock file and checking the PID.
 *
 * Returns the lock info if a server is alive, null if not running.
 * Automatically cleans up stale lock files (PID dead).
 */
export async function probeRunningServer(): Promise<ServerLockInfo | null> {
  try {
    const raw = await readFile(getLockPath(), 'utf-8')
    const info = JSON.parse(raw) as ServerLockInfo

    if (isProcessAlive(info.pid)) {
      return info
    }

    // Stale lock — process is dead, clean up
    await removeServerLock()
    return null
  } catch {
    return null
  }
}
