import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state'
import {
  createManagedAutonomyFlowKey,
  DEFAULT_AUTONOMY_OWNER_KEY,
  formatAutonomyFlowDetail,
  formatAutonomyFlowsList,
  formatAutonomyFlowsStatus,
  getAutonomyFlowById,
  listAutonomyFlows,
  markManagedAutonomyFlowStepCancelled,
  markManagedAutonomyFlowStepCompleted,
  markManagedAutonomyFlowStepFailed,
  markManagedAutonomyFlowStepRunning,
  queueManagedAutonomyFlowStepRun,
  requestManagedAutonomyFlowCancel,
  resolveAutonomyFlowsPath,
  resumeManagedAutonomyFlow,
  startManagedAutonomyFlow,
  type AutonomyFlowRecord,
  type ManagedAutonomyFlowStepDefinition,
} from '../autonomyFlows'
import { AUTONOMY_DIR } from '../autonomyAuthority'
import { cleanupTempDir, createTempDir } from '../../../tests/mocks/file-system'

let tempDir = ''

beforeEach(async () => {
  tempDir = await createTempDir('autonomy-flows-')
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

const TWO_STEPS: ManagedAutonomyFlowStepDefinition[] = [
  { name: 'gather', prompt: 'Gather inputs' },
  { name: 'draft', prompt: 'Draft the report' },
]

const STEPS_WITH_WAIT: ManagedAutonomyFlowStepDefinition[] = [
  { name: 'gather', prompt: 'Gather inputs', waitFor: 'manual-review' },
  { name: 'draft', prompt: 'Draft the report' },
]

describe('createManagedAutonomyFlowKey', () => {
  test('builds deterministic key from trigger and sourceId', () => {
    const key = createManagedAutonomyFlowKey({
      trigger: 'scheduled-task',
      sourceId: 'cron-1',
      goal: 'Do stuff',
    })
    expect(key).toBe('managed:scheduled-task:cron-1')
  })

  test('uses sourceLabel when sourceId is absent', () => {
    const key = createManagedAutonomyFlowKey({
      trigger: 'scheduled-task',
      sourceLabel: 'nightly',
      goal: 'Do stuff',
    })
    expect(key).toBe('managed:scheduled-task:nightly')
  })

  test('falls back to goal when no sourceId or sourceLabel', () => {
    const key = createManagedAutonomyFlowKey({
      trigger: 'scheduled-task',
      goal: 'Do stuff',
    })
    expect(key).toBe('managed:scheduled-task:Do stuff')
  })

  test('uses heartbeat-loop for proactive-tick without sourceId', () => {
    const key = createManagedAutonomyFlowKey({
      trigger: 'proactive-tick',
      goal: 'Tick goal',
    })
    expect(key).toBe('managed:proactive-tick:heartbeat-loop')
  })
})

describe('resolveAutonomyFlowsPath', () => {
  test('resolves to flows.json under the autonomy dir', () => {
    const path = resolveAutonomyFlowsPath(tempDir)
    expect(path).toContain(AUTONOMY_DIR)
    expect(path).toContain('flows.json')
  })
})

describe('listAutonomyFlows', () => {
  test('returns empty array when no file exists', async () => {
    const flows = await listAutonomyFlows(tempDir)
    expect(flows).toEqual([])
  })

  test('reads and normalizes flow records from disk', async () => {
    const flowsPath = resolveAutonomyFlowsPath(tempDir)
    await mkdir(join(tempDir, AUTONOMY_DIR), { recursive: true })
    await writeFile(
      flowsPath,
      JSON.stringify({
        flows: [
          {
            flowId: 'flow-1',
            flowKey: 'managed:scheduled-task:cron-1',
            syncMode: 'managed',
            trigger: 'scheduled-task',
            status: 'queued',
            rootDir: tempDir,
            goal: 'Test goal',
            createdAt: 100,
            updatedAt: 200,
            revision: 1,
            runCount: 0,
            ownerKey: DEFAULT_AUTONOMY_OWNER_KEY,
            currentDir: tempDir,
            stateJson: {
              currentStepIndex: 0,
              steps: [
                {
                  stepId: 'step-1',
                  name: 'gather',
                  prompt: 'Gather inputs',
                  status: 'pending',
                },
              ],
            },
          },
        ],
      }),
      'utf-8',
    )

    const flows = await listAutonomyFlows(tempDir)
    expect(flows).toHaveLength(1)
    expect(flows[0]?.flowId).toBe('flow-1')
    expect(flows[0]?.syncMode).toBe('managed')
    expect(flows[0]?.stateJson?.steps).toHaveLength(1)
  })

  test('filters out invalid records', async () => {
    const flowsPath = resolveAutonomyFlowsPath(tempDir)
    await mkdir(join(tempDir, AUTONOMY_DIR), { recursive: true })
    await writeFile(
      flowsPath,
      JSON.stringify({
        flows: [
          {
            flowId: 'valid-flow',
            flowKey: 'k',
            trigger: 'scheduled-task',
            status: 'queued',
            rootDir: tempDir,
            createdAt: 1,
            updatedAt: 2,
            goal: 'g',
            revision: 0,
            runCount: 0,
            ownerKey: 'main-thread',
            currentDir: tempDir,
          },
          { bad: true },
          null,
        ],
      }),
      'utf-8',
    )

    const flows = await listAutonomyFlows(tempDir)
    expect(flows).toHaveLength(1)
    expect(flows[0]?.flowId).toBe('valid-flow')
  })

  test('returns empty array for malformed JSON', async () => {
    const flowsPath = resolveAutonomyFlowsPath(tempDir)
    await mkdir(join(tempDir, AUTONOMY_DIR), { recursive: true })
    await writeFile(flowsPath, 'not json', 'utf-8')

    const flows = await listAutonomyFlows(tempDir)
    expect(flows).toEqual([])
  })
})

describe('startManagedAutonomyFlow', () => {
  test('returns null when steps array is empty', async () => {
    const result = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Test',
      steps: [],
      rootDir: tempDir,
    })
    expect(result).toBeNull()
  })

  test('creates a new flow with queued status and returns nextStep', async () => {
    const result = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Ship report',
      steps: TWO_STEPS,
      rootDir: tempDir,
      nowMs: 1000,
    })

    expect(result).not.toBeNull()
    expect(result!.started).toBe(true)
    expect(result!.flow.status).toBe('queued')
    expect(result!.flow.goal).toBe('Ship report')
    expect(result!.flow.currentStep).toBe('gather')
    expect(result!.flow.stateJson?.steps).toHaveLength(2)
    expect(result!.flow.stateJson?.steps[0]?.status).toBe('pending')
    expect(result!.nextStep).toBeDefined()
    expect(result!.nextStep!.stepIndex).toBe(0)
    expect(result!.nextStep!.step.name).toBe('gather')
  })

  test('sets status=waiting when first step has waitFor', async () => {
    const result = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Wait flow',
      steps: STEPS_WITH_WAIT,
      rootDir: tempDir,
      nowMs: 1000,
    })

    expect(result!.started).toBe(true)
    expect(result!.flow.status).toBe('waiting')
    expect(result!.flow.waitJson).toBeDefined()
    expect(result!.flow.waitJson!.reason).toBe('manual-review')
    expect(result!.nextStep).toBeUndefined()
  })

  test('returns started=false if active flow with same key exists', async () => {
    const first = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Ship report',
      steps: TWO_STEPS,
      rootDir: tempDir,
      sourceId: 'dup-key',
      nowMs: 1000,
    })
    expect(first!.started).toBe(true)

    const second = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Ship report',
      steps: TWO_STEPS,
      rootDir: tempDir,
      sourceId: 'dup-key',
      nowMs: 2000,
    })
    expect(second!.started).toBe(false)
    expect(second!.flow.flowId).toBe(first!.flow.flowId)
  })

  test('reuses flowId when restarting a completed flow', async () => {
    // Start and complete a flow
    const first = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Repeatable',
      steps: [{ name: 'only', prompt: 'Do it' }],
      rootDir: tempDir,
      sourceId: 'repeat-src',
      nowMs: 1000,
    })
    const flowId = first!.flow.flowId

    // Queue and complete
    await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId: first!.nextStep!.step.stepId,
      stepIndex: 0,
      runId: 'run-1',
      rootDir: tempDir,
      nowMs: 2000,
    })
    await markManagedAutonomyFlowStepRunning({
      flowId,
      runId: 'run-1',
      rootDir: tempDir,
      nowMs: 3000,
    })
    await markManagedAutonomyFlowStepCompleted({
      flowId,
      runId: 'run-1',
      rootDir: tempDir,
      nowMs: 4000,
    })

    // Verify it completed
    const completed = await getAutonomyFlowById(flowId, tempDir)
    expect(completed!.status).toBe('succeeded')

    // Restart with the same key
    const restarted = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Repeatable',
      steps: [{ name: 'only', prompt: 'Do it again' }],
      rootDir: tempDir,
      sourceId: 'repeat-src',
      nowMs: 5000,
    })

    expect(restarted!.started).toBe(true)
    expect(restarted!.flow.flowId).toBe(flowId)
    expect(restarted!.flow.revision).toBeGreaterThan(first!.flow.revision)
  })

  test('persists the flow to disk', async () => {
    await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Persist test',
      steps: TWO_STEPS,
      rootDir: tempDir,
      nowMs: 1000,
    })

    const raw = await readFile(resolveAutonomyFlowsPath(tempDir), 'utf-8')
    const parsed = JSON.parse(raw) as { flows: AutonomyFlowRecord[] }
    expect(parsed.flows).toHaveLength(1)
    expect(parsed.flows[0]?.goal).toBe('Persist test')
  })
})

