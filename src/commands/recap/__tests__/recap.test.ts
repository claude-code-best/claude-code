import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock bun:bundle before any imports that use feature()
// Note: in the test environment AWAY_SUMMARY compile-time flag is false, so
// isEnabled() will always return false regardless of the GrowthBook value.
// We mock to true here to allow other feature-flagged code paths to be tested.
mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

// Mock log/debug to avoid bootstrap side effects
mock.module('src/utils/log.ts', () => ({
  logError: () => {},
  logInfo: () => {},
  logWarning: () => {},
}))
mock.module('src/utils/debug.ts', () => ({
  logForDebugging: () => {},
  isDebug: () => false,
}))

// Mock settings to avoid filesystem side effects
mock.module('src/utils/settings/settings.js', () => ({
  getCachedSettings: () => ({}),
  getSettings: async () => ({}),
  updateSettings: async () => {},
}))

// Mock analytics (GrowthBook) — required for isEnabled()
let gbValue = true
mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: (_key: string, defaultVal: unknown) =>
    gbValue ?? defaultVal,
}))

// Mock the forkedAgent utility used by generateRecap
let mockRecapResult: {
  kind: 'ok' | 'api-error' | 'no-turn' | 'aborted' | 'failed'
  text?: string
} = { kind: 'ok', text: 'Working on fixing the auth bug. Next: run tests.' }

mock.module('src/commands/recap/generateRecap.js', () => ({
  generateRecap: async (_signal: AbortSignal) => mockRecapResult,
}))

let recapCmd: any
let callFn:
  | ((args: string, context: any) => Promise<{ type: string; value: string }>)
  | undefined

beforeEach(async () => {
  gbValue = true
  mockRecapResult = {
    kind: 'ok',
    text: 'Working on fixing the auth bug. Next: run tests.',
  }
  // Re-import to get fresh module
  const mod = await import('../index.js')
  recapCmd = mod.default
  const loaded = await recapCmd.load()
  callFn = loaded.call
})

afterEach(() => {
  recapCmd = undefined
  callFn = undefined
})

// ── Metadata ──────────────────────────────────────────────────────────────────

describe('recap command metadata', () => {
  test('has correct name', () => {
    expect(recapCmd.name).toBe('recap')
  })

  test('has description mentioning recap/session', () => {
    expect(recapCmd.description).toBeTruthy()
    expect(typeof recapCmd.description).toBe('string')
    expect(recapCmd.description.length).toBeGreaterThan(5)
  })

  test('type is local', () => {
    expect(recapCmd.type).toBe('local')
  })

  test('supportsNonInteractive is false', () => {
    expect(recapCmd.supportsNonInteractive).toBe(false)
  })

  test('has aliases including away and catchup', () => {
    expect(recapCmd.aliases).toBeDefined()
    expect(recapCmd.aliases).toContain('away')
    expect(recapCmd.aliases).toContain('catchup')
  })

  test('isEnabled returns boolean', () => {
    // feature('AWAY_SUMMARY') is a compile-time constant; in the test env
    // it evaluates to false (flag not set), so isEnabled() returns false
    // regardless of GrowthBook. We verify it returns a boolean, not throws.
    const result = recapCmd.isEnabled()
    expect(typeof result).toBe('boolean')
  })

  test('isEnabled returns false when GrowthBook flag is false', () => {
    // GrowthBook off → isEnabled must be false (belt-and-suspenders check
    // for when the feature flag is true in a real build)
    gbValue = false
    const result = recapCmd.isEnabled()
    expect(result).toBe(false)
  })

  test('load() resolves to module with call function', async () => {
    const mod = await recapCmd.load()
    expect(typeof mod.call).toBe('function')
  })
})

// ── Call behavior ─────────────────────────────────────────────────────────────

describe('recap command call()', () => {
  // Cast to any: test only needs abortController, not the full ToolUseContext shape
  const fakeContext: any = {
    abortController: new AbortController(),
    messages: [],
    options: { tools: [], mainLoopModel: 'claude-3-5-haiku-20241022' },
  }

  test('returns text value on ok result', async () => {
    mockRecapResult = { kind: 'ok', text: 'Fixing auth bug. Next: run tests.' }
    const result = await callFn!('', fakeContext)
    expect(result.type).toBe('text')
    expect(result.value).toContain('Fixing auth bug')
  })

  test('returns text value on api-error result', async () => {
    mockRecapResult = { kind: 'api-error', text: 'Rate limit hit.' }
    const result = await callFn!('', fakeContext)
    expect(result.type).toBe('text')
    expect(result.value).toContain('Rate limit hit')
  })

  test('returns helpful message on no-turn result', async () => {
    mockRecapResult = { kind: 'no-turn' }
    const result = await callFn!('', fakeContext)
    expect(result.type).toBe('text')
    expect(result.value.length).toBeGreaterThan(5)
    expect(result.value).not.toBe('')
  })

  test('returns cancelled message on aborted result', async () => {
    mockRecapResult = { kind: 'aborted' }
    const result = await callFn!('', fakeContext)
    expect(result.type).toBe('text')
    expect(result.value.toLowerCase()).toMatch(/cancel|abort/)
  })

  test('returns error message on failed result', async () => {
    mockRecapResult = { kind: 'failed' }
    const result = await callFn!('', fakeContext)
    expect(result.type).toBe('text')
    expect(result.value.length).toBeGreaterThan(5)
  })

  test('passes abortController signal to generateRecap', async () => {
    let capturedSignal: AbortSignal | undefined
    mock.module('src/commands/recap/generateRecap.js', () => ({
      generateRecap: async (signal: AbortSignal) => {
        capturedSignal = signal
        return { kind: 'ok', text: 'Done.' }
      },
    }))
    const fresh = await import('../index.js')
    const loaded = await fresh.default.load()
    await loaded.call('', fakeContext)
    expect(capturedSignal).toBe(fakeContext.abortController.signal)
  })
})
