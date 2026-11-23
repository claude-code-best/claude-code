import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
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

// ── Fake bg engine (dispatchSessionCore) ───────────────────────────────────
// selectEngine is replaced with a controllable fake so dispatchSessionCore
// tests never spawn tmux / real background processes. respawnSessionCore's
// tests return before reaching the engine, and no other code path in bg.ts
// uses it, so the mock is safe file-wide.
const engineCalls: {
  sessionName: string
  args: string[]
  cwd: string
  env: Record<string, string | undefined>
}[] = []
let engineSupportsInteractiveInput = true
let engineStartError: Error | null = null

mock.module('src/cli/bg/engines/index.js', () => ({
  selectEngine: async () => ({
    name: 'tmux' as const,
    supportsInteractiveInput: engineSupportsInteractiveInput,
    start: async (opts: {
      sessionName: string
      args: string[]
      env: Record<string, string | undefined>
      logPath: string
      cwd: string
    }) => {
      if (engineStartError) throw engineStartError
      engineCalls.push({
        sessionName: opts.sessionName,
        args: opts.args,
        cwd: opts.cwd,
        env: opts.env,
      })
      return {
        pid: 123,
        sessionName: opts.sessionName,
        logPath: opts.logPath,
        engineUsed: 'tmux' as const,
      }
    },
  }),
}))

// ── Mocked execFileNoThrow (replyToSession's tmux send-keys) ───────────────
// Capture the real module first: rmHandler's worktree cleanup needs the real
// execFileNoThrowWithCwd, so the mock spreads the real exports and only
// replaces execFileNoThrow (recording the tmux invocations).
const execCalls: { file: string; args: string[] }[] = []
let execNextCode = 0
let execNextStderr = ''
const realExecFile = await import('../../../utils/execFileNoThrow.js')
mock.module('src/utils/execFileNoThrow.js', () => ({
  ...realExecFile,
  execFileNoThrow: mock(async (file: string, args: string[]) => {
    execCalls.push({ file, args })
    return { stdout: '', stderr: execNextStderr, code: execNextCode }
  }),
}))

