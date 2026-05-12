/**
 * Coverage tests for detectIssueTemplate paths.
 *
 * detectIssueTemplate uses getOriginalCwd() to find .github/ISSUE_TEMPLATE.
 * These tests create the template directory in the REAL project CWD and clean
 * up after each test.
 *
 * IMPORTANT: No state mock is used — this avoids global mock contamination.
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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ── child_process mock ──
let _execFileSyncImplT: (
  cmd: string,
  args: string[],
  opts?: unknown,
) => Buffer = () => Buffer.from('')
let _execFileImplT: (
  cmd: string,
  args: string[],
  opts: unknown,
  cb: (err: Error | null, stdout: string, stderr: string) => void,
) => void = (_cmd, _args, _opts, cb) => cb(null, '', '')

const execFileSyncMockT = (
  cmd: string,
  args: string[],
  opts?: unknown,
): Buffer => _execFileSyncImplT(cmd, args, opts)
const execFileMockT = (
  cmd: string,
  args: string[],
  opts: unknown,
  cb: (err: Error | null, stdout: string, stderr: string) => void,
) => _execFileImplT(cmd, args, opts, cb)

;(execFileMockT as unknown as Record<symbol, unknown>)[
  promisify.custom as symbol
] = (
  cmd: string,
  args: string[],
  opts: unknown,
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) =>
    _execFileImplT(cmd, args, opts, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    }),
  )

// Spread real child_process + flag-gated stub (see share-gh.test.ts for the
// promisify.custom rationale).
let useIssueTemplateCpStubs = false
const wrappedIssueTemplateExecFile = ((...args: unknown[]) =>
  useIssueTemplateCpStubs
    ? (execFileMockT as (...a: unknown[]) => unknown)(...args)
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('node:child_process').execFile as (...a: unknown[]) => unknown)(
        ...args,
      )) as unknown as Record<symbol, unknown> & ((...a: unknown[]) => unknown)
;(wrappedIssueTemplateExecFile as Record<symbol, unknown>)[
  promisify.custom as symbol
] = (
  cmd: string,
  args: string[],
  opts: unknown,
): Promise<{ stdout: string; stderr: string }> => {
  if (useIssueTemplateCpStubs) {
    return new Promise((resolve, reject) =>
      _execFileImplT(cmd, args, opts, (err, stdout, stderr) =>
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
    execFile: wrappedIssueTemplateExecFile as typeof real.execFile,
    execFileSync: ((...args: unknown[]) =>
      useIssueTemplateCpStubs
        ? (execFileSyncMockT as (...a: unknown[]) => unknown)(...args)
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

// Re-mock bootstrap/state.js so getOriginalCwd points at the real process
// cwd regardless of any prior test file's static state mock (e.g.
// launchAutofixPr.test.ts pinning '/mock/cwd'). Without this override, in
// the full suite detectIssueTemplate would see '/mock/cwd' and skip the
// template loading body (lines 114-129).
import { stateMock as _baseStateMockT } from '../../../../tests/mocks/state'
let _dynamicCwdT: string = process.cwd()
mock.module('src/bootstrap/state.js', () => ({
  ..._baseStateMockT(),
  getSessionId: () => 'issue-tpl-session-id',
  getSessionProjectDir: () => null,
  getOriginalCwd: () => _dynamicCwdT,
  setOriginalCwd: (c: string) => {
    _dynamicCwdT = c
  },
}))

// ── State ──
let tmpDir: string
let claudeDir: string

// The real CWD where the issue command will look for .github/ISSUE_TEMPLATE
// We determine this at import time (stable throughout test run)
const realCwd = process.cwd()
// We track whether we created the template dir so we can clean it up
let createdTemplatePath: string | null = null

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'issue-tpl-test-'))
  claudeDir = join(tmpDir, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = claudeDir
  createdTemplatePath = null

  // Default: git → GitHub remote, gh → available, async → issues true + create OK
  let n = 0
  _execFileSyncImplT = (cmd, _args, _opts) => {
    if (cmd === 'git') return Buffer.from('https://github.com/owner/repo.git\n')
    if (cmd === 'gh') return Buffer.from('gh version 2.0.0')
    return Buffer.from('')
  }
  _execFileImplT = (_cmd, _args, _opts, cb) => {
    n++
    if (n === 1) cb(null, 'true\n', '')
    else cb(null, 'https://github.com/owner/repo/issues/20', '')
  }
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
  // Clean up any template dir we created in the real CWD
  if (createdTemplatePath && existsSync(createdTemplatePath)) {
    rmSync(createdTemplatePath, { recursive: true, force: true })
  }
  createdTemplatePath = null
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

/**
 * Creates .github/ISSUE_TEMPLATE in the REAL CWD.
 * Registers for cleanup in afterEach.
 */
function createTemplateInCwd(files: Record<string, string>): string {
  const templateDir = join(realCwd, '.github', 'ISSUE_TEMPLATE')
  mkdirSync(templateDir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(templateDir, name), content)
  }
  // Track the ISSUE_TEMPLATE dir for cleanup — never delete the whole .github/
  // as it may contain workflows, settings, or other project config.
  createdTemplatePath = templateDir
  return templateDir
}

// Activate child_process stubs only for this suite.
beforeAll(() => {
  useIssueTemplateCpStubs = true
})
afterAll(() => {
  useIssueTemplateCpStubs = false
})

describe('issue command — detectIssueTemplate template paths', () => {
  test('md template with front-matter → front-matter stripped', async () => {
    createTemplateInCwd({
      'bug.md':
        '---\nname: Bug Report\nabout: A bug\n---\n## Describe the bug\n\nDetails.',
    })
    const call = await getCallFn()
    const result = await call('Fix bug with template')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
  })

  test('md template without front-matter → content returned as-is', async () => {
    createTemplateInCwd({
      'feature.md': '## Feature Request\n\nDescribe the feature.',
    })
    const call = await getCallFn()
    const result = await call('Add feature')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
  })

  test('yml file only → mdFile not found → no template (null)', async () => {
    createTemplateInCwd({
      'bug.yml': 'name: Bug\ndescription: Describe the bug.',
    })
    const call = await getCallFn()
    const result = await call('Fix yml-only template issue')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
  })

  test('md template stripped to empty → null (stripped || null)', async () => {
    // Front-matter only, empty body after stripping
    createTemplateInCwd({
      'empty.md': '---\nname: Empty\nabout: empty\n---',
    })
    const call = await getCallFn()
    const result = await call('Empty template test')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Issue created')
  })
})
