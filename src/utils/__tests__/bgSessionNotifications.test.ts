import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

// Mock log.ts / debug.ts to cut the bootstrap/state dependency chain
// (config.ts / notifier.ts pull in debug.ts → log.ts).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// ── config.ts: spread-mocked (NOT partial-mocked) ───────────────────────────
// bun test runs all files in one process (shared module registry): mocks
// leak across files in BOTH directions. A PARTIAL mock here would strip
// exports for other files (growthbook's checkHasTrustDialogAuthenticated
// broke that way), and NOT mocking lets other files' partial config mocks
// leak INTO this file (the dedup assertions would read a foreign object).
// So: capture the real module, spread ALL of its exports, and replace only
// getGlobalConfig/saveGlobalConfig with in-memory implementations backed
// by a FULL config copy — behaviorally identical to the real test-mode
// config for every other consumer.
const realConfig = await import('../config.js')
type MockGlobalConfig = ReturnType<typeof realConfig.getGlobalConfig>

// Capture the pristine config BEFORE mock.module: bun's mock.module patches
// the already-loaded module namespace IN PLACE, so realConfig.getGlobalConfig
// becomes the MOCK's function after the mock is registered — copying from it
// later would just copy the mock onto itself (fields would never reset).
const pristineConfig: MockGlobalConfig = { ...realConfig.getGlobalConfig() }

let mockGlobalConfig: MockGlobalConfig = { ...pristineConfig }
mock.module('src/utils/config.ts', () => ({
  ...realConfig,
  getGlobalConfig: () => mockGlobalConfig,
  saveGlobalConfig: (
    updater: (current: MockGlobalConfig) => MockGlobalConfig,
  ) => {
    mockGlobalConfig = updater(mockGlobalConfig)
  },
}))
const getGlobalConfig = (): MockGlobalConfig => mockGlobalConfig
const saveGlobalConfig = (
  updater: (current: MockGlobalConfig) => MockGlobalConfig,
): void => {
  mockGlobalConfig = updater(mockGlobalConfig)
}

// ── NOT mocked: cli/bg.ts ───────────────────────────────────────────────────
// A bg.ts mock would replace listSessions for bg.test.ts in the same run.
// The REAL listSessions is used, reading a CLAUDE_CONFIG_DIR fixture dir.

// ── Mocked notifier (capture system notifications) ─────────────────────────
// The real sendNotification would execute the user's Notification hooks and
// probe the terminal. Spread the real module so no exports are stripped for
// other test files in the same run (see the note above).
const realNotifier = await import('../../services/notifier.js')

const sentNotifications: { message: string; notificationType: string }[] = []
mock.module('src/services/notifier.ts', () => ({
  ...realNotifier,
  sendNotification: mock(
    async (notif: { message: string; notificationType: string }) => {
      sentNotifications.push(notif)
    },
  ),
}))

import type { SessionEntry } from '../../cli/bg.js'

const {
  computeBgSessionNotifications,
  scanAndNotifyBgSessions,
  BG_SESSION_SCAN_INTERVAL_MS,
} = await import('../bgSessionNotifications.js')

// ── Fixtures ───────────────────────────────────────────────────────────────

/** A PID that has exited (spawnSync waits for the child) — reads as dead. */
function deadPid(): number {
  const result = spawnSync(process.execPath, ['-e', ''])
  if (!result.pid || result.status === null) {
    throw new Error('Could not acquire a dead PID for the test')
  }
  return result.pid
}

function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    pid: process.pid,
    sessionId: 'session-x',
    cwd: '/tmp/project',
    startedAt: Date.now(),
    kind: 'bg',
    ...overrides,
  }
}

const terminal = { notifyBell: () => {} } as unknown as Parameters<
  typeof scanAndNotifyBgSessions
>[0]

/** Fixture sessions dir (real listSessions reads it via CLAUDE_CONFIG_DIR). */
let configDir: string
let sessionsDir: string

function writeEntry(entry: SessionEntry): void {
  writeFileSync(join(sessionsDir, `${entry.pid}.json`), JSON.stringify(entry))
}

