import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { LogOption } from '../../../types/logs.js'
import type { LocalJSXCommandCall } from '../../../types/command.js'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'

// ── Mock module-level side effects BEFORE any imports ──
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({
  feature: (_name: string) => false,
}))

// ── Teleport utilities ──
const validateGitStateMock = mock(() => Promise.resolve())
const teleportResumeMock = mock(
  (_id: string, _onProgress?: (stage: string) => void) =>
    Promise.resolve({ log: [], branch: 'main' }),
)

mock.module('src/utils/teleport.js', () => ({
  validateGitState: validateGitStateMock,
  teleportResumeCodeSession: teleportResumeMock,
  processMessagesForTeleportResume: mock(
    (_msgs: unknown[], _err: unknown) => [],
  ),
  checkOutTeleportedSessionBranch: mock(() =>
    Promise.resolve({ branchName: 'main', branchError: null }),
  ),
  validateSessionRepository: mock(() => Promise.resolve({ status: 'match' })),
  teleportToRemoteWithErrorHandling: mock(() => Promise.resolve(null)),
  teleportFromSessionsAPI: mock(() =>
    Promise.resolve({ log: [], branch: 'main' }),
  ),
  pollRemoteSessionEvents: mock(() => Promise.resolve([])),
  teleportToRemote: mock(() => Promise.resolve(null)),
  archiveRemoteSession: mock(() => Promise.resolve()),
}))

// ── Sessions API mock ──
const fetchSessionsMock = mock(() =>
  Promise.resolve([
    {
      id: 'session_01ABC',
      title: 'Test session',
      status: 'idle',
      created_at: '2026-04-29',
    },
  ]),
)
mock.module('src/utils/teleport/api.js', () => ({
  fetchCodeSessionsFromSessionsAPI: fetchSessionsMock,
}))

// ── Session storage ──
const mockLog: LogOption = {
  date: '2026-04-29',
  messages: [],
  value: 0,
  created: new Date(),
  modified: new Date(),
  firstPrompt: '',
  messageCount: 0,
  isSidechain: false,
}
const getLastSessionLogMock = mock(() => Promise.resolve(mockLog))
mock.module('src/utils/sessionStorage.js', () => ({
  getLastSessionLog: getLastSessionLogMock,
}))

// ── Analytics ──
const logEventMock = mock(() => {})
mock.module('src/services/analytics/index.js', () => ({
  logEvent: logEventMock,
  logEventAsync: mock(() => Promise.resolve()),
  _resetForTesting: mock(() => {}),
  attachAnalyticsSink: mock(() => {}),
  stripProtoFields: mock((v: unknown) => v),
}))

// ── Import SUT after mocks ──
let callTeleport: LocalJSXCommandCall

beforeAll(async () => {
  const sut = await import('../launchTeleport.js')
  callTeleport = sut.callTeleport
})

// ── Test helpers ──
const onDone = mock((_result?: string, _opts?: unknown) => {})
const resumeMockFn = mock(() => Promise.resolve())

function makeContext(withResume = true) {
  return {
    abortController: new AbortController(),
    resume: withResume ? resumeMockFn : undefined,
  } as unknown as Parameters<typeof callTeleport>[1]
}

function getLoggedEvents(): string[] {
  return (logEventMock.mock.calls as unknown as [string, unknown][]).map(
    c => c[0],
  )
}

beforeEach(() => {
  validateGitStateMock.mockClear()
  teleportResumeMock.mockClear()
  getLastSessionLogMock.mockClear()
  fetchSessionsMock.mockClear()
  logEventMock.mockClear()
  onDone.mockClear()
  resumeMockFn.mockClear()
  // Restore default happy-path implementations
  validateGitStateMock.mockImplementation(() => Promise.resolve())
  teleportResumeMock.mockImplementation(
    (_id: string, _onProgress?: (stage: string) => void) =>
      Promise.resolve({ log: [], branch: 'main' }),
  )
  getLastSessionLogMock.mockImplementation(() => Promise.resolve(mockLog))
  fetchSessionsMock.mockImplementation(() =>
    Promise.resolve([
      {
        id: 'session_01ABC',
        title: 'Test session',
        status: 'idle',
        created_at: '2026-04-29',
      },
    ]),
  )
})

