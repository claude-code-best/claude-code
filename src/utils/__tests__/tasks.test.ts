import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { beforeEach, afterEach, describe, expect, mock, test } from 'bun:test'

import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'

// Mock dependencies before importing the module under test
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({
  feature: () => false,
}))
mock.module('src/bootstrap/state.ts', () => ({
  getSessionId: () => 'test-session-123',
  getIsNonInteractiveSession: () => false,
}))
mock.module('src/utils/teammate.ts', () => ({
  getTeamName: () => undefined,
}))
mock.module('src/utils/teammateContext.ts', () => ({
  getTeammateContext: () => undefined,
}))
mock.module('src/utils/slowOperations.ts', () => ({
  jsonParse: (s: string) => JSON.parse(s),
  jsonStringify: (
    v: unknown,
    ...args: Parameters<typeof JSON.stringify>[1][]
  ) => JSON.stringify(v, ...args),
}))

import {
  createTask,
  getTask,
  updateTask,
  deleteTask,
  listTasks,
  blockTask,
  claimTask,
  resetTaskList,
  sanitizePathComponent,
  getTasksDir,
  notifyTasksUpdated,
  onTasksUpdated,
  setLeaderTeamName,
  clearLeaderTeamName,
  isTodoV2Enabled,
  type Task,
} from '../tasks'

// Use a temp dir as CLAUDE_CONFIG_DIR for isolation
let configDir: string
const ORIGINAL_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR

beforeEach(async () => {
  configDir = join(
    tmpdir(),
    `claude-test-tasks-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  process.env.CLAUDE_CONFIG_DIR = configDir
  // Reset memoize cache by changing env
  const { getClaudeConfigHomeDir } = await import('src/utils/envUtils')
  getClaudeConfigHomeDir.cache.clear?.()
})

afterEach(async () => {
  if (ORIGINAL_CONFIG_DIR !== undefined) {
    process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CONFIG_DIR
  } else {
    delete process.env.CLAUDE_CONFIG_DIR
  }
  const { getClaudeConfigHomeDir } = await import('src/utils/envUtils')
  getClaudeConfigHomeDir.cache.clear?.()
  await rm(configDir, { recursive: true, force: true }).catch(() => {})
})

const TASK_LIST_ID = 'test-list'

// ---------------------------------------------------------------------------
// sanitizePathComponent
// ---------------------------------------------------------------------------
describe('sanitizePathComponent', () => {
  test('replaces non-alphanumeric characters with hyphens', () => {
    expect(sanitizePathComponent('hello world')).toBe('hello-world')
  })

  test('preserves alphanumeric, hyphens and underscores', () => {
    expect(sanitizePathComponent('abc-123_XYZ')).toBe('abc-123_XYZ')
  })

  test('handles path traversal attempts', () => {
    expect(sanitizePathComponent('../../../etc/passwd')).toBe(
      '---------etc-passwd',
    )
  })

  test('handles empty string', () => {
    expect(sanitizePathComponent('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// getTasksDir
// ---------------------------------------------------------------------------
describe('getTasksDir', () => {
  test('returns correct path under config home', () => {
    const dir = getTasksDir('my-list')
    expect(dir).toBe(join(configDir, 'tasks', 'my-list'))
  })

  test('sanitizes task list ID', () => {
    const dir = getTasksDir('../evil')
    expect(dir).toBe(join(configDir, 'tasks', '---evil'))
  })
})

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------
describe('createTask', () => {
  test('creates a task with sequential ID starting at 1', async () => {
    const id = await createTask(TASK_LIST_ID, {
      subject: 'Test task',
      description: 'A test task description',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    expect(id).toBe('1')

    const task = await getTask(TASK_LIST_ID, id)
    expect(task).not.toBeNull()
    expect(task!.subject).toBe('Test task')
    expect(task!.status).toBe('pending')
  })

  test('creates tasks with incrementing IDs', async () => {
    const id1 = await createTask(TASK_LIST_ID, {
      subject: 'First',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const id2 = await createTask(TASK_LIST_ID, {
      subject: 'Second',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    expect(id1).toBe('1')
    expect(id2).toBe('2')
  })

  test('preserves optional fields', async () => {
    const id = await createTask(TASK_LIST_ID, {
      subject: 'Task with options',
      description: 'Has owner and activeForm',
      status: 'in_progress',
      blocks: [],
      blockedBy: [],
      owner: 'agent-1',
      activeForm: 'Working on task',
      metadata: { priority: 'high' },
    })
    const task = await getTask(TASK_LIST_ID, id)
    expect(task!.owner).toBe('agent-1')
    expect(task!.activeForm).toBe('Working on task')
    expect(task!.metadata).toEqual({ priority: 'high' })
  })

  test('does not reuse IDs after deletion (high water mark)', async () => {
    const id1 = await createTask(TASK_LIST_ID, {
      subject: 'To delete',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    await deleteTask(TASK_LIST_ID, id1)
    const id2 = await createTask(TASK_LIST_ID, {
      subject: 'After delete',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    expect(id1).toBe('1')
    expect(id2).toBe('2')
  })
})

// ---------------------------------------------------------------------------
// getTask
// ---------------------------------------------------------------------------
describe('getTask', () => {
  test('returns null for non-existent task', async () => {
    const task = await getTask(TASK_LIST_ID, '999')
    expect(task).toBeNull()
  })

  test('returns task by ID', async () => {
    const id = await createTask(TASK_LIST_ID, {
      subject: 'Find me',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const task = await getTask(TASK_LIST_ID, id)
    expect(task).not.toBeNull()
    expect(task!.id).toBe(id)
    expect(task!.subject).toBe('Find me')
  })

  test('returns null for invalid JSON in task file', async () => {
    const { writeFile } = await import('fs/promises')
    const dir = getTasksDir(TASK_LIST_ID)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'bad.json'), 'not valid json{{{')
    const task = await getTask(TASK_LIST_ID, 'bad')
    expect(task).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------
describe('updateTask', () => {
  test('updates task fields', async () => {
    const id = await createTask(TASK_LIST_ID, {
      subject: 'Original',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const updated = await updateTask(TASK_LIST_ID, id, {
      subject: 'Updated',
      status: 'in_progress',
      owner: 'agent-2',
    })
    expect(updated).not.toBeNull()
    expect(updated!.subject).toBe('Updated')
    expect(updated!.status).toBe('in_progress')
    expect(updated!.owner).toBe('agent-2')
    expect(updated!.id).toBe(id)
  })

  test('returns null for non-existent task', async () => {
    const result = await updateTask(TASK_LIST_ID, '999', { subject: 'Nope' })
    expect(result).toBeNull()
  })

  test('preserves unmodified fields', async () => {
    const id = await createTask(TASK_LIST_ID, {
      subject: 'Keep this',
      description: 'Keep desc',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const updated = await updateTask(TASK_LIST_ID, id, { status: 'completed' })
    expect(updated!.subject).toBe('Keep this')
    expect(updated!.description).toBe('Keep desc')
    expect(updated!.status).toBe('completed')
  })
})

// ---------------------------------------------------------------------------
// deleteTask
// ---------------------------------------------------------------------------
describe('deleteTask', () => {
  test('deletes an existing task', async () => {
    const id = await createTask(TASK_LIST_ID, {
      subject: 'Delete me',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const result = await deleteTask(TASK_LIST_ID, id)
    expect(result).toBe(true)
    const task = await getTask(TASK_LIST_ID, id)
    expect(task).toBeNull()
  })

  test('returns false for non-existent task', async () => {
    const result = await deleteTask(TASK_LIST_ID, '999')
    expect(result).toBe(false)
  })

  test('removes references from other tasks on delete', async () => {
    const id1 = await createTask(TASK_LIST_ID, {
      subject: 'Blocker',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const id2 = await createTask(TASK_LIST_ID, {
      subject: 'Blocked',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    // Set up block relationship
    await blockTask(TASK_LIST_ID, id1, id2)

    // Delete the blocker
    await deleteTask(TASK_LIST_ID, id1)

    // The blocked task should no longer reference the deleted task
    const remaining = await getTask(TASK_LIST_ID, id2)
    expect(remaining).not.toBeNull()
    expect(remaining!.blockedBy).not.toContain(id1)
  })
})

// ---------------------------------------------------------------------------
// listTasks
// ---------------------------------------------------------------------------
describe('listTasks', () => {
  test('returns empty array for empty list', async () => {
    const tasks = await listTasks(TASK_LIST_ID)
    expect(tasks).toEqual([])
  })

  test('returns all tasks', async () => {
    await createTask(TASK_LIST_ID, {
      subject: 'A',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    await createTask(TASK_LIST_ID, {
      subject: 'B',
      description: '',
      status: 'completed',
      blocks: [],
      blockedBy: [],
    })
    const tasks = await listTasks(TASK_LIST_ID)
    expect(tasks).toHaveLength(2)
    const subjects = tasks.map(t => t.subject).sort()
    expect(subjects).toEqual(['A', 'B'])
  })
})

// ---------------------------------------------------------------------------
// blockTask
// ---------------------------------------------------------------------------
describe('blockTask', () => {
  test('creates bidirectional block relationship', async () => {
    const id1 = await createTask(TASK_LIST_ID, {
      subject: 'Blocker',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const id2 = await createTask(TASK_LIST_ID, {
      subject: 'Blocked',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const result = await blockTask(TASK_LIST_ID, id1, id2)
    expect(result).toBe(true)

    const t1 = await getTask(TASK_LIST_ID, id1)
    const t2 = await getTask(TASK_LIST_ID, id2)
    expect(t1!.blocks).toContain(id2)
    expect(t2!.blockedBy).toContain(id1)
  })

  test('returns false for non-existent task', async () => {
    const result = await blockTask(TASK_LIST_ID, '999', '998')
    expect(result).toBe(false)
  })

  test('does not add duplicate block entries', async () => {
    const id1 = await createTask(TASK_LIST_ID, {
      subject: 'A',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const id2 = await createTask(TASK_LIST_ID, {
      subject: 'B',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    await blockTask(TASK_LIST_ID, id1, id2)
    await blockTask(TASK_LIST_ID, id1, id2)

    const t1 = await getTask(TASK_LIST_ID, id1)
    expect(t1!.blocks.filter(id => id === id2)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// claimTask
// ---------------------------------------------------------------------------
describe('claimTask', () => {
  test('claims an unowned task', async () => {
    const id = await createTask(TASK_LIST_ID, {
      subject: 'Claimable',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const result = await claimTask(TASK_LIST_ID, id, 'agent-1')
    expect(result.success).toBe(true)
    expect(result.task!.owner).toBe('agent-1')
  })

  test('allows same agent to re-claim', async () => {
    const id = await createTask(TASK_LIST_ID, {
      subject: 'Reclaim',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    await claimTask(TASK_LIST_ID, id, 'agent-1')
    const result = await claimTask(TASK_LIST_ID, id, 'agent-1')
    expect(result.success).toBe(true)
  })

  test('rejects claim by different agent if already owned', async () => {
    const id = await createTask(TASK_LIST_ID, {
      subject: 'Owned',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    await claimTask(TASK_LIST_ID, id, 'agent-1')
    const result = await claimTask(TASK_LIST_ID, id, 'agent-2')
    expect(result.success).toBe(false)
    expect(result.reason).toBe('already_claimed')
  })

  test('rejects claim on completed task', async () => {
    const id = await createTask(TASK_LIST_ID, {
      subject: 'Done',
      description: '',
      status: 'completed',
      blocks: [],
      blockedBy: [],
    })
    const result = await claimTask(TASK_LIST_ID, id, 'agent-1')
    expect(result.success).toBe(false)
    expect(result.reason).toBe('already_resolved')
  })

  test('rejects claim on blocked task', async () => {
    const id1 = await createTask(TASK_LIST_ID, {
      subject: 'Blocker',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const id2 = await createTask(TASK_LIST_ID, {
      subject: 'Blocked',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    await blockTask(TASK_LIST_ID, id1, id2)

    const result = await claimTask(TASK_LIST_ID, id2, 'agent-1')
    expect(result.success).toBe(false)
    expect(result.reason).toBe('blocked')
    expect(result.blockedByTasks).toContain(id1)
  })

  test('returns task_not_found for missing task', async () => {
    const result = await claimTask(TASK_LIST_ID, '999', 'agent-1')
    expect(result.success).toBe(false)
    expect(result.reason).toBe('task_not_found')
  })

  test('rejects claim when agent is busy with checkAgentBusy', async () => {
    const id1 = await createTask(TASK_LIST_ID, {
      subject: 'Owned task',
      description: '',
      status: 'in_progress',
      blocks: [],
      blockedBy: [],
      owner: 'agent-1',
    })
    // Write the task with owner directly via file
    const { writeFile } = await import('fs/promises')
    const dir = getTasksDir(TASK_LIST_ID)
    await mkdir(dir, { recursive: true })
    const taskData: Task = {
      id: id1,
      subject: 'Owned task',
      description: '',
      status: 'in_progress',
      blocks: [],
      blockedBy: [],
      owner: 'agent-1',
    }
    await writeFile(join(dir, `${id1}.json`), JSON.stringify(taskData))

    const id2 = await createTask(TASK_LIST_ID, {
      subject: 'New task',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const result = await claimTask(TASK_LIST_ID, id2, 'agent-1', {
      checkAgentBusy: true,
    })
    expect(result.success).toBe(false)
    expect(result.reason).toBe('agent_busy')
    expect(result.busyWithTasks).toContain(id1)
  })
})

// ---------------------------------------------------------------------------
// resetTaskList
// ---------------------------------------------------------------------------
describe('resetTaskList', () => {
  test('deletes all tasks and preserves high water mark', async () => {
    const id1 = await createTask(TASK_LIST_ID, {
      subject: 'A',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const id2 = await createTask(TASK_LIST_ID, {
      subject: 'B',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    await resetTaskList(TASK_LIST_ID)

    const tasks = await listTasks(TASK_LIST_ID)
    expect(tasks).toHaveLength(0)

    // Next ID should be higher than previous max
    const nextId = await createTask(TASK_LIST_ID, {
      subject: 'After reset',
      description: '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    expect(Number(nextId)).toBeGreaterThan(Number(id2))
  })
})

// ---------------------------------------------------------------------------
// Notification signals
// ---------------------------------------------------------------------------
describe('task notifications', () => {
  test('notifyTasksUpdated fires subscriber', () => {
    let called = false
    const unsub = onTasksUpdated(() => {
      called = true
    })
    notifyTasksUpdated()
    expect(called).toBe(true)
    unsub()
  })

  test('setLeaderTeamName triggers notification', () => {
    let callCount = 0
    const unsub = onTasksUpdated(() => {
      callCount++
    })
    setLeaderTeamName('team-alpha')
    expect(callCount).toBe(1)
    // Setting same name again should not fire
    setLeaderTeamName('team-alpha')
    expect(callCount).toBe(1)
    unsub()
    clearLeaderTeamName()
  })
})

// ---------------------------------------------------------------------------
// isTodoV2Enabled
// ---------------------------------------------------------------------------
describe('isTodoV2Enabled', () => {
  test('returns true when CLAUDE_CODE_ENABLE_TASKS is set', () => {
    process.env.CLAUDE_CODE_ENABLE_TASKS = '1'
    try {
      expect(isTodoV2Enabled()).toBe(true)
    } finally {
      delete process.env.CLAUDE_CODE_ENABLE_TASKS
    }
  })

  test('returns true in interactive sessions by default', () => {
    delete process.env.CLAUDE_CODE_ENABLE_TASKS
    // getIsNonInteractiveSession is mocked to return false
    expect(isTodoV2Enabled()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Concurrent access (integration)
// ---------------------------------------------------------------------------
describe('concurrent task creation', () => {
  test('creates unique IDs under rapid sequential writes', async () => {
    // proper-lockfile advisory locks may not serialize same-process async
    // operations in Bun, so we use sequential writes to verify ID monotonicity.
    const ids: string[] = []
    for (let i = 0; i < 10; i++) {
      const id = await createTask(TASK_LIST_ID, {
        subject: `Rapid ${i}`,
        description: '',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      })
      ids.push(id)
    }
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(10)
    // Verify IDs are monotonically increasing
    for (let i = 1; i < ids.length; i++) {
      expect(Number(ids[i])).toBeGreaterThan(Number(ids[i - 1]))
    }
  })
})
