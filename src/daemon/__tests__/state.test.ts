/**
 * Tests for src/daemon/state.ts
 *
 * Uses real temp directories and CLAUDE_CONFIG_DIR env var
 * instead of mocking fs/envUtils, to avoid cross-test mock pollution.
 */
import { describe, expect, test, beforeEach, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

// ─── setup: real temp dir via env var ──────────────────────────────────────

const tempBase = mkdtempSync(join(tmpdir(), 'daemon-state-test-'))

beforeEach(() => {
  // Clear lodash memoize cache so CLAUDE_CONFIG_DIR env var takes effect
  if (
    typeof getClaudeConfigHomeDir === 'function' &&
    'cache' in getClaudeConfigHomeDir
  ) {
    ;(getClaudeConfigHomeDir as any).cache.clear?.()
  }
  const tempHome = mkdtempSync(join(tempBase, 'home-'))
  process.env.CLAUDE_CONFIG_DIR = tempHome
})

afterAll(() => {
  delete process.env.CLAUDE_CONFIG_DIR
  // Clear memoize cache after all tests so other files see fresh state
  if (
    typeof getClaudeConfigHomeDir === 'function' &&
    'cache' in getClaudeConfigHomeDir
  ) {
    ;(getClaudeConfigHomeDir as any).cache.clear?.()
  }
  try {
    rmSync(tempBase, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
})

// ─── import ─────────────────────────────────────────────────────────────────

const {
  getDaemonStateFilePath,
  writeDaemonState,
  readDaemonState,
  removeDaemonState,
  queryDaemonStatus,
} = await import('../state.js')

// ─── tests ─────────────────────────────────────────────────────────────────

describe('getDaemonStateFilePath', () => {
  test('returns default path with remote-control name', () => {
    const p = getDaemonStateFilePath()
    expect(p).toContain('daemon')
    expect(p).toContain('remote-control.json')
  })

  test('returns path with custom name', () => {
    const p = getDaemonStateFilePath('my-daemon')
    expect(p).toContain('my-daemon.json')
  })
})

describe('writeDaemonState', () => {
  test('writes state JSON to disk', () => {
    const state = {
      pid: 1234,
      cwd: '/test',
      startedAt: '2026-01-01T00:00:00Z',
      workerKinds: ['rcs'],
      lastStatus: 'running' as const,
    }
    writeDaemonState(state, 'test')
    const filePath = getDaemonStateFilePath('test')
    expect(existsSync(filePath)).toBe(true)
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(parsed.pid).toBe(1234)
    expect(parsed.cwd).toBe('/test')
  })

  test('creates directory recursively', () => {
    writeDaemonState(
      {
        pid: 1,
        cwd: '/',
        startedAt: '',
        workerKinds: [],
        lastStatus: 'running',
      },
      'dir-test',
    )
    const filePath = getDaemonStateFilePath('dir-test')
    expect(existsSync(filePath)).toBe(true)
  })
})

describe('readDaemonState', () => {
  test('returns null when no state file', () => {
    expect(readDaemonState('nonexistent')).toBeNull()
  })

  test('returns parsed state when file exists', () => {
    const state = {
      pid: 42,
      cwd: '/x',
      startedAt: '',
      workerKinds: [],
      lastStatus: 'running' as const,
    }
    writeDaemonState(state, 'read-test')
    const result = readDaemonState('read-test')
    expect(result).not.toBeNull()
    expect(result!.pid).toBe(42)
  })
})

describe('removeDaemonState', () => {
  test('removes existing state file', () => {
    writeDaemonState(
      {
        pid: 1,
        cwd: '/',
        startedAt: '',
        workerKinds: [],
        lastStatus: 'running',
      },
      'rm-test',
    )
    const filePath = getDaemonStateFilePath('rm-test')
    expect(existsSync(filePath)).toBe(true)
    removeDaemonState('rm-test')
    expect(existsSync(filePath)).toBe(false)
  })

  test('does not throw when file does not exist', () => {
    expect(() => removeDaemonState('no-file')).not.toThrow()
  })
})

describe('queryDaemonStatus', () => {
  test('returns stopped when no state file', () => {
    const result = queryDaemonStatus('empty')
    expect(result.status).toBe('stopped')
    expect(result.state).toBeUndefined()
  })

  test('returns running when PID is alive (current process)', () => {
    writeDaemonState(
      {
        pid: process.pid,
        cwd: process.cwd(),
        startedAt: new Date().toISOString(),
        workerKinds: ['test'],
        lastStatus: 'running',
      },
      'alive-test',
    )
    const result = queryDaemonStatus('alive-test')
    expect(result.status).toBe('running')
    expect(result.state).toBeDefined()
    expect(result.state!.pid).toBe(process.pid)
  })

  test('returns stale when PID is dead and cleans up', () => {
    writeDaemonState(
      {
        pid: 999999,
        cwd: '/',
        startedAt: '',
        workerKinds: [],
        lastStatus: 'running',
      },
      'stale-test',
    )
    const result = queryDaemonStatus('stale-test')
    expect(result.status).toBe('stale')
    expect(existsSync(getDaemonStateFilePath('stale-test'))).toBe(false)
  })
})
