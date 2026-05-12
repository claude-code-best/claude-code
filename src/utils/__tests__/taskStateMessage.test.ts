import { describe, expect, test } from 'bun:test'
import {
  buildTaskStateMessage,
  getTaskStateSnapshotKey,
} from '../taskStateMessage'

describe('buildTaskStateMessage', () => {
  test('filters internal tasks and preserves public task fields', () => {
    const message = buildTaskStateMessage('tasklist', [
      {
        id: '1',
        subject: 'Visible task',
        description: 'Shown in web UI',
        activeForm: 'Doing visible task',
        status: 'in_progress',
        owner: 'agent-1',
        blocks: ['2'],
        blockedBy: [],
      },
      {
        id: '2',
        subject: 'Internal task',
        description: 'Hidden from web UI',
        status: 'pending',
        blocks: [],
        blockedBy: [],
        metadata: { _internal: true },
      },
    ])

    expect(message.type).toBe('task_state')
    expect(message.task_list_id).toBe('tasklist')
    expect(message.uuid).toEqual(expect.any(String))
    expect(message.tasks).toEqual([
      {
        id: '1',
        subject: 'Visible task',
        description: 'Shown in web UI',
        activeForm: 'Doing visible task',
        status: 'in_progress',
        owner: 'agent-1',
        blocks: ['2'],
        blockedBy: [],
      },
    ])
  })

  test('builds a stable snapshot key for equivalent public tasks', () => {
    const tasks = [
      {
        id: '2',
        subject: 'Second',
        description: 'Second task',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      },
      {
        id: '1',
        subject: 'First',
        description: 'First task',
        status: 'in_progress',
        blocks: ['2'],
        blockedBy: [],
      },
      {
        id: 'internal',
        subject: 'Internal task',
        description: 'Hidden',
        status: 'pending',
        blocks: [],
        blockedBy: [],
        metadata: { _internal: true },
      },
    ]

    const firstKey = getTaskStateSnapshotKey('tasklist', tasks as any)
    const secondKey = getTaskStateSnapshotKey(
      'tasklist',
      [...tasks].reverse() as any,
    )
    const message = buildTaskStateMessage('tasklist', tasks as any)

    expect(firstKey).toBe(secondKey)
    expect(message.tasks.map(task => task.id)).toEqual(['1', '2'])
  })
})
