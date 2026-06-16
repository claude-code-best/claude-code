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
  taskId: 'framework-task-id',
  sessionId: 'session-123',
  cleanup: () => {},
}))
const checkEligibilityMock = mock(() =>
  Promise.resolve({ eligible: true as const }),
)
const getSessionUrlMock = mock(
  (id: string) => `https://claude.ai/session/${id}`,
)
const registerCompletionHookMock = mock<
  (taskType: string, hook: (taskId: string, metadata?: unknown) => void) => void
>(() => {})
const registerCompletionCheckerMock = mock<
  (
    taskType: string,
    checker: (metadata?: unknown) => Promise<string | null>,
  ) => void
>(() => {})
const registerContentExtractorMock = mock<
  (taskType: string, extractor: (log: unknown[]) => string | null) => void
>(() => {})

mock.module('src/tasks/RemoteAgentTask/RemoteAgentTask.js', () => ({
  checkRemoteAgentEligibility: checkEligibilityMock,
  registerRemoteAgentTask: registerMock,
  registerCompletionHook: registerCompletionHookMock,
  registerCompletionChecker: registerCompletionCheckerMock,
  registerContentExtractor: registerContentExtractorMock,
  getRemoteTaskSessionUrl: getSessionUrlMock,
  formatPreconditionError: (e: { type: string }) => e.type,
}))

const fetchPrHeadShaMock = mock<
  (owner: string, repo: string, prNumber: number) => Promise<string | null>
>(() => Promise.resolve('sha-baseline-abc123'))

// Mock prFetch.ts (gh CLI spawn layer) — keeping the pure decision matrix
// in prOutcomeCheck.ts unmocked so its tests are unaffected by this file's
// process-global mock.module pollution.
mock.module('src/commands/autofix-pr/prFetch.js', () => ({
  fetchPrHeadSha: fetchPrHeadShaMock,
  checkPrAutofixOutcome: mock(() => Promise.resolve({ completed: false })),
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

// Regression suite for the taskId-mismatch latent bug + completion hook wiring.
// Before this fix, createAutofixTeammate generated a teammate UUID, that UUID
// was used to acquire the singleton monitor lock, and registerRemoteAgentTask
// generated a *different* framework taskId. When the framework eventually
// called clearActiveMonitor(frameworkTaskId) on natural completion, the guard
// failed (active.taskId !== frameworkTaskId) and the lock stayed acquired,
// blocking any subsequent /autofix-pr invocations in the same process.
describe('callAutofixPr · completion hook wiring (taskId mismatch regression)', () => {
  test('updateActiveMonitor swaps lock taskId to framework-assigned id after register', async () => {
    await callAutofixPr(onDone, makeContext(), '42')
    const monitor = getActiveMonitor() as { taskId: string } | null
    expect(monitor).not.toBeNull()
    // registerMock returns 'framework-task-id'; before the fix this would be
    // a teammate-generated random UUID instead.
    expect(monitor?.taskId).toBe('framework-task-id')
  })

  test('framework hook → clearActiveMonitor releases lock on natural completion', async () => {
    await callAutofixPr(onDone, makeContext(), '42')
    expect(getActiveMonitor()).not.toBeNull()

    // Find the hook the module registered at import time. We grab the last
    // call so re-imports across tests don't break this — only the most recent
    // registration is what the framework would invoke now.
    const calls = registerCompletionHookMock.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const lastCall = calls[calls.length - 1]
    expect(lastCall?.[0]).toBe('autofix-pr')
    const hook = lastCall?.[1] as (id: string, metadata?: unknown) => void
    expect(typeof hook).toBe('function')

    // Simulate the framework invoking the hook with the framework taskId
    // after a terminal transition. Before the fix this would no-op against
    // a lock keyed by the teammate UUID.
    hook('framework-task-id', { owner: 'acme', repo: 'myrepo', prNumber: 42 })
    expect(getActiveMonitor()).toBeNull()
  })

  test('subsequent /autofix-pr succeeds after framework hook clears the lock', async () => {
    await callAutofixPr(onDone, makeContext(), '42')
    // Simulate natural completion via the registered hook
    const calls = registerCompletionHookMock.mock.calls
    const hook = calls[calls.length - 1]?.[1] as (
      id: string,
      metadata?: unknown,
    ) => void
    hook('framework-task-id', { owner: 'acme', repo: 'myrepo', prNumber: 42 })

    onDone.mockClear()
    await callAutofixPr(onDone, makeContext(), '99')
    const firstArg = onDone.mock.calls[0]?.[0] as string
    // Should be the success path, not "already monitoring"
    expect(firstArg).not.toMatch(/already monitoring/i)
    expect(firstArg).toMatch(/Autofix launched/)
  })
})

// Phase 2: completionChecker wiring + initialHeadSha capture
describe('callAutofixPr · Phase 2 completionChecker integration', () => {
  test('completionChecker is registered at module load with autofix-pr type', () => {
    // The registration happens during the beforeAll dynamic import; just
    // verify the mock recorded a call. Filter by task type so any future
    // additional registrations elsewhere don't break this assertion.
    const calls = registerCompletionCheckerMock.mock.calls.filter(
      c => c[0] === 'autofix-pr',
    )
    expect(calls.length).toBeGreaterThan(0)
    const hook = calls[calls.length - 1]?.[1]
    expect(typeof hook).toBe('function')
  })

  test('callAutofixPr captures initialHeadSha via fetchPrHeadSha', async () => {
    fetchPrHeadShaMock.mockClear()
    await callAutofixPr(onDone, makeContext(), '42')
    expect(fetchPrHeadShaMock).toHaveBeenCalledWith('acme', 'myrepo', 42)
  })

  test('initialHeadSha is passed into remoteTaskMetadata on register', async () => {
    fetchPrHeadShaMock.mockImplementationOnce(() =>
      Promise.resolve('sha-from-launch'),
    )
    await callAutofixPr(onDone, makeContext(), '42')
    expect(registerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteTaskMetadata: expect.objectContaining({
          owner: 'acme',
          repo: 'myrepo',
          prNumber: 42,
          initialHeadSha: 'sha-from-launch',
        }),
      }),
    )
  })

  test('fetchPrHeadSha failure → metadata initialHeadSha undefined, launch still succeeds', async () => {
    fetchPrHeadShaMock.mockImplementationOnce(() =>
      Promise.reject(new Error('gh not installed')),
    )
    await callAutofixPr(onDone, makeContext(), '42')
    expect(registerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteTaskMetadata: expect.objectContaining({
          owner: 'acme',
          repo: 'myrepo',
          prNumber: 42,
          initialHeadSha: undefined,
        }),
      }),
    )
    // Launch must NOT fail just because SHA capture failed
    const firstArg = onDone.mock.calls[0]?.[0] as string
    expect(firstArg).toMatch(/Autofix launched/)
  })

  test('fetchPrHeadSha returning null → metadata initialHeadSha undefined', async () => {
    fetchPrHeadShaMock.mockImplementationOnce(() => Promise.resolve(null))
    await callAutofixPr(onDone, makeContext(), '42')
    expect(registerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteTaskMetadata: expect.objectContaining({
          initialHeadSha: undefined,
        }),
      }),
    )
  })
})

