import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
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
import { getClaudeConfigHomeDir } from '../../../utils/envUtils.js'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'
import * as settingsModule from '../../../utils/settings/settings.js'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
  stripProtoFields: (v: unknown) => v,
}))

// Mock log.ts / debug.ts to cut the bootstrap/state dependency chain
// (fullscreen.ts — imported by the tui command — pulls in debug.ts → log.ts).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// ── Settings mock (same pattern as poorMode.test.ts) ─────────────────────────
// The tui command persists `tui: "classic" | "fullscreen"` via
// updateSettingsForSource, and the fullscreen resolver reads it via
// getInitialSettings. Mocking keeps these tests hermetic (no real
// settings.json writes / caches / change-detector watchers).

let mockSettings: Record<string, unknown> = {}
let lastUpdate: { source: string; patch: Record<string, unknown> } | null = null

mock.module('src/utils/settings/settings.js', () => ({
  loadManagedFileSettings: () => ({ settings: null, errors: [] }),
  getManagedFileSettingsPresence: () => ({
    hasBase: false,
    hasDropIns: false,
  }),
  parseSettingsFile: () => ({ settings: null, errors: [] }),
  getSettingsRootPathForSource: () => '',
  getSettingsFilePathForSource: () => undefined,
  getRelativeSettingsFilePathForSource: () => '',
  getInitialSettings: () => mockSettings,
  getSettingsForSource: () => mockSettings,
  getPolicySettingsOrigin: () => null,
  getSettingsWithErrors: () => ({ settings: mockSettings, errors: [] }),
  getSettingsWithSources: () => ({ effective: mockSettings, sources: [] }),
  getSettings_DEPRECATED: () => mockSettings,
  settingsMergeCustomizer: () => undefined,
  getManagedSettingsKeysForLogging: () => [],
  hasAutoModeOptIn: () => true,
  hasSkipDangerousModePermissionPrompt: () => false,
  getAutoModeConfig: () => undefined,
  getUseAutoModeDuringPlan: () => true,
  rawSettingsContainsKey: (key: string) => key in mockSettings,
  updateSettingsForSource: (source: string, patch: Record<string, unknown>) => {
    lastUpdate = { source, patch }
    mockSettings = { ...mockSettings, ...patch }
    // Real signature returns { error: Error | null }
    return { error: null }
  },
}))

afterAll(() => {
  mock.restore()
  mock.module('src/utils/settings/settings.js', () => settingsModule)
})

// Import AFTER mocks are registered. The query suffix gives this file its own
// module instance so cross-file mocks cannot replace the subject under test.
// NOTE: no query-suffix here — unlike poorMode.test.ts, these tests exercise
// the module-level session caches shared between index.js, fullscreen.js and
// rendererHealth.js, so all three must resolve to the SAME module instances.
// Cross-file pollution is handled by the _reset*ForTesting() calls in
// beforeEach instead of instance isolation.
const { callTui, getTuiMarkerPath, isTuiModeEnabled } = await import(
  '../index.js'
)
const fullscreen = await import('../../../utils/fullscreen.js')
const rendererHealth = await import('../../../utils/rendererHealth.js')

let tmpDir: string
let claudeDir: string
let statePath: string
const origEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tui-test-'))
  claudeDir = join(tmpDir, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  statePath = join(claudeDir, '.tui-renderer-state.json')
  process.env.CLAUDE_CONFIG_DIR = claudeDir
  // getClaudeConfigHomeDir is `memoize(...)` — clear its cache so this
  // suite's CLAUDE_CONFIG_DIR overrides any value cached by an earlier
  // test file in the same process.
  getClaudeConfigHomeDir.cache?.clear?.()
  // Save env vars we may mutate
  origEnv.CLAUDE_CODE_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
  delete process.env.CLAUDE_CODE_NO_FLICKER
  // The tmux -CC probe spawns a subprocess when $TMUX is set — keep tests hermetic.
  origEnv.TMUX = process.env.TMUX
  delete process.env.TMUX
  // Deterministic default resolution (external → classic unless opted in)
  origEnv.USER_TYPE = process.env.USER_TYPE
  process.env.USER_TYPE = 'external'
  mockSettings = {}
  lastUpdate = null
  // Reset the session-scoped module caches (fullscreen resolution is
  // one-shot per session; rendererHealth keeps session flags).
  fullscreen._resetForTesting()
  rendererHealth._resetRendererHealthForTesting()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
  // Restore env vars
  if (origEnv.CLAUDE_CODE_NO_FLICKER === undefined) {
    delete process.env.CLAUDE_CODE_NO_FLICKER
  } else {
    process.env.CLAUDE_CODE_NO_FLICKER = origEnv.CLAUDE_CODE_NO_FLICKER
  }
  if (origEnv.TMUX === undefined) {
    delete process.env.TMUX
  } else {
    process.env.TMUX = origEnv.TMUX
  }
  if (origEnv.USER_TYPE === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = origEnv.USER_TYPE
  }
})