describe('full lifecycle: start → queue → running → completed → succeeded', () => {
  test('advances through all steps to succeeded', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Full lifecycle',
      steps: TWO_STEPS,
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId
    const step0Id = startResult!.nextStep!.step.stepId

    // Queue step 0
    const queued = await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId: step0Id,
      stepIndex: 0,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 2000,
    })
    expect(queued!.status).toBe('queued')
    expect(queued!.latestRunId).toBe('run-0')
    expect(queued!.runCount).toBe(1)

    // Mark step 0 running
    const running = await markManagedAutonomyFlowStepRunning({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 3000,
    })
    expect(running!.status).toBe('running')
    expect(running!.startedAt).toBe(3000)

    // Complete step 0 — should auto-advance to step 1
    const advanced = await markManagedAutonomyFlowStepCompleted({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 4000,
    })
    expect(advanced!.flow.status).toBe('queued')
    expect(advanced!.flow.currentStep).toBe('draft')
    expect(advanced!.nextStep).toBeDefined()
    expect(advanced!.nextStep!.stepIndex).toBe(1)
    const step1Id = advanced!.nextStep!.step.stepId

    // Queue step 1
    await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId: step1Id,
      stepIndex: 1,
      runId: 'run-1',
      rootDir: tempDir,
      nowMs: 5000,
    })

    // Mark step 1 running
    await markManagedAutonomyFlowStepRunning({
      flowId,
      runId: 'run-1',
      rootDir: tempDir,
      nowMs: 6000,
    })

    // Complete step 1 — no more steps, should succeed
    const final = await markManagedAutonomyFlowStepCompleted({
      flowId,
      runId: 'run-1',
      rootDir: tempDir,
      nowMs: 7000,
    })
    expect(final!.flow.status).toBe('succeeded')
    expect(final!.flow.endedAt).toBe(7000)
    expect(final!.nextStep).toBeUndefined()

    // Verify persisted state
    const persisted = await getAutonomyFlowById(flowId, tempDir)
    expect(persisted!.status).toBe('succeeded')
    expect(persisted!.stateJson?.steps[0]?.status).toBe('completed')
    expect(persisted!.stateJson?.steps[1]?.status).toBe('completed')
  })
})

