import { afterAll, describe, expect, mock, test } from 'bun:test'
import { feature } from 'bun:bundle'
import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'
import { settingsMock, setMockSettings } from '../../../tests/mocks/settings'

// NOTE on bun:bundle: `feature()` is a Bun compile-time macro (it may only
// appear in if/ternary condition position and is resolved from Bun's
// --feature flags / build defines), so mock.module('bun:bundle') CANNOT
// intercept it — the mock below only satisfies the module shape, matching
// the convention in tasks.test.ts / focusView.test.ts. The feature-gate
// tests therefore read the actual macro state via
// `feature('WORKFLOW_SCRIPTS') ? true : false` and assert the composition
// self-consistently (run with `bun test --feature WORKFLOW_SCRIPTS` to
// exercise the feature-on branch).
mock.module('bun:bundle', () => ({
  feature: (_name: string) => false,
}))

// Mock log.ts / debug.ts to cut the bootstrap/state dependency chain.
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// ── Settings mock for workflowKeyword.ts ────────────────────────────────────
// The shared COMPLETE mock (see tests/mocks/settings.ts): bun registers
// mock.module process-globally across every test file in one invocation, so
// an incomplete inline mock here could break other files' import chains.
// The settings gate is controlled through setMockSettings — the shared
// mock's getWorkflowKeywordTriggerEnabled mirrors the real default-true
// semantics. The REAL getter is tested hermetically below via a query-string
// import that bypasses the mock registry (and in
// settings/__tests__/workflowKeywordSetting.test.ts via its injectable
// source reader).
mock.module('src/utils/settings/settings.js', settingsMock)

// NOTE: no model/* mocks here. workflowKeyword.ts's only heavy dependency is
// settings.js (mocked above); mocking src/utils/model/model.js &
// friends process-globally from this file would leak into the real-model
// test suites (model.test.ts, providerGates.test.ts, …) that run in the
// same `bun test` invocation and break them.
afterAll(() => {
  mock.restore()
  // Reset the shared mock state for any test file that runs after this one
  // in the same invocation.
  setMockSettings({})
})

const {
  WORKFLOW_KEYWORD,
  hasUltracodeKeyword,
  isWorkflowKeywordTriggerActive,
} = await import('../workflowKeyword.js')

// The REAL settings module. bun applies mock.module process-globally across
// every test file in one invocation (all files are imported — and their
// hoisted mock.module calls registered — before any test runs), so the plain
// '../settings/settings.js' specifier would resolve to the mock above no
// matter the file order. A query-string specifier bypasses the mock registry
// and loads the untouched module, letting the real
// getWorkflowKeywordTriggerEnabled — with its injectable source reader — be
// tested hermetically in the same file.
const realSettingsSpecifier = '../settings/settings.js?real'
const realSettings = (await import(
  realSettingsSpecifier
)) as typeof import('../settings/settings.js')

// ── hasUltracodeKeyword (official yLi detector, L919001) ─────────────────────

describe('hasUltracodeKeyword', () => {
  test('detects the bare keyword', () => {
    expect(hasUltracodeKeyword('ultracode')).toBe(true)
  })

  test('detects the keyword inside a prompt', () => {
    expect(hasUltracodeKeyword('fix the bug ultracode please')).toBe(true)
  })

  test('case-insensitive', () => {
    expect(hasUltracodeKeyword('UltraCode')).toBe(true)
    expect(hasUltracodeKeyword('ULTRACODE')).toBe(true)
    expect(hasUltracodeKeyword('ultraCode this task')).toBe(true)
  })

  test('word-bounded: substrings do not match', () => {
    expect(hasUltracodeKeyword('ultracoded')).toBe(false)
    expect(hasUltracodeKeyword('prefixultracode')).toBe(false)
    expect(hasUltracodeKeyword('ultracode-something')).toBe(true) // hyphen is a boundary
  })

  test('empty / absent keyword', () => {
    expect(hasUltracodeKeyword('')).toBe(false)
    expect(hasUltracodeKeyword('use a workflow please')).toBe(false)
  })

  test('WORKFLOW_KEYWORD constant is the keyword', () => {
    expect(WORKFLOW_KEYWORD).toBe('ultracode')
    expect(hasUltracodeKeyword(`use ${WORKFLOW_KEYWORD} now`)).toBe(true)
  })

  test('structural twin of hasUltrathinkKeyword (official hLi/yLi isomorphism)', () => {
    // Official hLi (ultrathink) and yLi (ultracode) are the same detector
    // shape. hasUltrathinkKeyword (src/utils/thinking.ts) is
    // /\bultrathink\b/i — the corpus below pins hasUltracodeKeyword to the
    // identical word-boundary semantics for its own keyword. (Importing the
    // real thinking.js here is not viable in the full `bun test` run: other
    // test files register partial src/utils/model/* mocks process-globally
    // that would break its import chain — see the NOTE above.)
    const corpus = [
      'ultracode',
      'ultrathink',
      'use ultracode here',
      'use ultrathink here',
      'ultracoded',
      'prefixultrathink',
      'UltraCode mixed case',
      'nothing to see',
      '',
    ]
    for (const text of corpus) {
      expect(hasUltracodeKeyword(text)).toBe(/\bultracode\b/i.test(text))
    }
    // Cross-check: swapping ultracode↔ultrathink in every corpus entry, the
    // two regexes agree entry-for-entry — the detectors are interchangeable
    // modulo the keyword.
    const swapKeyword = (text: string) =>
      text.replace(/ultracode|ultrathink/gi, match =>
        match.toLowerCase() === 'ultracode' ? 'ultrathink' : 'ultracode',
      )
    for (const text of corpus) {
      expect(/\bultracode\b/i.test(text)).toBe(
        /\bultrathink\b/i.test(swapKeyword(text)),
      )
    }
  })
})