// Helper: invoke the command's call function
async function invokeCmd(
  args: string,
): Promise<{ type: string; value: string }> {
  return callTui(args) as Promise<{ type: string; value: string }>
}

function writeRendererState(state: {
  starting: boolean
  failureCount: number
  lastVersion: string
}): void {
  writeFileSync(statePath, JSON.stringify(state), 'utf8')
}

function readRendererState(): {
  starting: boolean
  failureCount: number
  lastVersion: string
} {
  return JSON.parse(readFileSync(statePath, 'utf8'))
}

describe('tui command metadata', () => {
  test('has correct name, type, and description', async () => {
    const mod = await import('../index.js')
    const cmd = mod.default
    expect(cmd.name).toBe('tui')
    expect(cmd.type).toBe('local-jsx')
    expect(cmd.description).toContain('renderer')
    expect(cmd.argumentHint).toBe('[classic|fullscreen]')
  })

  test('interactive and noninteractive entries are mutually gated', async () => {
    const mod = await import('../index.js')
    const interactiveEnabled = mod.default.isEnabled?.()
    const nonInteractiveEnabled = mod.tuiNonInteractive.isEnabled?.()

    expect(typeof interactiveEnabled).toBe('boolean')
    expect(nonInteractiveEnabled).toBe(!interactiveEnabled)
  })

  test('supportsNonInteractive is true', async () => {
    const mod = await import('../index.js')
    const cmd = mod.tuiNonInteractive as unknown as {
      supportsNonInteractive: boolean
      type: string
    }
    expect(cmd.type).toBe('local')
    expect(cmd.supportsNonInteractive).toBe(true)
  })

  test('local-jsx no args renders action panel without completing', async () => {
    const { call } = await import('../panel.js')
    const messages: string[] = []

    const node = await call(
      msg => {
        if (msg) messages.push(msg)
      },
      {} as never,
      '',
    )

    expect(node).not.toBeNull()
    expect(messages).toHaveLength(0)
  })

  test('local-jsx explicit args completes through onDone', async () => {
    const { call } = await import('../panel.js')
    const messages: string[] = []

    const node = await call(
      msg => {
        if (msg) messages.push(msg)
      },
      {} as never,
      'status',
    )

    expect(node).toBeNull()
    expect(messages.join('\n')).toContain('TUI Renderer Status')
  })
})

describe('tui status subcommand', () => {
  test('reports classic renderer with override hint when nothing is configured', async () => {
    const result = await invokeCmd('status')
    expect(result.type).toBe('text')
    expect(result.value).toContain('classic')
    // Official hint for switching the renderer on
    expect(result.value).toContain(
      '/tui fullscreen or CLAUDE_CODE_NO_FLICKER=1 to override',
    )
  })

  test('reports fullscreen when the legacy marker file exists', async () => {
    writeFileSync(getTuiMarkerPath(), '1', 'utf8')

    const result = await invokeCmd('status')
    expect(result.type).toBe('text')
    expect(result.value).toContain('fullscreen')
    expect(result.value).toContain('marker file')
  })

  test('reports fullscreen when settings.tui is "fullscreen"', async () => {
    mockSettings = { tui: 'fullscreen' }

    const result = await invokeCmd('status')
    expect(result.value).toContain('fullscreen')
    expect(result.value).toContain('settings.json')
  })

  test('reports classic when settings.tui is "classic"', async () => {
    mockSettings = { tui: 'classic' }

    const result = await invokeCmd('status')
    expect(result.value).toContain('classic')
    expect(result.value).toContain('settings.json `tui: "classic"`')
  })

  test('no args is an alias for status', async () => {
    const result = await invokeCmd('')
    expect(result.value).toContain('TUI Renderer Status')
  })

  test('explains what kept the renderer when degraded after startup failures', async () => {
    // Last launch entered fullscreen but never finished starting
    writeRendererState({ starting: true, failureCount: 0, lastVersion: '' })
    mockSettings = { tui: 'fullscreen' }

    const result = await invokeCmd('status')
    expect(result.value).toContain('classic')
    expect(result.value).toContain('fell back to the classic renderer')
    expect(result.value).toContain('/tui fullscreen` to retry')
  })
})