describe('lifecycle: step failure', () => {
  test('marks flow as failed when step fails', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Fail lifecycle',
      steps: TWO_STEPS,
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId
    const step0Id = startResult!.nextStep!.step.stepId

    await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId: step0Id,
      stepIndex: 0,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 2000,
    })
    await markManagedAutonomyFlowStepRunning({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 3000,
    })

    const failed = await markManagedAutonomyFlowStepFailed({
      flowId,
      runId: 'run-0',
      error: 'Something broke',
      rootDir: tempDir,
      nowMs: 4000,
    })

    expect(failed!.flow.status).toBe('failed')
    expect(failed!.flow.lastError).toBe('Something broke')
    expect(failed!.flow.blockedRunId).toBe('run-0')
    expect(failed!.flow.endedAt).toBe(4000)
    expect(failed!.flow.stateJson?.steps[0]?.status).toBe('failed')
    expect(failed!.flow.stateJson?.steps[0]?.error).toBe('Something broke')
  })
})

describe('lifecycle: waitFor → resume', () => {
  test('starts waiting then resumes and completes', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Wait then resume',
      steps: STEPS_WITH_WAIT,
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId
    expect(startResult!.flow.status).toBe('waiting')
    expect(startResult!.nextStep).toBeUndefined()

    // Resume the waiting flow
    const resumed = await resumeManagedAutonomyFlow({
      flowId,
      rootDir: tempDir,
      nowMs: 2000,
    })
    expect(resumed!.flow.status).toBe('queued')
    expect(resumed!.flow.waitJson).toBeUndefined()
    expect(resumed!.nextStep).toBeDefined()
    expect(resumed!.nextStep!.step.name).toBe('gather')

    // Queue, run, complete step 0
    const step0Id = resumed!.nextStep!.step.stepId
    await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId: step0Id,
      stepIndex: 0,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 3000,
    })
    await markManagedAutonomyFlowStepRunning({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 4000,
    })
    const afterStep0 = await markManagedAutonomyFlowStepCompleted({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 5000,
    })

    // Step 1 has no waitFor, so should auto-queue
    expect(afterStep0!.flow.status).toBe('queued')
    expect(afterStep0!.nextStep!.step.name).toBe('draft')

    // Complete step 1
    const step1Id = afterStep0!.nextStep!.step.stepId
    await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId: step1Id,
      stepIndex: 1,
      runId: 'run-1',
      rootDir: tempDir,
      nowMs: 6000,
    })
    await markManagedAutonomyFlowStepRunning({
      flowId,
      runId: 'run-1',
      rootDir: tempDir,
      nowMs: 7000,
    })
    const final = await markManagedAutonomyFlowStepCompleted({
      flowId,
      runId: 'run-1',
      rootDir: tempDir,
      nowMs: 8000,
    })
    expect(final!.flow.status).toBe('succeeded')
  })
})

