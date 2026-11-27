import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logMock } from '../../../tests/mocks/log'

// Mock log.ts to cut the heavy dependency chain (log.ts → bootstrap/state.ts → analytics)
mock.module('src/utils/log.ts', logMock)

const {
  evaluateRendererHealth,
  readRendererHealthState,
  writeRendererHealthState,
  getRendererHealthStatePath,
  shouldDegradeFullscreenForHealth,
  markFullscreenStarting,
  markFullscreenRenderSucceeded,
  resetRendererFailures,
  getFullscreenDegradationNotice,
  wasFullscreenDegradedThisSession,
  getRendererHealthSummary,
  getCurrentVersion,
  _resetRendererHealthForTesting,
  RENDERER_FAILURE_THRESHOLD,
  RENDERER_DEGRADED_RETRY_MESSAGE,
  RENDERER_DEGRADED_OFF_MESSAGE,
} = await import('../rendererHealth')

// ─── evaluateRendererHealth (pure — no filesystem) ──────────────────────────

describe('evaluateRendererHealth', () => {
  const fresh = { starting: false, failureCount: 0, lastVersion: '' }

  test('fresh state proceeds with no message', () => {
    const result = evaluateRendererHealth(fresh, '1.0.0')
    expect(result.decision).toBe('proceed')
    expect(result.message).toBeNull()
    expect(result.nextState).toEqual({
      starting: false,
      failureCount: 0,
      lastVersion: '',
    })
  })

  test('starting=true degrades once, bumps failureCount, retries next launch', () => {
    const result = evaluateRendererHealth(
      { starting: true, failureCount: 0, lastVersion: '' },
      '1.0.0',
    )
    expect(result.decision).toBe('degrade-retry')
    expect(result.nextState).toEqual({
      starting: false,
      failureCount: 1,
      lastVersion: '',
    })
    expect(result.message).toBe(RENDERER_DEGRADED_RETRY_MESSAGE)
    expect(result.message).toContain("didn't finish starting last time")
    expect(result.message).toContain('/tui classic keeps the classic renderer')
  })

  test('second missed start reaches the threshold and degrades persistently', () => {
    const result = evaluateRendererHealth(
      { starting: true, failureCount: 1, lastVersion: '' },
      '1.0.0',
    )
    expect(result.decision).toBe('degrade-retry')
    expect(result.nextState.failureCount).toBe(2)

    const next = evaluateRendererHealth(result.nextState, '1.0.0')
    expect(next.decision).toBe('degrade-off')
    expect(next.nextState.failureCount).toBe(2)
    expect(next.message).toBe(RENDERER_DEGRADED_OFF_MESSAGE)
    expect(next.message).toContain('repeatedly failed to start')
    expect(next.message).toContain('/tui fullscreen to try it again')
    expect(next.message).toContain('resets after an update')
  })

  test('failureCount at threshold with starting=false stays persistently off', () => {
    const result = evaluateRendererHealth(
      { starting: false, failureCount: 2, lastVersion: '1.0.0' },
      '1.0.0',
    )
    expect(result.decision).toBe('degrade-off')
    expect(result.nextState).toEqual({
      starting: false,
      failureCount: 2,
      lastVersion: '1.0.0',
    })
  })

  test('version update resets the failure count (proceed again)', () => {
    const result = evaluateRendererHealth(
      { starting: false, failureCount: 2, lastVersion: '1.0.0' },
      '1.1.0',
    )
    expect(result.decision).toBe('proceed')
    expect(result.nextState).toEqual({
      starting: false,
      failureCount: 0,
      lastVersion: '1.0.0',
    })
  })

  test('no version reset when fullscreen never succeeded (lastVersion empty)', () => {
    // Without this rule a never-working machine would retry forever.
    const result = evaluateRendererHealth(
      { starting: false, failureCount: 2, lastVersion: '' },
      '1.1.0',
    )
    expect(result.decision).toBe('degrade-off')
  })

  test('version update also gives a degrade-retry launch a fresh count', () => {
    const result = evaluateRendererHealth(
      { starting: true, failureCount: 1, lastVersion: '1.0.0' },
      '1.1.0',
    )
    expect(result.decision).toBe('degrade-retry')
    expect(result.nextState.failureCount).toBe(1)
  })
})

// ─── State file read/write (injectable path) ────────────────────────────────

describe('readRendererHealthState / writeRendererHealthState', () => {
  let tmpDir: string
  let statePath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'renderer-health-test-'))
    statePath = join(tmpDir, 'state.json')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('missing file reads as fresh state', () => {
    expect(readRendererHealthState(statePath)).toEqual({
      starting: false,
      failureCount: 0,
      lastVersion: '',
    })
  })

  test('roundtrips through disk', () => {
    writeRendererHealthState(
      { starting: true, failureCount: 1, lastVersion: '2.1.330' },
      statePath,
    )
    expect(readRendererHealthState(statePath)).toEqual({
      starting: true,
      failureCount: 1,
      lastVersion: '2.1.330',
    })
  })

  test('corrupt JSON reads as fresh state (never bricks the renderer)', () => {
    writeFileSync(statePath, '{not valid json', 'utf8')
    expect(readRendererHealthState(statePath)).toEqual({
      starting: false,
      failureCount: 0,
      lastVersion: '',
    })
  })

  test('wrong-shaped JSON reads as fresh state', () => {
    writeFileSync(statePath, JSON.stringify({ starting: 'yes' }), 'utf8')
    expect(readRendererHealthState(statePath).starting).toBe(false)
  })

  test('writeRendererHealthState creates the parent directory', () => {
    const nested = join(tmpDir, 'a', 'b', 'state.json')
    writeRendererHealthState(
      { starting: false, failureCount: 3, lastVersion: 'x' },
      nested,
    )
    expect(existsSync(nested)).toBe(true)
  })
})

