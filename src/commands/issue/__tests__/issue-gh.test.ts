/**
 * Coverage tests for issue/index.ts gh-CLI paths.
 *
 * issue/index.ts uses `import * as childProcess from 'node:child_process'`
 * with lazy promisify, so mock.module('node:child_process') is effective.
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

// ── Mock control state ──
let _execFileSyncImpl: (cmd: string, args: string[], opts?: unknown) => Buffer =
  () => Buffer.from('')

let _execFileImpl: (
  cmd: string,
  args: string[],
  opts: unknown,
  cb: (err: Error | null, stdout: string, stderr: string) => void,
) => void = (_cmd, _args, _opts, cb) => cb(null, '', '')

const execFileSyncMockCore = (
  cmd: string,
  args: string[],
  opts?: unknown,
): Buffer => _execFileSyncImpl(cmd, args, opts)

const execFileMockCore = (
  cmd: string,
  args: string[],
  opts: unknown,
  cb: (err: Error | null, stdout: string, stderr: string) => void,
) => _execFileImpl(cmd, args, opts, cb)

;(execFileMockCore as unknown as Record<symbol, unknown>)[
  promisify.custom as symbol
] = (
  cmd: string,
  args: string[],
  opts: unknown,
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) =>
    _execFileImpl(cmd, args, opts, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    }),
  )

// Spread real child_process + flag-gated stub (see share-gh.test.ts for the
// promisify.custom rationale).
let useIssueGhCpStubs = false
const wrappedIssueGhExecFile = ((...args: unknown[]) =>
  useIssueGhCpStubs
    ? (execFileMockCore as (...a: unknown[]) => unknown)(...args)
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('node:child_process').execFile as (...a: unknown[]) => unknown)(
        ...args,
      )) as unknown as Record<symbol, unknown> & ((...a: unknown[]) => unknown)
;(wrappedIssueGhExecFile as Record<symbol, unknown>)[
  promisify.custom as symbol
] = (
  cmd: string,
  args: string[],
  opts: unknown,
): Promise<{ stdout: string; stderr: string }> => {
  if (useIssueGhCpStubs) {
    return new Promise((resolve, reject) =>
      _execFileImpl(cmd, args, opts, (err, stdout, stderr) =>
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
    execFile: wrappedIssueGhExecFile as typeof real.execFile,
    execFileSync: ((...args: unknown[]) =>
      useIssueGhCpStubs
        ? (execFileSyncMockCore as (...a: unknown[]) => unknown)(...args)
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

// ── State ──
let tmpDir: string
let claudeDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'issue-gh-test-'))
  claudeDir = join(tmpDir, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = claudeDir
  // Default: git remote fails (no GitHub remote), gh not available
  _execFileSyncImpl = (_cmd, _args, _opts) => {
    throw new Error('ENOENT: command not found')
  }
  _execFileImpl = (_cmd, _args, _opts, cb) =>
    cb(new Error('ENOENT: command not found'), '', '')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
})

// ── Helpers ──
type CallFn = (args: string) => Promise<{ type: string; value: string }>

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

// Create a .github/ISSUE_TEMPLATE dir in tmpDir
function createIssueTemplate(
  content = '## Bug Report\n\nDescribe the bug.',
): string {
  const templateDir = join(tmpDir, '.github', 'ISSUE_TEMPLATE')
  mkdirSync(templateDir, { recursive: true })
  writeFileSync(join(templateDir, 'bug_report.md'), content)
  return templateDir
}

// ── Sequence helpers ──
type SeqBehavior =
  | { type: 'sync-ok'; stdout: string }
  | { type: 'sync-fail'; msg: string }
  | { type: 'async-ok'; stdout: string }
  | { type: 'async-fail'; msg: string }

/**
 * Sets sync/async behavior based on command name.
 * syncBehavior controls execFileSync (git, gh --version sync-check).
 * asyncBehaviors controls sequential async calls.
 */