// Phase 2 (cont.): exercise the registered completionChecker arrow body
// directly. The earlier suite verifies it was registered but never invokes
// the arrow itself, leaving the throttle / metadata-guard / gh-CLI dispatch
// branches uncovered.
describe('callAutofixPr · Phase 2 completionChecker arrow body', () => {
  // Pull the most recent registered checker — beforeAll registers once at
  // module load; nothing else re-registers across this file's tests.
  function getChecker(): (metadata?: unknown) => Promise<string | null> {
    const calls = registerCompletionCheckerMock.mock.calls.filter(
      c => c[0] === 'autofix-pr',
    )
    const fn = calls[calls.length - 1]?.[1]
    if (typeof fn !== 'function') {
      throw new Error('completionChecker not registered')
    }
    return fn
  }

  test('returns null when metadata is undefined (early guard)', async () => {
    const checker = getChecker()
    expect(await checker(undefined)).toBeNull()
  })

  test('returns null when checkPrAutofixOutcome reports not completed', async () => {
    const { checkPrAutofixOutcome } = await import('../prFetch.js')
    ;(checkPrAutofixOutcome as ReturnType<typeof mock>).mockImplementationOnce(
      () => Promise.resolve({ completed: false }),
    )
    const checker = getChecker()
    // Distinct PR number to dodge the in-process throttle map carried over
    // from earlier tests.
    const result = await checker({
      owner: 'acme',
      repo: 'myrepo',
      prNumber: 1001,
    })
    expect(result).toBeNull()
  })

  test('returns the summary string when checkPrAutofixOutcome reports completed', async () => {
    const { checkPrAutofixOutcome } = await import('../prFetch.js')
    ;(checkPrAutofixOutcome as ReturnType<typeof mock>).mockImplementationOnce(
      () =>
        Promise.resolve({
          completed: true,
          summary: 'acme/myrepo#1002 merged. Autofix monitoring complete.',
        }),
    )
    const checker = getChecker()
    const result = await checker({
      owner: 'acme',
      repo: 'myrepo',
      prNumber: 1002,
    })
    expect(result).toBe('acme/myrepo#1002 merged. Autofix monitoring complete.')
  })

  test('passes initialHeadSha through to checkPrAutofixOutcome', async () => {
    const { checkPrAutofixOutcome } = await import('../prFetch.js')
    const checkMock = checkPrAutofixOutcome as ReturnType<typeof mock>
    checkMock.mockClear()
    checkMock.mockImplementationOnce(() =>
      Promise.resolve({ completed: false }),
    )
    const checker = getChecker()
    await checker({
      owner: 'acme',
      repo: 'myrepo',
      prNumber: 1003,
      initialHeadSha: 'sha-baseline-xyz',
    })
    expect(checkMock).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'myrepo',
      prNumber: 1003,
      initialHeadSha: 'sha-baseline-xyz',
    })
  })

  test('throttles back-to-back calls for the same PR within CHECK_INTERVAL_MS', async () => {
    const { checkPrAutofixOutcome } = await import('../prFetch.js')
    const checkMock = checkPrAutofixOutcome as ReturnType<typeof mock>
    checkMock.mockClear()
    checkMock.mockImplementation(() => Promise.resolve({ completed: false }))
    const checker = getChecker()
    const meta = { owner: 'acme', repo: 'myrepo', prNumber: 1004 }
    await checker(meta)
    // Second call within the 5s throttle window must short-circuit to null
    // without invoking the gh CLI layer again.
    const callCountAfterFirst = checkMock.mock.calls.length
    const result = await checker(meta)
    expect(result).toBeNull()
    expect(checkMock.mock.calls.length).toBe(callCountAfterFirst)
  })

  test('completionHook with metadata clears the throttle entry (re-launch can re-check immediately)', async () => {
    const { checkPrAutofixOutcome } = await import('../prFetch.js')
    const checkMock = checkPrAutofixOutcome as ReturnType<typeof mock>
    checkMock.mockClear()
    checkMock.mockImplementation(() => Promise.resolve({ completed: false }))
    const checker = getChecker()
    const meta = { owner: 'acme', repo: 'myrepo', prNumber: 1005 }
    await checker(meta) // populate throttle map

    // Invoke the registered completion hook with the same metadata so the
    // throttle entry is wiped, then verify the next checker call dispatches
    // gh CLI again instead of short-circuiting.
    const hookCalls = registerCompletionHookMock.mock.calls.filter(
      c => c[0] === 'autofix-pr',
    )
    const hook = hookCalls[hookCalls.length - 1]?.[1] as (
      id: string,
      metadata?: unknown,
    ) => void
    hook('any-task-id', meta)

    const callCountBefore = checkMock.mock.calls.length
    await checker(meta)
    expect(checkMock.mock.calls.length).toBe(callCountBefore + 1)
  })

  test('completionHook without metadata still clears the active monitor lock', async () => {
    // Lock is set via callAutofixPr; hook then invoked with undefined metadata
    // to exercise the `if (meta)` short-circuit branch (the lock-clear half
    // still has to run regardless of metadata presence).
    await callAutofixPr(onDone, makeContext(), '42')
    expect(getActiveMonitor()).not.toBeNull()
    const hookCalls = registerCompletionHookMock.mock.calls.filter(
      c => c[0] === 'autofix-pr',
    )
    const hook = hookCalls[hookCalls.length - 1]?.[1] as (
      id: string,
      metadata?: unknown,
    ) => void
    hook('framework-task-id', undefined)
    expect(getActiveMonitor()).toBeNull()
  })
})