beforeEach(() => {
  // Reset the dedup map per test (fresh copy of the pristine config).
  mockGlobalConfig = { ...pristineConfig }
  sentNotifications.length = 0

  configDir = mkdtempSync(join(tmpdir(), 'bg-notif-test-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
  sessionsDir = join(configDir, 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
})

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
  mockGlobalConfig = { ...pristineConfig }
})

// ── computeBgSessionNotifications (official L927692 scan semantics) ────────

describe('computeBgSessionNotifications', () => {
  test('completed bg session notifies "label finished" (agent_completed)', () => {
    const dead = deadPid()
    const { notifications, notified } = computeBgSessionNotifications(
      [
        makeEntry({
          pid: dead,
          sessionId: 'abc',
          name: 'my task',
          outcome: 'success',
        }),
      ],
      {},
    )
    expect(notifications).toEqual([
      {
        sessionId: 'abc',
        kind: 'completed',
        message: 'my task finished',
        notificationType: 'agent_completed',
      },
    ])
    expect(notified).toEqual({ abc: 'completed' })
  })

  test('label falls back to the sessionId prefix when no name', () => {
    const dead = deadPid()
    const { notifications } = computeBgSessionNotifications(
      [
        makeEntry({
          pid: dead,
          sessionId: '923d5913-aaaa',
          outcome: 'success',
        }),
      ],
      {},
    )
    expect(notifications[0]!.message).toBe('923d5913 finished')
  })

  test('outcome failure notifies "label failed"', () => {
    const dead = deadPid()
    const { notifications } = computeBgSessionNotifications(
      [makeEntry({ pid: dead, outcome: 'failure', name: 'bot' })],
      {},
    )
    expect(notifications[0]!.message).toBe('bot failed')
    expect(notifications[0]!.notificationType).toBe('agent_completed')
  })

  test('outcome stopped does not notify (user-stopped sessions stay silent)', () => {
    const dead = deadPid()
    const { notifications } = computeBgSessionNotifications(
      [makeEntry({ pid: dead, outcome: 'stopped' })],
      {},
    )
    expect(notifications).toEqual([])
  })

  test('selfDriving sessions never notify', () => {
    const dead = deadPid()
    const { notifications } = computeBgSessionNotifications(
      [makeEntry({ pid: dead, outcome: 'success', selfDriving: true })],
      {},
    )
    expect(notifications).toEqual([])
  })

  test('dead bg session without outcome (crashed) does not notify', () => {
    const dead = deadPid()
    const { notifications } = computeBgSessionNotifications(
      [makeEntry({ pid: dead })],
      {},
    )
    expect(notifications).toEqual([])
  })

  test('live session waiting for input notifies agent_needs_input', () => {
    const { notifications, notified } = computeBgSessionNotifications(
      [makeEntry({ waitingFor: 'approve Bash', name: 'helper' })],
      {},
    )
    expect(notifications).toEqual([
      {
        sessionId: 'session-x',
        kind: 'needs_input',
        message: 'helper needs input',
        notificationType: 'agent_needs_input',
      },
    ])
    expect(notified).toEqual({ 'session-x': 'needs_input' })
  })

  test('live session not waiting does not notify', () => {
    const { notifications } = computeBgSessionNotifications([makeEntry({})], {})
    expect(notifications).toEqual([])
  })

  test('non-bg sessions never notify', () => {
    const dead = deadPid()
    const { notifications } = computeBgSessionNotifications(
      [
        makeEntry({ pid: dead, kind: 'interactive', outcome: 'success' }),
        makeEntry({ pid: dead, kind: 'daemon', outcome: 'success' }),
      ],
      {},
    )
    expect(notifications).toEqual([])
  })

  test('dedup: each session notifies at most once per kind', () => {
    const dead = deadPid()
    const entry = makeEntry({ pid: dead, sessionId: 'abc', outcome: 'success' })
    const first = computeBgSessionNotifications([entry], {})
    expect(first.notifications).toHaveLength(1)

    // Second scan with the updated map → no repeat.
    const second = computeBgSessionNotifications([entry], first.notified)
    expect(second.notifications).toEqual([])
  })

  test('dedup is per kind: needs_input then completed both notify', () => {
    // While alive + waiting → needs_input fires and is recorded.
    const alive = makeEntry({ sessionId: 'abc', waitingFor: 'approve Bash' })
    const first = computeBgSessionNotifications([alive], {})
    expect(first.notifications[0]!.kind).toBe('needs_input')

    // Later dead + outcome → completed fires too (different kind).
    const dead = deadPid()
    const ended = makeEntry({ pid: dead, sessionId: 'abc', outcome: 'success' })
    const second = computeBgSessionNotifications([ended], first.notified)
    expect(second.notifications[0]!.kind).toBe('completed')
  })

  test('input map is not mutated', () => {
    const dead = deadPid()
    const notified = {}
    computeBgSessionNotifications(
      [makeEntry({ pid: dead, sessionId: 'abc', outcome: 'success' })],
      notified,
    )
    expect(notified).toEqual({})
  })
})

// ── scanAndNotifyBgSessions (the REPL's scan pass) ──────────────────────────

describe('scanAndNotifyBgSessions', () => {
  test('fires system notifications and persists the dedup map', async () => {
    const dead = deadPid()
    // Real registry: a completed bg entry on disk (dead pid + outcome).
    writeEntry(
      makeEntry({
        pid: dead,
        sessionId: 'abc',
        name: 'task',
        outcome: 'success',
      }),
    )

    await scanAndNotifyBgSessions(terminal)

    expect(sentNotifications).toEqual([
      { message: 'task finished', notificationType: 'agent_completed' },
    ])
    expect(getGlobalConfig().notifiedSessions).toEqual({ abc: 'completed' })

    // Second scan: dedup map persisted → no repeat.
    sentNotifications.length = 0
    await scanAndNotifyBgSessions(terminal)
    expect(sentNotifications).toEqual([])
    expect(getGlobalConfig().notifiedSessions).toEqual({ abc: 'completed' })
  })

  test('reads the registry with includeExited (completed bg entries persist)', async () => {
    const dead = deadPid()
    writeEntry(makeEntry({ pid: dead, outcome: 'success' }))
    await scanAndNotifyBgSessions(terminal)
    // Without includeExited the completed entry would not be listed → no
    // notification. Firing proves the scan reads with includeExited.
    expect(sentNotifications.length).toBe(1)
  })

  test('live waiting session fires agent_needs_input', async () => {
    writeEntry(
      makeEntry({
        pid: process.pid,
        sessionId: 'live-1',
        name: 'helper',
        waitingFor: 'approve Bash',
      }),
    )
    await scanAndNotifyBgSessions(terminal)
    expect(sentNotifications).toEqual([
      { message: 'helper needs input', notificationType: 'agent_needs_input' },
    ])
  })

  test('nothing to notify → no notification, no dedup entry', async () => {
    writeEntry(makeEntry({ pid: process.pid }))
    await scanAndNotifyBgSessions(terminal)
    expect(sentNotifications).toEqual([])
    expect(getGlobalConfig().notifiedSessions).toBeUndefined()
  })

  test('scan interval is 5s (aligned with the agents view refresh)', () => {
    expect(BG_SESSION_SCAN_INTERVAL_MS).toBe(5000)
  })
})
