import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

// Mock log.ts / debug.ts to cut the bootstrap/state dependency chain
// (slowOperations.ts — imported by concurrentSessions.ts — pulls in
// debug.ts → log.ts).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// bootstrap/state, teammate and worktree are imported at module scope by
// concurrentSessions — the real implementations are used (their module-level
// side effects are benign: realpath caching, session UUID generation).

const {
  registerSession,
  countConcurrentSessions,
  finalizeSessionEntry,
  setSessionOutcome,
} = await import('../concurrentSessions.js')

/** This process's registry entry path (what registerSession would use). */
function ownPidFile(): string {
  return join(sessionsDir, `${process.pid}.json`)
}

async function readEntry(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await Bun.file(file).text()) as Record<string, unknown>
}

// ── Fixtures ───────────────────────────────────────────────────────────────

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

function writeEntry(entry: Record<string, unknown>): void {
  writeFileSync(join(sessionsDir, `${entry.pid}.json`), JSON.stringify(entry))
}

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'concurrent-sessions-test-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
  sessionsDir = join(configDir, 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
  delete process.env.CLAUDE_CODE_SESSION_KIND
  process.exitCode = 0
})

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
  delete process.env.CLAUDE_CODE_SESSION_KIND
  process.exitCode = 0
})

// ── Entry lifecycle (official 2.1.330: completed bg entries persist) ───────

describe('finalizeSessionEntry (bg entry lifecycle)', () => {
  test('bg session exit KEEPS its entry with outcome + endTime', async () => {
    const file = ownPidFile()
    writeEntry({ pid: process.pid, sessionId: 's', kind: 'bg' })

    await finalizeSessionEntry(file, 'bg')

    expect(existsSync(file)).toBe(true)
    const entry = await readEntry(file)
    expect(entry.kind).toBe('bg')
    expect(entry.outcome).toBe('success')
    expect(typeof entry.endTime).toBe('number')
  })

  test('bg session exit records failure from a non-zero exit code', async () => {
    const file = ownPidFile()
    writeEntry({ pid: process.pid, sessionId: 's', kind: 'bg' })
    process.exitCode = 1

    await finalizeSessionEntry(file, 'bg')

    expect((await readEntry(file)).outcome).toBe('failure')
  })

  test('setSessionOutcome overrides the computed outcome', async () => {
    const file = ownPidFile()
    writeEntry({ pid: process.pid, sessionId: 's', kind: 'bg' })
    setSessionOutcome('failure')

    await finalizeSessionEntry(file, 'bg')

    expect((await readEntry(file)).outcome).toBe('failure')
  })

  test('a pidFile outcome pre-written by the stopper (`stopped`) wins', async () => {
    const file = ownPidFile()
    // The stopper (stopSession) patches `stopped` in BEFORE signaling.
    writeEntry({
      pid: process.pid,
      sessionId: 's',
      kind: 'bg',
      outcome: 'stopped',
    })

    await finalizeSessionEntry(file, 'bg')

    expect((await readEntry(file)).outcome).toBe('stopped')
  })

  test('bg session exit with a vanished entry (rm mid-run) does not throw', async () => {
    await finalizeSessionEntry(ownPidFile(), 'bg')
  })

  test('interactive session exit still unlinks its entry', async () => {
    const file = ownPidFile()
    writeEntry({ pid: process.pid, sessionId: 's', kind: 'interactive' })

    await finalizeSessionEntry(file, 'interactive')

    expect(existsSync(file)).toBe(false)
  })

  test('registerSession wires finalizeSessionEntry as its cleanup', async () => {
    // Integration: registerSession (interactive kind — the BG_SESSIONS
    // feature gate on the env override is compile-time, so tests exercise
    // the interactive path end-to-end) registers a cleanup that unlinks.
    const registered = await registerSession()
    expect(registered).toBe(true)
    expect(readdirSync(sessionsDir)).toHaveLength(1)

    const { runCleanupFunctions } = await import('../cleanupRegistry.js')
    await runCleanupFunctions()

    expect(readdirSync(sessionsDir)).toHaveLength(0)
  })
})

// ── countConcurrentSessions (ps 计数不受 completed bg 会话影响) ─────────────

describe('countConcurrentSessions', () => {
  test('counts live sessions only — completed bg entries are not counted', async () => {
    const dead = deadPid()
    writeEntry({ pid: process.pid, sessionId: 'live', kind: 'interactive' })
    writeEntry({
      pid: dead,
      sessionId: 'completed-bg',
      kind: 'bg',
      outcome: 'success',
    })

    expect(await countConcurrentSessions()).toBe(1)
  })

  test('does NOT sweep completed bg entries (they persist for --all/agents view)', async () => {
    const dead = deadPid()
    writeEntry({
      pid: dead,
      sessionId: 'completed-bg',
      kind: 'bg',
      outcome: 'stopped',
    })

    await countConcurrentSessions()

    expect(readdirSync(sessionsDir)).toHaveLength(1)
  })

  test('still sweeps dead non-completed entries (crashed sessions)', async () => {
    const dead = deadPid()
    writeEntry({ pid: dead, sessionId: 'crashed-bg', kind: 'bg' })
    writeEntry({
      pid: dead,
      sessionId: 'crashed-interactive',
      kind: 'interactive',
    })

    await countConcurrentSessions()
    // Sweep is fire-and-forget — let it land.
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(readdirSync(sessionsDir)).toHaveLength(0)
  })
})