// Phase 3: content extractor wiring + initialMessage tag instruction
describe('callAutofixPr · Phase 3 content extractor integration', () => {
  test('registerContentExtractor is called at module load with autofix-pr type', () => {
    const calls = registerContentExtractorMock.mock.calls.filter(
      c => c[0] === 'autofix-pr',
    )
    expect(calls.length).toBeGreaterThan(0)
    const extractor = calls[calls.length - 1]?.[1]
    expect(typeof extractor).toBe('function')
  })

  test('initialMessage instructs the remote agent to emit an <autofix-result> tag', async () => {
    await callAutofixPr(onDone, makeContext(), '42')
    // teleportMock's typed signature has no args, so calls[0] is a
    // zero-length tuple. We know teleportToRemote is invoked with one
    // options object, so double-cast through unknown to read the args.
    const calls = teleportMock.mock.calls as unknown as Array<
      [{ initialMessage?: string }]
    >
    const teleportArgs = calls[0]?.[0]
    expect(teleportArgs?.initialMessage).toContain('<autofix-result>')
    expect(teleportArgs?.initialMessage).toContain('</autofix-result>')
    expect(teleportArgs?.initialMessage).toContain('<ci-status>')
    expect(teleportArgs?.initialMessage).toContain('<summary>')
  })

  test('registered extractor returns string for valid log and null for empty', () => {
    const calls = registerContentExtractorMock.mock.calls.filter(
      c => c[0] === 'autofix-pr',
    )
    const extractor = calls[calls.length - 1]?.[1] as
      | ((log: unknown[]) => string | null)
      | undefined
    expect(extractor).toBeDefined()
    // Empty log → null
    expect(extractor?.([])).toBeNull()
    // Log with assistant text containing tag → returns it
    const logWithTag = [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: 'done\n<autofix-result><summary>x</summary></autofix-result>',
            },
          ],
        },
      },
    ]
    expect(extractor?.(logWithTag)).toContain('<autofix-result>')
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
