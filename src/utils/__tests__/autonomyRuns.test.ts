import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  resetStateForTests,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state'
import {
  formatAutonomyRunsList,
  formatAutonomyRunsStatus,
  listAutonomyRuns,
  createAutonomyQueuedPrompt,
  createProactiveAutonomyCommands,
  finalizeAutonomyRunCompleted,
  markAutonomyRunCompleted,
  markAutonomyRunFailed,
  markAutonomyRunRunning,
  recoverManagedAutonomyFlowPrompt,
  resolveAutonomyRunsPath,
  startManagedAutonomyFlowFromHeartbeatTask,
} from '../autonomyRuns'
import {
  formatAutonomyFlowsList,
  getAutonomyFlowById,
  listAutonomyFlows,
} from '../autonomyFlows'
import {
  AUTONOMY_DIR,
  resetAutonomyAuthorityForTests,
} from '../autonomyAuthority'
import { resetCommandQueue } from '../messageQueueManager'
import {
  cleanupTempDir,
  createTempDir,
  createTempSubdir,
  writeTempFile,
} from '../../../tests/mocks/file-system'

const AGENTS_REL = join(AUTONOMY_DIR, 'AGENTS.md')
const HEARTBEAT_REL = join(AUTONOMY_DIR, 'HEARTBEAT.md')

let tempDir = ''

