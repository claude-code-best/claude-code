import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  getSessionCronTasks,
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state'
import {
  addCronTask,
  findMissedTasks,
  getCronFilePath,
  hasCronTasksSync,
  listAllCronTasks,
  markCronTasksFired,
  nextCronRunMs,
  oneShotJitteredNextCronRunMs,
  readCronTasks,
  removeCronTasks,
  writeCronTasks,
} from '../cronTasks'
import { cleanupTempDir, createTempDir } from '../../../tests/mocks/file-system'

let tempDir = ''

beforeEach(async () => {
  tempDir = await createTempDir('cron-baseline-')
  resetStateForTests()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('cronTasks baseline', () => {
  test('session-only cron tasks remain in memory and do not create the cron file', async () => {
    const id = await addCronTask(
      '* * * * *',
      'session-only prompt',
      true,
      false,
    )

    const tasks = await listAllCronTasks()

    expect(id).toHaveLength(8)
    expect(getSessionCronTasks()).toHaveLength(1)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      id,
      prompt: 'session-only prompt',
      durable: false,
      recurring: true,
    })
    expect(existsSync(getCronFilePath())).toBe(false)
  })

  test('durable cron tasks are written to .claude/scheduled_tasks.json', async () => {
    const id = await addCronTask('* * * * *', 'durable prompt', true, true)

    const filePath = getCronFilePath()
    const fileTasks = await readCronTasks()

    expect(existsSync(filePath)).toBe(true)
    expect(filePath).toBe(join(tempDir, '.claude', 'scheduled_tasks.json'))
    expect(fileTasks).toHaveLength(1)
    expect(fileTasks[0]).toMatchObject({
      id,
      prompt: 'durable prompt',
      recurring: true,
    })
    expect(fileTasks[0].durable).toBeUndefined()
  })

  test('writeCronTasks strips runtime-only durable flags from disk', async () => {
    await writeCronTasks([
      {
        id: 'abc12345',
        cron: '* * * * *',
        prompt: 'strip durable',
        createdAt: 123,
        recurring: true,
        durable: false,
      },
    ])

    const raw = await readFile(getCronFilePath(), 'utf-8')
    expect(raw).not.toContain('"durable"')
  })

  test('hasCronTasksSync reflects whether the durable cron file has entries', async () => {
    expect(hasCronTasksSync()).toBe(false)

    await writeCronTasks([
      {
        id: 'sync0001',
        cron: '* * * * *',
        prompt: 'present',
        createdAt: 1,
      },
    ])

    expect(hasCronTasksSync()).toBe(true)
  })

  test('daemon-style listAllCronTasks(dir) excludes session-only tasks', async () => {
    await addCronTask('* * * * *', 'session prompt', true, false)
    const durableId = await addCronTask(
      '* * * * *',
      'durable prompt',
      true,
      true,
    )

    const sessionView = await listAllCronTasks()
    const daemonView = await listAllCronTasks(tempDir)

    expect(sessionView).toHaveLength(2)
    expect(daemonView).toHaveLength(1)
    expect(daemonView[0]).toMatchObject({
      id: durableId,
      prompt: 'durable prompt',
    })
  })

  test('removeCronTasks without dir removes session-only tasks from memory', async () => {
    const sessionId = await addCronTask('* * * * *', 'remove me', true, false)

    await removeCronTasks([sessionId])

    expect(getSessionCronTasks()).toHaveLength(0)
    expect(await listAllCronTasks()).toHaveLength(0)
  })

  test('removeCronTasks with dir does not mutate session-only task storage', async () => {
    const sessionId = await addCronTask(
      '* * * * *',
      'keep session task',
      true,
      false,
    )
    await addCronTask('* * * * *', 'durable prompt', true, true)

    await removeCronTasks([sessionId], tempDir)

    expect(getSessionCronTasks()).toHaveLength(1)
    expect(getSessionCronTasks()[0]?.id).toBe(sessionId)
  })

  test('markCronTasksFired persists lastFiredAt for durable tasks', async () => {
    await writeCronTasks([
      {
        id: 'fire0001',
        cron: '* * * * *',
        prompt: 'persist fired',
        createdAt: 100,
        recurring: true,
      },
    ])

    await markCronTasksFired(['fire0001'], 123456789)

    const tasks = await readCronTasks()
    expect(tasks[0]?.lastFiredAt).toBe(123456789)
  })

  test('findMissedTasks returns tasks whose first scheduled run is in the past', () => {
    const nowMs = new Date('2026-04-12T10:10:00').getTime()
    const tasks = findMissedTasks(
      [
        {
          id: 'missed01',
          cron: '* * * * *',
          prompt: 'old task',
          createdAt: new Date('2026-04-12T10:00:00').getTime(),
        },
        {
          id: 'future01',
          cron: '59 23 31 12 *',
          prompt: 'far future',
          createdAt: nowMs,
        },
      ],
      nowMs,
    )

    expect(tasks.map(t => t.id)).toEqual(['missed01'])
  })

  test('nextCronRunMs returns null for invalid cron expressions', () => {
    expect(nextCronRunMs('invalid cron', Date.now())).toBeNull()
  })

  test('oneShotJitteredNextCronRunMs never returns a time earlier than fromMs', () => {
    const fromMs = new Date('2026-04-12T10:59:50').getTime()
    const next = oneShotJitteredNextCronRunMs('0 11 * * *', fromMs, '00000000')

    expect(next).not.toBeNull()
    expect(next!).toBeGreaterThanOrEqual(fromMs)
  })

  test('jitteredNextCronRunMs returns the exact next fire time when no second match exists in range', () => {
    const fromMs = new Date('2026-04-12T10:00:00').getTime()
    const exact = nextCronRunMs('0 0 29 2 *', fromMs)
    const jittered = oneShotJitteredNextCronRunMs(
      '0 0 29 2 *',
      fromMs,
      '89abcdef',
    )

    expect(exact).not.toBeNull()
    expect(jittered).not.toBeNull()
    expect(jittered!).toBeGreaterThanOrEqual(fromMs)
  })
})
