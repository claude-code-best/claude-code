import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join, resolve as resolvePath } from 'node:path'
import {
  resetStateForTests,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state'
import {
  createAutonomyRun,
  formatAutonomyRunsList,
  formatAutonomyRunsStatus,
  listAutonomyRuns,
  createAutonomyQueuedPrompt,
  createAutonomyQueuedPromptIfNoActiveSource,
  createProactiveAutonomyCommands,
  finalizeAutonomyRunCompleted,
  getAutonomyRunById,
  hasActiveAutonomyRunForSource,
  markAutonomyRunCompleted,
  markAutonomyRunCancelled,
  markAutonomyRunFailed,
  markAutonomyRunRunning,
  recoverManagedAutonomyFlowPrompt,
  resolveAutonomyRunsPath,
  STALE_ACTIVE_RUN_ERROR_PREFIX,
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
  readTempFile,
  tempPathExists,
  writeTempFile,
} from '../../../tests/mocks/file-system'

const AGENTS_REL = join(AUTONOMY_DIR, 'AGENTS.md')
const HEARTBEAT_REL = join(AUTONOMY_DIR, 'HEARTBEAT.md')
const RUNS_REL = join(AUTONOMY_DIR, 'runs.json')

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
      ownerProcessId: process.pid,
    })
    expect(runs[0]?.ownerSessionId).toBeString()
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

  test('markAutonomyRunRunning/completed update persisted lifecycle state for plain runs', async () => {
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
      ownerProcessId: process.pid,
    })
    expect(runs[0]?.ownerSessionId).toBeString()

    await markAutonomyRunCompleted(runId, tempDir, 200)
    runs = await listAutonomyRuns(tempDir)
    expect(runs[0]).toMatchObject({
      runId,
      status: 'completed',
      endedAt: 200,
    })
  })

  test('markAutonomyRunFailed updates a non-terminal run', async () => {
    const command = await createAutonomyQueuedPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(command).not.toBeNull()
    const runId = command!.autonomy!.runId

    await markAutonomyRunRunning(runId, tempDir, 100)
    await markAutonomyRunFailed(runId, 'boom', tempDir, 300)
    const runs = await listAutonomyRuns(tempDir)

    expect(runs[0]).toMatchObject({
      runId,
      status: 'failed',
      endedAt: 300,
      error: 'boom',
    })
  })

  test('terminal runs are not revived by stale lifecycle updates', async () => {
    const command = await createAutonomyQueuedPrompt({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(command).not.toBeNull()
    const runId = command!.autonomy!.runId

    await markAutonomyRunCancelled(runId, tempDir, 100)
    const revived = await markAutonomyRunRunning(runId, tempDir, 200)
    const completed = await markAutonomyRunCompleted(runId, tempDir, 300)
    const failed = await markAutonomyRunFailed(
      runId,
      'late failure',
      tempDir,
      400,
    )
    const persisted = await getAutonomyRunById(runId, tempDir)

    expect(revived).toBeNull()
    expect(completed).toBeNull()
    expect(failed).toBeNull()
    expect(persisted).toMatchObject({
      status: 'cancelled',
      endedAt: 100,
    })
    expect(persisted!.error).toBeUndefined()
  })

  test('hasActiveAutonomyRunForSource only treats queued and running scheduled runs as active', async () => {
    const command = await createAutonomyQueuedPrompt({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceId: 'cron-1',
      sourceLabel: 'nightly',
    })
    expect(command).not.toBeNull()
    const runId = command!.autonomy!.runId

    await expect(
      hasActiveAutonomyRunForSource({
        trigger: 'scheduled-task',
        sourceId: 'cron-1',
        rootDir: tempDir,
      }),
    ).resolves.toBe(true)

    await markAutonomyRunRunning(runId, tempDir, 100)
    await expect(
      hasActiveAutonomyRunForSource({
        trigger: 'scheduled-task',
        sourceId: 'cron-1',
        rootDir: tempDir,
      }),
    ).resolves.toBe(true)

    await expect(
      hasActiveAutonomyRunForSource({
        trigger: 'scheduled-task',
        sourceId: 'cron-2',
        rootDir: tempDir,
      }),
    ).resolves.toBe(false)

    await markAutonomyRunCompleted(runId, tempDir, 200)
    await expect(
      hasActiveAutonomyRunForSource({
        trigger: 'scheduled-task',
        sourceId: 'cron-1',
        rootDir: tempDir,
      }),
    ).resolves.toBe(false)

    const failedCommand = await createAutonomyQueuedPrompt({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceId: 'cron-1',
    })
    expect(failedCommand).not.toBeNull()
    await markAutonomyRunFailed(
      failedCommand!.autonomy!.runId,
      'boom',
      tempDir,
      300,
    )
    await expect(
      hasActiveAutonomyRunForSource({
        trigger: 'scheduled-task',
        sourceId: 'cron-1',
        rootDir: tempDir,
      }),
    ).resolves.toBe(false)
  })

  test('createAutonomyQueuedPromptIfNoActiveSource atomically skips duplicate active scheduled sources', async () => {
    const [first, second] = await Promise.all([
      createAutonomyQueuedPromptIfNoActiveSource({
        basePrompt: 'scheduled prompt',
        trigger: 'scheduled-task',
        rootDir: tempDir,
        currentDir: tempDir,
        sourceId: 'cron-1',
      }),
      createAutonomyQueuedPromptIfNoActiveSource({
        basePrompt: 'scheduled prompt',
        trigger: 'scheduled-task',
        rootDir: tempDir,
        currentDir: tempDir,
        sourceId: 'cron-1',
      }),
    ])

    const created = [first, second].filter(command => command !== null)
    const runs = await listAutonomyRuns(tempDir)

    expect(created).toHaveLength(1)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      trigger: 'scheduled-task',
      status: 'queued',
      sourceId: 'cron-1',
    })
  })

  test('createAutonomyQueuedPromptIfNoActiveSource scopes dedup by ownerKey', async () => {
    const first = await createAutonomyQueuedPromptIfNoActiveSource({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceId: 'cron-1',
      ownerKey: 'owner-a',
    })
    const second = await createAutonomyQueuedPromptIfNoActiveSource({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceId: 'cron-1',
      ownerKey: 'owner-b',
    })

    const runs = await listAutonomyRuns(tempDir)

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(runs).toHaveLength(2)
    expect(new Set(runs.map(run => run.ownerKey))).toEqual(
      new Set(['owner-a', 'owner-b']),
    )
  })

  test('createAutonomyQueuedPromptIfNoActiveSource does not advance heartbeat last-run state on dedup skip (two-phase commit invariant)', async () => {
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

    // Seed an active queued run for cron-1 so the next dedup attempt skips.
    await writeTempFile(
      tempDir,
      RUNS_REL,
      `${JSON.stringify(
        {
          runs: [
            {
              runId: 'preexisting-active',
              runtime: 'automatic',
              trigger: 'scheduled-task',
              status: 'queued',
              rootDir: tempDir,
              currentDir: tempDir,
              sourceId: 'cron-1',
              promptPreview: 'still queued',
              createdAt: 100,
              ownerProcessId: process.pid,
              ownerSessionId: 'self',
            },
          ],
        },
        null,
        2,
      )}\n`,
    )

    const skipped = await createAutonomyQueuedPromptIfNoActiveSource({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceId: 'cron-1',
    })
    expect(skipped).toBeNull()

    // If the dedup skip wrongly advanced heartbeat state, the next
    // proactive-tick prompt would NOT include the inbox task. Verify it
    // still does.
    const followUp = await createAutonomyQueuedPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(followUp).not.toBeNull()
    expect(followUp!.value).toContain('Due HEARTBEAT.md tasks:')
    expect(followUp!.value).toContain('- inbox (30m): Check inbox')
  })

  test('createAutonomyQueuedPromptIfNoActiveSource recovers stale active runs from dead owner processes', async () => {
    await writeTempFile(
      tempDir,
      RUNS_REL,
      `${JSON.stringify(
        {
          runs: [
            {
              runId: 'stale-run',
              runtime: 'automatic',
              trigger: 'scheduled-task',
              status: 'running',
              rootDir: tempDir,
              currentDir: tempDir,
              sourceId: 'cron-1',
              sourceLabel: 'nightly',
              promptPreview: 'stale scheduled prompt',
              createdAt: 100,
              startedAt: 100,
              ownerProcessId: 2_147_483_647,
              ownerSessionId: 'dead-session',
            },
          ],
        },
        null,
        2,
      )}\n`,
    )

    await expect(
      hasActiveAutonomyRunForSource({
        trigger: 'scheduled-task',
        sourceId: 'cron-1',
        rootDir: tempDir,
      }),
    ).resolves.toBe(false)

    const command = await createAutonomyQueuedPromptIfNoActiveSource({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceId: 'cron-1',
    })
    const runs = await listAutonomyRuns(tempDir)

    expect(command).not.toBeNull()
    expect(runs).toHaveLength(2)
    expect(runs[0]).toMatchObject({
      trigger: 'scheduled-task',
      status: 'queued',
      sourceId: 'cron-1',
      ownerProcessId: process.pid,
    })
    expect(runs[1]).toMatchObject({
      runId: 'stale-run',
      status: 'failed',
      endedAt: runs[0]?.createdAt,
      error: expect.stringContaining('owner process 2147483647'),
    })
  })

  test('stale managed-flow run recovery also marks the flow step failed', async () => {
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
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(command).not.toBeNull()
    const runId = command!.autonomy!.runId
    await markAutonomyRunRunning(runId, tempDir, 100)

    const runsPath = resolveAutonomyRunsPath(tempDir)
    const file = JSON.parse(await readTempFile(runsPath)) as {
      runs: Array<Record<string, unknown>>
    }
    file.runs = file.runs.map(run =>
      run.runId === runId ? { ...run, ownerProcessId: 2_147_483_647 } : run,
    )
    await writeTempFile(tempDir, RUNS_REL, `${JSON.stringify(file, null, 2)}\n`)

    const replacement = await createAutonomyQueuedPromptIfNoActiveSource({
      basePrompt: 'replacement prompt',
      trigger: 'managed-flow-step',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceId: command!.autonomy!.sourceId!,
      ownerKey: 'main-thread',
    })
    const [flow] = await listAutonomyFlows(tempDir)
    const runs = await listAutonomyRuns(tempDir)

    expect(replacement).not.toBeNull()
    expect(runs.find(run => run.runId === runId)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining(STALE_ACTIVE_RUN_ERROR_PREFIX),
    })
    expect(flow).toMatchObject({
      status: 'failed',
      blockedRunId: runId,
    })
    expect(flow?.stateJson?.steps[0]).toMatchObject({
      status: 'failed',
      runId,
      error: expect.stringContaining(STALE_ACTIVE_RUN_ERROR_PREFIX),
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

  test('persistence pruning keeps active runs ahead of recent completed history', async () => {
    const runs = [
      {
        runId: 'old-active',
        runtime: 'automatic',
        trigger: 'scheduled-task',
        status: 'queued',
        rootDir: tempDir,
        currentDir: tempDir,
        ownerKey: 'main-thread',
        promptPreview: 'old active',
        createdAt: 1,
      },
      ...Array.from({ length: 200 }, (_, index) => ({
        runId: `history-${index}`,
        runtime: 'automatic',
        trigger: 'scheduled-task',
        status: 'completed',
        rootDir: tempDir,
        currentDir: tempDir,
        ownerKey: 'main-thread',
        promptPreview: `history ${index}`,
        createdAt: 1_000 + index,
        endedAt: 2_000 + index,
      })),
    ]
    await writeTempFile(
      tempDir,
      RUNS_REL,
      `${JSON.stringify({ runs }, null, 2)}\n`,
    )

    await createAutonomyRun({
      trigger: 'scheduled-task',
      prompt: 'fresh active',
      rootDir: tempDir,
      currentDir: tempDir,
      nowMs: 9_999,
    })

    const persisted = await listAutonomyRuns(tempDir)
    expect(persisted).toHaveLength(200)
    expect(persisted.some(run => run.runId === 'old-active')).toBe(true)
    expect(persisted.some(run => run.runId === 'history-0')).toBe(false)
  })

  test('listAutonomyRuns keeps older persisted records by normalizing missing runtime and owner metadata', async () => {
    await writeTempFile(
      tempDir,
      RUNS_REL,
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

  test('STALE_ACTIVE_RUN_ERROR_PREFIX stays in sync with HEARTBEAT.md stale-recovery-health task', async () => {
    // The HEARTBEAT.md stale-recovery-health task prompt embeds this prefix
    // as a literal string. Changing the constant without updating the
    // heartbeat prompt would silently break the monitor — this test fails
    // first to force the simultaneous update.
    const heartbeatPath = resolvePath(
      import.meta.dir,
      '..',
      '..',
      '..',
      '.claude',
      'autonomy',
      'HEARTBEAT.md',
    )
    if (!(await tempPathExists(heartbeatPath))) {
      // .claude/ may be absent in some checkout layouts (e.g., shallow clone
      // for npm pack). Skip rather than fail in that case.
      return
    }
    const content = await readTempFile(heartbeatPath)
    expect(content).toContain(STALE_ACTIVE_RUN_ERROR_PREFIX)
  })
})
