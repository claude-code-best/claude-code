import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AppState } from '../../../state/AppStateStore.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../../types/command.js'
import type { ToolUseContext } from '../../../Tool.js'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'
// Real envUtils — a leaf module (lodash/os/path only), safe to import
// statically even while other files' envUtils mocks are active.
import * as realEnvUtils from '../../../utils/envUtils.js'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
  stripProtoFields: (v: unknown) => v,
}))

// Mock log.ts / debug.ts to cut the bootstrap/state dependency chain
// (fullscreen.ts — imported by the focus command — pulls in debug.ts → log.ts).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// Repair cross-file envUtils mock pollution BEFORE any import that links
// against envUtils. Other test files in the same bun test batch
// (break-cache, debug-tool-call) mock envUtils with a PARTIAL export set —
// any module loaded afterwards that imports a missing named export (e.g.
// tokenEstimation.ts imports getVertexRegionForModel) dies with
// "Export named 'X' not found" at link time, and their
// `isEnvDefinedFalsy: () => false` breaks '0'-means-off env semantics.
// Re-registering the real module restores both. This is intentionally the
// "mock identical to real" pattern — here it is load-bearing for isolation,
// not a pointless indirection.
mock.module('src/utils/envUtils.js', () => realEnvUtils)

// ── Settings mock (same pattern as tui.test.ts) ─────────────────────────────
// The focus command reads viewMode/briefTranscript from appState.settings
// (fed by getInitialSettings) and persists the runtime toggle via
// updateSettingsForSource. Mocking keeps these tests hermetic.

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
    return { error: null }
  },
}))

afterAll(() => {
  mock.restore()
  mock.module('src/utils/settings/settings.js', () => settingsModule)
  mock.module('src/utils/envUtils.js', () => realEnvUtils)
})

// Real settings module for the afterAll restore. Dynamic (not static)
// import: it must link AFTER the envUtils repair mock above — its dependency
// chain reaches modules that import named exports from envUtils.
const settingsModule = await import('../../../utils/settings/settings.js')

// Import AFTER mocks are registered. No query suffix — focus.js,
// focusNonInteractive.js and fullscreen.js must resolve to the SAME module
// instances as this test file (fullscreen caches its resolution per session;
// we reset it per test via _resetForTesting()).
const { default: focusCommand, focusNonInteractive } = await import(
  '../index.js'
)
const { call: callFocus } = await import('../focus.js')
const { callFocusNonInteractive } = await import('../focusNonInteractive.js')
const fullscreen = await import('../../../utils/fullscreen.js')
const { getFocusViewActive, setFocusViewActive, _resetFocusViewForTesting } =
  await import('../../../utils/focusView.js')

// ── Test harness ────────────────────────────────────────────────────────────

let tmpDir: string
const origEnv: Record<string, string | undefined> = {}
const ENV_VARS_UNDER_TEST = ['CLAUDE_CODE_NO_FLICKER', 'TMUX']

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'focus-test-'))
  mkdirSync(join(tmpDir, '.claude'), { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = join(tmpDir, '.claude')
  for (const key of ENV_VARS_UNDER_TEST) {
    origEnv[key] = process.env[key]
  }
  // Not set by the test runner normally, but delete defensively: the env-var
  // branch of the fullscreen resolver must not fire (see setFullscreen).
  delete process.env.CLAUDE_CODE_NO_FLICKER
  delete process.env.TMUX
  mockSettings = {}
  lastUpdate = null
  _resetFocusViewForTesting()
  fullscreen._resetForTesting()
  fullscreen._resetTmuxControlModeProbeForTesting()
})

