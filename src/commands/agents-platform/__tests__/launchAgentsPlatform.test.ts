import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

// ── Analytics mock ──────────────────────────────────────────────────────────
const logEventMock = mock(() => {})
mock.module('src/services/analytics/index.js', () => ({
  logEvent: logEventMock,
  logEventAsync: mock(() => Promise.resolve()),
  _resetForTesting: mock(() => {}),
  attachAnalyticsSink: mock(() => {}),
  stripProtoFields: mock((v: unknown) => v),
}))

// ── agentsApi mock ──────────────────────────────────────────────────────────
const listMock = mock(async () => [
  {
    id: 'agt_1',
    cron_expr: '0 9 * * 1',
    prompt: 'hello world',
    status: 'active',
    timezone: 'UTC',
    next_run: null,
  },
])
const createMock = mock(async (cron: string, prompt: string) => ({
  id: 'agt_new',
  cron_expr: cron,
  prompt,
  status: 'active',
  timezone: 'UTC',
  next_run: null,
}))
const deleteMock = mock(async () => undefined)
const runMock = mock(async () => ({ run_id: 'run_123' }))

mock.module('src/commands/agents-platform/agentsApi.js', () => ({
  listAgents: listMock,
  createAgent: createMock,
  deleteAgent: deleteMock,
  runAgent: runMock,
}))

// ── cron mock ───────────────────────────────────────────────────────────────
mock.module('src/utils/cron.js', () => ({
  parseCronExpression: (expr: string) =>
    expr.includes('INVALID')
      ? null
      : { minute: [0], hour: [9], dayOfMonth: [1], month: [1], dayOfWeek: [1] },
  cronToHuman: (expr: string) => `Human(${expr})`,
  computeNextCronRun: () => null,
}))

let callAgentsPlatform: typeof import('../launchAgentsPlatform.js').callAgentsPlatform

beforeAll(async () => {
  const mod = await import('../launchAgentsPlatform.js')
  callAgentsPlatform = mod.callAgentsPlatform
})

beforeEach(() => {
  logEventMock.mockClear()
  listMock.mockClear()
  createMock.mockClear()
  deleteMock.mockClear()
  runMock.mockClear()
})

function makeContext() {
  return {} as Parameters<typeof callAgentsPlatform>[1]
}

describe('callAgentsPlatform', () => {
  test('list (empty args) calls listAgents and returns element', async () => {
    const onDone = mock(() => {})
    const result = await callAgentsPlatform(onDone, makeContext(), '')
    expect(listMock).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(result).not.toBeNull()
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_list',
      expect.anything(),
    )
  })

  test('list sub-command calls listAgents', async () => {
    const onDone = mock(() => {})
    await callAgentsPlatform(onDone, makeContext(), 'list')
    expect(listMock).toHaveBeenCalledTimes(1)
  })

  test('create with valid cron calls createAgent', async () => {
    const onDone = mock(() => {})
    const result = await callAgentsPlatform(
      onDone,
      makeContext(),
      'create 0 9 * * 1 Run standup',
    )
    expect(createMock).toHaveBeenCalledTimes(1)
    const [cron, prompt] = createMock.mock.calls[0] as [string, string]
    expect(cron).toBe('0 9 * * 1')
    expect(prompt).toBe('Run standup')
    expect(result).not.toBeNull()
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_create',
      expect.anything(),
    )
  })

  test('create with INVALID cron does not call API', async () => {
    // parseCronExpression returns null for expressions containing 'INVALID'
    const onDone = mock(() => {})
    await callAgentsPlatform(
      onDone,
      makeContext(),
      'create INVALID INVALID * * * my prompt',
    )
    // cron = 'INVALID INVALID * * *', mock returns null → no API call
    expect(createMock).not.toHaveBeenCalled()
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_failed',
      expect.anything(),
    )
  })

  test('delete with id calls deleteAgent', async () => {
    const onDone = mock(() => {})
    const result = await callAgentsPlatform(
      onDone,
      makeContext(),
      'delete agt_abc',
    )
    expect(deleteMock).toHaveBeenCalledWith('agt_abc')
    expect(result).not.toBeNull()
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_delete',
      expect.anything(),
    )
  })

  test('run with id calls runAgent', async () => {
    const onDone = mock(() => {})
    const result = await callAgentsPlatform(
      onDone,
      makeContext(),
      'run agt_xyz',
    )
    expect(runMock).toHaveBeenCalledWith('agt_xyz')
    expect(result).not.toBeNull()
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_run',
      expect.anything(),
    )
  })

  test('invalid args logs failed and calls onDone', async () => {
    const onDone = mock(() => {})
    await callAgentsPlatform(onDone, makeContext(), 'unknown-cmd foo')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_failed',
      expect.anything(),
    )
    expect(listMock).not.toHaveBeenCalled()
  })

  test('listAgents API error → error view returned', async () => {
    listMock.mockRejectedValueOnce(new Error('network error'))
    const onDone = mock(() => {})
    const result = await callAgentsPlatform(onDone, makeContext(), 'list')
    expect(result).not.toBeNull()
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_failed',
      expect.anything(),
    )
  })

  test('started event fires on every call', async () => {
    const onDone = mock(() => {})
    await callAgentsPlatform(onDone, makeContext(), '')
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_started',
      expect.anything(),
    )
  })

  // ── Error-path branches (lines 77-86, 100-109, 128-136) ──────────────────

  test('createAgent API error → error view returned', async () => {
    createMock.mockRejectedValueOnce(new Error('subscription required'))
    const onDone = mock(() => {})
    const result = await callAgentsPlatform(
      onDone,
      makeContext(),
      'create 0 9 * * 1 My prompt',
    )
    expect(result).not.toBeNull()
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_failed',
      expect.anything(),
    )
    expect(onDone).toHaveBeenCalledWith(
      expect.stringContaining('subscription required'),
      expect.anything(),
    )
  })

  test('deleteAgent API error → error view returned', async () => {
    deleteMock.mockRejectedValueOnce(new Error('not found'))
    const onDone = mock(() => {})
    const result = await callAgentsPlatform(
      onDone,
      makeContext(),
      'delete agt_abc',
    )
    expect(result).not.toBeNull()
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_failed',
      expect.anything(),
    )
    expect(onDone).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
      expect.anything(),
    )
  })

  test('runAgent API error → error view returned', async () => {
    runMock.mockRejectedValueOnce(new Error('run failed'))
    const onDone = mock(() => {})
    const result = await callAgentsPlatform(
      onDone,
      makeContext(),
      'run agt_xyz',
    )
    expect(result).not.toBeNull()
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_failed',
      expect.anything(),
    )
    expect(onDone).toHaveBeenCalledWith(
      expect.stringContaining('run failed'),
      expect.anything(),
    )
  })

  test('create with no prompt part → invalid action', async () => {
    const onDone = mock(() => {})
    // Only 4 cron fields — parseArgs returns invalid
    await callAgentsPlatform(onDone, makeContext(), 'create 0 9 * *')
    expect(createMock).not.toHaveBeenCalled()
    expect(logEventMock).toHaveBeenCalledWith(
      'tengu_agents_platform_failed',
      expect.anything(),
    )
  })
})
