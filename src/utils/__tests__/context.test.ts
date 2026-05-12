import { mock, describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { logMock } from '../../../tests/mocks/log.js'
import { debugMock } from '../../../tests/mocks/debug.js'

// Mock bun:bundle (feature flags all off)
mock.module('bun:bundle', () => ({ feature: () => false }))

// Mock side-effect modules
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// Mock bootstrap/state.js to avoid realpathSync/randomUUID side effects
mock.module('src/bootstrap/state.js', () => ({
  markPostCompaction: () => {},
  getSdkBetas: () => [] as string[],
  getSessionId: () => 'test-session-id',
}))

// Mock config to avoid file system reads
mock.module('src/utils/config.ts', () => ({
  getGlobalConfig: () => ({
    showTurnDuration: false,
    clientDataCache: {},
  }),
}))

// Mock model modules to control resolution chain
mock.module('src/utils/model/model.js', () => ({
  getCanonicalName: (m: string) => m,
}))

mock.module('src/utils/model/antModels.js', () => ({
  resolveAntModel: () => null,
}))

// Control what getCachedCoStrictModels returns via mutable state
let _mockCoStrictModels: Array<{ id: string; contextWindow?: number }> = []
mock.module('src/costrict/provider/models.js', () => ({
  getCachedCoStrictModels: () => _mockCoStrictModels,
}))

// Control what resolveCoStrictModel returns
let _mockResolveCoStrictModelResult = ''
mock.module('src/costrict/provider/modelMapping.js', () => ({
  resolveCoStrictModel: (model: string) =>
    _mockResolveCoStrictModelResult || model,
}))

mock.module('src/utils/model/modelCapabilities.js', () => ({
  getModelCapability: () => null,
}))

// Dynamic import after all mocks
const { getContextWindowForModel, MODEL_CONTEXT_WINDOW_DEFAULT } =
  await import('../context.js')

// --- getContextWindowForModel (CoStrict model support) ---

describe('getContextWindowForModel', () => {
  const originalUserType = process.env.USER_TYPE

  beforeEach(() => {
    // Ensure USER_TYPE is not 'ant' so ant-only paths are skipped
    delete process.env.USER_TYPE
    delete process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS
    delete process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT
    _mockCoStrictModels = []
    _mockResolveCoStrictModelResult = ''
  })

  afterEach(() => {
    process.env.USER_TYPE = originalUserType
    _mockCoStrictModels = []
    _mockResolveCoStrictModelResult = ''
  })

  test('returns default context window when no CoStrict models cached', () => {
    _mockCoStrictModels = []
    const result = getContextWindowForModel('some-unknown-model')
    expect(result).toBe(MODEL_CONTEXT_WINDOW_DEFAULT)
  })

  test('returns CoStrict model contextWindow when model is found by exact id', () => {
    _mockCoStrictModels = [
      { id: 'costrict-model-x', contextWindow: 128_000 },
      { id: 'costrict-model-y', contextWindow: 256_000 },
    ]
    const result = getContextWindowForModel('costrict-model-x')
    expect(result).toBe(128_000)
  })

  test('returns CoStrict model contextWindow when resolved via resolveCoStrictModel', () => {
    _mockCoStrictModels = [
      { id: 'costrict-mapped-model', contextWindow: 512_000 },
    ]
    _mockResolveCoStrictModelResult = 'costrict-mapped-model'
    const result = getContextWindowForModel('claude-sonnet-4')
    expect(result).toBe(512_000)
  })

  test('prefers exact id match over resolved name when both exist', () => {
    _mockCoStrictModels = [
      { id: 'claude-sonnet-4', contextWindow: 300_000 },
      { id: 'costrict-mapped', contextWindow: 400_000 },
    ]
    _mockResolveCoStrictModelResult = 'costrict-mapped'
    // exact id 'claude-sonnet-4' matches first element
    const result = getContextWindowForModel('claude-sonnet-4')
    expect(result).toBe(300_000)
  })

  test('skips CoStrict model with zero contextWindow', () => {
    _mockCoStrictModels = [
      { id: 'bad-model', contextWindow: 0 },
    ]
    const result = getContextWindowForModel('bad-model')
    expect(result).toBe(MODEL_CONTEXT_WINDOW_DEFAULT)
  })

  test('skips CoStrict model with undefined contextWindow', () => {
    _mockCoStrictModels = [
      { id: 'no-window-model' },
    ]
    const result = getContextWindowForModel('no-window-model')
    expect(result).toBe(MODEL_CONTEXT_WINDOW_DEFAULT)
  })

  test('skips CoStrict model with negative contextWindow', () => {
    _mockCoStrictModels = [
      { id: 'negative-model', contextWindow: -1 },
    ]
    const result = getContextWindowForModel('negative-model')
    expect(result).toBe(MODEL_CONTEXT_WINDOW_DEFAULT)
  })

  test('returns default when CoStrict models exist but none match', () => {
    _mockCoStrictModels = [
      { id: 'other-model-a', contextWindow: 100_000 },
      { id: 'other-model-b', contextWindow: 200_000 },
    ]
    _mockResolveCoStrictModelResult = 'yet-another-model'
    const result = getContextWindowForModel('nothing-matches')
    expect(result).toBe(MODEL_CONTEXT_WINDOW_DEFAULT)
  })
})