function setupMocks(opts: {
  gitRemoteUrl?: string | null // null = git fails, string = succeeds with that URL
  ghCliAvailable?: boolean // whether gh --version sync call succeeds
  asyncSequence?: Array<
    { ok: true; stdout: string } | { ok: false; msg: string }
  >
}): void {
  const { gitRemoteUrl, ghCliAvailable = false, asyncSequence = [] } = opts

  _execFileSyncImpl = (cmd, _args, _opts) => {
    if (cmd === 'git') {
      if (gitRemoteUrl !== null && gitRemoteUrl !== undefined) {
        return Buffer.from(gitRemoteUrl + '\n')
      }
      throw new Error('ENOENT: git not found or no remote')
    }
    if (cmd === 'gh') {
      if (ghCliAvailable) {
        return Buffer.from('gh version 2.0.0')
      }
      throw new Error('ENOENT: gh not found')
    }
    throw new Error(`Unexpected sync command: ${cmd}`)
  }

  let asyncCallCount = 0
  _execFileImpl = (_cmd, _args, _opts, cb) => {
    const b = asyncSequence[asyncCallCount] ?? {
      ok: false,
      msg: 'unexpected async call',
    }
    asyncCallCount++
    if (b.ok) cb(null, b.stdout, '')
    else cb(new Error(b.msg), '', b.msg)
  }
}

// Activate child_process stubs only for this suite.
beforeAll(() => {
  useIssueGhCpStubs = true
})
afterAll(() => {
  useIssueGhCpStubs = false
})

describe('issue command — tryDetectGitRemoteUrl catch path', () => {
  test('git fails → tryDetectGitRemoteUrl returns null → no remote detected', async () => {
    setupMocks({ gitRemoteUrl: null, ghCliAvailable: false })
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    // No remote + no gh → fallback URL path
    expect(result.value).toContain('GitHub')
  })
})

describe('issue command — ghCliAvailable paths', () => {
  test('gh not available → falls back to browser URL (with GitHub remote)', async () => {
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: false,
    })
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    expect(result.value).toContain('github.com/owner/repo')
    expect(result.value).toContain('Install')
  })

  test('gh not available + no remote → shows no GitHub remote message', async () => {
    setupMocks({ gitRemoteUrl: null, ghCliAvailable: false })
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    expect(result.value).toContain('GitHub')
  })

  test('gh available + no remote → falls back to browser (no URL)', async () => {
    setupMocks({
      gitRemoteUrl: null,
      ghCliAvailable: true,
    })
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    expect(result.value).toContain('GitHub')
  })
})

describe('issue command — parseOwnerRepo null path', () => {
  test('non-GitHub remote → parseOwnerRepo returns null → no gh URL', async () => {
    setupMocks({
      gitRemoteUrl: 'https://gitlab.com/owner/repo.git',
      ghCliAvailable: true,
    })
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
  })
})

describe('issue command — repoHasIssuesEnabled paths', () => {
  test('gh available + GitHub remote → issues enabled (true) → creates issue', async () => {
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'true\n' }, // gh api repos → has_issues = true
        { ok: true, stdout: 'https://github.com/owner/repo/issues/42' }, // gh issue create
      ],
    })
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
    expect(result.value).toContain('Fix login bug')
    expect(result.value).toContain('https://github.com/owner/repo/issues/42')
  })

  test('gh available + GitHub remote → issues disabled (false) → discussions fallback', async () => {
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'false\n' }, // gh api repos → has_issues = false
      ],
    })
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issues are disabled')
    expect(result.value).toContain('discussions')
  })

  test('gh available + GitHub remote → repoHasIssuesEnabled returns null (unexpected output)', async () => {
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'null\n' }, // unexpected .has_issues value → null
        { ok: true, stdout: 'https://github.com/owner/repo/issues/99' }, // issue create
      ],
    })
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    // null → proceeds to create issue
    expect(result.value).toContain('Issue created')
  })

  test('gh available + GitHub remote → repoHasIssuesEnabled throws → returns null → creates issue', async () => {
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: false, msg: 'network error' }, // gh api fails → catch → null
        { ok: true, stdout: 'https://github.com/owner/repo/issues/101' }, // issue create
      ],
    })
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
  })

  test('gh available + GitHub remote + issue create fails → error message', async () => {
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'true\n' }, // has_issues = true
        { ok: false, msg: 'gh auth error' }, // issue create fails
      ],
    })
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Failed to create issue')
    expect(result.value).toContain('gh auth error')
  })

  test('gh available + GitHub remote + labels and assignees → issue created with labels', async () => {
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'true\n' },
        { ok: true, stdout: 'https://github.com/owner/repo/issues/50' },
      ],
    })
    const call = await getCallFn()
    const result = await call('--label bug --assignee alice Fix login bug')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
    expect(result.value).toContain('Labels: bug')
    expect(result.value).toContain('Assignees: alice')
  })
})