afterEach(() => {
  delete process.env.CLAUDE_CONFIG_DIR
  for (const [key, value] of Object.entries(origEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(tmpDir, { recursive: true, force: true })
})

function setFullscreen(enabled: boolean): void {
  // Control the renderer through the settings.json `tui` field (read via our
  // own settings mock — the last mock.module registration wins, so this is
  // immune to cross-file mock pollution) instead of the
  // CLAUDE_CODE_NO_FLICKER env var: other test files in the same bun test
  // batch (break-cache, debug-tool-call) mock envUtils with
  // `isEnvDefinedFalsy: () => false`, which breaks the '0'-means-off env
  // semantics. With the env var unset, those mocks behave identically to the
  // real envUtils for undefined input, so the settings path stays
  // deterministic in both isolated and full-suite runs.
  mockSettings = { ...mockSettings, tui: enabled ? 'fullscreen' : 'classic' }
  fullscreen._resetForTesting()
  fullscreen._resetTmuxControlModeProbeForTesting()
}

type OnDoneCall = { result?: string; options?: { display?: string } }

function makeOnDone(): { calls: OnDoneCall[]; onDone: LocalJSXCommandOnDone } {
  const calls: OnDoneCall[] = []
  const onDone: LocalJSXCommandOnDone = (result, options) => {
    calls.push({ result, options })
  }
  return { calls, onDone }
}

function makeContext(initial: {
  briefTranscript: boolean
  settings?: Record<string, unknown>
}): {
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
} & ToolUseContext &
  LocalJSXCommandContext {
  // Test-only minimal context — the focus command only touches
  // getAppState/setAppState (cast per the test-file mock-data allowance).
  const state = {
    briefTranscript: initial.briefTranscript,
    settings: { ...initial.settings },
  } as unknown as AppState & { settings: Record<string, unknown> }
  return {
    getAppState: () => state,
    setAppState: (f: (prev: AppState) => AppState) => {
      const next = f(state)
      // Mutate in place so getAppState and .settings reads stay in sync
      Object.assign(state, next)
    },
  } as unknown as ReturnType<typeof makeContext>
}

// ── Command metadata (official L918597 / L929934) ───────────────────────────

describe('/focus command metadata', () => {
  test('interactive form matches official L918597', () => {
    expect(focusCommand.type).toBe('local-jsx')
    expect(focusCommand.name).toBe('focus')
    expect(focusCommand.description).toBe(
      'Toggle focus view: just your prompt, summary, and response',
    )
    expect(focusCommand.immediate).toBe(true)
    expect(focusCommand.requires).toEqual({ ink: true })
    expect(focusCommand.terminalOriented).toBe(true)
  })

  test('non-interactive form matches official L929934', () => {
    expect(focusNonInteractive.type).toBe('local')
    expect(focusNonInteractive.name).toBe('focus')
    expect(focusNonInteractive.terminalOriented).toBe(true)
    // supportsNonInteractive lives on the LocalCommand variant — narrow first
    if (focusNonInteractive.type === 'local') {
      expect(focusNonInteractive.supportsNonInteractive).toBe(true)
    } else {
      throw new Error('expected /focus non-interactive to be type local')
    }
    expect(focusNonInteractive.argumentHint).toBe('[on|off]')
  })
})

// ── Interactive call (official L918597 logic) ───────────────────────────────

describe('interactive /focus call', () => {
  describe('classic renderer (not fullscreen)', () => {
    test('viewMode "focus" in settings: explains removal, does not toggle', async () => {
      setFullscreen(false)
      const ctx = makeContext({
        briefTranscript: true,
        settings: { viewMode: 'focus' },
      })
      const { calls, onDone } = makeOnDone()
      await callFocus(onDone, ctx)
      expect(calls[0]!.result).toContain(
        'Focus view is set by "viewMode": "focus" in settings.json',
      )
      expect(calls[0]!.result).toContain(
        'remove it there and restart Claude Code to turn it off',
      )
      expect(calls[0]!.options!.display).toBe('system')
      // No toggle, no persist
      expect(ctx.getAppState().briefTranscript).toBe(true)
      expect(lastUpdate).toBeNull()
    })

    test('active via runtime toggle: turns both off and persists', async () => {
      setFullscreen(false)
      const ctx = makeContext({
        briefTranscript: true,
        settings: { briefTranscript: true },
      })
      const { calls, onDone } = makeOnDone()
      await callFocus(onDone, ctx)
      expect(calls[0]!.result).toContain('Focus view disabled.')
      expect(calls[0]!.result).toContain(
        'Focus view needs the fullscreen renderer.',
      )
      expect(calls[0]!.options!.display).toBe('system')
      expect(ctx.getAppState().briefTranscript).toBe(false)
      expect(lastUpdate).toEqual({
        source: 'userSettings',
        patch: { briefTranscript: false },
      })
      expect(getFocusViewActive()).toBe(false)
    })

    test('appState on but settings unset: turns off without persisting', async () => {
      setFullscreen(false)
      const ctx = makeContext({ briefTranscript: true })
      const { calls, onDone } = makeOnDone()
      await callFocus(onDone, ctx)
      expect(calls[0]!.result).toContain('Focus view disabled.')
      expect(ctx.getAppState().briefTranscript).toBe(false)
      // settings.briefTranscript was not set → no pointless settings write
      expect(lastUpdate).toBeNull()
    })

    test('inactive: only explains the fullscreen requirement', async () => {
      setFullscreen(false)
      const ctx = makeContext({ briefTranscript: false })
      const { calls, onDone } = makeOnDone()
      await callFocus(onDone, ctx)
      expect(calls[0]!.result).toBe(
        'Focus view needs the fullscreen renderer. Run /tui fullscreen to switch (this restarts and resumes your session), or set CLAUDE_CODE_NO_FLICKER=1 and restart.',
      )
      expect(ctx.getAppState().briefTranscript).toBe(false)
      expect(lastUpdate).toBeNull()
    })
  })

  describe('fullscreen renderer', () => {
    test('toggles on and persists the runtime toggle', async () => {
      setFullscreen(true)
      const ctx = makeContext({ briefTranscript: false })
      const { calls, onDone } = makeOnDone()
      await callFocus(onDone, ctx)
      expect(calls[0]!.result).toBe('Focus view enabled')
      expect(calls[0]!.options!.display).toBe('system')
      expect(ctx.getAppState().briefTranscript).toBe(true)
      expect(lastUpdate).toEqual({
        source: 'userSettings',
        patch: { briefTranscript: true },
      })
      expect(getFocusViewActive()).toBe(true)
    })

    test('toggles off', async () => {
      setFullscreen(true)
      const ctx = makeContext({ briefTranscript: true })
      const { calls, onDone } = makeOnDone()
      await callFocus(onDone, ctx)
      expect(calls[0]!.result).toBe('Focus view disabled')
      expect(ctx.getAppState().briefTranscript).toBe(false)
      expect(lastUpdate).toEqual({
        source: 'userSettings',
        patch: { briefTranscript: false },
      })
      expect(getFocusViewActive()).toBe(false)
    })

    test('skips persist when settings already match', async () => {
      setFullscreen(true)
      // appState is off but the persisted toggle already says on → the
      // toggle flips on, and settings.briefTranscript === next → no write
      const ctx = makeContext({
        briefTranscript: false,
        settings: { briefTranscript: true },
      })
      const { calls, onDone } = makeOnDone()
      await callFocus(onDone, ctx)
      expect(calls[0]!.result).toBe('Focus view enabled')
      expect(ctx.getAppState().briefTranscript).toBe(true)
      expect(lastUpdate).toBeNull()
    })
  })
})

// ── Non-interactive call (official L929934 logic) ───────────────────────────

describe('non-interactive /focus call', () => {
  test('"on" enables focus view', async () => {
    const ctx = makeContext({ briefTranscript: false })
    const result = await callFocusNonInteractive('on', ctx)
    expect(result).toEqual({ type: 'text', value: 'Focus view enabled' })
    expect(ctx.getAppState().briefTranscript).toBe(true)
    expect(getFocusViewActive()).toBe(true)
  })

  test('"off" disables focus view', async () => {
    const ctx = makeContext({ briefTranscript: true })
    const result = await callFocusNonInteractive('off', ctx)
    expect(result).toEqual({ type: 'text', value: 'Focus view disabled' })
    expect(ctx.getAppState().briefTranscript).toBe(false)
    expect(getFocusViewActive()).toBe(false)
  })

  test('empty argument toggles', async () => {
    const ctx = makeContext({ briefTranscript: false })
    const result = await callFocusNonInteractive('', ctx)
    expect(result).toEqual({ type: 'text', value: 'Focus view enabled' })
    expect(ctx.getAppState().briefTranscript).toBe(true)
  })

  test('unknown argument returns usage error', async () => {
    const ctx = makeContext({ briefTranscript: false })
    const result = await callFocusNonInteractive('bogus', ctx)
    expect(result).toEqual({
      type: 'text',
      value: 'Unknown argument "bogus". Use: /focus [on|off]',
    })
    // State untouched on argument errors
    expect(ctx.getAppState().briefTranscript).toBe(false)
  })
})
