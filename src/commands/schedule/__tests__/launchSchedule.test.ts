import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// ── Analytics mock ──────────────────────────────────────────────────────────
const logEventMock = mock(() => {})
mock.module('src/services/analytics/index.js', () => ({
  logEvent: logEventMock,
}))

// ── Cron utility mock ───────────────────────────────────────────────────────
// parseCronExpression: returns null if any field is non-numeric/non-wildcard
// to simulate real validation; specifically reject expressions with word fields.
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

// ── triggersApi mock ──────────────────────────────────────────────────────
// Use `as unknown as` casts to keep mock type flexible while satisfying strict TS
const listTriggersMock = mock(async () => [] as unknown)
const getTriggerMock = mock(async () => ({}) as unknown)
const createTriggerMock = mock(async () => ({}) as unknown)
const updateTriggerMock = mock(async () => ({}) as unknown)
const deleteTriggerMock = mock(async () => undefined)
const runTriggerMock = mock(async () => ({ run_id: 'run_mock' }) as unknown)

mock.module('src/commands/schedule/triggersApi.js', () => ({
  listTriggers: listTriggersMock,
  getTrigger: getTriggerMock,
  createTrigger: createTriggerMock,
  updateTrigger: updateTriggerMock,
  deleteTrigger: deleteTriggerMock,
  runTrigger: runTriggerMock,
}))

let callSchedule: typeof import('../launchSchedule.js').callSchedule

beforeAll(async () => {
  const mod = await import('../launchSchedule.js')
  callSchedule = mod.callSchedule
})

function makeOnDone() {
  return mock(() => {})
}

beforeEach(() => {
  logEventMock.mockClear()
  listTriggersMock.mockClear()
  getTriggerMock.mockClear()
  createTriggerMock.mockClear()
  updateTriggerMock.mockClear()
  deleteTriggerMock.mockClear()
  runTriggerMock.mockClear()
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
    listTriggersMock.mockResolvedValueOnce([])
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'list')
    expect(listTriggersMock).toHaveBeenCalledTimes(1)
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
    listTriggersMock.mockResolvedValueOnce(triggers)
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, '')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/1 scheduled trigger/)
  })

  test('list API error → error view', async () => {
    listTriggersMock.mockRejectedValueOnce(new Error('Network error'))
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
    getTriggerMock.mockResolvedValueOnce(trigger)
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'get trg_get')
    expect(getTriggerMock).toHaveBeenCalledTimes(1)
    const calls = getTriggerMock.mock.calls as unknown as [string][]
    expect(calls[0]?.[0]).toBe('trg_get')
  })

  test('get API error → error message', async () => {
    getTriggerMock.mockRejectedValueOnce(new Error('Not found'))
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
    createTriggerMock.mockResolvedValueOnce(trigger)
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'create 0 9 * * * daily report')
    expect(createTriggerMock).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/trigger created/i)
  })

  test('create with invalid cron → validation error without hitting API', async () => {
    const onDone = makeOnDone()
    // 4 fields only — invalid
    await callSchedule(onDone, {} as never, 'create 0 9 * * report only')
    // createTrigger should not be called
    expect(createTriggerMock).not.toHaveBeenCalled()
  })

  test('create API error → error message', async () => {
    createTriggerMock.mockRejectedValueOnce(new Error('Subscription required'))
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
    updateTriggerMock.mockResolvedValueOnce(trigger)
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'update trg_upd enabled false')
    expect(updateTriggerMock).toHaveBeenCalledTimes(1)
    const calls = updateTriggerMock.mock.calls as unknown as [
      string,
      Record<string, unknown>,
    ][]
    expect(calls[0]?.[1]).toEqual({ enabled: false })
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/updated/i)
  })

  test('update with unknown field → error without API call', async () => {
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'update trg_upd foofield bar')
    expect(updateTriggerMock).not.toHaveBeenCalled()
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/unknown field/i)
  })
})

describe('callSchedule: delete', () => {
  test('delete calls deleteTrigger', async () => {
    deleteTriggerMock.mockResolvedValueOnce(undefined)
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'delete trg_del')
    expect(deleteTriggerMock).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/deleted/i)
  })

  test('delete API error → error message', async () => {
    deleteTriggerMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'delete trg_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to delete/i)
  })
})

describe('callSchedule: run', () => {
  test('run fires trigger and returns run_id', async () => {
    runTriggerMock.mockResolvedValueOnce({ run_id: 'run_xyz' })
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'run trg_fire')
    expect(runTriggerMock).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/run_xyz/)
  })

  test('run API error → error message', async () => {
    runTriggerMock.mockRejectedValueOnce(new Error('Forbidden'))
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
    updateTriggerMock.mockResolvedValueOnce(trigger)
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'enable trg_en')
    const calls = updateTriggerMock.mock.calls as unknown as [
      string,
      Record<string, unknown>,
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
    updateTriggerMock.mockResolvedValueOnce(trigger)
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'disable trg_dis')
    const calls = updateTriggerMock.mock.calls as unknown as [
      string,
      Record<string, unknown>,
    ][]
    expect(calls[0]?.[1]).toEqual({ enabled: false })
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/disabled/i)
  })

  test('enable API error → error message', async () => {
    updateTriggerMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'enable trg_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to enable/i)
  })

  test('disable API error → error message', async () => {
    updateTriggerMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callSchedule(onDone, {} as never, 'disable trg_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to disable/i)
  })
})
