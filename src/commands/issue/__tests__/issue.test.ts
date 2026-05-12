/**
 * Tests for issue/index.ts
 *
 * NOTE: issue/index.ts calls execFileSync at module-function level (not top-level).
 * The child_process functions are imported by reference and cannot be reliably
 * mocked after module load with Bun's mock.module. Tests here cover what's
 * testable without child_process control: parseIssueArgs, metadata, and
 * environment-agnostic paths.
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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
  logEventAsync: () => Promise.resolve(),
  stripProtoFields: (v: unknown) => v,
  _resetForTesting: () => {},
  attachAnalyticsSink: () => {},
}))

// Re-mock bootstrap/state.js with a dynamic getOriginalCwd / setOriginalCwd
// pair so this suite can drive cwd values regardless of any earlier test
// file's static mock (e.g. launchAutofixPr.test.ts which sets a fixed
// '/mock/cwd'). We start from the shared stateMock helper, then override
// the four exports issue/index.ts cares about with closure-driven impls.
//
// Bun's mock.module is global / last-write-wins. After this suite finishes
// we set `useIssueDynamicState=false` so launchAutofixPr's tests (which run
// in the same process) see the values their suite originally expected.
import { stateMock } from '../../../../tests/mocks/state'
let _dynamicCwd = process.cwd()
let _dynamicSessionId = `issue-test-${randomUUID()}`
// Default OFF — autofix-pr/__tests__/launchAutofixPr.test.ts runs FIRST in
// the combined suite (alphabetical: 'autofix-pr' < 'issue') and expects
// '/mock/cwd'. Issue's beforeAll switches this on, afterAll switches off.
let useIssueDynamicState = false
// Default OFF — the long-body draft-save test below flips this on for its
// body (so execFile/execFileSync return ENOENT + a fake GitHub remote URL)
// then flips off in finally. Without the flag the child_process stub leaked
// process-globally into every later test file via Bun's mock.module cache.
let useIssueLongBodyCpStubs = false
mock.module('src/bootstrap/state.js', () => ({
  ...stateMock(),
  getSessionId: () =>
    useIssueDynamicState ? _dynamicSessionId : 'parent-session-id',
  getParentSessionId: () => undefined,
  getCwdState: () => (useIssueDynamicState ? _dynamicCwd : '/mock/cwd'),
  getSessionProjectDir: () => null,
  getOriginalCwd: () => (useIssueDynamicState ? _dynamicCwd : '/mock/cwd'),
  getProjectRoot: () => (useIssueDynamicState ? _dynamicCwd : '/mock/project'),
  setCwdState: (c: string) => {
    if (useIssueDynamicState) _dynamicCwd = c
  },
  setOriginalCwd: (c: string) => {
    if (useIssueDynamicState) _dynamicCwd = c
  },
  setLastAPIRequestMessages: () => {},
  getIsNonInteractiveSession: () => false,
  addSlowOperation: () => {},
}))

// ── State ──
let tmpDir: string
let claudeDir: string
// Snapshot HOME so per-test mutations (lines below set process.env.HOME =
// tmpDir for child-process branches) can be restored. Otherwise the leaked
// /tmp/issue-test-XXX HOME pollutes downstream tests like
// src/services/langfuse/__tests__/langfuse.test.ts whose sanitize logic
// substitutes the current process.env.HOME.
const _originalHomeForIssueSuite = process.env.HOME

// Mock envUtils to read CLAUDE_CONFIG_DIR from process.env dynamically so
// other test files (cacheStats, SessionMemory/prompts) that mock with static
// paths don't pollute this test in the full suite. Reading process.env at
// call time lets each test drive its own dir.
mock.module('src/utils/envUtils.js', () => ({
  getClaudeConfigHomeDir: () =>
    process.env.CLAUDE_CONFIG_DIR ?? `${tmpdir()}/dummy-claude`,
  isEnvTruthy: (v: unknown) => Boolean(v),
  getTeamsDir: () =>
    join(process.env.CLAUDE_CONFIG_DIR ?? `${tmpdir()}/dummy-claude`, 'teams'),
  hasNodeOption: () => false,
  isEnvDefinedFalsy: () => false,
  isBareMode: () => false,
  parseEnvVars: (s: string) => s,
  getAWSRegion: () => 'us-east-1',
  getDefaultVertexRegion: () => 'us-central1',
  shouldMaintainProjectWorkingDir: () => false,
}))

// Activate dynamic state mode for this suite only.
beforeAll(() => {
  useIssueDynamicState = true
})

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'issue-test-'))
  claudeDir = join(tmpDir, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = claudeDir
  // Reset dynamic cwd to a per-test deterministic default (the tmpDir).
  // Tests that need a different cwd call the mocked setOriginalCwd.
  _dynamicCwd = tmpDir
  _dynamicSessionId = `issue-test-${randomUUID()}`
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
  // Restore HOME — individual tests may have set it to tmpDir.
  if (_originalHomeForIssueSuite === undefined) {
    delete process.env.HOME
  } else {
    process.env.HOME = _originalHomeForIssueSuite
  }
})

// After this suite finishes, switch off our dynamic mode so any subsequent
// test file (e.g. launchAutofixPr.test.ts) that imports bootstrap/state.js
// gets the static values its suite expects. Bun's mock.module is global and
// our mock won the registration race; this flag flips behavior post-suite.
afterAll(() => {
  useIssueDynamicState = false
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
    JSON.stringify({ role: 'user', content: 'Fix the login bug' }),
    JSON.stringify({
      role: 'assistant',
      content: [{ type: 'text', text: 'I will investigate' }],
    }),
  ]
  writeFileSync(join(dir, `${sessionId}.jsonl`), content.join('\n') + '\n')
}

describe('issue command — metadata', () => {
  test('command has correct name and type', async () => {
    const mod = await import('../index.js')
    const cmd = mod.default
    expect(cmd.name).toBe('issue')
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

describe('issue command — parseIssueArgs', () => {
  test('--label without value → parse error message', async () => {
    const call = await getCallFn()
    const result = await call('--label')
    expect(result.type).toBe('text')
    expect(result.value).toContain('--label requires a value')
  })

  test('--label with empty next flag → parse error', async () => {
    const call = await getCallFn()
    const result = await call('--label --public')
    expect(result.type).toBe('text')
    expect(result.value).toContain('--label requires a value')
  })

  test('--assignee without value → parse error message', async () => {
    const call = await getCallFn()
    const result = await call('--assignee')
    expect(result.type).toBe('text')
    expect(result.value).toContain('--assignee requires a value')
  })

  test('-l without value → parse error', async () => {
    const call = await getCallFn()
    const result = await call('-l')
    expect(result.type).toBe('text')
    expect(result.value).toContain('--label requires a value')
  })

  test('-a without value → parse error', async () => {
    const call = await getCallFn()
    const result = await call('-a')
    expect(result.type).toBe('text')
    expect(result.value).toContain('--assignee requires a value')
  })

  test('unknown flag → parse error', async () => {
    const call = await getCallFn()
    const result = await call('--unknown Fix bug')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Unknown flag')
  })
})

describe('issue command — no title', () => {
  test('empty args → usage hint', async () => {
    const call = await getCallFn()
    const result = await call('')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Usage')
  })

  test('whitespace-only args → usage hint', async () => {
    const call = await getCallFn()
    const result = await call('   ')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Usage')
  })
})

describe('issue command — with title', () => {
  test('title only → returns some text result', async () => {
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('title with --label → returns some text result', async () => {
    const call = await getCallFn()
    const result = await call('--label bug Fix login bug')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('title with --assignee → returns some text result', async () => {
    const call = await getCallFn()
    const result = await call('--assignee alice Fix login bug')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('title with both --label and --assignee → returns some text result', async () => {
    const call = await getCallFn()
    const result = await call('--label bug --assignee alice Fix login bug')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('title with log file present → exercises transcript summary paths', async () => {
    await writeSessionLog()
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('transcript with array content → covers array branch in getTranscriptSummary', async () => {
    await writeSessionLog([
      JSON.stringify({
        role: 'user',
        content: [{ type: 'text', text: 'What is the issue?' }],
      }),
      // tool_result with is_error → covers error collection
      JSON.stringify({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu1',
            is_error: true,
            content: 'Command failed',
          },
        ],
      }),
      // malformed line
      'NOT_JSON{{{',
    ])
    const call = await getCallFn()
    const result = await call('Test issue')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
  })

  test('transcript with only system entries → no conversation content', async () => {
    await writeSessionLog([
      JSON.stringify({ role: 'system', content: 'system prompt' }),
    ])
    const call = await getCallFn()
    const result = await call('Test issue empty summary')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
  })

  // ── H5 regression: browser fallback URL body must be ≤ 4096 chars before encode ──
  test('H5: URL-encoded body is capped at 4096 chars when session summary is very long', async () => {
    // Write a log with a very long user message to ensure summary exceeds 4096 chars
    const longText = 'A'.repeat(6000)
    await writeSessionLog([
      JSON.stringify({ role: 'user', content: longText }),
      JSON.stringify({
        role: 'assistant',
        content: [{ type: 'text', text: longText }],
      }),
    ])
    const call = await getCallFn()
    // No gh, no remote → falls into browser fallback path
    const result = await call('Some Long Issue Title')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      // Extract the URL from the output (if present)
      const urlMatch = result.value.match(/https?:\/\/\S+/)
      if (urlMatch) {
        // The URL must be ≤ ~8KB after encoding. Check the body= parameter specifically.
        const bodyParam = urlMatch[0].match(/[?&]body=([^&]*)/)
        if (bodyParam) {
          // decoded body text must be ≤ 4096 chars (plus truncation suffix)
          const decoded = decodeURIComponent(bodyParam[1])
          expect(decoded.length).toBeLessThanOrEqual(4096 + 60) // 60 for truncation suffix
        }
      }
    }
  })

  test('long body session log does not crash', async () => {
    // Long session log content exercises the body-formatting branches.
    const longText = 'x'.repeat(4500)
    const entries: string[] = []
    for (let i = 0; i < 50; i++) {
      entries.push(JSON.stringify({ role: 'user', content: longText }))
      entries.push(
        JSON.stringify({
          role: 'assistant',
          content: [{ type: 'text', text: longText }],
        }),
      )
    }
    await writeSessionLog(entries)
    process.env.HOME = tmpDir
    const call = await getCallFn()
    const result = await call('Long body issue')
    expect(result.type).toBe('text')
  })

  test('handles unreadable session log gracefully', async () => {
    // Write a corrupt log file that triggers parse errors but exists
    const { sanitizePath } = await import('../../../utils/path.js')
    const { getSessionId, getOriginalCwd } = await import(
      '../../../bootstrap/state.js'
    )
    const sessionId = getSessionId()
    const cwd = getOriginalCwd()
    const encoded = sanitizePath(cwd)
    const dir = join(claudeDir, 'projects', encoded)
    mkdirSync(dir, { recursive: true })
    // Empty / whitespace-only file: should not crash, will produce empty session text
    writeFileSync(join(dir, `${sessionId}.jsonl`), '')
    const call = await getCallFn()
    const result = await call('Issue from empty session')
    expect(result.type).toBe('text')
  })

  test('template directory unreadable returns null template (graceful)', async () => {
    // Create issue-templates directory with no .md files (only a non-readable subfile name)
    const templatesDir = join(claudeDir, 'issue-templates')
    mkdirSync(templatesDir, { recursive: true })
    writeFileSync(join(templatesDir, 'README.txt'), 'not a markdown template')
    await writeSessionLog()
    const call = await getCallFn()
    // Should still succeed without template — template loading is best-effort
    const result = await call('Issue without templates')
    expect(result.type).toBe('text')
  })

  test('session log read failure caught (path is a directory)', async () => {
    const { sanitizePath } = await import('../../../utils/path.js')
    const { getSessionId, getOriginalCwd } = await import(
      '../../../bootstrap/state.js'
    )
    const sessionId = getSessionId()
    const cwd = getOriginalCwd()
    const encoded = sanitizePath(cwd)
    const dir = join(claudeDir, 'projects', encoded)
    mkdirSync(dir, { recursive: true })
    // Create a directory at the log path so readFileSync throws EISDIR.
    mkdirSync(join(dir, `${sessionId}.jsonl`), { recursive: true })
    const call = await getCallFn()
    const result = await call('Issue with broken log')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      // Should still produce output even when session log is unreadable
      expect(result.value.length).toBeGreaterThan(0)
    }
  })

  test('detectIssueTemplate picks up first .md template from .github/ISSUE_TEMPLATE', async () => {
    // Issue command uses getOriginalCwd() (NOT process.cwd) — override via
    // setOriginalCwd. Restore after to avoid polluting other tests.
    const { getOriginalCwd, setOriginalCwd } = await import(
      '../../../bootstrap/state.js'
    )
    const githubDir = join(tmpDir, '.github', 'ISSUE_TEMPLATE')
    mkdirSync(githubDir, { recursive: true })
    writeFileSync(
      join(githubDir, 'bug.md'),
      '---\nname: Bug\nabout: Bug report\n---\n## Steps to reproduce\n\nSteps...\n',
    )
    writeFileSync(
      join(githubDir, 'config.yml'),
      'blank_issues_enabled: false\n',
    )
    await writeSessionLog()
    const origCwd = getOriginalCwd()
    try {
      setOriginalCwd(tmpDir)
      const call = await getCallFn()
      const result = await call('Issue with bug template')
      expect(result.type).toBe('text')
    } finally {
      setOriginalCwd(origCwd)
    }
  })

  test('detectIssueTemplate returns null when only non-md templates present', async () => {
    const { getOriginalCwd, setOriginalCwd } = await import(
      '../../../bootstrap/state.js'
    )
    const githubDir = join(tmpDir, '.github', 'ISSUE_TEMPLATE')
    mkdirSync(githubDir, { recursive: true })
    writeFileSync(join(githubDir, 'bug.yml'), 'name: Bug')
    await writeSessionLog()
    const origCwd = getOriginalCwd()
    try {
      setOriginalCwd(tmpDir)
      const call = await getCallFn()
      const result = await call('Issue YAML-only template')
      expect(result.type).toBe('text')
    } finally {
      setOriginalCwd(origCwd)
    }
  })

  test('detectIssueTemplate returns null when ISSUE_TEMPLATE is empty', async () => {
    const { getOriginalCwd, setOriginalCwd } = await import(
      '../../../bootstrap/state.js'
    )
    const githubDir = join(tmpDir, '.github', 'ISSUE_TEMPLATE')
    mkdirSync(githubDir, { recursive: true })
    await writeSessionLog()
    const origCwd = getOriginalCwd()
    try {
      setOriginalCwd(tmpDir)
      const call = await getCallFn()
      const result = await call('Issue empty template dir')
      expect(result.type).toBe('text')
    } finally {
      setOriginalCwd(origCwd)
    }
  })

  test('detectIssueTemplate readdir failure is caught (catch branch)', async () => {
    const { getOriginalCwd, setOriginalCwd } = await import(
      '../../../bootstrap/state.js'
    )
    // Create the ISSUE_TEMPLATE path as a regular file (not a directory) so
    // existsSync returns true but readdirSync throws ENOTDIR.
    const githubDir = join(tmpDir, '.github')
    mkdirSync(githubDir, { recursive: true })
    writeFileSync(join(githubDir, 'ISSUE_TEMPLATE'), 'not-a-directory')
    await writeSessionLog()
    const origCwd = getOriginalCwd()
    try {
      setOriginalCwd(tmpDir)
      const call = await getCallFn()
      const result = await call('Issue with broken template path')
      expect(result.type).toBe('text')
    } finally {
      setOriginalCwd(origCwd)
    }
  })

  test('long body triggers truncation + draft save', async () => {
    const { getOriginalCwd, setOriginalCwd } = await import(
      '../../../bootstrap/state.js'
    )
    // getTranscriptSummary clips each user/assistant text to 200 chars and
    // joins only the last 10 entries, so it can never organically exceed
    // ~2.7 KB. To exercise the >4096-char branch (lines 362-375), we
    // temporarily neutralise Array.prototype.slice for the `slice(-N)`
    // pattern (negative-only first arg, no second arg). String.slice and
    // positive Array.slice keep working, and we restore the original in
    // finally so no state leaks across tests.
    const longText = 'x'.repeat(200)
    const entries: string[] = []
    for (let i = 0; i < 100; i++) {
      entries.push(JSON.stringify({ role: 'user', content: longText }))
      entries.push(
        JSON.stringify({
          role: 'assistant',
          content: [{ type: 'text', text: longText }],
        }),
      )
    }
    await writeSessionLog(entries)
    process.env.HOME = tmpDir
    const origCwd = getOriginalCwd()
    const origSlice = Array.prototype.slice
    // Force the fallback URL branch with a *parsed* GitHub remote so the
    // draft-path output (lines 392-393) is reached: git remote returns a
    // GitHub URL but `gh --version` fails so hasGh is false.
    //
    // Spread+flag pattern: the previous bare `mock.module(...)` here leaked
    // a stub child_process to every later test file in the same `bun test`
    // run (mock.module is process-global, last-write-wins). Now we register
    // a flag-gated mock that delegates to real child_process by default, and
    // only flips on for THIS test's body.
    mock.module('node:child_process', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const real = require('node:child_process') as Record<string, unknown>
      return {
        ...real,
        default: real,
        execFile: ((...args: unknown[]) => {
          if (useIssueLongBodyCpStubs) {
            const cb = args[3] as
              | ((e: Error | null, s: string, e2: string) => void)
              | undefined
            if (cb) cb(new Error('ENOENT'), '', '')
            return
          }
          return (real.execFile as (...a: unknown[]) => unknown)(...args)
        }) as typeof real.execFile,
        execFileSync: ((...args: unknown[]) => {
          if (useIssueLongBodyCpStubs) {
            const cmd = args[0] as string
            if (cmd === 'git')
              return Buffer.from('https://github.com/owner/repo.git\n')
            throw new Error('ENOENT')
          }
          return (real.execFileSync as (...a: unknown[]) => unknown)(...args)
        }) as typeof real.execFileSync,
      }
    })
    useIssueLongBodyCpStubs = true
    Array.prototype.slice = function (
      this: unknown[],
      start?: number,
      end?: number,
    ): unknown[] {
      // For `summaryParts.slice(-10)` and `errors.slice(-3)` (negative
      // start, no end) return the full array so summaryParts.length
      // determines the body size.
      if (typeof start === 'number' && start < 0 && end === undefined) {
        return Array.from(this)
      }
      return origSlice.call(this, start, end) as unknown[]
    } as typeof Array.prototype.slice
    try {
      setOriginalCwd(tmpDir)
      const call = await getCallFn()
      const result = await call('Long body for draft save')
      expect(result.type).toBe('text')
      if (result.type === 'text') {
        // Draft path is reported when body > 4096 chars (line 393 branch).
        expect(result.value).toContain('Full issue body saved to')
      }
    } finally {
      Array.prototype.slice = origSlice
      setOriginalCwd(origCwd)
      useIssueLongBodyCpStubs = false
    }
  })
})
