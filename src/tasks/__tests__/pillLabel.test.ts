import { describe, expect, test } from 'bun:test'
import { getPillLabel, pillNeedsCta } from '../pillLabel.js'
import type { BackgroundTaskState } from '../types.js'

function bashTask(kind: 'shell' | 'monitor' = 'shell'): BackgroundTaskState {
  return {
    type: 'local_bash',
    kind,
    id: `task-${Math.random().toString(36).slice(2)}`,
    status: 'running',
  } as unknown as BackgroundTaskState
}

function agentTask(): BackgroundTaskState {
  return {
    type: 'local_agent',
    id: `agent-${Math.random().toString(36).slice(2)}`,
    status: 'running',
  } as unknown as BackgroundTaskState
}

describe('getPillLabel', () => {
  test('single shell shows one number with category name', () => {
    expect(getPillLabel([bashTask()])).toBe('1 shell')
  })

  test('homogeneous shells show one combined number', () => {
    expect(getPillLabel([bashTask(), bashTask(), bashTask()])).toBe('3 shells')
  })

  test('homogeneous monitors show one combined number', () => {
    expect(getPillLabel([bashTask('monitor'), bashTask('monitor')])).toBe(
      '2 monitors',
    )
  })

  // Official 2.1.330: the footer's background count is ONE number covering
  // shells, monitors, MCP calls, agents, workflows and scheduled tasks —
  // a shell/monitor mix must not split into per-category counts.
  test('shell/monitor mix falls back to one combined count', () => {
    expect(getPillLabel([bashTask(), bashTask(), bashTask('monitor')])).toBe(
      '3 background tasks',
    )
  })

  test('mixed task types show one combined count', () => {
    expect(getPillLabel([bashTask(), agentTask()])).toBe('2 background tasks')
  })

  test('single local agent keeps its label', () => {
    expect(getPillLabel([agentTask()])).toBe('1 local agent')
  })
})

describe('pillNeedsCta', () => {
  test('false for plain running tasks', () => {
    expect(pillNeedsCta([bashTask()])).toBe(false)
    expect(pillNeedsCta([bashTask(), bashTask()])).toBe(false)
  })
})
