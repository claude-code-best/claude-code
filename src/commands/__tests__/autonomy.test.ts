import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type React from 'react'
import autonomyCommand from '../autonomy'
import {
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state'

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
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { writeRegistry } from '../../utils/pipeRegistry'
import { getAutonomyPanelBaseActionCountForTests } from '../autonomyPanel'

let tempDir = ''
let previousConfigDir: string | undefined

async function callAutonomy(args = ''): Promise<{
  result?: string
}> {
  const mod = await autonomyCommand.load()
  let result: string | undefined
  const onDone = (text: string) => {
    result = text
  }
  await mod.call(onDone as any, {} as any, args)
  return { result }
}

beforeEach(async () => {
  tempDir = await createTempDir('autonomy-command-')
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = join(tempDir, 'config')
  resetStateForTests()
  resetCommandQueue()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  resetCommandQueue()
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('/autonomy', () => {
  test('without args renders the autonomy panel', async () => {
    const mod = await autonomyCommand.load()
    let onDoneCalled = false
    const onDone = () => {
      onDoneCalled = true
    }
    const jsx = await mod.call(onDone as any, {} as any, '')
    // Without args, the panel JSX is returned (onDone is NOT called)
    expect(jsx).not.toBeNull()
    expect(onDoneCalled).toBe(false)
    expect(getAutonomyPanelBaseActionCountForTests()).toBeGreaterThan(10)
  })

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

    const { result } = await callAutonomy('status')

    expect(result).toContain('Autonomy runs: 2')
    expect(result).toContain('Autonomy flows: 1')
    expect(result).toContain('Completed: 1')
    expect(result).toContain('Queued: 1')
  })

  test('runs subcommand lists recent autonomy runs', async () => {
    const queued = await createAutonomyQueuedPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
    })

    const { result } = await callAutonomy('runs 5')

    expect(result).toContain(queued!.autonomy!.runId)
    expect(result).toContain('proactive-tick')
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
    const flowsResult = await callAutonomy('flows 5')
    expect(flowsResult.result).toContain(flow!.flowId)
    expect(flowsResult.result).toContain('managed')

    const flowResult = await callAutonomy(`flow ${flow!.flowId}`)
    expect(flowResult.result).toContain(`Flow: ${flow!.flowId}`)
    expect(flowResult.result).toContain('Mode: managed')
    expect(flowResult.result).toContain('Current step: gather')
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

    const { result } = await callAutonomy(`flow resume ${flow!.flowId}`)

    expect(result).toContain('Queued the next managed step')
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
    const { result } = await callAutonomy(`flow cancel ${flow!.flowId}`)
    const [cancelledFlow] = await listAutonomyFlows(tempDir)

    expect(result).toContain('Cancelled flow')
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
    const { result } = await callAutonomy(`flow cancel ${flow!.flowId}`)
    const [terminalFlow] = await listAutonomyFlows(tempDir)

    expect(result).toContain('already terminal')
    expect(terminalFlow!.status).toBe('succeeded')
  })

  test('invalid subcommands return usage text', async () => {
    const { result } = await callAutonomy('unknown')

    expect(result).toContain('Usage: /autonomy')
  })

  test('status --deep reports local autonomy health surfaces', async () => {
    const run = await createAutonomyQueuedPrompt({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceLabel: 'nightly',
    })
    expect(run).not.toBeNull()

    await mkdir(join(tempDir, '.claude'), { recursive: true })
    await writeFile(
      join(tempDir, '.claude', 'scheduled_tasks.json'),
      JSON.stringify({
        tasks: [
          {
            id: 'cron1',
            cron: '0 9 * * *',
            prompt: 'Daily check',
            createdAt: Date.now(),
            recurring: true,
          },
        ],
      }),
    )
    await mkdir(join(tempDir, '.claude', 'workflow-runs'), {
      recursive: true,
    })
    await writeFile(
      join(tempDir, '.claude', 'workflow-runs', 'workflow-1.json'),
      JSON.stringify({
        runId: 'workflow-1',
        workflow: 'release',
        status: 'running',
        createdAt: 1,
        updatedAt: 2,
        currentStepIndex: 0,
        steps: [
          {
            name: 'Run tests',
            prompt: 'Run focused tests',
            status: 'running',
            startedAt: 2,
          },
        ],
      }),
    )

    const teamDir = join(process.env.CLAUDE_CONFIG_DIR ?? '', 'teams', 'alpha')
    await mkdir(teamDir, { recursive: true })
    await writeFile(
      join(teamDir, 'config.json'),
      JSON.stringify({
        name: 'alpha',
        createdAt: Date.now(),
        leadAgentId: 'team-lead@alpha',
        members: [
          {
            agentId: 'team-lead@alpha',
            name: 'team-lead',
            joinedAt: Date.now(),
            tmuxPaneId: '',
            cwd: tempDir,
            subscriptions: [],
          },
          {
            agentId: 'worker@alpha',
            name: 'worker',
            joinedAt: Date.now(),
            tmuxPaneId: 'in-process',
            cwd: tempDir,
            subscriptions: [],
            backendType: 'in-process',
            isActive: false,
          },
        ],
      }),
    )
    await writeRegistry({
      version: 1,
      mainMachineId: 'machine-main-123456',
      main: {
        id: 'main-id',
        pid: 123,
        machineId: 'machine-main-123456',
        startedAt: 1,
        ip: '127.0.0.1',
        mac: '00:11:22:33:44:55',
        hostname: 'main-host',
        pipeName: 'main-pipe',
      },
      subs: [],
    })

    const { result } = await callAutonomy('status --deep')

    expect(result).toContain('# Autonomy Deep Status')
    expect(result).toContain('Auto mode:')
    expect(result).toContain('## Runs')
    expect(result).toContain('Autonomy runs: 1')
    expect(result).toContain('## Cron')
    expect(result).toContain('Cron jobs: 1')
    expect(result).toContain('## Workflow Runs')
    expect(result).toContain('Workflow runs: 1')
    expect(result).toContain('workflow-1: release: running')
    expect(result).toContain('## Teams')
    expect(result).toContain('alpha: teammates=1')
    expect(result).toContain('@worker: idle backend=in-process')
    expect(result).toContain('## Pipes')
    expect(result).toContain('Pipe registry: 1 main, 0 sub(s)')
    expect(result).toContain('## Runtime')
    expect(result).toContain('Daemon:')
    expect(result).toContain('## Remote Control')
    expect(result).toContain('Remote Control:')
  })
})