import {
  dispatchSessionCore,
  findSession,
  listSessions,
  logsHandler,
  printSessionsJson,
  readSessionLog,
  removeSessionCore,
  replyToSession,
  respawnHandler,
  respawnSessionCore,
  rmHandler,
  sortSessions,
  stopSession,
  updateSessionEntry,
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

  // Reset the fake engine / mocked execFileNoThrow state
  engineCalls.length = 0
  engineSupportsInteractiveInput = true
  engineStartError = null
  execCalls.length = 0
  execNextCode = 0
  execNextStderr = ''

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
  test('prints live sessions as a JSON array (official schema)', async () => {
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
      // bg sessions serialize with the official background shape:
      // id (sessionId's first 8 chars), kind "background", state — no pid.
      expect(sessions[0]).toMatchObject({
        id: 'session-',
        kind: 'background',
        state: 'blocked',
      })
      expect('pid' in (sessions[0] ?? {})).toBe(false)
      expect(chunks.join('')).toBe(JSON.stringify(sessions) + '\n')
    } finally {
      process.stdout.write = originalWrite
    }
  })

  test('serializes bg and interactive sessions with the official field order', async () => {
    // Two entries need two distinct pid files — the interactive one uses a
    // dead pid (kept because of --all).
    writeEntry(
      makeEntry({
        pid: process.pid,
        sessionId: '923d5913-1f25-4a05-a3d6-2d69d9e0aaaa',
        kind: 'bg',
        name: '分析工具差距文档',
        waitingFor: 'approval',
      }),
    )
    writeEntry(
      makeEntry({
        pid: deadPid(),
        sessionId: '7ac20fc4-1234-4a05-a3d6-2d69d9e0bbbb',
        kind: 'interactive',
        name: 'qagent-rust-6a',
        status: 'busy',
      }),
    )
    const chunks: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    const stdoutMock = mock(
      (chunk: string | Uint8Array, cb?: (error?: Error | null) => void) => {
        chunks.push(
          typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
        )
        cb?.()
        return true
      },
    )
    process.stdout.write = stdoutMock as typeof process.stdout.write
    try {
      await printSessionsJson({ all: true })
    } finally {
      process.stdout.write = originalWrite
    }
    const parsed = JSON.parse(chunks.join('')) as Record<string, unknown>[]
    const background = parsed.find(e => e.kind === 'background')
    const interactive = parsed.find(e => e.kind === 'interactive')
    // background: id, cwd, kind, startedAt, sessionId, name?, state — no pid
    expect(Object.keys(background!)).toEqual([
      'id',
      'cwd',
      'kind',
      'startedAt',
      'sessionId',
      'name',
      'state',
    ])
    expect(background!.id).toBe('923d5913')
    expect(background!.state).toBe('approval')
    expect('pid' in background!).toBe(false)
    // interactive: pid, cwd, kind, startedAt, sessionId, name?, status — no id
    expect(Object.keys(interactive!)).toEqual([
      'pid',
      'cwd',
      'kind',
      'startedAt',
      'sessionId',
      'name',
      'status',
    ])
    expect(interactive!.kind).toBe('interactive')
    expect(interactive!.status).toBe('busy')
    expect('id' in interactive!).toBe(false)
  })

  test('state defaults to blocked (bg) and status to idle (interactive)', async () => {
    writeEntry(makeEntry({ pid: process.pid, sessionId: 'bg-no-status' }))
    writeEntry(
      makeEntry({
        pid: deadPid(),
        sessionId: 'int-no-status',
        kind: 'interactive',
      }),
    )
    const sessions = await printSessionsJson({ all: true })
    expect(sessions.find(s => s.sessionId === 'bg-no-status')).toMatchObject({
      kind: 'background',
      state: 'blocked',
    })
    expect(sessions.find(s => s.sessionId === 'int-no-status')).toMatchObject({
      kind: 'interactive',
      status: 'idle',
    })
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

// ── dispatchSessionCore (silent core behind handleBgStart + agents view) ──

describe('dispatchSessionCore', () => {
  test('dispatches a prompt session (agents view enter-to-create)', async () => {
    const result = await dispatchSessionCore(['-p', 'hello world'], {
      cwd: '/tmp/project',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.engineUsed).toBe('tmux')
    expect(result.sessionName).toMatch(/^claude-bg-/)
    expect(result.logPath).toContain(result.sessionName)

    expect(engineCalls.length).toBe(1)
    const call = engineCalls[0]!
    expect(call.args).toEqual(['-p', 'hello world'])
    expect(call.cwd).toBe('/tmp/project')
    // Launch args recorded for `claude respawn`
    expect(JSON.parse(call.env.CLAUDE_CODE_SESSION_ARGS!)).toEqual([
      '-p',
      'hello world',
    ])
  })

  test('refuses detached engines without -p (no interactive input)', async () => {
    engineSupportsInteractiveInput = false
    const result = await dispatchSessionCore(['hello'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no-interactive-input')
    expect(result.message).toContain('-p/--print')
    expect(engineCalls.length).toBe(0)
  })

  test('reports engine start errors silently (no console output)', async () => {
    engineStartError = new Error('boom')
    const result = await dispatchSessionCore(['-p', 'x'])
    expect(result).toEqual({
      ok: false,
      reason: 'error',
      message: 'boom',
    })
    expect(consoleOutput.join('\n')).toBe('')
  })
})

// ── replyToSession (agents view reply dialog → tmux send-keys) ─────────────

describe('replyToSession', () => {
  test('sends the text literally (-l) then a separate Enter', async () => {
    const session = makeEntry({ tmuxSessionName: 'claude-bg-abc123' })
    const result = await replyToSession(session, 'hello world')
    expect(result.ok).toBe(true)
    expect(execCalls).toEqual([
      {
        file: 'tmux',
        args: ['send-keys', '-t', 'claude-bg-abc123', '-l', 'hello world'],
      },
      { file: 'tmux', args: ['send-keys', '-t', 'claude-bg-abc123', 'Enter'] },
    ])
  })

  test('detached sessions (no tmux session name) are not supported yet', async () => {
    const result = await replyToSession(makeEntry(), 'hi')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('does not support replies')
    expect(execCalls.length).toBe(0)
  })

  test('reports tmux send-keys failures', async () => {
    execNextCode = 1
    execNextStderr = 'no such session'
    const result = await replyToSession(
      makeEntry({ tmuxSessionName: 'claude-bg-gone' }),
      'hi',
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('claude-bg-gone')
    expect(result.message).toContain('no such session')
    // The Enter submit is not sent after a failed literal send
    expect(execCalls.length).toBe(1)
  })
})

// ── removeSessionCore (silent core behind claude rm + agents view ctrl+x) ──

describe('removeSessionCore', () => {
  test('refuses running sessions without console output', async () => {
    const result = await removeSessionCore(
      makeEntry({ pid: process.pid, sessionId: 'session-live' }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('running')
    expect(result.message).toContain('still running')
    expect(consoleOutput.join('\n')).toBe('')
  })

  test('removes an exited session and its registry entry silently', async () => {
    const dead = deadPid()
    writeEntry(makeEntry({ pid: dead, sessionId: 'session-gone' }))
    const result = await removeSessionCore(
      makeEntry({ pid: dead, sessionId: 'session-gone' }),
    )
    expect(result.ok).toBe(true)
    expect(existsSync(join(sessionsDir, `${dead}.json`))).toBe(false)
    expect(consoleOutput.join('\n')).toBe('')
  })
})

describe('logsHandler', () => {
  test('errors when the session is not found', async () => {
    await logsHandler('nope')
    expect(process.exitCode).toBe(1)
    expect(consoleOutput.join('\n')).toContain('Session not found: nope')
  })
})

// ── updateSessionEntry / sortSessions (agents view pin & rename) ───────────

describe('updateSessionEntry', () => {
  test('patches the registry entry in place', async () => {
    const dead = deadPid()
    writeEntry(makeEntry({ pid: dead, sessionId: 'session-patch' }))

    const ok = await updateSessionEntry(
      makeEntry({ pid: dead, sessionId: 'session-patch' }),
      { name: 'renamed', pinned: true },
    )

    expect(ok).toBe(true)
    const { readFileSync } = await import('node:fs')
    const data = JSON.parse(
      readFileSync(join(sessionsDir, `${dead}.json`), 'utf-8'),
    )
    expect(data.name).toBe('renamed')
    expect(data.pinned).toBe(true)
    expect(data.sessionId).toBe('session-patch')
  })

  test('returns false when the entry file is gone', async () => {
    const ok = await updateSessionEntry(
      makeEntry({ pid: 999999, sessionId: 'missing' }),
      { name: 'x' },
    )
    expect(ok).toBe(false)
  })
})

describe('sortSessions', () => {
  test('pinned sessions come first, then newest first', () => {
    const a = makeEntry({ pid: 1, sessionId: 'a', startedAt: 100 })
    const b = makeEntry({ pid: 2, sessionId: 'b', startedAt: 300 })
    const c = makeEntry({
      pid: 3,
      sessionId: 'c',
      startedAt: 200,
      pinned: true,
    })

    expect(sortSessions([a, b, c]).map(s => s.sessionId)).toEqual([
      'c',
      'b',
      'a',
    ])
  })
})

// ── rmHandler worktree cleanup (official "delete its worktree") ────────────

function git(cwd: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  }
}

function makeRepoWithWorktree(): { repo: string; worktree: string } {
  const repo = mkdtempSync(join(tmpdir(), 'bg-wt-repo-'))
  git(repo, ['init', '-q'])
  writeFileSync(join(repo, 'README.md'), 'hello\n')
  git(repo, ['add', '.'])
  git(repo, [
    '-c',
    'user.email=test@example.com',
    '-c',
    'user.name=Test',
    'commit',
    '-q',
    '-m',
    'init',
  ])
  const worktree = join(repo, 'wt')
  git(repo, ['worktree', 'add', '-q', worktree, '-b', 'bg-test-branch'])
  return { repo, worktree }
}

describe('rmHandler worktree cleanup', () => {
  test('removes a clean worktree and the registry entry', async () => {
    const { repo, worktree } = makeRepoWithWorktree()
    const dead = deadPid()
    writeEntry(
      makeEntry({
        pid: dead,
        sessionId: 'session-wt',
        worktreePath: worktree,
        worktreeBranch: 'bg-test-branch',
      }),
    )

    await rmHandler('session-wt')

    expect(process.exitCode).toBe(0)
    expect(existsSync(worktree)).toBe(false)
    expect(existsSync(join(sessionsDir, `${dead}.json`))).toBe(false)
    rmSync(repo, { recursive: true, force: true })
  })

  test('refuses to remove a worktree with uncommitted changes', async () => {
    const { repo, worktree } = makeRepoWithWorktree()
    writeFileSync(join(worktree, 'dirty.txt'), 'uncommitted\n')
    const dead = deadPid()
    writeEntry(
      makeEntry({
        pid: dead,
        sessionId: 'session-dirty',
        worktreePath: worktree,
      }),
    )

    await rmHandler('session-dirty')

    expect(process.exitCode).toBe(1)
    expect(consoleOutput.join('\n')).toContain('uncommitted changes')
    // Entry and worktree are both kept.
    expect(existsSync(join(sessionsDir, `${dead}.json`))).toBe(true)
    expect(existsSync(worktree)).toBe(true)
    rmSync(repo, { recursive: true, force: true })
  })
})