describe('lifecycle: next step has waitFor', () => {
  test('completing a step transitions to waiting when next step has waitFor', async () => {
    const steps: ManagedAutonomyFlowStepDefinition[] = [
      { name: 'step-a', prompt: 'Do A' },
      { name: 'step-b', prompt: 'Do B', waitFor: 'approval' },
    ]
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Wait mid-flow',
      steps,
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId
    const step0Id = startResult!.nextStep!.step.stepId

    await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId: step0Id,
      stepIndex: 0,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 2000,
    })
    await markManagedAutonomyFlowStepRunning({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 3000,
    })
    const afterStep0 = await markManagedAutonomyFlowStepCompleted({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 4000,
    })

    expect(afterStep0!.flow.status).toBe('waiting')
    expect(afterStep0!.flow.waitJson).toBeDefined()
    expect(afterStep0!.flow.waitJson!.reason).toBe('approval')
    expect(afterStep0!.flow.waitJson!.stepName).toBe('step-b')
    expect(afterStep0!.nextStep).toBeUndefined()
  })
})

describe('requestManagedAutonomyFlowCancel', () => {
  test('immediate cancel when not running (queued)', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Cancel test',
      steps: TWO_STEPS,
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId

    const cancelResult = await requestManagedAutonomyFlowCancel({
      flowId,
      rootDir: tempDir,
      nowMs: 2000,
    })

    expect(cancelResult!.accepted).toBe(true)
    expect(cancelResult!.flow.status).toBe('cancelled')
    expect(cancelResult!.flow.endedAt).toBe(2000)
  })

  test('deferred cancel when step is running, completes on next step completion', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Deferred cancel',
      steps: TWO_STEPS,
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId
    const step0Id = startResult!.nextStep!.step.stepId

    // Queue and start running
    await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId: step0Id,
      stepIndex: 0,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 2000,
    })
    await markManagedAutonomyFlowStepRunning({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 3000,
    })

    // Request cancel while running — should be deferred
    const cancelResult = await requestManagedAutonomyFlowCancel({
      flowId,
      rootDir: tempDir,
      nowMs: 4000,
    })
    expect(cancelResult!.accepted).toBe(true)
    expect(cancelResult!.flow.status).toBe('running') // Still running
    expect(cancelResult!.flow.cancelRequestedAt).toBe(4000)

    // Complete the step — cancel should now take effect
    const completed = await markManagedAutonomyFlowStepCompleted({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 5000,
    })
    expect(completed!.flow.status).toBe('cancelled')
    expect(completed!.flow.endedAt).toBe(5000)
    // Remaining steps should be cancelled
    expect(completed!.flow.stateJson?.steps[1]?.status).toBe('cancelled')
  })

  test('returns accepted=false for already completed flow', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Already done',
      steps: [{ name: 'only', prompt: 'Do it' }],
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId
    const stepId = startResult!.nextStep!.step.stepId

    await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId,
      stepIndex: 0,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 2000,
    })
    await markManagedAutonomyFlowStepRunning({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 3000,
    })
    await markManagedAutonomyFlowStepCompleted({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 4000,
    })

    const cancelResult = await requestManagedAutonomyFlowCancel({
      flowId,
      rootDir: tempDir,
      nowMs: 5000,
    })
    expect(cancelResult!.accepted).toBe(false)
  })

  test('returns null for unknown flowId', async () => {
    const cancelResult = await requestManagedAutonomyFlowCancel({
      flowId: 'nonexistent',
      rootDir: tempDir,
      nowMs: 1000,
    })
    expect(cancelResult).toBeNull()
  })
})