// ─── Session-scoped integration (uses CLAUDE_CONFIG_DIR tmp dir) ────────────

describe('rendererHealth session integration', () => {
  let tmpDir: string
  let claudeDir: string
  let statePath: string
  const origEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'renderer-health-session-'))
    claudeDir = join(tmpDir, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    statePath = join(claudeDir, '.tui-renderer-state.json')
    process.env.CLAUDE_CONFIG_DIR = claudeDir
    origEnv.CLAUDE_CONFIG_DIR = claudeDir
    _resetRendererHealthForTesting()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    if (origEnv.CLAUDE_CONFIG_DIR === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = origEnv.CLAUDE_CONFIG_DIR
    }
    _resetRendererHealthForTesting()
  })

  test('getRendererHealthStatePath lives under the config home', () => {
    expect(getRendererHealthStatePath()).toBe(statePath)
  })

  test('shouldDegradeFullscreenForHealth: fresh state proceeds and is one-shot', () => {
    expect(shouldDegradeFullscreenForHealth()).toBe(false)
    expect(wasFullscreenDegradedThisSession()).toBe(false)
    expect(getFullscreenDegradationNotice()).toBeNull()
    // One-shot: a second call must not re-evaluate (and re-apply side effects)
    expect(shouldDegradeFullscreenForHealth()).toBe(false)
  })

  test('shouldDegradeFullscreenForHealth: missed start degrades once with official message', () => {
    writeRendererHealthState(
      { starting: true, failureCount: 0, lastVersion: '' },
      statePath,
    )
    expect(shouldDegradeFullscreenForHealth()).toBe(true)
    expect(wasFullscreenDegradedThisSession()).toBe(true)
    expect(getFullscreenDegradationNotice()).toBe(
      RENDERER_DEGRADED_RETRY_MESSAGE,
    )
    // failureCount bumped + starting cleared on disk → next launch retries
    expect(readRendererHealthState(statePath)).toEqual({
      starting: false,
      failureCount: 1,
      lastVersion: '',
    })
  })

  test('shouldDegradeFullscreenForHealth: repeated failures degrade persistently', () => {
    // lastVersion must equal the current version, otherwise the version
    // update reset would kick in (in tests getCurrentVersion() is 'unknown')
    writeRendererHealthState(
      {
        starting: false,
        failureCount: RENDERER_FAILURE_THRESHOLD,
        lastVersion: getCurrentVersion(),
      },
      statePath,
    )
    expect(shouldDegradeFullscreenForHealth()).toBe(true)
    expect(getFullscreenDegradationNotice()).toBe(RENDERER_DEGRADED_OFF_MESSAGE)
    // failureCount preserved → stays off until /tui fullscreen or update
    expect(readRendererHealthState(statePath).failureCount).toBe(
      RENDERER_FAILURE_THRESHOLD,
    )
  })

  test('markFullscreenStarting arms starting; first render success clears it', () => {
    writeRendererHealthState(
      { starting: false, failureCount: 1, lastVersion: 'v1' },
      statePath,
    )
    markFullscreenStarting()
    expect(readRendererHealthState(statePath)).toEqual({
      starting: true,
      failureCount: 1,
      lastVersion: 'v1',
    })

    markFullscreenRenderSucceeded()
    expect(readRendererHealthState(statePath)).toEqual({
      starting: false,
      failureCount: 0,
      lastVersion: getCurrentVersion(),
    })
  })

  test('markFullscreenRenderSucceeded is a no-op without markFullscreenStarting', () => {
    // Guards against alt-screen overlays in classic sessions erasing
    // real failure counts.
    writeRendererHealthState(
      { starting: false, failureCount: 2, lastVersion: 'v1' },
      statePath,
    )
    markFullscreenRenderSucceeded()
    expect(readRendererHealthState(statePath)).toEqual({
      starting: false,
      failureCount: 2,
      lastVersion: 'v1',
    })
  })

  test('markFullscreenStarting is once per session (re-renders do not rewrite)', () => {
    markFullscreenStarting()
    // Simulate success, then a re-render calling markFullscreenStarting again
    markFullscreenRenderSucceeded()
    markFullscreenStarting()
    expect(readRendererHealthState(statePath).starting).toBe(false)
  })

  test('resetRendererFailures clears everything (/tui fullscreen retry)', () => {
    writeRendererHealthState(
      { starting: true, failureCount: 5, lastVersion: 'v1' },
      statePath,
    )
    resetRendererFailures()
    expect(readRendererHealthState(statePath)).toEqual({
      starting: false,
      failureCount: 0,
      lastVersion: getCurrentVersion(),
    })
  })

  test('getRendererHealthSummary exposes persisted state plus session flags', () => {
    writeRendererHealthState(
      { starting: false, failureCount: 1, lastVersion: 'v1' },
      statePath,
    )
    const summary = getRendererHealthSummary()
    expect(summary.failureCount).toBe(1)
    expect(summary.lastVersion).toBe('v1')
    expect(summary.threshold).toBe(RENDERER_FAILURE_THRESHOLD)
    expect(summary.degradedThisSession).toBe(false)
  })
})
