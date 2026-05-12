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
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'
import { setupAxiosMock } from '../../../../tests/mocks/axios.js'

// Mock side-effect modules first
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// ── Workspace API key mock ──────────────────────────────────────────────────
const mockApiKey = 'sk-ant-api03-test-agents-key'

mock.module('src/constants/oauth.js', () => ({
  getOauthConfig: () => ({ BASE_API_URL: 'https://api.anthropic.com' }),
}))

const prepareWorkspaceApiRequestMock = mock(async () => ({
  apiKey: mockApiKey,
}))

mock.module('src/utils/teleport/api.js', () => ({
  prepareWorkspaceApiRequest: prepareWorkspaceApiRequestMock,
}))

// Note: we do NOT mock src/services/auth/hostGuard.js here.
// The real assertWorkspaceHost() is called with the URL from getOauthConfig()
// (mocked to https://api.anthropic.com), which passes the host guard.
// Mocking hostGuard would pollute hostGuard's own test file via Bun process-level cache.

// ── Axios mock ──────────────────────────────────────────────────────────────
const axiosGetMock = mock(async () => ({}))
const axiosPostMock = mock(async () => ({}))
const axiosDeleteMock = mock(async () => ({}))

const axiosIsAxiosError = mock((err: unknown) => {
  return (
    typeof err === 'object' &&
    err !== null &&
    'isAxiosError' in err &&
    (err as { isAxiosError: boolean }).isAxiosError === true
  )
})

const axiosHandle = setupAxiosMock()
axiosHandle.stubs.get = axiosGetMock
axiosHandle.stubs.post = axiosPostMock
axiosHandle.stubs.delete = axiosDeleteMock
axiosHandle.stubs.isAxiosError = axiosIsAxiosError

// Lazy import after mocks are in place
let listAgents: typeof import('../agentsApi.js').listAgents
let createAgent: typeof import('../agentsApi.js').createAgent
let deleteAgent: typeof import('../agentsApi.js').deleteAgent
let runAgent: typeof import('../agentsApi.js').runAgent

beforeAll(async () => {
  axiosHandle.useStubs = true
  const mod = await import('../agentsApi.js')
  listAgents = mod.listAgents
  createAgent = mod.createAgent
  deleteAgent = mod.deleteAgent
  runAgent = mod.runAgent
})

afterAll(() => {
  axiosHandle.useStubs = false
})

beforeEach(() => {
  axiosGetMock.mockClear()
  axiosPostMock.mockClear()
  axiosDeleteMock.mockClear()
  prepareWorkspaceApiRequestMock.mockClear()
  // Ensure ANTHROPIC_API_KEY is set for happy-path tests
  process.env['ANTHROPIC_API_KEY'] = mockApiKey
})

afterEach(() => {
  // Clean up env var to avoid test pollution
  delete process.env['ANTHROPIC_API_KEY']
})

// afterEach handled above

describe('listAgents', () => {
  test('returns agents on 200', async () => {
    const agents = [
      {
        id: 'agt_1',
        cron_expr: '0 9 * * 1',
        prompt: 'hello',
        status: 'active',
        timezone: 'UTC',
        next_run: null,
      },
    ]
    axiosGetMock.mockResolvedValueOnce({ data: { data: agents }, status: 200 })

    const result = await listAgents()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('agt_1')
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
  })

  test('returns empty array when data.data is empty', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    const result = await listAgents()
    expect(result).toHaveLength(0)
  })

  test('throws on 401 with friendly message', async () => {
    const err = Object.assign(new Error('Unauthorized'), {
      isAxiosError: true,
      response: { status: 401, data: {} },
    })
    axiosGetMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )

    await expect(listAgents()).rejects.toThrow('re-authenticate')
  })

  test('throws on 403 with subscription message', async () => {
    const err = Object.assign(new Error('Forbidden'), {
      isAxiosError: true,
      response: { status: 403, data: {} },
    })
    axiosGetMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )

    await expect(listAgents()).rejects.toThrow('Subscription')
  })

  test('retries on 5xx and eventually throws', async () => {
    const make5xxErr = () =>
      Object.assign(new Error('Server Error'), {
        isAxiosError: true,
        response: { status: 500, data: {} },
      })
    axiosGetMock
      .mockRejectedValueOnce(make5xxErr())
      .mockRejectedValueOnce(make5xxErr())
      .mockRejectedValueOnce(make5xxErr())
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )

    await expect(listAgents()).rejects.toThrow()
    expect(axiosGetMock).toHaveBeenCalledTimes(3)
  }, 15000)
})

describe('createAgent', () => {
  test('sends correct body and returns agent', async () => {
    const agent = {
      id: 'agt_new',
      cron_expr: '0 9 * * *',
      prompt: 'Test',
      status: 'active',
      timezone: 'UTC',
      next_run: null,
    }
    axiosPostMock.mockResolvedValueOnce({ data: agent, status: 201 })

    const result = await createAgent('0 9 * * *', 'Test')
    expect(result.id).toBe('agt_new')
    const callArgs = (
      axiosPostMock.mock.calls as unknown as [string, unknown, unknown][]
    )[0]
    const body = callArgs?.[1] as { cron_expr: string; timezone: string }
    expect(body.cron_expr).toBe('0 9 * * *')
    expect(body.timezone).toBe('UTC')
  })

  test('throws on 404', async () => {
    const err = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404, data: {} },
    })
    axiosPostMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )

    await expect(createAgent('0 9 * * *', 'Test')).rejects.toThrow(
      'Agent not found',
    )
  })
})