describe('markManagedAutonomyFlowStepCancelled', () => {
  test('cancels the step and all remaining steps', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Cancel step',
      steps: [
        { name: 's1', prompt: 'p1' },
        { name: 's2', prompt: 'p2' },
        { name: 's3', prompt: 'p3' },
      ],
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId
    const step0Id = startResult!.nextStep!.step.stepId

    await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId: step0Id,
      stepIndex: 0,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 2000,
    })

    const cancelled = await markManagedAutonomyFlowStepCancelled({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 3000,
    })

    expect(cancelled!.flow.status).toBe('cancelled')
    expect(cancelled!.flow.endedAt).toBe(3000)
    expect(cancelled!.flow.stateJson?.steps[0]?.status).toBe('cancelled')
    expect(cancelled!.flow.stateJson?.steps[1]?.status).toBe('cancelled')
    expect(cancelled!.flow.stateJson?.steps[2]?.status).toBe('cancelled')
  })
})

describe('resumeManagedAutonomyFlow', () => {
  test('returns unchanged flow when not in waiting status', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Not waiting',
      steps: TWO_STEPS,
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId

    const resumed = await resumeManagedAutonomyFlow({
      flowId,
      rootDir: tempDir,
      nowMs: 2000,
    })

    // Flow is queued, not waiting, so resume should not change status
    expect(resumed!.flow.status).toBe('queued')
  })

  test('cancels when cancel was requested during wait', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Cancel during wait',
      steps: STEPS_WITH_WAIT,
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId
    expect(startResult!.flow.status).toBe('waiting')

    // Request cancel while waiting
    await requestManagedAutonomyFlowCancel({
      flowId,
      rootDir: tempDir,
      nowMs: 2000,
    })

    // The flow should already be cancelled since it's not running
    const flow = await getAutonomyFlowById(flowId, tempDir)
    expect(flow!.status).toBe('cancelled')
  })
})

describe('getAutonomyFlowById', () => {
  test('returns null when flow does not exist', async () => {
    const flow = await getAutonomyFlowById('nonexistent', tempDir)
    expect(flow).toBeNull()
  })

  test('returns the flow when it exists', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Find me',
      steps: TWO_STEPS,
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId

    const found = await getAutonomyFlowById(flowId, tempDir)
    expect(found).not.toBeNull()
    expect(found!.flowId).toBe(flowId)
    expect(found!.goal).toBe('Find me')
  })
})

