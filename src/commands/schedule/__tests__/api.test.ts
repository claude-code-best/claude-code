/**
 * Regression tests for triggersApi.ts
 *
 * Key invariants under test:
 *   - updateTrigger MUST use POST, not PATCH (binary literal: update: POST /v1/code/triggers/{id})
 *   - All CRUD endpoints hit /v1/code/triggers (not /v1/agents)
 *   - 401/403/404/429/5xx classified correctly
 *   - withRetry retries only 5xx, not 4xx
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
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'
import { setupAxiosMock } from '../../../../tests/mocks/axios.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// ── Auth / OAuth mocks ──────────────────────────────────────────────────────
const mockAccessToken = 'test-token-triggers'
const mockOrgUUID = 'org-uuid-triggers'

mock.module('src/utils/auth.js', () => ({
  getClaudeAIOAuthTokens: () => ({ accessToken: mockAccessToken }),
}))
mock.module('src/services/oauth/client.js', () => ({
  getOrganizationUUID: async () => mockOrgUUID,
}))
mock.module('src/constants/oauth.js', () => ({
  getOauthConfig: () => ({ BASE_API_URL: 'https://api.anthropic.com' }),
}))
mock.module('src/utils/teleport/api.js', () => ({
  getOAuthHeaders: (token: string) => ({
    Authorization: `Bearer ${token}`,
    'anthropic-version': '2023-06-01',
  }),
  prepareApiRequest: async () => ({
    accessToken: mockAccessToken,
    orgUUID: mockOrgUUID,
  }),
  prepareWorkspaceApiRequest: async () => ({
    apiKey: 'test-workspace-key',
  }),
}))
mock.module('src/services/auth/hostGuard.ts', () => ({
  assertSubscriptionBaseUrl: () => {},
  assertWorkspaceHost: () => {},
  assertNoAnthropicEnvForOpenAI: () => {},
}))

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

// ── Lazy import after mocks ─────────────────────────────────────────────────
// Use the src/ alias path (same canonical key used in launchSchedule.test.ts mock)
// so that if launchSchedule.test.ts runs first and replaces the mock, this file's
// own beforeAll re-registers the real implementation under that same key.
let listTriggers: typeof import('../triggersApi.js').listTriggers
let getTrigger: typeof import('../triggersApi.js').getTrigger
let createTrigger: typeof import('../triggersApi.js').createTrigger
let updateTrigger: typeof import('../triggersApi.js').updateTrigger
let deleteTrigger: typeof import('../triggersApi.js').deleteTrigger
let runTrigger: typeof import('../triggersApi.js').runTrigger

beforeAll(async () => {
  axiosHandle.useStubs = true
  const mod = await import('../triggersApi.js')
  listTriggers = mod.listTriggers
  getTrigger = mod.getTrigger
  createTrigger = mod.createTrigger
  updateTrigger = mod.updateTrigger
  deleteTrigger = mod.deleteTrigger
  runTrigger = mod.runTrigger
})

afterAll(() => {
  axiosHandle.useStubs = false
})

beforeEach(() => {
  axiosGetMock.mockClear()
  axiosPostMock.mockClear()
  axiosDeleteMock.mockClear()
})

afterEach(() => {})

// ── REGRESSION: updateTrigger MUST use POST not PATCH ──────────────────────
describe('updateTrigger regression: must use POST not PATCH', () => {
  test('updateTrigger calls POST /v1/code/triggers/{id} (not PATCH)', async () => {
    const updated = {
      trigger_id: 'trg_upd',
      cron_expression: '0 10 * * *',
      enabled: true,
      prompt: 'Updated prompt',
    }
    axiosPostMock.mockResolvedValueOnce({ data: updated, status: 200 })

    await updateTrigger('trg_upd', { enabled: false })

    // POST must have been called
    expect(axiosPostMock).toHaveBeenCalledTimes(1)
    // axiosPatchMock must NOT have been called (no patch mock registered)
    // The URL must contain the trigger id
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      unknown,
      unknown,
    ][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('trg_upd')
    expect(url).toContain('/v1/code/triggers/')
    // Verify the URL does NOT end in /run (which is the runTrigger endpoint)
    expect(url).not.toMatch(/\/run$/)
  })
})

// ── listTriggers ──────────────────────────────────────────────────────────
describe('listTriggers', () => {
  test('returns triggers on 200', async () => {
    const triggers = [
      {
        trigger_id: 'trg_1',
        cron_expression: '0 9 * * 1',
        enabled: true,
        prompt: 'Weekly standup',
        agent_id: 'agt_1',
        next_run: '2026-05-05T09:00:00Z',
      },
    ]
    axiosGetMock.mockResolvedValueOnce({
      data: { data: triggers },
      status: 200,
    })

    const result = await listTriggers()
    expect(result).toHaveLength(1)
    expect(result[0]!.trigger_id).toBe('trg_1')
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0]).toContain('/v1/code/triggers')
  })

  test('returns empty array on empty response', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    const result = await listTriggers()
    expect(result).toHaveLength(0)
  })

  test('throws 401 with friendly message', async () => {
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
    await expect(listTriggers()).rejects.toThrow(/login|authenticate/i)
  })

  test('throws 403 with subscription message', async () => {
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
    await expect(listTriggers()).rejects.toThrow(/subscription|pro|max|team/i)
  })

  test('retries on 5xx and eventually throws', async () => {
    const make5xx = () =>
      Object.assign(new Error('Server Error'), {
        isAxiosError: true,
        response: { status: 500, data: {} },
      })
    axiosGetMock
      .mockRejectedValueOnce(make5xx())
      .mockRejectedValueOnce(make5xx())
      .mockRejectedValueOnce(make5xx())
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    await expect(listTriggers()).rejects.toThrow()
    expect(axiosGetMock).toHaveBeenCalledTimes(3)
  }, 15000)

  test('honors Retry-After header on 5xx', async () => {
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
    const result = await listTriggers()
    expect(result).toHaveLength(0)
    expect(axiosGetMock).toHaveBeenCalledTimes(2)
  })
})

// ── getTrigger ──────────────────────────────────────────────────────────
describe('getTrigger', () => {
  test('calls GET /v1/code/triggers/{id}', async () => {
    const trigger = {
      trigger_id: 'trg_get',
      cron_expression: '0 8 * * *',
      enabled: true,
      prompt: 'Daily report',
    }
    axiosGetMock.mockResolvedValueOnce({ data: trigger, status: 200 })

    const result = await getTrigger('trg_get')
    expect(result.trigger_id).toBe('trg_get')
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0]).toContain('trg_get')
  })

  test('throws 404 with not found message', async () => {
    const err = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404, data: {} },
    })
    axiosGetMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    await expect(getTrigger('nonexistent')).rejects.toThrow(/not found/i)
  })
})

// ── createTrigger ─────────────────────────────────────────────────────────
describe('createTrigger', () => {
  test('sends POST /v1/code/triggers with cron_expression and prompt', async () => {
    const trigger = {
      trigger_id: 'trg_new',
      cron_expression: '0 9 * * *',
      enabled: true,
      prompt: 'Create daily report',
    }
    axiosPostMock.mockResolvedValueOnce({ data: trigger, status: 201 })

    const result = await createTrigger({
      cron_expression: '0 9 * * *',
      prompt: 'Create daily report',
    })
    expect(result.trigger_id).toBe('trg_new')
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      unknown,
      unknown,
    ][]
    const url = calls[0]?.[0] as string
    const body = calls[0]?.[1] as Record<string, unknown>
    expect(url).toContain('/v1/code/triggers')
    expect(url).not.toContain('/v1/agents')
    expect(body.cron_expression).toBe('0 9 * * *')
    expect(body.prompt).toBe('Create daily report')
  })
})

// ── deleteTrigger ─────────────────────────────────────────────────────────
describe('deleteTrigger', () => {
  test('calls DELETE /v1/code/triggers/{id}', async () => {
    axiosDeleteMock.mockResolvedValueOnce({ status: 204 })

    await deleteTrigger('trg_del')
    const calls = axiosDeleteMock.mock.calls as unknown as [string, unknown][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('trg_del')
    expect(url).toContain('/v1/code/triggers/')
  })
})

// ── runTrigger ───────────────────────────────────────────────────────────
describe('runTrigger', () => {
  test('calls POST /v1/code/triggers/{id}/run', async () => {
    axiosPostMock.mockResolvedValueOnce({
      data: { run_id: 'run_trg_1' },
      status: 200,
    })

    const result = await runTrigger('trg_run')
    expect(result.run_id).toBe('run_trg_1')
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      unknown,
      unknown,
    ][]
    const url = calls[0]?.[0] as string
    expect(url).toMatch(/trg_run\/run$/)
  })
})

// ── 429 Retry-After ──────────────────────────────────────────────────────
describe('429 rate-limit: not retried (non-5xx)', () => {
  test('throws immediately on 429 without retry', async () => {
    const err = Object.assign(new Error('Too Many Requests'), {
      isAxiosError: true,
      response: { status: 429, data: {}, headers: { 'retry-after': '60' } },
    })
    axiosGetMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    await expect(listTriggers()).rejects.toThrow()
    // Must NOT have retried — 429 is not a 5xx
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
  })
})
