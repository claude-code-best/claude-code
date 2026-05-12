import { mock, describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log.js'
import { debugMock } from '../../../../tests/mocks/debug.js'

// Mock bun:bundle first (feature flags all off)
mock.module('bun:bundle', () => ({ feature: () => false }))

// Mock side-effect modules to avoid bootstrap/state.ts init chain
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// Mock bootstrap/state.js to avoid realpathSync/randomUUID side effects
mock.module('src/bootstrap/state.js', () => ({
  markPostCompaction: () => {},
  getSdkBetas: () => [] as string[],
  getSessionId: () => 'test-session-id',
}))

// Mock config to control isAutoCompactEnabled behavior
let _mockAutoCompactEnabled: boolean | undefined = true
mock.module('src/utils/config.ts', () => ({
  getGlobalConfig: () => ({
    autoCompactEnabled: _mockAutoCompactEnabled,
    showTurnDuration: false,
  }),
  isConfigEnabled: () => false,
}))

// Mock context to avoid model resolution chain
mock.module('src/utils/context.ts', () => ({
  getContextWindowForModel: () => 200_000,
  MODEL_CONTEXT_WINDOW_DEFAULT: 200_000,
}))

// Mock tokens to avoid dependency on log.ts chain
mock.module('src/utils/tokens.ts', () => ({
  tokenCountWithEstimation: () => 1000,
}))

// Mock analytics/growthbook
mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: () => false,
}))

// Mock API modules
mock.module('src/services/api/claude.js', () => ({
  getMaxOutputTokensForModel: () => 4096,
}))

mock.module('src/services/api/promptCacheBreakDetection.js', () => ({
  notifyCompaction: () => {},
}))

mock.module('src/services/SessionMemory/sessionMemoryUtils.js', () => ({
  setLastSummarizedMessageId: () => {},
}))

mock.module('../compact.js', () => ({
  compactConversation: async () => ({
    summary: 'test summary',
    messages: [],
  }),
  ERROR_MESSAGE_USER_ABORT: 'User aborted compaction',
}))

mock.module('../postCompactCleanup.js', () => ({
  runPostCompactCleanup: () => {},
}))

mock.module('../sessionMemoryCompact.js', () => ({
  trySessionMemoryCompaction: async () => null,
}))

// Dynamic import after all mocks are in place
const {
  AUTOCOMPACT_BUFFER_TOKENS,
  MANUAL_COMPACT_BUFFER_TOKENS,
  isAutoCompactEnabled,
  autoCompactIfNeeded,
} = await import('../autoCompact.js')

// --- Helpers ---

function makeToolUseContext(model = 'claude-sonnet-4-20250514') {
  return { options: { mainLoopModel: model } } as any
}

function makeCacheSafeParams(): any {
  return {
    systemPrompt: [''],
    userContext: {},
    systemContext: {},
    toolUseContext: {},
    forkContextMessages: [],
  }
}

// --- Constants ---

describe('AUTOCOMPACT_BUFFER_TOKENS', () => {
  test('is 25_000 (increased from 13K for system prompt + tool definition headroom)', () => {
    expect(AUTOCOMPACT_BUFFER_TOKENS).toBe(25_000)
  })
})

describe('MANUAL_COMPACT_BUFFER_TOKENS', () => {
  test('is 10_000 (increased from 3K for /compact headroom)', () => {
    expect(MANUAL_COMPACT_BUFFER_TOKENS).toBe(10_000)
  })
})

// --- isAutoCompactEnabled ---