describe('queueManagedAutonomyFlowStepRun edge cases', () => {
  test('returns null for unknown flowId', async () => {
    const result = await queueManagedAutonomyFlowStepRun({
      flowId: 'nonexistent',
      stepId: 'step-0',
      stepIndex: 0,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 1000,
    })
    expect(result).toBeNull()
  })

  test('returns unchanged flow for mismatched stepId', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Mismatch test',
      steps: TWO_STEPS,
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId

    const result = await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId: 'wrong-step-id',
      stepIndex: 0,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 2000,
    })

    // Should return the flow unchanged (still pending, not queued step)
    expect(result).not.toBeNull()
    expect(result!.stateJson?.steps[0]?.status).toBe('pending')
  })
})

describe('markManagedAutonomyFlowStepRunning edge cases', () => {
  test('returns null for unknown flowId', async () => {
    const result = await markManagedAutonomyFlowStepRunning({
      flowId: 'nonexistent',
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 1000,
    })
    expect(result).toBeNull()
  })
})

describe('markManagedAutonomyFlowStepFailed with cancelRequestedAt', () => {
  test('marks flow as cancelled (not failed) when cancel was requested', async () => {
    const startResult = await startManagedAutonomyFlow({
      trigger: 'scheduled-task',
      goal: 'Fail after cancel',
      steps: TWO_STEPS,
      rootDir: tempDir,
      nowMs: 1000,
    })
    const flowId = startResult!.flow.flowId
    const step0Id = startResult!.nextStep!.step.stepId

    await queueManagedAutonomyFlowStepRun({
      flowId,
      stepId: step0Id,
      stepIndex: 0,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 2000,
    })
    await markManagedAutonomyFlowStepRunning({
      flowId,
      runId: 'run-0',
      rootDir: tempDir,
      nowMs: 3000,
    })

    // Request cancel while running
    await requestManagedAutonomyFlowCancel({
      flowId,
      rootDir: tempDir,
      nowMs: 4000,
    })

    // Step fails — should result in cancelled (because cancel was requested)
    const result = await markManagedAutonomyFlowStepFailed({
      flowId,
      runId: 'run-0',
      error: 'step error',
      rootDir: tempDir,
      nowMs: 5000,
    })

    expect(result!.flow.status).toBe('cancelled')
    expect(result!.flow.lastError).toBe('step error')
  })
})

describe('formatAutonomyFlowsStatus', () => {
  test('formats counts for various statuses', () => {
    const flows: AutonomyFlowRecord[] = [
      makeMinimalFlow({ status: 'queued' }),
      makeMinimalFlow({ status: 'running' }),
      makeMinimalFlow({ status: 'succeeded' }),
      makeMinimalFlow({ status: 'succeeded' }),
      makeMinimalFlow({ status: 'failed' }),
    ]

    const status = formatAutonomyFlowsStatus(flows)
    expect(status).toContain('Autonomy flows: 5')
    expect(status).toContain('Queued: 1')
    expect(status).toContain('Running: 1')
    expect(status).toContain('Succeeded: 2')
    expect(status).toContain('Failed: 1')
    expect(status).toContain('Cancelled: 0')
  })
})

describe('formatAutonomyFlowsList', () => {
  test('returns message when no flows', () => {
    const list = formatAutonomyFlowsList([])
    expect(list).toBe('No autonomy flows recorded.')
  })

  test('formats flow list with source and step info', () => {
    const flows: AutonomyFlowRecord[] = [
      makeMinimalFlow({
        flowId: 'flow-abc',
        goal: 'Test goal',
        currentStep: 'gather',
        sourceLabel: 'nightly',
        revision: 3,
        runCount: 2,
        status: 'queued',
      }),
    ]

    const list = formatAutonomyFlowsList(flows)
    expect(list).toContain('flow-abc')
    expect(list).toContain('nightly')
    expect(list).toContain('step=gather')
    expect(list).toContain('rev=3')
    expect(list).toContain('goal=Test goal')
    expect(list).toContain('runs=2')
  })

  test('respects limit parameter', () => {
    const flows = Array.from({ length: 5 }, (_, i) =>
      makeMinimalFlow({ flowId: `flow-${i}` }),
    )

    const list = formatAutonomyFlowsList(flows, 2)
    expect(list).toContain('flow-0')
    expect(list).toContain('flow-1')
    expect(list).not.toContain('flow-2')
  })

  test('shows waiting info for waiting flows', () => {
    const flows: AutonomyFlowRecord[] = [
      makeMinimalFlow({
        status: 'waiting',
        waitJson: {
          reason: 'manual-review',
          stepId: 's1',
          stepName: 'review',
          stepIndex: 1,
        },
      }),
    ]

    const list = formatAutonomyFlowsList(flows)
    expect(list).toContain('waiting=manual-review')
  })
})

