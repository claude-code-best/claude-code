import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

// Mock log.ts / debug.ts to cut the bootstrap/state dependency chain
// (slowOperations.ts — imported by bg.ts — pulls in debug.ts → log.ts).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

import {
  findSession,
  listSessions,
  logsHandler,
  printSessionsJson,
  readSessionLog,
  respawnHandler,
  respawnSessionCore,
  rmHandler,
  stopSession,
  type SessionEntry,
} from '../../bg.js'

// ── Test fixtures ──────────────────────────────────────────────────────────

let configDir: string
let sessionsDir: string

/** A PID that has exited (spawnSync waits for the child) — reads as dead. */
function deadPid(): number {
  const result = spawnSync(process.execPath, ['-e', ''])
  if (!result.pid || result.status === null) {
    throw new Error('Could not acquire a dead PID for the test')
  }
  return result.pid
}

function writeEntry(entry: SessionEntry): void {
  writeFileSync(join(sessionsDir, `${entry.pid}.json`), JSON.stringify(entry))
}

function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    pid: process.pid,
    sessionId: 'session-live',
    cwd: '/tmp/project',
    startedAt: Date.now(),
    kind: 'bg',
    ...overrides,
  }
}

// Capture console output so assertions can check user-facing messages
let consoleOutput: string[]
const origLog = console.log
const origError = console.error

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'bg-test-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
  sessionsDir = join(configDir, 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
  // bun can't reset exitCode back to undefined (assignment is sticky), so 0
  // is the "no error" sentinel here.
  process.exitCode = 0

  consoleOutput = []
  console.log = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '))
  }
  console.error = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '))
  }
})

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
  process.exitCode = 0
  console.log = origLog
  console.error = origError
})

// ── listSessions ───────────────────────────────────────────────────────────

describe('listSessions', () => {
  test('returns empty array when the sessions dir does not exist', async () => {
    rmSync(sessionsDir, { recursive: true, force: true })
    expect(await listSessions()).toEqual([])
  })

  test('returns live sessions and sweeps exited entries by default', async () => {
    const dead = deadPid()
    writeEntry(makeEntry({ pid: process.pid, sessionId: 'session-live' }))
    writeEntry(makeEntry({ pid: dead, sessionId: 'session-dead' }))

    const sessions = await listSessions()
    expect(sessions.map(s => s.sessionId)).toEqual(['session-live'])

    // The dead entry's file was swept
    const { readdirSync } = await import('node:fs')
    expect(readdirSync(sessionsDir)).toEqual([
      expect.stringMatching(/^\d+\.json$/) as never,
    ])
  })

  test('includeExited keeps exited entries instead of sweeping them', async () => {
    const dead = deadPid()
    writeEntry(makeEntry({ pid: process.pid, sessionId: 'session-live' }))
    writeEntry(makeEntry({ pid: dead, sessionId: 'session-dead' }))

    const sessions = await listSessions({ includeExited: true })
    expect(sessions.map(s => s.sessionId).sort()).toEqual([
      'session-dead',
      'session-live',
    ])
  })

  test('skips corrupt entry files', async () => {
    writeFileSync(join(sessionsDir, `${process.pid}.json`), 'not json')
    expect(await listSessions()).toEqual([])
  })
})

// ── findSession ────────────────────────────────────────────────────────────

describe('findSession', () => {
  const sessions: SessionEntry[] = [
    makeEntry({ sessionId: 'alpha-123', pid: 111, name: 'claude-bg-alpha' }),
    makeEntry({ sessionId: 'beta-456', pid: 222, name: 'claude-bg-beta' }),
  ]

  test('matches exact sessionId', () => {
    expect(findSession(sessions, 'alpha-123')?.sessionId).toBe('alpha-123')
  })

  test('matches exact pid', () => {
    expect(findSession(sessions, '222')?.sessionId).toBe('beta-456')
  })

  test('matches exact name', () => {
    expect(findSession(sessions, 'claude-bg-beta')?.sessionId).toBe('beta-456')
  })

  test('matches a unique part of the session name', () => {
    // Official: "Part of the session name works too"
    expect(findSession(sessions, 'alpha')?.sessionId).toBe('alpha-123')
  })

  test('ambiguous partial match resolves to undefined', () => {
    // Both names contain "claude-bg" — ambiguous
    expect(findSession(sessions, 'claude-bg')).toBeUndefined()
  })

  test('no match resolves to undefined', () => {
    expect(findSession(sessions, 'nope')).toBeUndefined()
  })
})

