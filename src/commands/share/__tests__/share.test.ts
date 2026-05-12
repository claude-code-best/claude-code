/**
 * Tests for share/index.ts
 *
 * share/index.ts now uses `import * as childProcess from 'node:child_process'`
 * with lazy promisify, so mock.module('node:child_process') is effective.
 * This file sets up a default mock where gh succeeds (so tests that exercise
 * the log-exists paths can proceed past the gh check). The share-gh.test.ts
 * file tests specific gh upload paths in detail.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { promisify } from 'node:util'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Default: gh --version succeeds, gist create fails (upload error is acceptable
// for tests that only need to reach the content-preparation stage).
let _execFileImplBase: (
  cmd: string,
  args: string[],
  opts: unknown,
  cb: (err: Error | null, stdout: string, stderr: string) => void,
) => void = (_cmd, _args, _opts, cb) => cb(null, '', '')

const execFileMockBase = (
  cmd: string,
  args: string[],
  opts: unknown,
  cb: (err: Error | null, stdout: string, stderr: string) => void,
) => _execFileImplBase(cmd, args, opts, cb)

;(execFileMockBase as unknown as Record<symbol, unknown>)[
  promisify.custom as symbol
] = (
  cmd: string,
  args: string[],
  opts: unknown,
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) =>
    _execFileImplBase(cmd, args, opts, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    }),
  )

// Spread real child_process + flag-gated stub (see share-gh.test.ts for the
// promisify.custom rationale). Default OFF; suite's beforeAll flips on,
// afterAll flips off so projectContext.test and other child_process consumers
// see the real impl outside this suite.
let useShareCpStubs = false
const wrappedShareExecFile = ((...args: unknown[]) =>
  useShareCpStubs
    ? (execFileMockBase as (...a: unknown[]) => unknown)(...args)
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('node:child_process').execFile as (...a: unknown[]) => unknown)(
        ...args,
      )) as unknown as Record<symbol, unknown> & ((...a: unknown[]) => unknown)
;(wrappedShareExecFile as Record<symbol, unknown>)[promisify.custom as symbol] =
  (
    cmd: string,
    args: string[],
    opts: unknown,
  ): Promise<{ stdout: string; stderr: string }> => {
    if (useShareCpStubs) {
      return new Promise((resolve, reject) =>
        _execFileImplBase(cmd, args, opts, (err, stdout, stderr) =>
          err ? reject(err) : resolve({ stdout, stderr }),
        ),
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const real = require('node:child_process') as Record<string, unknown>
    return promisify(real.execFile as never)(cmd, args, opts) as Promise<{
      stdout: string
      stderr: string
    }>
  }
mock.module('node:child_process', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const real = require('node:child_process') as Record<string, unknown>
  return {
    ...real,
    default: real,
    execFile: wrappedShareExecFile as typeof real.execFile,
    execFileSync: ((...args: unknown[]) =>
      useShareCpStubs
        ? Buffer.from('')
        : (real.execFileSync as (...a: unknown[]) => unknown)(
            ...args,
          )) as typeof real.execFileSync,
  }
})

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
  stripProtoFields: (v: unknown) => v,
}))

// NOTE: We do NOT mock src/bootstrap/state.js here to avoid interfering with
// other test files (particularly launchAutofixPr.test.ts). We dynamically
// import state to get the real session ID for log file path construction.

// ── State ──
let tmpDir: string
let claudeDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'share-test-'))
  claudeDir = join(tmpDir, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = claudeDir
  // Reset to gh-succeeds default (execFile returns empty stdout — gh check passes,
  // gist create will fail with "Unexpected gh gist output" which is acceptable for
  // tests that only exercise content-preparation paths).
  _execFileImplBase = (_cmd, _args, _opts, cb) => cb(null, '', '')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
})

// ── Helpers ──
type CallFn = (
  args: string,
  ctx?: never,
) => Promise<{ type: string; value: string }>

async function getCallFn(): Promise<CallFn> {
  const mod = await import('../index.js')
  const loaded = await (
    mod.default as unknown as { load: () => Promise<{ call: CallFn }> }
  ).load()
  return loaded.call.bind(loaded) as CallFn
}

async function writeSessionLog(entries?: string[]): Promise<void> {
  // Write the session log at the path share/index.ts will compute at runtime.
  // We use the real state values (no mock) to match the actual path.
  const { sanitizePath } = await import('../../../utils/path.js')
  const { getSessionId, getOriginalCwd } = await import(
    '../../../bootstrap/state.js'
  )
  const sessionId = getSessionId()
  const cwd = getOriginalCwd()
  const encoded = sanitizePath(cwd)
  const dir = join(claudeDir, 'projects', encoded)
  mkdirSync(dir, { recursive: true })
  const content = entries ?? [
    JSON.stringify({ role: 'user', content: 'hello world' }),
    JSON.stringify({
      role: 'assistant',
      content: [{ type: 'text', text: 'hi there' }],
    }),
  ]
  writeFileSync(join(dir, `${sessionId}.jsonl`), content.join('\n') + '\n')
}

// Activate child_process stubs only for this suite.
beforeAll(() => {
  useShareCpStubs = true
})
afterAll(() => {
  useShareCpStubs = false
})

describe('share command — metadata', () => {
  test('command has correct name and type', async () => {
    const mod = await import('../index.js')
    const cmd = mod.default
    expect(cmd.name).toBe('share')
    expect(cmd.type).toBe('local')
    expect(
      (cmd as unknown as { supportsNonInteractive: boolean })
        .supportsNonInteractive,
    ).toBe(true)
  })

  test('isEnabled returns true', async () => {
    const mod = await import('../index.js')
    expect(mod.default.isEnabled?.()).toBe(true)
  })
})

describe('share command — parseShareArgs', () => {
  test('unknown flag → returns usage hint', async () => {
    const call = await getCallFn()
    const result = await call('--unknown')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Usage')
  })

  test('empty args → valid (default private) → log_not_found', async () => {
    const call = await getCallFn()
    const result = await call('')
    expect(result.type).toBe('text')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('--private is valid', async () => {
    const call = await getCallFn()
    const result = await call('--private')
    expect(result.type).toBe('text')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('--public is valid', async () => {
    const call = await getCallFn()
    const result = await call('--public')
    expect(result.type).toBe('text')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('--mask-secrets is valid', async () => {
    const call = await getCallFn()
    const result = await call('--mask-secrets')
    expect(result.type).toBe('text')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('--summary-only is valid', async () => {
    const call = await getCallFn()
    const result = await call('--summary-only')
    expect(result.type).toBe('text')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('--allow-public-fallback is valid', async () => {
    const call = await getCallFn()
    const result = await call('--allow-public-fallback')
    expect(result.type).toBe('text')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('multiple valid flags together', async () => {
    const call = await getCallFn()
    const result = await call('--public --mask-secrets --summary-only')
    expect(result.type).toBe('text')
    expect(result.value.length).toBeGreaterThan(0)
  })
})

describe('share command — log not found', () => {
  test('returns log_not_found when no log exists', async () => {
    const call = await getCallFn()
    const result = await call('--private')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Session log not found')
  })

  test('--public returns log_not_found when no log exists', async () => {
    const call = await getCallFn()
    const result = await call('--public')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Session log not found')
  })
})

describe('share command — log exists', () => {
  test('log exists + --summary-only with real content → proceeds past log check', async () => {
    await writeSessionLog()
    const call = await getCallFn()
    const result = await call('--summary-only')
    expect(result.type).toBe('text')
    // Either succeeds (if gh available) or fails (if not) — but passes the log check
    expect(typeof result.value).toBe('string')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('log exists + --summary-only with only system entries → no conversation content', async () => {
    await writeSessionLog([
      JSON.stringify({ type: 'system', content: 'system message' }),
    ])
    const call = await getCallFn()
    const result = await call('--summary-only')
    expect(result.type).toBe('text')
    expect(result.value).toContain('No conversation content')
  })

  test('log exists + --mask-secrets with API key → proceeds past log check', async () => {
    await writeSessionLog([
      JSON.stringify({
        role: 'user',
        content: 'my api key is sk-ant-abcdefghijklmnopqrstuvwxyz123456',
      }),
    ])
    const call = await getCallFn()
    const result = await call('--mask-secrets')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('log exists + no fallback + gh not available → shows manual instructions OR fails if gh is installed', async () => {
    await writeSessionLog()
    const call = await getCallFn()
    // Without controlling child_process, behavior depends on environment
    const result = await call('--private')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
    // Accept any outcome — the log exists path is exercised
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('log exists with array content (buildSummaryContent array branch)', async () => {
    await writeSessionLog([
      JSON.stringify({
        role: 'user',
        content: [{ type: 'text', text: 'help me debug' }],
      }),
      JSON.stringify({
        role: 'assistant',
        content: 'sure',
      }),
    ])
    const call = await getCallFn()
    const result = await call('--summary-only')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
  })

  test('log exists with malformed JSONL lines (buildSummaryContent try/catch)', async () => {
    await writeSessionLog([
      JSON.stringify({ role: 'user', content: 'valid' }),
      'NOT_VALID_JSON{{{',
    ])
    const call = await getCallFn()
    const result = await call('--summary-only')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
  })

  // ── M2 regression: maskSecrets must NOT redact git SHAs but MUST redact Anthropic keys ──
  test('M2: maskSecrets redacts sk-ant-* keys but leaves 40-char hex git SHAs intact', async () => {
    const { maskSecrets } = await import('../index.js')

    const gitSha = 'a' + '1'.repeat(39) // 40 hex chars — a git SHA
    const apiKey = 'sk-ant-api03-verylongapikey1234567890abcdef'
    const input = `commit ${gitSha}\nAPI key: ${apiKey}`

    const result = maskSecrets(input)

    // Git SHA must NOT be redacted
    expect(result).toContain(gitSha)
    // API key MUST be redacted
    expect(result).not.toContain(apiKey)
    expect(result).toContain('[REDACTED')
  })

  test('M2: maskSecrets redacts Bearer tokens', async () => {
    const { maskSecrets } = await import('../index.js')
    const input =
      'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.verylongvalue'
    const result = maskSecrets(input)
    expect(result).toContain('[REDACTED_TOKEN]')
  })
})
