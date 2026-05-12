import {
  afterAll,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
} from 'bun:test'
import * as path from 'node:path'
import * as os from 'node:os'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as fsp from 'node:fs/promises'

// ---------------------------------------------------------------------------
// Mock envUtils so getClaudeConfigHomeDir returns a temp dir while THIS
// suite runs. After it finishes, getClaudeConfigHomeDir falls back to the
// real semantics (process.env.CLAUDE_CONFIG_DIR ?? ~/.claude) so other
// tests in the same process (envUtils.test.ts in particular) don't see
// the test's tmpDir leaked as the user config home.
// ---------------------------------------------------------------------------
let tmpDir = ''
let useMockForCacheStats = true
afterAll(() => {
  useMockForCacheStats = false
})

// Provide REAL semantics for every other envUtils export — this mock is
// process-global, so envUtils.test.ts and other consumers (providers,
// model, etc.) running in the same process see real behavior for
// hasNodeOption, isEnvTruthy, isBareMode, parseEnvVars, etc. Only
// getClaudeConfigHomeDir is overridden (to point at the test temp dir).
const VERTEX_REGION_OVERRIDES: ReadonlyArray<[string, string]> = [
  ['claude-haiku-4-5', 'VERTEX_REGION_CLAUDE_HAIKU_4_5'],
  ['claude-3-5-haiku', 'VERTEX_REGION_CLAUDE_3_5_HAIKU'],
  ['claude-3-5-sonnet', 'VERTEX_REGION_CLAUDE_3_5_SONNET'],
  ['claude-3-7-sonnet', 'VERTEX_REGION_CLAUDE_3_7_SONNET'],
  ['claude-opus-4-1', 'VERTEX_REGION_CLAUDE_4_1_OPUS'],
  ['claude-opus-4', 'VERTEX_REGION_CLAUDE_4_0_OPUS'],
  ['claude-sonnet-4-6', 'VERTEX_REGION_CLAUDE_4_6_SONNET'],
  ['claude-sonnet-4-5', 'VERTEX_REGION_CLAUDE_4_5_SONNET'],
  ['claude-sonnet-4', 'VERTEX_REGION_CLAUDE_4_0_SONNET'],
]

const realIsEnvTruthy = (v: string | boolean | undefined): boolean => {
  if (!v) return false
  if (typeof v === 'boolean') return v
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase().trim())
}
const realIsEnvDefinedFalsy = (v: string | boolean | undefined): boolean => {
  if (v === undefined) return false
  if (typeof v === 'boolean') return !v
  if (!v) return false
  return ['0', 'false', 'no', 'off'].includes(v.toLowerCase().trim())
}
const realDefaultVertexRegion = (): string =>
  process.env.CLOUD_ML_REGION || 'us-east5'

// Real getClaudeConfigHomeDir is memoized via lodash, so consumers may call
// `.cache.clear()` on it (see tasks.test.ts). Provide a no-op .cache stub.
const mockedGetClaudeConfigHomeDir: (() => string) & {
  cache: { clear: () => void; get: (k: unknown) => unknown }
} = Object.assign(
  () =>
    useMockForCacheStats
      ? tmpDir
      : (process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')).normalize(
          'NFC',
        ),
  {
    cache: {
      clear: () => {},
      get: (_k: unknown) => undefined,
    },
  },
)

mock.module('src/utils/envUtils.js', () => ({
  getClaudeConfigHomeDir: mockedGetClaudeConfigHomeDir,
  isEnvTruthy: realIsEnvTruthy,
  hasNodeOption: (flag: string) => {
    const opts = process.env.NODE_OPTIONS
    return !!opts && opts.split(/\s+/).includes(flag)
  },
  isEnvDefinedFalsy: realIsEnvDefinedFalsy,
  isBareMode: () =>
    realIsEnvTruthy(process.env.CLAUDE_CODE_SIMPLE) ||
    process.argv.includes('--bare'),
  parseEnvVars: (rawEnvArgs: string[] | undefined) => {
    const parsed: Record<string, string> = {}
    if (rawEnvArgs) {
      for (const envStr of rawEnvArgs) {
        const [key, ...valueParts] = envStr.split('=')
        if (!key || valueParts.length === 0) {
          throw new Error(
            `Invalid environment variable format: ${envStr}, environment variables should be added as: -e KEY1=value1 -e KEY2=value2`,
          )
        }
        parsed[key] = valueParts.join('=')
      }
    }
    return parsed
  },
  getAWSRegion: () =>
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
  getDefaultVertexRegion: realDefaultVertexRegion,
  shouldMaintainProjectWorkingDir: () =>
    realIsEnvTruthy(process.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR),
  isRunningOnHomespace: () =>
    process.env.USER_TYPE === 'ant' &&
    realIsEnvTruthy(process.env.COO_RUNNING_ON_HOMESPACE),
  isInProtectedNamespace: () => false,
  getTeamsDir: () =>
    useMockForCacheStats
      ? `${tmpDir}/teams`
      : join(
          (
            process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
          ).normalize('NFC'),
          'teams',
        ),
  getEnvBool: () => false,
  getEnvNumber: () => undefined,
  getVertexRegionForModel: (model: string | undefined) => {
    if (model) {
      const match = VERTEX_REGION_OVERRIDES.find(([prefix]) =>
        model.startsWith(prefix),
      )
      if (match) {
        return process.env[match[1]] || realDefaultVertexRegion()
      }
    }
    return realDefaultVertexRegion()
  },
}))