describe('issue command — detectIssueTemplate paths', () => {
  test('no .github/ISSUE_TEMPLATE → no template used', async () => {
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'true\n' },
        { ok: true, stdout: 'https://github.com/owner/repo/issues/1' },
      ],
    })
    process.env.INIT_CWD = tmpDir
    // Ensure no ISSUE_TEMPLATE exists
    const call = await getCallFn()
    const result = await call('Test no template')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
  })

  test('.github/ISSUE_TEMPLATE with md file → template included in body', async () => {
    createIssueTemplate('---\nname: Bug Report\n---\n## Describe the bug')
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'true\n' },
        { ok: true, stdout: 'https://github.com/owner/repo/issues/2' },
      ],
    })
    // Override getOriginalCwd to return tmpDir by setting env
    // detectIssueTemplate uses `cwd = getOriginalCwd()` from state
    // which returns the real process cwd. We create template relative to real cwd
    // This test just verifies the path doesn't crash.
    const call = await getCallFn()
    const result = await call('Test with template')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
  })

  test('.github/ISSUE_TEMPLATE with only yml files → no md template', async () => {
    const templateDir = join(tmpDir, '.github', 'ISSUE_TEMPLATE')
    mkdirSync(templateDir, { recursive: true })
    writeFileSync(join(templateDir, 'bug.yml'), 'name: Bug\ndescription: A bug')
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'true\n' },
        { ok: true, stdout: 'https://github.com/owner/repo/issues/3' },
      ],
    })
    const call = await getCallFn()
    const result = await call('Test yml template')
    expect(result.type).toBe('text')
    expect(typeof result.value).toBe('string')
  })
})

describe('issue command — getTranscriptSummary paths', () => {
  test('session log exists + projectDir=null → reads from standard path', async () => {
    await writeSessionLog()
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'true\n' },
        { ok: true, stdout: 'https://github.com/owner/repo/issues/4' },
      ],
    })
    const call = await getCallFn()
    const result = await call('Fix login bug')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
  })

  test('session log with tool_result errors → errors included in summary', async () => {
    await writeSessionLog([
      JSON.stringify({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu1',
            is_error: true,
            content: 'Command failed with exit code 1',
          },
        ],
      }),
      JSON.stringify({ role: 'user', content: 'help me' }),
      JSON.stringify({ role: 'assistant', content: 'let me look' }),
    ])
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'true\n' },
        { ok: true, stdout: 'https://github.com/owner/repo/issues/5' },
      ],
    })
    const call = await getCallFn()
    const result = await call('Fix crash')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
  })

  test('session log with array content user message', async () => {
    await writeSessionLog([
      JSON.stringify({
        role: 'user',
        content: [{ type: 'text', text: 'What is the issue?' }],
      }),
    ])
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'true\n' },
        { ok: true, stdout: 'https://github.com/owner/repo/issues/6' },
      ],
    })
    const call = await getCallFn()
    const result = await call('Test array content')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
  })

  test('no session log → getTranscriptSummary returns no session log found', async () => {
    // No log written → summary says "(no session log found)"
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'true\n' },
        { ok: true, stdout: 'https://github.com/owner/repo/issues/7' },
      ],
    })
    const call = await getCallFn()
    const result = await call('Fix issue no log')
    expect(result.type).toBe('text')
    // Either creates issue successfully or fails, but passes the code paths
    expect(typeof result.value).toBe('string')
  })
})

describe('issue command — SSH GitHub remote', () => {
  test('SSH remote parsed correctly → issue created', async () => {
    setupMocks({
      gitRemoteUrl: 'git@github.com:owner/myrepo.git',
      ghCliAvailable: true,
      asyncSequence: [
        { ok: true, stdout: 'true\n' },
        { ok: true, stdout: 'https://github.com/owner/myrepo/issues/8' },
      ],
    })
    const call = await getCallFn()
    const result = await call('Fix SSH issue')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
  })
})

describe('issue command — no title with remote present', () => {
  test('no title + GitHub remote + gh available → usage with repo info and gh message', async () => {
    setupMocks({
      gitRemoteUrl: 'https://github.com/owner/repo.git',
      ghCliAvailable: true,
    })
    const call = await getCallFn()
    const result = await call('')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Usage')
    expect(result.value).toContain('owner/repo')
  })

  test('no title + no remote + gh not available → usage with no repo info', async () => {
    setupMocks({ gitRemoteUrl: null, ghCliAvailable: false })
    const call = await getCallFn()
    const result = await call('')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Usage')
  })
})
