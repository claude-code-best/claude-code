import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  resetStateForTests,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state'
import { createScheduledTaskQueuedCommand } from '../useScheduledTasks'
import {
  listAutonomyRuns,
  markAutonomyRunCompleted,
} from '../../utils/autonomyRuns'
import { resetAutonomyAuthorityForTests } from '../../utils/autonomyAuthority'
import { cleanupTempDir, createTempDir } from '../../../tests/mocks/file-system'

let tempDir = ''

beforeEach(async () => {
  tempDir = await createTempDir('scheduled-tasks-')
  resetStateForTests()
  resetAutonomyAuthorityForTests()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
  setCwdState(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  resetAutonomyAuthorityForTests()
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('createScheduledTaskQueuedCommand', () => {
  function createCommandForTest(task: { id: string; prompt: string }) {
    return createScheduledTaskQueuedCommand(task, {
      rootDir: tempDir,
      currentDir: tempDir,
    })
  }

  test('skips a scheduled task when the same source already has an active run', async () => {
    const task = {
      id: 'cron-1',
      prompt: '/loop review the repository',
    }

    const first = await createCommandForTest(task)
    const second = await createCommandForTest(task)
    const runs = await listAutonomyRuns(tempDir)

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      trigger: 'scheduled-task',
      status: 'queued',
      sourceId: 'cron-1',
    })
  })

  test('allows a scheduled task after the previous same-source run completes', async () => {
    const task = {
      id: 'cron-1',
      prompt: '/loop review the repository',
    }

    const first = await createCommandForTest(task)
    expect(first?.autonomy?.runId).toBeDefined()

    await markAutonomyRunCompleted(first!.autonomy!.runId, tempDir, 100)
    const second = await createCommandForTest(task)
    const runs = await listAutonomyRuns(tempDir)

    expect(second).not.toBeNull()
    expect(runs).toHaveLength(2)
    expect(runs.map(run => run.status).sort()).toEqual(['completed', 'queued'])
  })
})
