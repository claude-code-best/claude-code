import { describe, expect, test } from 'bun:test'
import type { Task } from '../../../utils/tasks.js'
import {
  buildContinuationPrompt,
  buildUnfinishedTaskNotice,
} from '../taskAnchorReminder.js'

function task(partial: Partial<Task> & Pick<Task, 'id' | 'status'>): Task {
  return {
    subject: `Task ${partial.id}`,
    description: '',
    blocks: [],
    blockedBy: [],
    ...partial,
  }
}

describe('buildContinuationPrompt', () => {
  test('returns null when there are no unfinished tasks', () => {
    expect(buildContinuationPrompt([])).toBeNull()
    expect(
      buildContinuationPrompt([
        task({ id: '1', status: 'completed' }),
        task({ id: '2', status: 'completed' }),
      ]),
    ).toBeNull()
  })

  test('picks the in_progress task over pending ones', () => {
    const prompt = buildContinuationPrompt([
      task({ id: '1', status: 'pending', subject: 'first' }),
      task({ id: '2', status: 'in_progress', subject: 'second' }),
    ])
    expect(prompt).toBe('按计划继续 Task #2 second')
  })

  test('among same status picks the lowest numeric id', () => {
    const prompt = buildContinuationPrompt([
      task({ id: '10', status: 'pending', subject: 'ten' }),
      task({ id: '2', status: 'pending', subject: 'two' }),
    ])
    expect(prompt).toBe('按计划继续 Task #2 two')
  })

  test('ignores completed tasks when picking', () => {
    const prompt = buildContinuationPrompt([
      task({ id: '1', status: 'completed', subject: 'done' }),
      task({ id: '3', status: 'pending', subject: 'todo' }),
    ])
    expect(prompt).toBe('按计划继续 Task #3 todo')
  })
})

describe('buildUnfinishedTaskNotice', () => {
  test('returns null when no task is in_progress', () => {
    expect(buildUnfinishedTaskNotice([])).toBeNull()
    expect(
      buildUnfinishedTaskNotice([
        task({ id: '1', status: 'pending' }),
        task({ id: '2', status: 'completed' }),
      ]),
    ).toBeNull()
  })

  test('surfaces in_progress task names and pending count', () => {
    const notice = buildUnfinishedTaskNotice([
      task({ id: '1', status: 'in_progress', subject: '写模块' }),
      task({ id: '2', status: 'pending' }),
      task({ id: '3', status: 'pending' }),
      task({ id: '4', status: 'completed' }),
    ])!
    expect(notice).toContain('#1 写模块')
    expect(notice).toContain('2 个待办')
  })

  test('collapses overflow when more than three in_progress tasks', () => {
    const notice = buildUnfinishedTaskNotice(
      Array.from({ length: 5 }, (_, i) =>
        task({ id: String(i + 1), status: 'in_progress' }),
      ),
    )!
    expect(notice).toContain('等 5 个')
  })

  test('guides the user to press Tab instead of promising bare Enter', () => {
    const notice = buildUnfinishedTaskNotice([
      task({ id: '1', status: 'in_progress', subject: '写模块' }),
    ])!
    expect(notice).toContain('按 Tab')
    expect(notice).not.toContain('可直接回车继续')
  })
})