import {
  computeHitRate,
  tokenSignature,
  getStateFilePath,
  readState,
  writeStateAtomic,
  type CacheUsage,
  type CacheStatsState,
} from '../cacheStats.js'

import {
  onResponse,
  getCacheStatsState,
  initCacheStatsState,
  _resetCacheStatsStateForTest,
} from '../cacheStatsState.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usage(input: number, create: number, read: number): CacheUsage {
  return {
    input_tokens: input,
    cache_creation_input_tokens: create,
    cache_read_input_tokens: read,
  }
}

// ---------------------------------------------------------------------------
// computeHitRate
// ---------------------------------------------------------------------------

describe('computeHitRate', () => {
  test('returns null for null input', () => {
    expect(computeHitRate(null)).toBeNull()
  })

  test('returns null when all fields are 0 (denominator = 0)', () => {
    expect(computeHitRate(usage(0, 0, 0))).toBeNull()
  })

  test('100% when all tokens are cache reads', () => {
    expect(computeHitRate(usage(0, 0, 1000))).toBe(100)
  })

  test('0% when no cache reads', () => {
    expect(computeHitRate(usage(1000, 0, 0))).toBe(0)
  })

  test('rounds to integer (50%)', () => {
    expect(computeHitRate(usage(500, 0, 500))).toBe(50)
  })

  test('rounds fractional values', () => {
    // read=1, total=3 → 33.33... → rounds to 33
    expect(computeHitRate(usage(2, 0, 1))).toBe(33)
  })

  test('handles large numbers without overflow', () => {
    const big = 1_000_000_000
    expect(computeHitRate(usage(big, big, big))).toBe(33)
  })

  test('cache_creation does not count as reads', () => {
    // Only cache_read_input_tokens in numerator
    expect(computeHitRate(usage(0, 1000, 0))).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// tokenSignature
// ---------------------------------------------------------------------------

describe('tokenSignature', () => {
  test('produces deterministic string', () => {
    const u = usage(100, 200, 300)
    expect(tokenSignature(u)).toBe('100|200|300')
  })

  test('changes when input_tokens changes', () => {
    expect(tokenSignature(usage(1, 2, 3))).not.toBe(
      tokenSignature(usage(9, 2, 3)),
    )
  })

  test('changes when cache_creation changes', () => {
    expect(tokenSignature(usage(1, 2, 3))).not.toBe(
      tokenSignature(usage(1, 9, 3)),
    )
  })

  test('changes when cache_read changes', () => {
    expect(tokenSignature(usage(1, 2, 3))).not.toBe(
      tokenSignature(usage(1, 2, 9)),
    )
  })
})

// ---------------------------------------------------------------------------
// State file: getStateFilePath
// ---------------------------------------------------------------------------

describe('getStateFilePath', () => {
  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cache-stats-test-'))
  })

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  test('returns path inside config home dir', () => {
    const p = getStateFilePath('session-abc')
    expect(p).toContain('cache-stats')
    expect(p.startsWith(tmpDir)).toBe(true)
  })

  test('different sessionIds produce different paths', () => {
    const p1 = getStateFilePath('session-one')
    const p2 = getStateFilePath('session-two')
    expect(p1).not.toBe(p2)
  })

  test('same sessionId always produces same path (deterministic)', () => {
    expect(getStateFilePath('s1')).toBe(getStateFilePath('s1'))
  })

  test('file name is 16 hex chars + .json', () => {
    const p = getStateFilePath('any-session-id')
    const base = path.basename(p)
    expect(base).toMatch(/^[0-9a-f]{16}\.json$/)
  })
})

// ---------------------------------------------------------------------------
// State file: readState / writeStateAtomic
// ---------------------------------------------------------------------------

describe('readState / writeStateAtomic', () => {
  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cache-stats-test-'))
  })

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  test('readState returns init defaults when file is missing', async () => {
    const p = path.join(tmpDir, 'cache-stats', 'nonexistent.json')
    const s = await readState(p)
    expect(s.version).toBe(1)
    expect(s.signature).toBeNull()
    expect(s.lastResetAt).toBeNull()
    expect(s.lastHitRate).toBeNull()
  })

  test('readState returns init defaults on corrupt JSON', async () => {
    const p = path.join(tmpDir, 'bad.json')
    await fsp.writeFile(p, 'not-json!!!', 'utf8')
    const s = await readState(p)
    expect(s.signature).toBeNull()
  })

  test('readState returns init defaults on invalid shape', async () => {
    const p = path.join(tmpDir, 'bad-shape.json')
    await fsp.writeFile(p, JSON.stringify({ version: 2, foo: 'bar' }), 'utf8')
    const s = await readState(p)
    expect(s.signature).toBeNull()
  })

  test('round-trip: writeStateAtomic then readState', async () => {
    const p = getStateFilePath('round-trip-session')
    const state: CacheStatsState = {
      version: 1,
      signature: '100|200|300',
      lastResetAt: 1_700_000_000_000,
      lastHitRate: 75,
    }
    await writeStateAtomic(p, state)
    const read = await readState(p)
    expect(read).toEqual(state)
  })

  test('writeStateAtomic creates parent directory if missing', async () => {
    const p = path.join(tmpDir, 'deep', 'nested', 'state.json')
    const state: CacheStatsState = {
      version: 1,
      signature: null,
      lastResetAt: null,
      lastHitRate: null,
    }
    await writeStateAtomic(p, state)
    const read = await readState(p)
    expect(read.version).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// onResponse / getCacheStatsState (in-memory singleton)
// ---------------------------------------------------------------------------

describe('onResponse', () => {
  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cache-stats-test-'))
    _resetCacheStatsStateForTest()
  })

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  test('initial state has null signature and lastResetAt', () => {
    const s = getCacheStatsState()
    expect(s.signature).toBeNull()
    expect(s.lastResetAt).toBeNull()
  })

  test('first onResponse sets lastResetAt and signature', () => {
    const u = usage(100, 0, 50)
    const before = Date.now()
    const s = onResponse(u)
    const after = Date.now()
    expect(s.signature).toBe(tokenSignature(u))
    expect(s.lastResetAt).toBeGreaterThanOrEqual(before)
    expect(s.lastResetAt).toBeLessThanOrEqual(after)
    expect(s.lastHitRate).toBe(33) // 50/(100+50) ≈ 33
  })

  test('same signature does NOT reset lastResetAt', async () => {
    const u = usage(100, 0, 50)
    onResponse(u)
    const firstState = getCacheStatsState()
    const firstResetAt = firstState.lastResetAt

    // Wait a tick to ensure Date.now() would differ
    await new Promise(r => setTimeout(r, 5))

    onResponse(u) // same signature
    const secondState = getCacheStatsState()
    expect(secondState.lastResetAt).toBe(firstResetAt)
  })

  test('different signature RESETS lastResetAt', async () => {
    const u1 = usage(100, 0, 50)
    onResponse(u1)
    const firstState = getCacheStatsState()

    await new Promise(r => setTimeout(r, 5))

    const u2 = usage(200, 0, 100) // different signature
    onResponse(u2)
    const secondState = getCacheStatsState()
    expect(secondState.lastResetAt).toBeGreaterThan(firstState.lastResetAt!)
  })

  test('lastHitRate is updated on signature change', () => {
    onResponse(usage(1000, 0, 0)) // 0% hit rate
    const s1 = getCacheStatsState()
    expect(s1.lastHitRate).toBe(0)

    onResponse(usage(0, 0, 1000)) // 100% hit rate — different sig
    const s2 = getCacheStatsState()
    expect(s2.lastHitRate).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Multi-session isolation
// ---------------------------------------------------------------------------

describe('multi-session file isolation', () => {
  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cache-stats-test-'))
  })

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  test('different session IDs produce different state files', async () => {
    const p1 = getStateFilePath('session-alpha')
    const p2 = getStateFilePath('session-beta')

    const s1: CacheStatsState = {
      version: 1,
      signature: 'sig-alpha',
      lastResetAt: 1000,
      lastHitRate: 90,
    }
    const s2: CacheStatsState = {
      version: 1,
      signature: 'sig-beta',
      lastResetAt: 2000,
      lastHitRate: 10,
    }

    await writeStateAtomic(p1, s1)
    await writeStateAtomic(p2, s2)

    const r1 = await readState(p1)
    const r2 = await readState(p2)

    expect(r1.signature).toBe('sig-alpha')
    expect(r2.signature).toBe('sig-beta')
    expect(r1.lastHitRate).toBe(90)
    expect(r2.lastHitRate).toBe(10)
  })

  test('initCacheStatsState loads persisted fallback values', async () => {
    _resetCacheStatsStateForTest()
    const sid = 'test-session-init'
    const p = getStateFilePath(sid)
    const persisted: CacheStatsState = {
      version: 1,
      signature: '500|100|400',
      lastResetAt: 1_700_000_000_000,
      lastHitRate: 40,
    }
    await writeStateAtomic(p, persisted)

    await initCacheStatsState(sid)
    const s = getCacheStatsState()
    expect(s.lastHitRate).toBe(40)
    expect(s.lastResetAt).toBe(1_700_000_000_000)
    expect(s.signature).toBe('500|100|400')
  })
})