describe('formatAutonomyFlowDetail', () => {
  test('returns not found for null', () => {
    expect(formatAutonomyFlowDetail(null)).toBe('Autonomy flow not found.')
    expect(formatAutonomyFlowDetail(undefined)).toBe('Autonomy flow not found.')
  })

  test('formats full flow detail with steps', () => {
    const flow = makeMinimalFlow({
      flowId: 'detail-flow',
      flowKey: 'managed:scheduled-task:src',
      revision: 2,
      trigger: 'scheduled-task',
      status: 'running',
      goal: 'Detail test',
      sourceLabel: 'nightly',
      ownerKey: 'main-thread',
      currentStep: 'gather',
      runCount: 1,
      latestRunId: 'run-0',
      stateJson: {
        currentStepIndex: 0,
        steps: [
          {
            stepId: 's0',
            name: 'gather',
            prompt: 'Gather inputs',
            status: 'running',
            runId: 'run-0',
          },
          {
            stepId: 's1',
            name: 'draft',
            prompt: 'Draft report',
            status: 'pending',
            waitFor: 'approval',
          },
        ],
      },
    })

    const detail = formatAutonomyFlowDetail(flow)
    expect(detail).toContain('Flow: detail-flow')
    expect(detail).toContain('Key: managed:scheduled-task:src')
    expect(detail).toContain('Mode: managed')
    expect(detail).toContain('Revision: 2')
    expect(detail).toContain('Status: running')
    expect(detail).toContain('Goal: Detail test')
    expect(detail).toContain('Source: nightly')
    expect(detail).toContain('Current step: gather')
    expect(detail).toContain('1. gather | running | run=run-0')
    expect(detail).toContain('2. draft | pending | run=none | wait=approval')
  })

  test('includes error and blocked info', () => {
    const flow = makeMinimalFlow({
      status: 'failed',
      lastError: 'step exploded',
      blockedRunId: 'run-x',
      blockedSummary: 'step exploded',
    })

    const detail = formatAutonomyFlowDetail(flow)
    expect(detail).toContain('Error: step exploded')
    expect(detail).toContain('Blocked run: run-x')
    expect(detail).toContain('Blocked summary: step exploded')
  })

  test('includes cancel requested timestamp', () => {
    const flow = makeMinimalFlow({
      cancelRequestedAt: 99999,
    })
    const detail = formatAutonomyFlowDetail(flow)
    expect(detail).toContain('Cancel requested:')
  })
})

describe('concurrent startManagedAutonomyFlow calls', () => {
  test('do not lose updates', async () => {
    await Promise.all([
      startManagedAutonomyFlow({
        trigger: 'scheduled-task',
        goal: 'Flow A',
        steps: [{ name: 'a', prompt: 'A' }],
        rootDir: tempDir,
        sourceId: 'src-a',
        nowMs: 1000,
      }),
      startManagedAutonomyFlow({
        trigger: 'scheduled-task',
        goal: 'Flow B',
        steps: [{ name: 'b', prompt: 'B' }],
        rootDir: tempDir,
        sourceId: 'src-b',
        nowMs: 1000,
      }),
    ])

    const flows = await listAutonomyFlows(tempDir)
    expect(flows).toHaveLength(2)
    const goals = new Set(flows.map(f => f.goal))
    expect(goals).toEqual(new Set(['Flow A', 'Flow B']))
  })
})

// Helper to make minimal flow records for formatter tests
function makeMinimalFlow(
  overrides: Partial<AutonomyFlowRecord> = {},
): AutonomyFlowRecord {
  return {
    flowId: 'flow-0',
    flowKey: 'managed:scheduled-task:src',
    syncMode: 'managed',
    ownerKey: DEFAULT_AUTONOMY_OWNER_KEY,
    revision: 1,
    trigger: 'scheduled-task',
    status: 'queued',
    goal: 'Default goal',
    rootDir: '/tmp/test',
    currentDir: '/tmp/test',
    runCount: 0,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  }
}