// ── getWorkflowKeywordTriggerEnabled (REAL settings.ts getter) ──────────────

describe('getWorkflowKeywordTriggerEnabled (real settings.ts getter)', () => {
  const reader =
    (sources: Record<string, Record<string, unknown> | null>) =>
    (source: string) =>
      sources[source] ?? null

  test('defaults to true when no source sets it', () => {
    expect(realSettings.getWorkflowKeywordTriggerEnabled(reader({}))).toBe(true)
    expect(
      realSettings.getWorkflowKeywordTriggerEnabled(
        reader({ userSettings: { workflowKeywordTriggerEnabled: true } }),
      ),
    ).toBe(true)
  })

  test('userSettings false disables (the meta+w toggle writes here)', () => {
    expect(
      realSettings.getWorkflowKeywordTriggerEnabled(
        reader({ userSettings: { workflowKeywordTriggerEnabled: false } }),
      ),
    ).toBe(false)
  })

  test('policySettings false wins over userSettings true (merge priority)', () => {
    expect(
      realSettings.getWorkflowKeywordTriggerEnabled(
        reader({
          policySettings: { workflowKeywordTriggerEnabled: false },
          userSettings: { workflowKeywordTriggerEnabled: true },
        }),
      ),
    ).toBe(false)
  })

  test('any trusted source setting false disables', () => {
    for (const source of [
      'policySettings',
      'flagSettings',
      'userSettings',
      'localSettings',
    ]) {
      expect(
        realSettings.getWorkflowKeywordTriggerEnabled(
          reader({ [source]: { workflowKeywordTriggerEnabled: false } }),
        ),
      ).toBe(false)
    }
  })
})

// ── isWorkflowKeywordTriggerActive (feature gate + settings gate) ────────────

describe('isWorkflowKeywordTriggerActive', () => {
  test('inactive whenever the WORKFLOW_SCRIPTS build gate is off', () => {
    // feature() is resolved at compile/run time from Bun's --feature flags
    // (mock.module cannot intercept it — see the note at the top). Without
    // flags it is off, so the trigger is inert regardless of settings.
    const featureOn = feature('WORKFLOW_SCRIPTS') ? true : false
    setMockSettings({ workflowKeywordTriggerEnabled: true })
    expect(isWorkflowKeywordTriggerActive()).toBe(featureOn)
  })

  test('feature on: active iff the settings gate is enabled', () => {
    const featureOn = feature('WORKFLOW_SCRIPTS') ? true : false
    setMockSettings({ workflowKeywordTriggerEnabled: true })
    expect(isWorkflowKeywordTriggerActive()).toBe(featureOn)
    setMockSettings({ workflowKeywordTriggerEnabled: false })
    expect(isWorkflowKeywordTriggerActive()).toBe(false)
  })

  test('feature off: settings cannot turn the trigger on', () => {
    const featureOn = feature('WORKFLOW_SCRIPTS') ? true : false
    if (!featureOn) {
      setMockSettings({ workflowKeywordTriggerEnabled: true })
      expect(isWorkflowKeywordTriggerActive()).toBe(false)
    }
  })
})