describe('tui classic subcommand', () => {
  test('persists tui: "classic" to settings.json', async () => {
    const result = await invokeCmd('classic')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Classic renderer enabled')
    expect(lastUpdate).not.toBeNull()
    expect(lastUpdate!.source).toBe('userSettings')
    expect(lastUpdate!.patch.tui).toBe('classic')
  })

  test('removes the legacy marker file (shell-profile compat)', async () => {
    writeFileSync(getTuiMarkerPath(), '1', 'utf8')

    await invokeCmd('classic')
    expect(existsSync(getTuiMarkerPath())).toBe(false)
  })

  test('off is a legacy alias for classic', async () => {
    const result = await invokeCmd('off')
    expect(result.value).toContain('Classic renderer enabled')
    expect(lastUpdate!.patch.tui).toBe('classic')
  })
})

describe('tui fullscreen subcommand', () => {
  test('persists tui: "fullscreen" to settings.json and writes the marker', async () => {
    const result = await invokeCmd('fullscreen')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Fullscreen renderer enabled')
    expect(lastUpdate).not.toBeNull()
    expect(lastUpdate!.source).toBe('userSettings')
    expect(lastUpdate!.patch.tui).toBe('fullscreen')
    // Marker kept in sync for shell-profile integrations
    expect(existsSync(getTuiMarkerPath())).toBe(true)
  })

  test('resets renderer failure state (official: /tui fullscreen retries)', async () => {
    writeRendererState({ starting: true, failureCount: 2, lastVersion: 'v1' })

    await invokeCmd('fullscreen')
    expect(readRendererState()).toEqual({
      starting: false,
      failureCount: 0,
      lastVersion: rendererHealth.getCurrentVersion(),
    })
  })

  test('explains that a degraded session keeps the classic renderer', async () => {
    // Simulate a session that degraded to classic after a missed start
    writeRendererState({ starting: true, failureCount: 0, lastVersion: '' })
    mockSettings = { tui: 'fullscreen' }
    fullscreen._resetForTesting()
    expect(fullscreen.resolveFullscreenMode().fullscreen).toBe(false)
    expect(rendererHealth.wasFullscreenDegradedThisSession()).toBe(true)

    const result = await invokeCmd('fullscreen')
    expect(result.value).toContain('Fullscreen renderer enabled')
    expect(result.value).toContain('keeps the classic renderer')
  })

  test('on is a legacy alias for fullscreen', async () => {
    const result = await invokeCmd('on')
    expect(result.value).toContain('Fullscreen renderer enabled')
    expect(lastUpdate!.patch.tui).toBe('fullscreen')
  })
})

describe('tui toggle subcommand (legacy)', () => {
  test('toggle with nothing configured switches to fullscreen', async () => {
    const result = await invokeCmd('toggle')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Fullscreen renderer enabled')
    expect(lastUpdate!.patch.tui).toBe('fullscreen')
    expect(existsSync(getTuiMarkerPath())).toBe(true)
  })

  test('toggle when fullscreen switches to classic', async () => {
    await invokeCmd('fullscreen')

    const result = await invokeCmd('toggle')
    expect(result.value).toContain('Classic renderer enabled')
    expect(lastUpdate!.patch.tui).toBe('classic')
    expect(existsSync(getTuiMarkerPath())).toBe(false)
  })
})

describe('tui unknown subcommand', () => {
  test('returns usage text for unknown subcommand', async () => {
    const result = await invokeCmd('foobar')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Usage: /tui <classic|fullscreen>')
  })
})

describe('getTuiMarkerPath', () => {
  test('returns path under CLAUDE_CONFIG_DIR', async () => {
    const p = getTuiMarkerPath()
    expect(p).toContain(claudeDir)
    expect(p).toContain('.tui-mode')
  })
})

describe('tui status env var display', () => {
  test('shows forced-fullscreen when CLAUDE_CODE_NO_FLICKER=1', async () => {
    process.env.CLAUDE_CODE_NO_FLICKER = '1'
    const result = await invokeCmd('status')
    expect(result.value).toContain('forced fullscreen via env var')
    delete process.env.CLAUDE_CODE_NO_FLICKER
  })

  test('shows forced-classic when CLAUDE_CODE_NO_FLICKER=0', async () => {
    process.env.CLAUDE_CODE_NO_FLICKER = '0'
    const result = await invokeCmd('status')
    expect(result.value).toContain('forced classic via env var')
    delete process.env.CLAUDE_CODE_NO_FLICKER
  })
})

