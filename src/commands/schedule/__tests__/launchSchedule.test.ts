/**
 * Tests for launchSchedule.ts
 *
 * Strategy per feedback_mock_dependency_not_subject:
 * - DO NOT mock triggersApi.ts itself (would pollute api.test.ts)
 * - Mock axios (the underlying HTTP layer) to control API responses
 * - Mock auth dependencies so real triggersApi functions can build headers
 * - Let real triggersApi functions run real code paths
 */

import {
  afterAll,
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

// ── Analytics mock ──────────────────────────────────────────────────────────
const logEventMock = mock(() => {})
mock.module('src/services/analytics/index.js', () => ({
  logEvent: logEventMock,
}))

// ── Cron utility mock ───────────────────────────────────────────────────────
mock.module('src/utils/cron.js', () => ({
  parseCronExpression: (cron: string) => {
    const fields = cron.trim().split(/\s+/)
    if (fields.length !== 5) return null
    // Reject if any field contains a letter (invalid cron field)
    const hasWord = fields.some(f => /[a-zA-Z]/.test(f))
    if (hasWord) return null
    return {
      minute: [0],
      hour: [9],
      dayOfMonth: [1],
      month: [1],
      dayOfWeek: [1],
    }
  },
  cronToHuman: (cron: string) => `human(${cron})`,
}))

// ── ScheduleView mock ───────────────────────────────────────────────────────
const scheduleViewMock = mock((_props: unknown) => null)
mock.module('src/commands/schedule/ScheduleView.js', () => ({
  ScheduleView: scheduleViewMock,
}))

// ── Auth / OAuth mocks ──────────────────────────────────────────────────────
mock.module('src/utils/auth.js', () => ({
  getClaudeAIOAuthTokens: () => ({ accessToken: 'test-token-schedule' }),
}))
mock.module('src/services/oauth/client.js', () => ({
  getOrganizationUUID: async () => 'org-uuid-schedule',
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
    accessToken: 'test-token-schedule',
    orgUUID: 'org-uuid-schedule',
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

// ── Lazy import ─────────────────────────────────────────────────────────────
let callSchedule: typeof import('../launchSchedule.js').callSchedule

beforeAll(async () => {
  axiosHandle.useStubs = true
  const mod = await import('../launchSchedule.js')
  callSchedule = mod.callSchedule
})

afterAll(() => {
  axiosHandle.useStubs = false
})

function makeOnDone() {
  return mock(() => {})
}

beforeEach(() => {
  logEventMock.mockClear()
  axiosGetMock.mockClear()
  axiosPostMock.mockClear()
  axiosDeleteMock.mockClear()
  scheduleViewMock.mockClear()
})

describe('callSchedule: invalid args', () => {
  test('invalid subcommand → onDone with usage + null', async () => {
    const onDone = makeOnDone()
    const result = await callSchedule(onDone, {} as never, 'badcmd')
    expect(result).toBeNull()
    expect(onDone).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/Usage/i)
  })
})

describe('callSchedule: list', () => {
  test('list returns empty triggers', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'list')
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/no scheduled triggers/i)
  })

  test('list with triggers reports count', async () => {
    const triggers = [
      {
        trigger_id: 'trg_1',
        cron_expression: '0 9 * * 1',
        enabled: true,
        prompt: 'daily',
      },
    ]
    axiosGetMock.mockResolvedValueOnce({
      data: { data: triggers },
      status: 200,
    })
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, '')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/1 scheduled trigger/)
  })

  test('list API error → error view', async () => {
    axiosGetMock.mockRejectedValueOnce(new Error('Network error'))
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'list')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to list/i)
  })
})

describe('callSchedule: get', () => {
  test('get calls getTrigger with id', async () => {
    const trigger = {
      trigger_id: 'trg_get',
      cron_expression: '0 8 * * *',
      enabled: true,
      prompt: 'test',
    }
    axiosGetMock.mockResolvedValueOnce({ data: trigger, status: 200 })
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'get trg_get')
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0] as string).toContain('trg_get')
  })

  test('get API error → error message', async () => {
    axiosGetMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'get trg_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to get/i)
  })
})