describe('isAutoCompactEnabled', () => {
  const originalDisableCompact = process.env.DISABLE_COMPACT
  const originalDisableAutoCompact = process.env.DISABLE_AUTO_COMPACT

  afterEach(() => {
    process.env.DISABLE_COMPACT = originalDisableCompact
    process.env.DISABLE_AUTO_COMPACT = originalDisableAutoCompact
    _mockAutoCompactEnabled = true
  })

  test('returns true by default when autoCompactEnabled is undefined', () => {
    _mockAutoCompactEnabled = undefined
    delete process.env.DISABLE_COMPACT
    delete process.env.DISABLE_AUTO_COMPACT
    expect(isAutoCompactEnabled()).toBe(true)
  })

  test('returns true when autoCompactEnabled is explicitly true', () => {
    _mockAutoCompactEnabled = true
    delete process.env.DISABLE_COMPACT
    delete process.env.DISABLE_AUTO_COMPACT
    expect(isAutoCompactEnabled()).toBe(true)
  })

  test('returns false when autoCompactEnabled is false', () => {
    _mockAutoCompactEnabled = false
    delete process.env.DISABLE_COMPACT
    delete process.env.DISABLE_AUTO_COMPACT
    expect(isAutoCompactEnabled()).toBe(false)
  })

  test('returns false when DISABLE_COMPACT is set', () => {
    _mockAutoCompactEnabled = true
    process.env.DISABLE_COMPACT = '1'
    delete process.env.DISABLE_AUTO_COMPACT
    expect(isAutoCompactEnabled()).toBe(false)
  })

  test('returns false when DISABLE_AUTO_COMPACT is set', () => {
    _mockAutoCompactEnabled = true
    delete process.env.DISABLE_COMPACT
    process.env.DISABLE_AUTO_COMPACT = '1'
    expect(isAutoCompactEnabled()).toBe(false)
  })

  test('DISABLE_COMPACT takes precedence over autoCompactEnabled setting', () => {
    _mockAutoCompactEnabled = true
    process.env.DISABLE_COMPACT = '1'
    expect(isAutoCompactEnabled()).toBe(false)
  })
})

// --- autoCompactIfNeeded ---

describe('autoCompactIfNeeded', () => {
  const originalDisableCompact = process.env.DISABLE_COMPACT

  beforeEach(() => {
    delete process.env.DISABLE_COMPACT
    _mockAutoCompactEnabled = true
  })

  afterEach(() => {
    process.env.DISABLE_COMPACT = originalDisableCompact
    _mockAutoCompactEnabled = true
  })

  test('returns wasCompacted=false when DISABLE_COMPACT is set', async () => {
    process.env.DISABLE_COMPACT = '1'
    const result = await autoCompactIfNeeded(
      [],
      makeToolUseContext(),
      makeCacheSafeParams(),
    )
    expect(result.wasCompacted).toBe(false)
  })

  test('trips consecutiveCompactions circuit breaker at limit (2)', async () => {
    const result = await autoCompactIfNeeded(
      [],
      makeToolUseContext(),
      makeCacheSafeParams(),
      undefined,
      { compacted: true, turnCounter: 5, turnId: 't1', consecutiveCompactions: 2 },
    )
    expect(result.wasCompacted).toBe(false)
  })

  test('allows compaction when consecutiveCompactions is below limit', async () => {
    const result = await autoCompactIfNeeded(
      [],
      makeToolUseContext(),
      makeCacheSafeParams(),
      undefined,
      { compacted: false, turnCounter: 0, turnId: 't1', consecutiveCompactions: 1 },
    )
    // Passes the circuit breaker check but shouldAutoCompact returns false (low token count)
    expect(result.wasCompacted).toBe(false)
    expect(result.consecutiveCompactions).toBeUndefined()
  })

  test('trips consecutiveFailures circuit breaker at limit (3)', async () => {
    const result = await autoCompactIfNeeded(
      [],
      makeToolUseContext(),
      makeCacheSafeParams(),
      undefined,
      { compacted: false, turnCounter: 0, turnId: 't1', consecutiveFailures: 3 },
    )
    expect(result.wasCompacted).toBe(false)
  })

  test('allows attempt when consecutiveFailures is below limit', async () => {
    const result = await autoCompactIfNeeded(
      [],
      makeToolUseContext(),
      makeCacheSafeParams(),
      undefined,
      { compacted: false, turnCounter: 0, turnId: 't1', consecutiveFailures: 2 },
    )
    // Passes the failure circuit breaker but shouldAutoCompact returns false (low tokens)
    expect(result.wasCompacted).toBe(false)
  })

  test('returns wasCompacted=false when tracking is undefined', async () => {
    const result = await autoCompactIfNeeded(
      [],
      makeToolUseContext(),
      makeCacheSafeParams(),
    )
    // No tracking → no circuit breakers tripped, but shouldAutoCompact returns false
    expect(result.wasCompacted).toBe(false)
  })
})
