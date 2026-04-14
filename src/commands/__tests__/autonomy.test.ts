import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import autonomyCommand from '../autonomy'
import type { LocalCommandResult } from '../../types/command'
import {
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state'

function expectTextResult(
  result: LocalCommandResult,
): asserts result is Extract<LocalCommandResult, { type: 'text' }> {
  if (result.type !== 'text')
    throw new Error(`Expected text result, got ${result.type}`)
}
import { listAutonomyFlows } from '../../utils/autonomyFlows'
import {
  createAutonomyQueuedPrompt,
  markAutonomyRunCompleted,
  startManagedAutonomyFlowFromHeartbeatTask,
} from '../../utils/autonomyRuns'
import {
  enqueuePendingNotification,
  getCommandQueueSnapshot,
  resetCommandQueue,
} from '../../utils/messageQueueManager'
import { cleanupTempDir, createTempDir } from '../../../tests/mocks/file-system'

let tempDir = ''

beforeEach(async () => {
  tempDir = await createTempDir('autonomy-command-')
  resetStateForTests()
  resetCommandQueue()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  resetCommandQueue()
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('/autonomy', () => {
  test('status reports autonomy runs and managed flows separately', async () => {
    const plainRun = await createAutonomyQueuedPrompt({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceLabel: 'nightly',
    })
    expect(plainRun).not.toBeNull()
    await markAutonomyRunCompleted(plainRun!.autonomy!.runId, tempDir)

    await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          {
            name: 'gather',
            prompt: 'Gather weekly inputs',
          },
          {
            name: 'draft',
            prompt: 'Draft the weekly report',
          },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })

    const mod = await autonomyCommand.load()
    const result = await mod.call('', {} as any)

    expectTextResult(result)
    expect(result.value).toContain('Autonomy runs: 2')
    expect(result.value).toContain('Autonomy flows: 1')
    expect(result.value).toContain('Completed: 1')
    expect(result.value).toContain('Queued: 1')
  })

  test('runs subcommand lists recent autonomy runs', async () => {
    const queued = await createAutonomyQueuedPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
    })

    const mod = await autonomyCommand.load()
    const result = await mod.call('runs 5', {} as any)

    expectTextResult(result)
    expect(result.value).toContain(queued!.autonomy!.runId)
    expect(result.value).toContain('proactive-tick')
  })

  test('flows subcommand lists managed flows and flow subcommand shows detail', async () => {
    await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          {
            name: 'gather',
            prompt: 'Gather weekly inputs',
          },
          {
            name: 'draft',
            prompt: 'Draft the weekly report',
          },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })

    const [flow] = await listAutonomyFlows(tempDir)
    const mod = await autonomyCommand.load()

    const flowsResult = await mod.call('flows 5', {} as any)
    expectTextResult(flowsResult)
    expect(flowsResult.value).toContain(flow!.flowId)
    expect(flowsResult.value).toContain('managed')

    const flowResult = await mod.call(`flow ${flow!.flowId}`, {} as any)
    expectTextResult(flowResult)
    expect(flowResult.value).toContain(`Flow: ${flow!.flowId}`)
    expect(flowResult.value).toContain('Mode: managed')
    expect(flowResult.value).toContain('Current step: gather')
  })

  test('flow resume queues the next waiting step', async () => {
    const waitingStart = await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          {
            name: 'gather',
            prompt: 'Gather weekly inputs',
            waitFor: 'manual',
          },
          {
            name: 'draft',
            prompt: 'Draft the weekly report',
          },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })

    expect(waitingStart).toBeNull()
    const [flow] = await listAutonomyFlows(tempDir)

    const mod = await autonomyCommand.load()
    const result = await mod.call(`flow resume ${flow!.flowId}`, {} as any)

    expectTextResult(result)
    expect(result.value).toContain('Queued the next managed step')
    expect(getCommandQueueSnapshot()).toHaveLength(1)
    expect(getCommandQueueSnapshot()[0]!.autonomy?.flowId).toBe(flow!.flowId)
  })

  test('flow cancel removes queued managed steps and marks the flow cancelled', async () => {
    const queued = await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          {
            name: 'gather',
            prompt: 'Gather weekly inputs',
          },
          {
            name: 'draft',
            prompt: 'Draft the weekly report',
          },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })

    expect(queued).not.toBeNull()
    enqueuePendingNotification(queued!)
    expect(getCommandQueueSnapshot()).toHaveLength(1)
    const [flow] = await listAutonomyFlows(tempDir)
    const mod = await autonomyCommand.load()
    const result = await mod.call(`flow cancel ${flow!.flowId}`, {} as any)
    const [cancelledFlow] = await listAutonomyFlows(tempDir)

    expectTextResult(result)
    expect(result.value).toContain('Cancelled flow')
    expect(cancelledFlow!.status).toBe('cancelled')
    expect(getCommandQueueSnapshot()).toHaveLength(0)
  })

  test('flow cancel refuses to rewrite a terminal managed flow', async () => {
    const queued = await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          {
            name: 'gather',
            prompt: 'Gather weekly inputs',
          },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })

    await markAutonomyRunCompleted(queued!.autonomy!.runId, tempDir)

    const [flow] = await listAutonomyFlows(tempDir)
    const mod = await autonomyCommand.load()
    const result = await mod.call(`flow cancel ${flow!.flowId}`, {} as any)
    const [terminalFlow] = await listAutonomyFlows(tempDir)

    expectTextResult(result)
    expect(result.value).toContain('already terminal')
    expect(terminalFlow!.status).toBe('succeeded')
  })

  test('invalid subcommands return usage text', async () => {
    const mod = await autonomyCommand.load()
    const result = await mod.call('unknown', {} as any)

    expectTextResult(result)
    expect(result.value).toContain('Usage: /autonomy')
  })
})