describe('callSchedule: create', () => {
  test('create with valid cron calls createTrigger', async () => {
    const trigger = {
      trigger_id: 'trg_new',
      cron_expression: '0 9 * * *',
      enabled: true,
      prompt: 'daily report',
    }
    axiosPostMock.mockResolvedValueOnce({ data: trigger, status: 200 })
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'create 0 9 * * * daily report')
    expect(axiosPostMock).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/trigger created/i)
  })

  test('create with invalid cron → validation error without hitting API', async () => {
    const onDone = makeOnDone()
    // 4 fields only — invalid
    await callSchedule(onDone, {} as never, 'create 0 9 * * report only')
    // axios.post should not be called
    expect(axiosPostMock).not.toHaveBeenCalled()
  })

  test('create API error → error message', async () => {
    axiosPostMock.mockRejectedValueOnce(new Error('Subscription required'))
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'create 0 9 * * * test prompt')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to create/i)
  })
})

describe('callSchedule: update', () => {
  test('update enabled field', async () => {
    const trigger = {
      trigger_id: 'trg_upd',
      cron_expression: '0 9 * * *',
      enabled: false,
      prompt: 'test',
    }
    axiosPostMock.mockResolvedValueOnce({ data: trigger, status: 200 })
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'update trg_upd enabled false')
    expect(axiosPostMock).toHaveBeenCalledTimes(1)
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      Record<string, unknown>,
      unknown,
    ][]
    expect(calls[0]?.[0]).toContain('trg_upd')
    expect(calls[0]?.[1]).toEqual({ enabled: false })
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/updated/i)
  })

  test('update with unknown field → error without API call', async () => {
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'update trg_upd foofield bar')
    expect(axiosPostMock).not.toHaveBeenCalled()
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/unknown field/i)
  })
})

describe('callSchedule: delete', () => {
  test('delete calls deleteTrigger', async () => {
    axiosDeleteMock.mockResolvedValueOnce({ status: 204 })
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'delete trg_del')
    expect(axiosDeleteMock).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/deleted/i)
  })

  test('delete API error → error message', async () => {
    axiosDeleteMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'delete trg_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to delete/i)
  })
})

describe('callSchedule: run', () => {
  test('run fires trigger and returns run_id', async () => {
    axiosPostMock.mockResolvedValueOnce({
      data: { run_id: 'run_xyz' },
      status: 200,
    })
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'run trg_fire')
    expect(axiosPostMock).toHaveBeenCalledTimes(1)
    const calls = axiosPostMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0] as string).toMatch(/\/run$/)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/run_xyz/)
  })

  test('run API error → error message', async () => {
    axiosPostMock.mockRejectedValueOnce(new Error('Forbidden'))
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'run trg_fire')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to run/i)
  })
})

describe('callSchedule: enable / disable', () => {
  test('enable calls updateTrigger with enabled:true', async () => {
    const trigger = {
      trigger_id: 'trg_en',
      cron_expression: '0 9 * * *',
      enabled: true,
      prompt: 'test',
    }
    axiosPostMock.mockResolvedValueOnce({ data: trigger, status: 200 })
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'enable trg_en')
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      Record<string, unknown>,
      unknown,
    ][]
    expect(calls[0]?.[1]).toEqual({ enabled: true })
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/enabled/i)
  })

  test('disable calls updateTrigger with enabled:false', async () => {
    const trigger = {
      trigger_id: 'trg_dis',
      cron_expression: '0 9 * * *',
      enabled: false,
      prompt: 'test',
    }
    axiosPostMock.mockResolvedValueOnce({ data: trigger, status: 200 })
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'disable trg_dis')
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      Record<string, unknown>,
      unknown,
    ][]
    expect(calls[0]?.[1]).toEqual({ enabled: false })
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/disabled/i)
  })

  test('enable API error → error message', async () => {
    axiosPostMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'enable trg_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to enable/i)
  })

  test('disable API error → error message', async () => {
    axiosPostMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'disable trg_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to disable/i)
  })
})
