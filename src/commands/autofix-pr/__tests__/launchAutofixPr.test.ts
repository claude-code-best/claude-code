import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import type { LocalJSXCommandCall } from '../../../types/command.js'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'

// ── Mock module-level side effects before any imports ──
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

// ── Core dependencies ──
type TeleportResult = { id: string; title: string } | null
const teleportMock = mock(
  (): Promise<TeleportResult> =>
    Promise.resolve({ id: 'session-123', title: 'Autofix PR: acme/myrepo#42' }),
)
mock.module('src/utils/teleport.js', () => ({
  teleportToRemote: teleportMock,
  // Stubs for other exports — Bun mock-module is process-level, so when
  // run combined with teleport-command tests these would otherwise leak as
  // undefined and crash. Keep here in sync with utils/teleport.tsx exports
  // that any other test in this process might import transitively.
  teleportResumeCodeSession: mock(() =>
    Promise.resolve({ branch: null, messages: [], error: null }),
  ),
  validateGitState: mock(() => Promise.resolve()),
  validateSessionRepository: mock(() => Promise.resolve({ ok: true })),
  checkOutTeleportedSessionBranch: mock(() =>
    Promise.resolve({ branchName: 'main', branchError: null }),
  ),
  processMessagesForTeleportResume: mock((m: unknown[]) => m),
  teleportFromSessionsAPI: mock(() =>
    Promise.resolve({ branch: null, messages: [], error: null }),
  ),
  teleportToRemoteWithErrorHandling: mock(() => Promise.resolve(null)),
}))

const registerMock = mock(() => ({
  taskId: 'task-abc',
  sessionId: 'session-123',
  cleanup: () => {},
}))
const checkEligibilityMock = mock(() =>
  Promise.resolve({ eligible: true as const }),
)
const getSessionUrlMock = mock(
  (id: string) => `https://claude.ai/session/${id}`,
)

mock.module('src/tasks/RemoteAgentTask/RemoteAgentTask.js', () => ({
  checkRemoteAgentEligibility: checkEligibilityMock,
  registerRemoteAgentTask: registerMock,
  getRemoteTaskSessionUrl: getSessionUrlMock,
  formatPreconditionError: (e: { type: string }) => e.type,
}))

const detectRepoMock = mock(() =>
  Promise.resolve({ host: 'github.com', owner: 'acme', name: 'myrepo' }),
)
mock.module('src/utils/detectRepository.js', () => ({
  detectCurrentRepositoryWithHost: detectRepoMock,
}))

const logEventMock = mock(() => {})
mock.module('src/services/analytics/index.js', () => ({
  logEvent: logEventMock,
  logEventAsync: mock(() => Promise.resolve()),
  _resetForTesting: mock(() => {}),
  attachAnalyticsSink: mock(() => {}),
  stripProtoFields: mock((v: unknown) => v),
}))

const noop = () => {}
mock.module('src/bootstrap/state.js', () => ({
  getSessionId: () => 'parent-session-id',
  getParentSessionId: () => undefined,
  // Additional exports needed by transitive imports (e.g. cwd.ts, sandbox-adapter.ts)
  getCwdState: () => '/mock/cwd',
  getOriginalCwd: () => '/mock/cwd',
  getSessionProjectDir: () => null,
  getProjectRoot: () => '/mock/project',
  setCwdState: noop,
  setOriginalCwd: noop,
  setLastAPIRequestMessages: noop,
  getIsNonInteractiveSession: () => false,
  addSlowOperation: noop,
}))

// Mock skillDetect so initialMessage is deterministic across CI environments
// (real existsSync would depend on .claude/skills/* in the working dir).
mock.module('src/commands/autofix-pr/skillDetect.js', () => ({
  detectAutofixSkills: () => [] as string[],
  formatSkillsHint: () => '',
}))

// ── Import SUT after mocks ──
let callAutofixPr: LocalJSXCommandCall
let clearActiveMonitor: () => void
let getActiveMonitor: () => unknown

beforeAll(async () => {
  const sut = await import('../launchAutofixPr.js')
  callAutofixPr = sut.callAutofixPr
  const state = await import('../monitorState.js')
  clearActiveMonitor = state.clearActiveMonitor
  getActiveMonitor = state.getActiveMonitor
})

// Helper context
function makeContext() {
  return { abortController: new AbortController() } as Parameters<
    typeof callAutofixPr
  >[1]
}

const onDone = mock((_result?: string, _opts?: unknown) => {})