// ── printSessionsJson (claude agents --json) ───────────────────────────────

describe('printSessionsJson', () => {
  test('prints live sessions as a JSON array', async () => {
    writeEntry(makeEntry({ pid: process.pid, sessionId: 'session-live' }))
    const chunks: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    const stdoutMock = mock(
      (chunk: string | Uint8Array, cb?: (error?: Error | null) => void) => {
        chunks.push(
          typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
        )
        // printSessionsJson awaits the completion callback before returning
        cb?.()
        return true
      },
    )
    process.stdout.write = stdoutMock as typeof process.stdout.write
    try {
      const sessions = await printSessionsJson({})
      expect(sessions.map(s => s.sessionId)).toEqual(['session-live'])
      expect(chunks.join('')).toBe(JSON.stringify(sessions) + '\n')
    } finally {
      process.stdout.write = originalWrite
    }
  })

  test('--all includes exited sessions', async () => {
    const dead = deadPid()
    writeEntry(makeEntry({ pid: process.pid, sessionId: 'session-live' }))
    writeEntry(makeEntry({ pid: dead, sessionId: 'session-dead' }))

    const sessions = await printSessionsJson({ all: true })
    expect(sessions.map(s => s.sessionId).sort()).toEqual([
      'session-dead',
      'session-live',
    ])
  })

  test('--cwd filters to sessions started in (or beneath) that directory', async () => {
    const dead = deadPid()
    writeEntry(
      makeEntry({
        pid: process.pid,
        sessionId: 'session-here',
        cwd: '/tmp/project',
      }),
    )
    writeEntry(
      makeEntry({
        pid: dead,
        sessionId: 'session-sub',
        cwd: '/tmp/project/sub',
      }),
    )
    writeEntry(
      makeEntry({
        pid: dead + 1,
        sessionId: 'session-elsewhere',
        cwd: '/other',
      }),
    )

    const sessions = await printSessionsJson({ all: true, cwd: '/tmp/project' })
    expect(sessions.map(s => s.sessionId).sort()).toEqual([
      'session-here',
      'session-sub',
    ])
  })
})

// ── readSessionLog ─────────────────────────────────────────────────────────

describe('readSessionLog', () => {
  test('returns the log file content', async () => {
    const logPath = join(configDir, 'session.log')
    writeFileSync(logPath, 'line 1\nline 2\n')
    const content = await readSessionLog(makeEntry({ sessionId: 's', logPath }))
    expect(content).toBe('line 1\nline 2\n')
  })

  test('throws when no log path is recorded', async () => {
    expect(readSessionLog(makeEntry({ sessionId: 's' }))).rejects.toThrow(
      /No log path recorded/,
    )
  })
})

// ── rmHandler (claude rm) ──────────────────────────────────────────────────

describe('rmHandler', () => {
  test('removes an exited session and keeps its conversation', async () => {
    const dead = deadPid()
    writeEntry(makeEntry({ pid: dead, sessionId: 'session-dead' }))

    await rmHandler('session-dead')

    expect(process.exitCode).toBe(0)
    expect(consoleOutput.join('\n')).toContain('Removed session session-dead')
    expect(consoleOutput.join('\n')).toContain('conversation is kept')
    const { readdirSync } = await import('node:fs')
    expect(readdirSync(sessionsDir)).toEqual([])
  })

  test('refuses to remove a running session', async () => {
    writeEntry(makeEntry({ pid: process.pid, sessionId: 'session-live' }))

    await rmHandler('session-live')

    expect(process.exitCode).toBe(1)
    expect(consoleOutput.join('\n')).toContain('still running')
    const { readdirSync } = await import('node:fs')
    expect(readdirSync(sessionsDir).length).toBe(1)
  })

  test('errors when the session is not found', async () => {
    await rmHandler('nope')
    expect(process.exitCode).toBe(1)
    expect(consoleOutput.join('\n')).toContain('Session not found: nope')
  })

  test('without a target, lists removable sessions', async () => {
    const dead = deadPid()
    writeEntry(
      makeEntry({ pid: dead, sessionId: 'session-dead', name: 'bg-1' }),
    )

    await rmHandler(undefined)

    expect(process.exitCode).toBe(0)
    expect(consoleOutput.join('\n')).toContain('bg-1')
    expect(consoleOutput.join('\n')).toContain('Specify a session to remove')
  })
})