beforeEach(async () => {
  tempDir = await createTempDir('autonomy-runs-')
  resetStateForTests()
  resetAutonomyAuthorityForTests()
  resetCommandQueue()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  resetAutonomyAuthorityForTests()
  resetCommandQueue()
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('autonomyRuns', () => {
  test('createAutonomyQueuedPrompt records a queued automatic run and returns a prompt command', async () => {
    const currentDir = await createTempSubdir(tempDir, 'nested')
    await writeTempFile(tempDir, AGENTS_REL, 'root authority')

    const command = await createAutonomyQueuedPrompt({
      basePrompt: 'Review nightly report',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir,
      sourceId: 'cron-1',
      sourceLabel: 'nightly-report',
      workload: 'cron',
    })

    const runs = await listAutonomyRuns(tempDir)
    const flows = await listAutonomyFlows(tempDir)

    expect(command).not.toBeNull()
    expect(command!.mode).toBe('prompt')
    expect(command!.isMeta).toBe(true)
    expect(command!.autonomy?.trigger).toBe('scheduled-task')
    expect(command!.autonomy?.sourceId).toBe('cron-1')
    expect(command!.origin).toBeDefined()
    expect(command!.value).toContain('root authority')
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      runId: command!.autonomy?.runId,
      runtime: 'automatic',
      trigger: 'scheduled-task',
      status: 'queued',
      ownerKey: 'main-thread',
      sourceId: 'cron-1',
      sourceLabel: 'nightly-report',
    })
    expect(flows).toHaveLength(0)
    expect(resolveAutonomyRunsPath(tempDir)).toContain('.claude')
  })

  test('createAutonomyQueuedPrompt defaults currentDir to the active cwd for nested authority', async () => {
    const nestedDir = await createTempSubdir(tempDir, 'nested')
    await writeTempFile(tempDir, AGENTS_REL, 'root authority')
    await writeTempFile(nestedDir, AGENTS_REL, 'nested authority')
    setOriginalCwd(nestedDir)
    setCwdState(nestedDir)

    const command = await createAutonomyQueuedPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
    })

    expect(command).not.toBeNull()
    expect(command!.value).toContain('root authority')
    expect(command!.value).toContain('nested authority')
  })

  test('markAutonomyRunRunning/completed/failed update persisted lifecycle state for plain runs', async () => {
    const command = await createAutonomyQueuedPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(command).not.toBeNull()
    const runId = command!.autonomy!.runId

    await markAutonomyRunRunning(runId, tempDir, 100)
    let runs = await listAutonomyRuns(tempDir)
    expect(runs[0]).toMatchObject({
      runId,
      status: 'running',
      startedAt: 100,
    })

    await markAutonomyRunCompleted(runId, tempDir, 200)
    runs = await listAutonomyRuns(tempDir)
    expect(runs[0]).toMatchObject({
      runId,
      status: 'completed',
      endedAt: 200,
    })

    await markAutonomyRunFailed(runId, 'boom', tempDir, 300)
    runs = await listAutonomyRuns(tempDir)
    expect(runs[0]).toMatchObject({
      runId,
      status: 'failed',
      endedAt: 300,
      error: 'boom',
    })
  })

  test('formatters produce readable status and run listings', async () => {
    const first = await createAutonomyQueuedPrompt({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceId: 'cron-1',
      sourceLabel: 'nightly',
    })
    const second = await createAutonomyQueuedPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
    })

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    await markAutonomyRunRunning(first!.autonomy!.runId, tempDir, 100)
    await markAutonomyRunCompleted(first!.autonomy!.runId, tempDir, 200)
    await markAutonomyRunFailed(
      second!.autonomy!.runId,
      'stopped',
      tempDir,
      300,
    )

    const runs = await listAutonomyRuns(tempDir)
    const status = formatAutonomyRunsStatus(runs)
    const list = formatAutonomyRunsList(runs, 5)
    const flows = await listAutonomyFlows(tempDir)
    const flowList = formatAutonomyFlowsList(flows, 5)

    expect(status).toContain('Autonomy runs: 2')
    expect(status).toContain('Completed: 1')
    expect(status).toContain('Failed: 1')
    expect(list).toContain(first!.autonomy!.runId)
    expect(list).toContain(second!.autonomy!.runId)
    expect(list).toContain('nightly')
    expect(list).toContain('stopped')
    expect(flowList).toBe('No autonomy flows recorded.')
  })

  test('same-process concurrent run creation does not lose updates', async () => {
    await Promise.all([
      createAutonomyQueuedPrompt({
        basePrompt: 'scheduled one',
        trigger: 'scheduled-task',
        rootDir: tempDir,
        currentDir: tempDir,
        sourceId: 'cron-1',
      }),
      createAutonomyQueuedPrompt({
        basePrompt: 'scheduled two',
        trigger: 'scheduled-task',
        rootDir: tempDir,
        currentDir: tempDir,
        sourceId: 'cron-2',
      }),
    ])

    const runs = await listAutonomyRuns(tempDir)

    expect(runs).toHaveLength(2)
    expect(new Set(runs.map(run => run.sourceId))).toEqual(
      new Set(['cron-1', 'cron-2']),
    )
  })

  test('listAutonomyRuns keeps older persisted records by normalizing missing runtime and owner metadata', async () => {
    const runsPath = resolveAutonomyRunsPath(tempDir)
    await mkdir(join(tempDir, '.claude', 'autonomy'), { recursive: true })
    await writeFile(
      runsPath,
      `${JSON.stringify(
        {
          runs: [
            {
              runId: 'legacy-run',
              trigger: 'scheduled-task',
              status: 'completed',
              rootDir: tempDir,
              promptPreview: 'legacy prompt',
              createdAt: 123,
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf-8',
    )

    const [legacy] = await listAutonomyRuns(tempDir)

    expect(legacy).toMatchObject({
      runId: 'legacy-run',
      runtime: 'automatic',
      ownerKey: 'main-thread',
      currentDir: tempDir,
      status: 'completed',
    })
  })

  test('createAutonomyQueuedPrompt does not consume heartbeat tasks or create runs when shouldCreate rejects commit', async () => {
    await writeTempFile(
      tempDir,
      HEARTBEAT_REL,
      [
        'tasks:',
        '  - name: inbox',
        '    interval: 30m',
        '    prompt: "Check inbox"',
      ].join('\n'),
    )

    const skipped = await createAutonomyQueuedPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
      shouldCreate: () => false,
    })
    const committed = await createAutonomyQueuedPrompt({
      basePrompt: '<tick>12:01:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
    })

    const runs = await listAutonomyRuns(tempDir)

    expect(skipped).toBeNull()
    expect(committed).not.toBeNull()
    expect(committed!.value).toContain('Due HEARTBEAT.md tasks:')
    expect(runs).toHaveLength(1)
  })

  test('createProactiveAutonomyCommands queues one managed flow step command per due HEARTBEAT flow', async () => {
    await writeTempFile(
      tempDir,
      HEARTBEAT_REL,
      [
        'tasks:',
        '  - name: inbox',
        '    interval: 30m',
        '    prompt: "Check inbox"',
        '  - name: weekly-report',
        '    interval: 7d',
        '    prompt: "Ship the weekly report"',
        '    steps:',
        '      - name: gather',
        '        prompt: "Gather weekly inputs"',
        '      - name: draft',
        '        prompt: "Draft the weekly report"',
      ].join('\n'),
    )

    const commands = await createProactiveAutonomyCommands({
      basePrompt: '<tick>12:00:00</tick>',
      rootDir: tempDir,
      currentDir: tempDir,
    })

    const runs = await listAutonomyRuns(tempDir)
    const flows = await listAutonomyFlows(tempDir)

    expect(commands).toHaveLength(2)
    expect(commands[0]!.autonomy?.trigger).toBe('proactive-tick')
    expect(commands[0]!.value).toContain('- inbox (30m): Check inbox')
    expect(commands[1]!.autonomy?.trigger).toBe('managed-flow-step')
    expect(commands[1]!.value).toContain(
      'This is step 1/2 of the managed autonomy flow',
    )
    expect(runs).toHaveLength(2)
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({
      status: 'queued',
      currentStep: 'gather',
      goal: 'Ship the weekly report',
    })
  })

  test('finalizeAutonomyRunCompleted advances managed flows to the next queued step', async () => {
    const command = await startManagedAutonomyFlowFromHeartbeatTask({
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

    expect(command).not.toBeNull()
    await markAutonomyRunRunning(command!.autonomy!.runId, tempDir, 100)

    const nextCommands = await finalizeAutonomyRunCompleted({
      runId: command!.autonomy!.runId,
      rootDir: tempDir,
      currentDir: tempDir,
    })

    const runs = await listAutonomyRuns(tempDir)
    const [flow] = await listAutonomyFlows(tempDir)
    const detail = await getAutonomyFlowById(flow!.flowId, tempDir)

    expect(nextCommands).toHaveLength(1)
    expect(nextCommands[0]!.autonomy?.trigger).toBe('managed-flow-step')
    expect(nextCommands[0]!.value).toContain('Current step: draft')
    expect(runs).toHaveLength(2)
    expect(flow).toMatchObject({
      status: 'queued',
      currentStep: 'draft',
      runCount: 2,
    })
    expect(detail?.stateJson?.steps.map(step => step.status)).toEqual([
      'completed',
      'queued',
    ])
  })

  test('recoverManagedAutonomyFlowPrompt rehydrates a queued managed step with the same run id', async () => {
    const command = await startManagedAutonomyFlowFromHeartbeatTask({
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
    const recovered = await recoverManagedAutonomyFlowPrompt({
      flowId: flow!.flowId,
      rootDir: tempDir,
      currentDir: tempDir,
    })

    expect(recovered).not.toBeNull()
    expect(recovered!.autonomy?.runId).toBe(command!.autonomy?.runId)
    expect(recovered!.autonomy?.flowId).toBe(flow!.flowId)
  })
})