beforeEach(() => {
  teleportMock.mockClear()
  registerMock.mockClear()
  detectRepoMock.mockClear()
  checkEligibilityMock.mockClear()
  logEventMock.mockClear()
  onDone.mockClear()
  clearActiveMonitor()
})

afterEach(() => {
  clearActiveMonitor()
})

describe('callAutofixPr', () => {
  test('start with PR number teleports with correct args', async () => {
    await callAutofixPr(onDone, makeContext(), '42')
    expect(teleportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'autofix_pr',
        useDefaultEnvironment: true,
        githubPr: { owner: 'acme', repo: 'myrepo', number: 42 },
        branchName: 'refs/pull/42/head',
        skipBundle: true,
      }),
    )
  })

  test('teleport call does NOT pass reuseOutcomeBranch (refs/pull/*/head is not pushable)', async () => {
    await callAutofixPr(onDone, makeContext(), '42')
    expect(teleportMock).toHaveBeenCalled()
    expect(teleportMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ reuseOutcomeBranch: expect.anything() }),
    )
  })

  test('start registers remote agent task with correct type', async () => {
    await callAutofixPr(onDone, makeContext(), '42')
    expect(registerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteTaskType: 'autofix-pr',
        isLongRunning: true,
      }),
    )
  })

  test('cross-repo syntax matching cwd repo is accepted', async () => {
    // detectRepo mock returns acme/myrepo by default — pass a matching
    // cross-repo arg and verify teleport is called normally.
    await callAutofixPr(onDone, makeContext(), 'acme/myrepo#999')
    expect(teleportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        githubPr: { owner: 'acme', repo: 'myrepo', number: 999 },
      }),
    )
  })

  test('cross-repo syntax NOT matching cwd repo is rejected with repo_mismatch', async () => {
    // detectRepo mock returns acme/myrepo; pass a mismatching cross-repo arg.
    await callAutofixPr(onDone, makeContext(), 'anthropics/claude-code#999')
    expect(teleportMock).not.toHaveBeenCalled()
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Cross-repo autofix is not supported/)
  })

  test('singleton lock blocks second start for different PR', async () => {
    await callAutofixPr(onDone, makeContext(), '42')
    onDone.mockClear()
    await callAutofixPr(onDone, makeContext(), '99')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/already monitoring/)
    expect(firstArg).toMatch(/Run \/autofix-pr stop first/)
  })

  test('same PR number while monitoring returns already monitoring message', async () => {
    await callAutofixPr(onDone, makeContext(), '42')
    onDone.mockClear()
    await callAutofixPr(onDone, makeContext(), '42')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Already monitoring/)
  })

  test('stop sub-command clears monitor and calls onDone', async () => {
    await callAutofixPr(onDone, makeContext(), '42')
    onDone.mockClear()
    await callAutofixPr(onDone, makeContext(), 'stop')
    expect(getActiveMonitor()).toBeNull()
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Stopped local monitoring/)
  })

  test('stop with no active monitor reports no active monitor', async () => {
    await callAutofixPr(onDone, makeContext(), 'stop')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/No active autofix monitor/)
  })

  test('freeform prompt returns not supported message', async () => {
    await callAutofixPr(onDone, makeContext(), 'please fix the failing test')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/not yet supported/)
  })

  test('teleport failure calls onDone with error', async () => {
    teleportMock.mockImplementationOnce(() => Promise.resolve(null))
    await callAutofixPr(onDone, makeContext(), '42')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Autofix PR failed/)
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_autofix_pr_result',
      expect.objectContaining({
        result: 'failed',
        error_code: 'session_create_failed',
      }),
    )
  })

  test('repo not on github.com calls onDone with error', async () => {
    detectRepoMock.mockImplementationOnce(() =>
      Promise.resolve({ host: 'bitbucket.org', owner: 'acme', name: 'myrepo' }),
    )
    await callAutofixPr(onDone, makeContext(), '42')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Autofix PR failed/)
  })

  test('eligibility check blocks non-no_remote_environment errors', async () => {
    checkEligibilityMock.mockImplementationOnce(() =>
      Promise.resolve({
        eligible: false,
        errors: [{ type: 'not_authenticated' }],
      } as unknown as { eligible: true }),
    )
    await callAutofixPr(onDone, makeContext(), '42')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Autofix PR failed/)
    expect(teleportMock).not.toHaveBeenCalled()
  })

  test('invalid args → invalid action message (lines 72-78)', async () => {
    // parseAutofixArgs('') returns { action: 'invalid', reason: 'empty' }
    await callAutofixPr(onDone, makeContext(), '')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Invalid args/)
    expect(teleportMock).not.toHaveBeenCalled()
  })

  test('cross-repo with pr_number_out_of_range → invalid action (lines 72-78)', async () => {
    // parsePrNumber('0') returns null → invalid action
    await callAutofixPr(onDone, makeContext(), 'acme/myrepo#0')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Invalid args/)
  })

  test('detectCurrentRepositoryWithHost throws → session_create_failed (lines 70-76)', async () => {
    detectRepoMock.mockImplementationOnce(() =>
      Promise.reject(new Error('git error: not a repository')),
    )
    await callAutofixPr(onDone, makeContext(), '42')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Autofix PR failed/)
    expect(teleportMock).not.toHaveBeenCalled()
  })

  test('detectCurrentRepositoryWithHost returns null → session_create_failed (lines 108-115)', async () => {
    detectRepoMock.mockImplementationOnce(() =>
      Promise.resolve(
        null as unknown as { host: string; owner: string; name: string },
      ),
    )
    await callAutofixPr(onDone, makeContext(), '42')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Autofix PR failed/)
    expect(firstArg).toMatch(/Cannot detect GitHub repo/)
    expect(teleportMock).not.toHaveBeenCalled()
  })

  test('teleportToRemote throws → teleport_failed error (lines 253-259)', async () => {
    teleportMock.mockImplementationOnce(() =>
      Promise.reject(new Error('network timeout')),
    )
    await callAutofixPr(onDone, makeContext(), '42')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Autofix PR failed/)
    expect(firstArg).toMatch(/teleport failed/)
    // Lock must be released
    const { getActiveMonitor } = await import('../monitorState.js')
    expect(getActiveMonitor()).toBeNull()
  })

  test('registerRemoteAgentTask throws → registration_failed error (lines 287-296)', async () => {
    registerMock.mockImplementationOnce(() => {
      throw new Error('registration error: session limit exceeded')
    })
    await callAutofixPr(onDone, makeContext(), '42')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Autofix PR failed/)
    expect(firstArg).toMatch(/task registration failed/)
    // Lock must be released
    const { getActiveMonitor } = await import('../monitorState.js')
    expect(getActiveMonitor()).toBeNull()
  })

  test('outer catch: checkRemoteAgentEligibility throws → outer catch (lines 315-323)', async () => {
    // checkRemoteAgentEligibility is awaited without an inner try/catch.
    // If it throws, the error bubbles to the outermost catch at lines 315-323.
    checkEligibilityMock.mockImplementationOnce(() =>
      Promise.reject(new Error('unexpected eligibility check error')),
    )
    await callAutofixPr(onDone, makeContext(), '42')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Autofix PR failed/)
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_autofix_pr_result',
      expect.objectContaining({ error_code: 'exception' }),
    )
  })

  test('captureFailMsg called via onBundleFail when teleport returns null (line 237)', async () => {
    // When teleportToRemote calls onBundleFail before returning null,
    // captureFailMsg captures the message and it's used in the !session branch.
    teleportMock.mockImplementationOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((opts: any) => {
        opts?.onBundleFail?.('bundle creation failed: disk full')
        return Promise.resolve(null)
      }) as unknown as Parameters<
        typeof teleportMock.mockImplementationOnce
      >[0],
    )
    await callAutofixPr(onDone, makeContext(), '42')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Autofix PR failed/)
    // The captured message should appear in the error
    expect(firstArg).toMatch(/bundle creation failed/)
  })

  test('eligibility check passes through no_remote_environment error', async () => {
    checkEligibilityMock.mockImplementationOnce(() =>
      Promise.resolve({
        eligible: false,
        errors: [{ type: 'no_remote_environment' }],
      } as unknown as { eligible: true }),
    )
    await callAutofixPr(onDone, makeContext(), '42')
    // Should still proceed — no_remote_environment is tolerated
    expect(teleportMock).toHaveBeenCalled()
  })
})

// Cover ../index.ts load() — placed in this test file so all the heavy mocks
// (teleport / detectRepository / RemoteAgentTask / bootstrap-state / analytics /
// skillDetect) are already registered when load() dynamically imports
// launchAutofixPr.js. Doing this in autofix-pr/__tests__/index.test.ts would
// pollute this file's mocks via cross-file ESM symbol binding.
describe('autofix-pr/index.ts load()', () => {
  test('load() resolves and exposes call function', async () => {
    const { default: cmd } = await import('../index.js')
    const loaded = await (
      cmd as unknown as { load: () => Promise<{ call: unknown }> }
    ).load()
    expect(loaded.call).toBeDefined()
    expect(typeof loaded.call).toBe('function')
  })
})
