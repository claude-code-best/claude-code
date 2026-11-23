import { describe, expect, mock, test } from 'bun:test'
import type { AppState } from '../../../state/AppState.js'

// attentionSwitcherState imports the panel-agent predicates from
// LocalAgentTask.tsx at runtime; that module pulls the whole task framework
// (Tool.js, diskOutput, messageQueueManager, ...). Stub the two predicates
// with the same logic so this test stays a pure state-machine test — the
// real predicates are covered in LocalAgentTask.test.ts.
mock.module('src/tasks/LocalAgentTask/LocalAgentTask.js', () => ({
  isPanelAgentTask: (t: unknown) =>
    typeof t === 'object' &&
    t !== null &&
    (t as { type?: string }).type === 'local_agent' &&
    (t as { agentType?: string }).agentType !== 'main-session',
  hasRunningPanelAgent: (tasks: Record<string, unknown>) =>
    Object.values(tasks).some(
      t =>
        typeof t === 'object' &&
        t !== null &&
        (t as { type?: string }).type === 'local_agent' &&
        (t as { agentType?: string }).agentType !== 'main-session' &&
        (t as { status?: string }).status === 'running',
    ),
}))

const {
  buildAttentionRows,
  closeAttentionSwitcher,
  moveAttentionSelection,
  openAttentionSwitch,
  shouldOpenAttentionSwitcher,
} = await import('../attentionSwitcherState.js')

// ── Helpers ───

type TaskLike = {
  type: 'local_agent'
  status: string
  agentType: string
  agentId: string
  description: string
  startTime: number
}

function agent(id: string, overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    type: 'local_agent',
    status: 'running',
    agentType: 'general-purpose',
    agentId: id,
    description: `task ${id}`,
    startTime: 100,
    ...overrides,
  }
}

function state(
  tasks: Record<string, TaskLike | { type: string; status: string }> = {},
  attentionSwitcher?: { selectedIndex: number },
): AppState {
  return { tasks, attentionSwitcher } as unknown as AppState
}

// ── buildAttentionRows ───

describe('buildAttentionRows', () => {
  test('main is always the first row', () => {
    const rows = buildAttentionRows(state({ a: agent('a') }).tasks)
    expect(rows[0]).toEqual({ kind: 'main', key: 'main' })
  })

  test('lists running panel agents sorted by startTime', () => {
    const rows = buildAttentionRows(
      state({
        slow: agent('slow', { startTime: 300 }),
        fast: agent('fast', { startTime: 100 }),
      }).tasks,
    )
    expect(rows).toHaveLength(3)
    expect(rows[1]).toMatchObject({ kind: 'agent', key: 'fast' })
    expect(rows[2]).toMatchObject({ kind: 'agent', key: 'slow' })
  })

  test('excludes non-running agents', () => {
    const rows = buildAttentionRows(
      state({
        done: agent('done', { status: 'completed' }),
        live: agent('live'),
      }).tasks,
    )
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ kind: 'agent', key: 'live' })
  })

  test('excludes main-session agents (not panel agents)', () => {
    const rows = buildAttentionRows(
      state({
        main: agent('main', { agentType: 'main-session' }),
        panel: agent('panel'),
      }).tasks,
    )
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ kind: 'agent', key: 'panel' })
  })

  test('excludes non-local_agent task types', () => {
    const rows = buildAttentionRows(
      state({
        bash: { type: 'local_bash', status: 'running' },
        panel: agent('panel'),
      }).tasks,
    )
    expect(rows).toHaveLength(2)
  })
})

// ── shouldOpenAttentionSwitcher (penetration rule) ───

describe('shouldOpenAttentionSwitcher', () => {
  test('opens while a panel agent is running', () => {
    expect(shouldOpenAttentionSwitcher(state({ a: agent('a') }))).toBe(true)
  })

  test('penetrates when no panel agent is running', () => {
    expect(
      shouldOpenAttentionSwitcher(
        state({ a: agent('a', { status: 'completed' }) }),
      ),
    ).toBe(false)
    expect(shouldOpenAttentionSwitcher(state({}))).toBe(false)
  })

  test('penetrates while the switcher is already open (its useInput owns ↑/↓)', () => {
    expect(
      shouldOpenAttentionSwitcher(
        state({ a: agent('a') }, { selectedIndex: 0 }),
      ),
    ).toBe(false)
  })

  test('main-session agents do not gate the switcher', () => {
    expect(
      shouldOpenAttentionSwitcher(
        state({ a: agent('a', { agentType: 'main-session' }) }),
      ),
    ).toBe(false)
  })
})

// ── open / close / move ───

describe('openAttentionSwitch', () => {
  test('opens with main selected (↓ was pressed from main)', () => {
    const next = openAttentionSwitch(state({ a: agent('a') }))
    expect(next.attentionSwitcher).toEqual({ selectedIndex: 0 })
  })
})

describe('closeAttentionSwitcher', () => {
  test('clears the switcher without touching the rest of the state', () => {
    const prev = state({ a: agent('a') }, { selectedIndex: 1 })
    const next = closeAttentionSwitcher(prev)
    expect(next.attentionSwitcher).toBeUndefined()
    expect(next.tasks).toBe(prev.tasks)
  })

  test('no-op when already closed', () => {
    const prev = state({})
    expect(closeAttentionSwitcher(prev)).toBe(prev)
  })
})

describe('moveAttentionSelection', () => {
  test('moves down and up within bounds', () => {
    const opened = openAttentionSwitch(state({ a: agent('a'), b: agent('b') }))
    const down = moveAttentionSelection(opened, 1, 3)
    expect(down.attentionSwitcher).toEqual({ selectedIndex: 1 })
    const up = moveAttentionSelection(down, -1, 3)
    expect(up.attentionSwitcher).toEqual({ selectedIndex: 0 })
  })

  test('wraps: ↓ past the last row returns to main, ↑ from main wraps to last', () => {
    const opened = openAttentionSwitch(state({ a: agent('a'), b: agent('b') }))
    const atLast = moveAttentionSelection(
      moveAttentionSelection(opened, 1, 3),
      1,
      3,
    )
    expect(atLast.attentionSwitcher).toEqual({ selectedIndex: 2 })
    const wrapDown = moveAttentionSelection(atLast, 1, 3)
    expect(wrapDown.attentionSwitcher).toEqual({ selectedIndex: 0 })
    const wrapUp = moveAttentionSelection(opened, -1, 3)
    expect(wrapUp.attentionSwitcher).toEqual({ selectedIndex: 2 })
  })

  test('no-op when the switcher is closed', () => {
    const prev = state({ a: agent('a') })
    expect(moveAttentionSelection(prev, 1, 2)).toBe(prev)
  })
})