describe('isTuiModeEnabled', () => {
  test('returns false when marker absent', () => {
    expect(isTuiModeEnabled()).toBe(false)
  })

  test('returns true when marker present', () => {
    writeFileSync(getTuiMarkerPath(), '1', 'utf8')
    expect(isTuiModeEnabled()).toBe(true)
  })
})

describe('resolveFullscreenMode (renderer-health integration)', () => {
  test('explicit CLAUDE_CODE_NO_FLICKER=1 overrides failure-based degradation', () => {
    // Repeated failures would normally keep the renderer off…
    writeRendererState({
      starting: true,
      failureCount: rendererHealth.RENDERER_FAILURE_THRESHOLD,
      lastVersion: rendererHealth.getCurrentVersion(),
    })
    process.env.CLAUDE_CODE_NO_FLICKER = '1'

    const resolved = fullscreen.resolveFullscreenMode()
    expect(resolved.fullscreen).toBe(true)
    expect(resolved.reason).toBe('env-forced-on')
    expect(resolved.degraded).toBe(false)
    // …and the override must not consume/rewrite the failure state
    expect(readRendererState().failureCount).toBe(
      rendererHealth.RENDERER_FAILURE_THRESHOLD,
    )

    delete process.env.CLAUDE_CODE_NO_FLICKER
  })

  test('explicit CLAUDE_CODE_NO_FLICKER=0 forces classic regardless of settings', () => {
    mockSettings = { tui: 'fullscreen' }
    process.env.CLAUDE_CODE_NO_FLICKER = '0'

    const resolved = fullscreen.resolveFullscreenMode()
    expect(resolved.fullscreen).toBe(false)
    expect(resolved.reason).toBe('env-forced-off')

    delete process.env.CLAUDE_CODE_NO_FLICKER
  })

  test('missed start degrades this session and schedules a retry', () => {
    writeRendererState({ starting: true, failureCount: 0, lastVersion: '' })
    mockSettings = { tui: 'fullscreen' }

    const resolved = fullscreen.resolveFullscreenMode()
    expect(resolved.fullscreen).toBe(false)
    expect(resolved.degraded).toBe(true)
    expect(rendererHealth.getFullscreenDegradationNotice()).toBe(
      rendererHealth.RENDERER_DEGRADED_RETRY_MESSAGE,
    )
    // starting cleared + failureCount bumped → next launch retries fullscreen
    expect(readRendererState()).toEqual({
      starting: false,
      failureCount: 1,
      lastVersion: '',
    })
  })

  test('repeated failures keep the renderer off until reset', () => {
    writeRendererState({
      starting: false,
      failureCount: rendererHealth.RENDERER_FAILURE_THRESHOLD,
      lastVersion: rendererHealth.getCurrentVersion(),
    })
    mockSettings = { tui: 'fullscreen' }

    const resolved = fullscreen.resolveFullscreenMode()
    expect(resolved.fullscreen).toBe(false)
    expect(resolved.degraded).toBe(true)
    expect(rendererHealth.getFullscreenDegradationNotice()).toBe(
      rendererHealth.RENDERER_DEGRADED_OFF_MESSAGE,
    )
  })

  test('version update resets the failure count and retries fullscreen', () => {
    // Failures recorded on an older version that last rendered fine
    writeRendererState({
      starting: false,
      failureCount: 5,
      lastVersion: '0.0.1-someoldversion',
    })
    mockSettings = { tui: 'fullscreen' }

    const resolved = fullscreen.resolveFullscreenMode()
    expect(resolved.fullscreen).toBe(true)
    expect(resolved.degraded).toBe(false)
    expect(readRendererState().failureCount).toBe(0)
  })

  test('resolution is cached for the session', () => {
    mockSettings = { tui: 'fullscreen' }
    expect(fullscreen.resolveFullscreenMode().fullscreen).toBe(true)
    // Changing settings mid-session must not flip the renderer (switches
    // take effect on the next session start)
    mockSettings = { tui: 'classic' }
    expect(fullscreen.resolveFullscreenMode().fullscreen).toBe(true)
  })
})