// ── respawnHandler (claude respawn) ────────────────────────────────────────

describe('respawnHandler', () => {
  test('asks for a manual restart when launch args were not recorded', async () => {
    // Sessions started before CLAUDE_CODE_SESSION_ARGS existed have no args —
    // respawn cannot relaunch them.
    const dead = deadPid()
    writeEntry(makeEntry({ pid: dead, sessionId: 'session-old', kind: 'bg' }))

    await respawnHandler(['session-old'])

    expect(process.exitCode).toBe(0)
    expect(consoleOutput.join('\n')).toContain('without recorded launch args')
    // The entry is kept — nothing was respawned
    const { readdirSync } = await import('node:fs')
    expect(readdirSync(sessionsDir).length).toBe(1)
  })

  test('skips running sessions', async () => {
    writeEntry(makeEntry({ pid: process.pid, sessionId: 'session-live' }))

    await respawnHandler(['session-live'])

    expect(consoleOutput.join('\n')).toContain('still running')
  })

  test('--all with no exited sessions reports nothing to do', async () => {
    writeEntry(makeEntry({ pid: process.pid, sessionId: 'session-live' }))

    await respawnHandler(['--all'])

    expect(consoleOutput.join('\n')).toContain(
      'No exited background sessions to respawn',
    )
  })

  test('errors when the target is not found', async () => {
    await respawnHandler(['nope'])
    expect(process.exitCode).toBe(1)
    expect(consoleOutput.join('\n')).toContain('Session not found: nope')
  })

  test('without a target, lists respawnable sessions', async () => {
    writeEntry(makeEntry({ pid: process.pid, sessionId: 'session-live' }))

    await respawnHandler([])

    expect(consoleOutput.join('\n')).toContain('Specify a session to respawn')
  })
})

// ── logsHandler (claude logs) ──────────────────────────────────────────────

// ── stopSession (silent core behind claude stop/kill + agents view x) ─────

describe('stopSession', () => {
  test('stops a running session and removes its registry entry', async () => {
    // Real child process we own — stopSession SIGTERMs it
    const child = spawn(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 30000)'],
      {
        stdio: 'ignore',
      },
    )
    if (!child.pid) throw new Error('Could not spawn a child for the test')
    writeEntry(makeEntry({ pid: child.pid, sessionId: 'session-live' }))

    const result = await stopSession(
      makeEntry({ pid: child.pid, sessionId: 'session-live' }),
    )

    expect(result === 'stopped' || result === 'exited-during-grace').toBe(true)
    const { readdirSync } = await import('node:fs')
    expect(readdirSync(sessionsDir)).toEqual([])
  })

  test('reports already-exited sessions and still cleans the entry', async () => {
    const dead = deadPid()
    writeEntry(makeEntry({ pid: dead, sessionId: 'session-dead' }))

    const result = await stopSession(
      makeEntry({ pid: dead, sessionId: 'session-dead' }),
    )

    expect(result).toBe('already-exited')
    const { readdirSync } = await import('node:fs')
    expect(readdirSync(sessionsDir)).toEqual([])
  })
})

// ── respawnSessionCore (silent core behind claude respawn + agents view r) ─

describe('respawnSessionCore', () => {
  test('refuses running sessions with a message', async () => {
    const result = await respawnSessionCore(
      makeEntry({
        pid: process.pid,
        sessionId: 'session-live',
        args: ['-p', 'x'],
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('running')
      expect(result.message).toContain('still running')
    }
  })

  test('reports missing launch args without respawning', async () => {
    const dead = deadPid()

    const result = await respawnSessionCore(
      makeEntry({ pid: dead, sessionId: 'session-old' }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('no-args')
      expect(result.message).toContain('without recorded launch args')
    }
  })
})

describe('logsHandler', () => {
  test('errors when the session is not found', async () => {
    await logsHandler('nope')
    expect(process.exitCode).toBe(1)
    expect(consoleOutput.join('\n')).toContain('Session not found: nope')
  })
})