describe('callTeleport', () => {
  test('empty args: fetches sessions list and shows picker', async () => {
    await callTeleport(onDone, makeContext(), '  ')
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/Available sessions/)
    expect(validateGitStateMock).not.toHaveBeenCalled()
    expect(teleportResumeMock).not.toHaveBeenCalled()
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_started')
    expect(events).toContain('tengu_teleport_source_decision')
  })

  test('empty args + sessions fetch fails with generic error → fetch_fail event', async () => {
    fetchSessionsMock.mockImplementationOnce(() =>
      Promise.reject(new Error('network timeout')),
    )
    await callTeleport(onDone, makeContext(), '')
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/failed to fetch sessions/)
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_events_fetch_fail')
  })

  test('empty args + sessions fetch fails with 401/forbidden → fetch_forbidden event', async () => {
    fetchSessionsMock.mockImplementationOnce(() =>
      Promise.reject(new Error('403 Forbidden: access denied')),
    )
    await callTeleport(onDone, makeContext(), '')
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/permission denied/)
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_events_fetch_forbidden')
  })

  test('empty args + sessions fetch fails with 404/not-found → fetch_not_found event', async () => {
    fetchSessionsMock.mockImplementationOnce(() =>
      Promise.reject(new Error('404 Not Found')),
    )
    await callTeleport(onDone, makeContext(), '')
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/404/)
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_events_fetch_not_found')
  })

  test('empty args + sessions fetch fails with token/unauthorized → bad_token event', async () => {
    fetchSessionsMock.mockImplementationOnce(() =>
      Promise.reject(new Error('unauthorized: invalid token')),
    )
    await callTeleport(onDone, makeContext(), '')
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/authentication error/)
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_error_bad_token')
  })

  test('empty args + empty sessions list → teleport_null event', async () => {
    fetchSessionsMock.mockImplementationOnce(() => Promise.resolve([]))
    await callTeleport(onDone, makeContext(), '')
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/No active sessions/)
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_null')
  })

  test('empty args + exactly PICKER_PAGE_CAP sessions → page_cap event', async () => {
    // 20 sessions triggers the page cap log
    const sessions = Array.from({ length: 20 }, (_, i) => ({
      id: `session_${i}`,
      title: `Session ${i}`,
      status: 'idle',
      created_at: '2026-04-29',
    }))
    fetchSessionsMock.mockImplementationOnce(() => Promise.resolve(sessions))
    await callTeleport(onDone, makeContext(), '')
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_page_cap')
  })

  test('--print flag with no session id → shows picker in print mode', async () => {
    await callTeleport(onDone, makeContext(), '--print')
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/Available sessions/)
  })

  test('short non-UUID session id is rejected without calling teleport', async () => {
    await callTeleport(onDone, makeContext(), 'abc')
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/Invalid session id/)
    expect(validateGitStateMock).not.toHaveBeenCalled()
    expect(teleportResumeMock).not.toHaveBeenCalled()
  })

  test('valid session id + git unclean → reports error, skips resume', async () => {
    validateGitStateMock.mockImplementation(() =>
      Promise.reject(
        new Error(
          'Git working directory is not clean. Please commit or stash your changes.',
        ),
      ),
    )
    await callTeleport(
      onDone,
      makeContext(),
      '12345678-abcd-ef01-2345-6789abcdef01',
    )
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/Cannot teleport/)
    expect(firstArg).toMatch(/not clean/)
    expect(teleportResumeMock).not.toHaveBeenCalled()
  })

  test('valid session id + clean git → calls teleportResumeCodeSession + context.resume', async () => {
    const ctx = makeContext(true)
    await callTeleport(onDone, ctx, '12345678-abcd-ef01-2345-6789abcdef01')
    expect(teleportResumeMock).toHaveBeenCalledWith(
      '12345678-abcd-ef01-2345-6789abcdef01',
      expect.any(Function),
    )
    expect(resumeMockFn).toHaveBeenCalledWith(
      '12345678-abcd-ef01-2345-6789abcdef01',
      mockLog,
      'slash_command_session_id',
    )
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_resume_session')
    expect(events).toContain('tengu_teleport_first_message_success')
  })

  test('progress callback is invoked during teleportResumeCodeSession (line 225)', async () => {
    teleportResumeMock.mockImplementationOnce(
      (_id: string, onProgress?: (stage: string) => void) => {
        onProgress?.('fetching_session')
        return Promise.resolve({ log: [], branch: 'main' })
      },
    )
    const ctx = makeContext(true)
    await callTeleport(onDone, ctx, '12345678-abcd-ef01-2345-6789abcdef01')
    expect(resumeMockFn).toHaveBeenCalled()
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_resume_session')
  })

  test('teleportResumeCodeSession throws not-found error → fires session_not_found_ event', async () => {
    teleportResumeMock.mockImplementation(() =>
      Promise.reject(new Error('Session not found')),
    )
    await callTeleport(
      onDone,
      makeContext(),
      '12345678-abcd-ef01-2345-6789abcdef01',
    )
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/Teleport failed/)
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_error_session_not_found_')
  })

  test('teleportResumeCodeSession throws repo mismatch → fires repo_mismatch event', async () => {
    teleportResumeMock.mockImplementation(() =>
      Promise.reject(new Error('repo mismatch: expected acme/foo')),
    )
    await callTeleport(
      onDone,
      makeContext(),
      '12345678-abcd-ef01-2345-6789abcdef01',
    )
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_error_repo_mismatch_sessions_api')
  })

  test('git dir error → fires tengu_teleport_error_repo_not_in_git_dir_ event', async () => {
    teleportResumeMock.mockImplementationOnce(() =>
      Promise.reject(new Error('not in git directory: /tmp/test')),
    )
    await callTeleport(
      onDone,
      makeContext(),
      '12345678-abcd-ef01-2345-6789abcdef01',
    )
    const events = getLoggedEvents()
    expect(events).toContain(
      'tengu_teleport_error_repo_not_in_git_dir_sessions_api',
    )
  })

  test('cancelled error → fires tengu_teleport_cancelled event', async () => {
    teleportResumeMock.mockImplementationOnce(() =>
      Promise.reject(new Error('operation was cancelled')),
    )
    await callTeleport(
      onDone,
      makeContext(),
      '12345678-abcd-ef01-2345-6789abcdef01',
    )
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_cancelled')
  })

  test('token/unauthorized error → fires bad_token event', async () => {
    teleportResumeMock.mockImplementationOnce(() =>
      Promise.reject(new Error('401 unauthorized: bad token')),
    )
    await callTeleport(
      onDone,
      makeContext(),
      '12345678-abcd-ef01-2345-6789abcdef01',
    )
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_error_bad_token')
  })

  test('status/4xx error → fires bad_status event', async () => {
    teleportResumeMock.mockImplementationOnce(() =>
      Promise.reject(new Error('500 internal server error bad status')),
    )
    await callTeleport(
      onDone,
      makeContext(),
      '12345678-abcd-ef01-2345-6789abcdef01',
    )
    const events = getLoggedEvents()
    expect(events).toContain('tengu_teleport_error_bad_status')
  })

  test('valid session id without context.resume → fallback message', async () => {
    const ctx = makeContext(false) // no resume callback
    await callTeleport(onDone, ctx, '12345678-abcd-ef01-2345-6789abcdef01')
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/did not provide a resume callback/)
  })

  test('valid session id without context.resume + print mode → success message', async () => {
    const ctx = makeContext(false)
    await callTeleport(
      onDone,
      ctx,
      '--print 12345678-abcd-ef01-2345-6789abcdef01',
    )
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(typeof firstArg).toBe('string')
  })

  test('log not found after resume → fallback message', async () => {
    getLastSessionLogMock.mockImplementation(() =>
      Promise.resolve(null as unknown as LogOption),
    )
    await callTeleport(
      onDone,
      makeContext(),
      '12345678-abcd-ef01-2345-6789abcdef01',
    )
    const firstArg = onDone.mock.calls[0]?.[0] as string | undefined
    expect(firstArg).toMatch(/local log was not found/)
  })
})