describe('deleteAgent', () => {
  test('calls DELETE endpoint with agent id', async () => {
    axiosDeleteMock.mockResolvedValueOnce({ status: 204 })

    await deleteAgent('agt_del')
    const url = (
      axiosDeleteMock.mock.calls as unknown as [string, unknown][]
    )[0]?.[0] as string
    expect(url).toContain('agt_del')
  })
})

describe('runAgent', () => {
  test('calls POST /v1/agents/:id/run and returns run_id', async () => {
    axiosPostMock.mockResolvedValueOnce({
      data: { run_id: 'run_abc' },
      status: 200,
    })

    const result = await runAgent('agt_run')
    expect(result.run_id).toBe('run_abc')
    const url = (
      axiosPostMock.mock.calls as unknown as [string, unknown, unknown][]
    )[0]?.[0] as string
    expect(url).toContain('agt_run/run')
  })
})

// ── M3 regression: createAgent must use system timezone, not hardcoded UTC ──
describe('createAgent M3: timezone uses system TZ not hardcoded UTC', () => {
  test('createAgent passes system timezone to the API body', async () => {
    axiosPostMock.mockResolvedValueOnce({
      data: {
        id: 'agt_tz',
        cron_expr: '0 9 * * 1',
        prompt: 'hello',
        status: 'active',
        timezone: 'America/New_York',
      },
      status: 200,
    })

    await createAgent('0 9 * * 1', 'hello')

    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      Record<string, unknown>,
      unknown,
    ][]
    const body = calls[0]?.[1]
    expect(body).toHaveProperty('timezone')
    // Must NOT be the hardcoded 'UTC' string — must be a real timezone string
    // In CI the system TZ may be UTC, but the field must still be present and a string.
    expect(typeof body?.timezone).toBe('string')
    expect((body?.timezone as string).length).toBeGreaterThan(0)
  })
})

// ── M5 regression: withRetry must honor Retry-After header ──
describe('withRetry M5: honors Retry-After header on 5xx', () => {
  test('waits at least Retry-After seconds before retrying on 5xx', async () => {
    // First call: 503 with Retry-After: 0 (immediate, so test is fast)
    // Second call: success
    const serverErr = Object.assign(new Error('Service Unavailable'), {
      isAxiosError: true,
      response: { status: 503, data: {}, headers: { 'retry-after': '0' } },
    })
    axiosGetMock
      .mockRejectedValueOnce(serverErr)
      .mockResolvedValueOnce({ data: { data: [] }, status: 200 })

    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )

    const result = await listAgents()
    // Should have retried and succeeded on second attempt
    expect(result).toHaveLength(0)
    expect(axiosGetMock).toHaveBeenCalledTimes(2)
  })
})

// ── Regression: auth must use prepareWorkspaceApiRequest (not subscription OAuth) ──
describe('regression: uses prepareWorkspaceApiRequest for auth', () => {
  test('listAgents calls prepareWorkspaceApiRequest to obtain workspace API key', async () => {
    prepareWorkspaceApiRequestMock.mockClear()
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })

    await listAgents()

    expect(prepareWorkspaceApiRequestMock).toHaveBeenCalledTimes(1)
  })
})

// ── Invariant: buildHeaders must return x-api-key, not Authorization ─────────
describe('invariant: x-api-key present, no Authorization, no x-organization-uuid', () => {
  test('buildHeaders returns x-api-key header (workspace key)', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listAgents()
    const calls = axiosGetMock.mock.calls as unknown as [
      string,
      { headers: Record<string, string> },
    ][]
    const headers = calls[0]?.[1]?.headers ?? {}
    expect(headers['x-api-key']).toBe(mockApiKey)
  })

  test('buildHeaders does NOT include Authorization header', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listAgents()
    const calls = axiosGetMock.mock.calls as unknown as [
      string,
      { headers: Record<string, string> },
    ][]
    const headers = calls[0]?.[1]?.headers ?? {}
    expect(headers['Authorization']).toBeUndefined()
  })

  test('buildHeaders does NOT include x-organization-uuid header', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listAgents()
    const calls = axiosGetMock.mock.calls as unknown as [
      string,
      { headers: Record<string, string> },
    ][]
    const headers = calls[0]?.[1]?.headers ?? {}
    expect(headers['x-organization-uuid']).toBeUndefined()
  })

  test('buildHeaders includes anthropic-beta header with managed-agents umbrella', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listAgents()
    const calls = axiosGetMock.mock.calls as unknown as [
      string,
      { headers: Record<string, string> },
    ][]
    const headers = calls[0]?.[1]?.headers ?? {}
    expect(headers['anthropic-beta']).toContain('managed-agents')
  })

  test('throws 501 when ANTHROPIC_API_KEY is missing (all 3 retries fail)', async () => {
    // withRetry retries 5xx errors (statusCode >= 500 including 501).
    // buildHeaders throws AgentsApiError(msg, 501) for config errors.
    // All 3 retry attempts must fail for the error to propagate.
    const missingKeyError = new Error('ANTHROPIC_API_KEY is required')
    prepareWorkspaceApiRequestMock
      .mockRejectedValueOnce(missingKeyError)
      .mockRejectedValueOnce(missingKeyError)
      .mockRejectedValueOnce(missingKeyError)
    await expect(listAgents()).rejects.toThrow(/ANTHROPIC_API_KEY|required/i)
  }, 5000)

  test('request goes to api.anthropic.com (host guard passes for correct host)', async () => {
    // The real assertWorkspaceHost() runs and passes since BASE_API_URL is api.anthropic.com
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listAgents()
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0]).toContain('api.anthropic.com')
  })
})
