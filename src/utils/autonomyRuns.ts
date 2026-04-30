import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { getProjectRoot, getSessionId } from '../bootstrap/state.js'
import type { MessageOrigin } from '../types/message.js'
import type { QueuedCommand } from '../types/textInputTypes.js'
import {
  AUTONOMY_DIR,
  buildAutonomyTurnPrompt,
  commitPreparedAutonomyTurn,
  prepareAutonomyTurnPrompt,
  type AutonomyTriggerKind,
  type HeartbeatAuthorityTask,
} from './autonomyAuthority.js'
import { getCwd } from './cwd.js'
import {
  DEFAULT_AUTONOMY_OWNER_KEY,
  getAutonomyFlowById,
  markManagedAutonomyFlowStepCancelled,
  markManagedAutonomyFlowStepCompleted,
  markManagedAutonomyFlowStepFailed,
  markManagedAutonomyFlowStepRunning,
  queueManagedAutonomyFlowStepRun,
  resumeManagedAutonomyFlow,
  startManagedAutonomyFlow,
  type AutonomyFlowRecord,
  type AutonomyFlowSyncMode,
  type ManagedAutonomyFlowStepDefinition,
} from './autonomyFlows.js'
import {
  retainActiveFirst,
  withAutonomyPersistenceLock,
} from './autonomyPersistence.js'
import { getFsImplementation } from './fsOperations.js'
import { isProcessRunning } from './genericProcessUtils.js'
import { logError } from './log.js'

const AUTONOMY_RUNS_MAX = 200
// Diagnostic threshold for active (queued/running) runs. Active records are
// deliberately exempt from AUTONOMY_RUNS_MAX so a leak in finalization cannot
// silently evict in-flight work; that exemption only makes sense if a leak is
// loud when it appears. Crossing this threshold warns once per process so
// operators see the divergence in logs before runs.json grows pathologically.
const AUTONOMY_ACTIVE_RUNS_WARN_THRESHOLD = 100
let warnedActiveRunsThresholdCrossed = false
const AUTONOMY_RUNS_RELATIVE_PATH = join(AUTONOMY_DIR, 'runs.json')
// Sentinel string surfaced to operators via runs.json error fields and
// referenced literally by the HEARTBEAT.md `stale-recovery-health` task.
// A unit test asserts the HEARTBEAT.md file contains this exact prefix —
// changing the value will fail the test, forcing the heartbeat prompt
// to be updated in the same change.
export const STALE_ACTIVE_RUN_ERROR_PREFIX =
  'Recovered stale active autonomy run'

// Guards the legacy-block warning so it fires once per (process, runId) instead
// of every dedup tick while a no-owner record sits there.
const warnedLegacyBlockRunIds = new Set<string>()

export type AutonomyRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AutonomyRunRuntime = 'automatic' | 'flow_step'

export type AutonomyRunRecord = {
  runId: string
  runtime: AutonomyRunRuntime
  trigger: AutonomyTriggerKind
  status: AutonomyRunStatus
  rootDir: string
  currentDir: string
  ownerKey: string
  sourceId?: string
  sourceLabel?: string
  parentFlowId?: string
  parentFlowKey?: string
  parentFlowSyncMode?: AutonomyFlowSyncMode
  flowStepId?: string
  flowStepName?: string
  promptPreview: string
  createdAt: number
  ownerProcessId?: number
  ownerSessionId?: string
  startedAt?: number
  endedAt?: number
  error?: string
}

type AutonomyRunsFile = {
  runs: AutonomyRunRecord[]
}

type AutonomyRunFlowRef = {
  flowId: string
  flowKey: string
  syncMode: AutonomyFlowSyncMode
  ownerKey: string
  stepId: string
  stepName: string
}

type CreateAutonomyRunParams = {
  trigger: AutonomyTriggerKind
  prompt: string
  rootDir?: string
  currentDir?: string
  sourceId?: string
  sourceLabel?: string
  runtime?: AutonomyRunRuntime
  ownerKey?: string
  flow?: AutonomyRunFlowRef
  nowMs?: number
}

function truncatePromptPreview(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, ' ').trim()
  return singleLine.length <= 240
    ? singleLine
    : `${singleLine.slice(0, 237)}...`
}

/** A persisted record may lack fields that were added after the initial schema. */
type PersistedAutonomyRunRecord = Omit<
  AutonomyRunRecord,
  'runtime' | 'currentDir' | 'ownerKey'
> &
  Partial<Pick<AutonomyRunRecord, 'runtime' | 'currentDir' | 'ownerKey'>>

function cloneRunRecord(run: AutonomyRunRecord): AutonomyRunRecord {
  return { ...run }
}

function isAutonomyRunActive(run: AutonomyRunRecord): boolean {
  return run.status === 'queued' || run.status === 'running'
}

function selectPersistedAutonomyRuns(
  runs: AutonomyRunRecord[],
): AutonomyRunRecord[] {
  const cloned = runs.map(cloneRunRecord)
  const activeCount = cloned.filter(isAutonomyRunActive).length
  if (
    !warnedActiveRunsThresholdCrossed &&
    activeCount >= AUTONOMY_ACTIVE_RUNS_WARN_THRESHOLD
  ) {
    warnedActiveRunsThresholdCrossed = true
    logError(
      new Error(
        `autonomy: ${activeCount} active runs exceed warn threshold ${AUTONOMY_ACTIVE_RUNS_WARN_THRESHOLD}; check for finalize leaks`,
      ),
    )
  }
  return retainActiveFirst(
    cloned,
    isAutonomyRunActive,
    run => run.createdAt,
    AUTONOMY_RUNS_MAX,
  )
}

function normalizePersistedRunRecord(
  run: PersistedAutonomyRunRecord,
): AutonomyRunRecord {
  return {
    ...run,
    runtime: run.runtime === 'flow_step' ? 'flow_step' : 'automatic',
    currentDir: run.currentDir ?? run.rootDir,
    ownerKey: run.ownerKey ?? DEFAULT_AUTONOMY_OWNER_KEY,
  }
}

export function resolveAutonomyRunsPath(
  rootDir: string = getProjectRoot(),
): string {
  return join(resolve(rootDir), AUTONOMY_RUNS_RELATIVE_PATH)
}

export async function listAutonomyRuns(
  rootDir: string = getProjectRoot(),
): Promise<AutonomyRunRecord[]> {
  try {
    const raw = (await getFsImplementation().readFile(
      resolveAutonomyRunsPath(rootDir),
      {
        encoding: 'utf-8',
      },
    )) as string
    const parsed = JSON.parse(raw) as { runs?: unknown[] }
    if (!Array.isArray(parsed.runs)) {
      return []
    }
    return (parsed.runs as Record<string, unknown>[])
      .filter(
        (run): run is PersistedAutonomyRunRecord & Record<string, unknown> => {
          return Boolean(
            run &&
              typeof run.runId === 'string' &&
              typeof run.trigger === 'string' &&
              typeof run.status === 'string' &&
              typeof run.rootDir === 'string' &&
              typeof run.promptPreview === 'string' &&
              typeof run.createdAt === 'number',
          )
        },
      )
      .map(normalizePersistedRunRecord)
      .sort((left, right) => right.createdAt - left.createdAt)
  } catch {
    return []
  }
}

async function writeAutonomyRuns(
  runs: AutonomyRunRecord[],
  rootDir: string = getProjectRoot(),
): Promise<void> {
  const path = resolveAutonomyRunsPath(rootDir)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    `${JSON.stringify(
      {
        runs: selectPersistedAutonomyRuns(runs),
      } satisfies AutonomyRunsFile,
      null,
      2,
    )}\n`,
    'utf-8',
  )
}

async function updateAutonomyRun(
  runId: string,
  updater: (current: AutonomyRunRecord) => AutonomyRunRecord | null,
  rootDir: string = getProjectRoot(),
): Promise<AutonomyRunRecord | null> {
  return withAutonomyPersistenceLock(rootDir, async () => {
    const runs = await listAutonomyRuns(rootDir)
    const index = runs.findIndex(run => run.runId === runId)
    if (index === -1) {
      return null
    }
    const next = updater(cloneRunRecord(runs[index]!))
    if (!next) {
      return null
    }
    const updated = cloneRunRecord(next)
    runs[index] = updated
    await writeAutonomyRuns(runs, rootDir)
    return updated
  })
}

export async function getAutonomyRunById(
  runId: string,
  rootDir: string = getProjectRoot(),
): Promise<AutonomyRunRecord | null> {
  const runs = await listAutonomyRuns(rootDir)
  return runs.find(run => run.runId === runId) ?? null
}

function isActiveAutonomyRunStatus(status: AutonomyRunStatus): boolean {
  return status === 'queued' || status === 'running'
}

function isValidOwnerProcessId(pid: number | undefined): pid is number {
  // Reject non-numeric, negative, zero (Linux: send-to-process-group), and
  // non-integer values. A forged record with pid=0 or pid<0 used to be
  // treated as live and could permanently block dedup; treating them as
  // stale closes that availability hole.
  return (
    typeof pid === 'number' &&
    Number.isInteger(pid) &&
    pid > 0 &&
    pid <= 4_194_304
  )
}

function isStaleActiveAutonomyRun(run: AutonomyRunRecord): boolean {
  if (!isActiveAutonomyRunStatus(run.status)) {
    return false
  }
  if (run.ownerProcessId === undefined) {
    return false
  }
  if (!isValidOwnerProcessId(run.ownerProcessId)) {
    return true
  }
  return !isProcessRunning(run.ownerProcessId)
}

function staleActiveRunError(run: AutonomyRunRecord): string {
  return `${STALE_ACTIVE_RUN_ERROR_PREFIX}: owner process ${run.ownerProcessId} is no longer running.`
}

function failAutonomyRunRecord(
  run: AutonomyRunRecord,
  error: string,
  nowMs: number,
): AutonomyRunRecord {
  return {
    ...run,
    status: 'failed',
    endedAt: nowMs,
    error,
  }
}

function recoverStaleActiveAutonomyRun(
  run: AutonomyRunRecord,
  nowMs: number,
): AutonomyRunRecord {
  return failAutonomyRunRecord(run, staleActiveRunError(run), nowMs)
}

async function syncFailedManagedFlowForRun(
  run: AutonomyRunRecord,
  rootDir: string,
): Promise<void> {
  if (run.parentFlowId && run.parentFlowSyncMode === 'managed') {
    await markManagedAutonomyFlowStepFailed({
      flowId: run.parentFlowId,
      runId: run.runId,
      error: run.error ?? 'Autonomy run failed.',
      rootDir,
      nowMs: run.endedAt,
    })
  }
}

function matchesActiveAutonomyRunSource(
  run: AutonomyRunRecord,
  params: {
    trigger: AutonomyTriggerKind
    sourceId: string
    ownerKey?: string
  },
): boolean {
  return (
    run.trigger === params.trigger &&
    run.sourceId === params.sourceId &&
    (params.ownerKey === undefined || run.ownerKey === params.ownerKey) &&
    isActiveAutonomyRunStatus(run.status)
  )
}

export async function hasActiveAutonomyRunForSource(params: {
  trigger: AutonomyTriggerKind
  sourceId: string
  rootDir?: string
  ownerKey?: string
}): Promise<boolean> {
  const runs = await listAutonomyRuns(params.rootDir)
  return runs.some(
    run =>
      matchesActiveAutonomyRunSource(run, params) &&
      !isStaleActiveAutonomyRun(run),
  )
}

function buildAutonomyRunRecord(
  params: CreateAutonomyRunParams,
  rootDir: string,
  currentDir: string,
): AutonomyRunRecord {
  const createdAt = params.nowMs ?? Date.now()
  return {
    runId: randomUUID(),
    runtime: params.runtime ?? (params.flow ? 'flow_step' : 'automatic'),
    trigger: params.trigger,
    status: 'queued',
    rootDir,
    currentDir,
    ownerKey:
      params.flow?.ownerKey ?? params.ownerKey ?? DEFAULT_AUTONOMY_OWNER_KEY,
    ...(params.sourceId ? { sourceId: params.sourceId } : {}),
    ...(params.sourceLabel ? { sourceLabel: params.sourceLabel } : {}),
    ...(params.flow
      ? {
          parentFlowId: params.flow.flowId,
          parentFlowKey: params.flow.flowKey,
          parentFlowSyncMode: params.flow.syncMode,
          flowStepId: params.flow.stepId,
          flowStepName: params.flow.stepName,
        }
      : {}),
    promptPreview: truncatePromptPreview(params.prompt),
    createdAt,
    ownerProcessId: process.pid,
    ownerSessionId: getSessionId(),
  }
}

async function persistAutonomyRunRecord(
  record: AutonomyRunRecord,
  rootDir: string,
  skipWhenActiveSource: boolean,
): Promise<{
  created: boolean
  recoveredStaleRuns: AutonomyRunRecord[]
}> {
  let created = false
  const recoveredStaleRuns: AutonomyRunRecord[] = []
  await withAutonomyPersistenceLock(rootDir, async () => {
    const runs = await listAutonomyRuns(rootDir)
    const sourceId = record.sourceId
    if (skipWhenActiveSource && sourceId) {
      let hasBlockingActiveRun = false
      let staleRecoveriesApplied = false
      for (let i = 0; i < runs.length; i++) {
        const run = runs[i]!
        if (
          !matchesActiveAutonomyRunSource(run, {
            trigger: record.trigger,
            sourceId,
            ownerKey: record.ownerKey,
          })
        ) {
          continue
        }
        if (isStaleActiveAutonomyRun(run)) {
          const recovered = recoverStaleActiveAutonomyRun(run, record.createdAt)
          runs[i] = recovered
          recoveredStaleRuns.push(recovered)
          staleRecoveriesApplied = true
          continue
        }
        if (
          run.ownerProcessId === undefined &&
          !warnedLegacyBlockRunIds.has(run.runId)
        ) {
          warnedLegacyBlockRunIds.add(run.runId)
          logError(
            new Error(
              `[autonomyRuns] blocked by legacy un-owned active run ${run.runId} (createdAt=${run.createdAt}); cancel manually if this is a stale upgrade artifact`,
            ),
          )
        }
        hasBlockingActiveRun = true
      }
      if (hasBlockingActiveRun) {
        if (staleRecoveriesApplied) {
          await writeAutonomyRuns(runs, rootDir)
        }
        return
      }
    }
    runs.unshift(record)
    await writeAutonomyRuns(runs, rootDir)
    created = true
  })
  return { created, recoveredStaleRuns }
}

async function queueManagedFlowStepRunForRecord(
  record: AutonomyRunRecord,
  rootDir: string,
): Promise<void> {
  if (
    record.parentFlowId &&
    record.flowStepId &&
    record.parentFlowSyncMode === 'managed'
  ) {
    const stepIndex =
      (
        await getAutonomyFlowById(record.parentFlowId, rootDir)
      )?.stateJson?.steps.findIndex(
        step => step.stepId === record.flowStepId,
      ) ?? 0
    await queueManagedAutonomyFlowStepRun({
      flowId: record.parentFlowId,
      stepId: record.flowStepId,
      stepIndex: stepIndex >= 0 ? stepIndex : 0,
      runId: record.runId,
      rootDir,
      nowMs: record.createdAt,
    })
  }
}

async function createAutonomyRunCore(
  params: CreateAutonomyRunParams,
  skipIfActiveSource: boolean,
): Promise<AutonomyRunRecord | null> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const currentDir = resolve(params.currentDir ?? rootDir)
  const record = buildAutonomyRunRecord(params, rootDir, currentDir)

  const { created, recoveredStaleRuns } = await persistAutonomyRunRecord(
    record,
    rootDir,
    skipIfActiveSource,
  )
  for (const recovered of recoveredStaleRuns) {
    await syncFailedManagedFlowForRun(recovered, rootDir)
  }
  if (!created) {
    return null
  }
  await queueManagedFlowStepRunForRecord(record, rootDir)
  return record
}

export async function createAutonomyRun(
  params: CreateAutonomyRunParams,
): Promise<AutonomyRunRecord> {
  const record = await createAutonomyRunCore(params, false)
  if (!record) {
    throw new Error('Autonomy run was unexpectedly skipped.')
  }
  return record
}

export async function createAutonomyRunIfNoActiveSource(
  params: CreateAutonomyRunParams & { sourceId: string },
): Promise<AutonomyRunRecord | null> {
  return createAutonomyRunCore(params, true)
}

function buildManagedFlowStepPrompt(
  flow: AutonomyFlowRecord,
  stepIndex: number,
): string {
  const state = flow.stateJson
  const step = state?.steps[stepIndex]
  if (!state || !step) {
    return flow.goal
  }
  const completed = state.steps
    .slice(0, stepIndex)
    .filter(candidate => candidate.status === 'completed')
    .map(candidate => `- ${candidate.name}`)
  const remaining = state.steps
    .slice(stepIndex + 1)
    .map(candidate => `- ${candidate.name}`)

  return [
    `This is step ${stepIndex + 1}/${state.steps.length} of the managed autonomy flow "${flow.goal}".`,
    '<autonomy_flow>',
    `Flow ID: ${flow.flowId}`,
    `Flow source: ${flow.sourceLabel ?? flow.sourceId ?? 'automatic'}`,
    `Current step: ${step.name}`,
    completed.length > 0
      ? ['Completed steps:', ...completed].join('\n')
      : 'Completed steps: none',
    remaining.length > 0
      ? ['Remaining steps after this one:', ...remaining].join('\n')
      : 'Remaining steps after this one: none',
    '</autonomy_flow>',
    step.prompt,
  ].join('\n\n')
}

async function createOrRecoverManagedFlowStepCommand(params: {
  flowId: string
  rootDir?: string
  currentDir?: string
  priority?: 'now' | 'next' | 'later'
  workload?: string
}): Promise<QueuedCommand | null> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const flow = await getAutonomyFlowById(params.flowId, rootDir)
  if (!flow || flow.status !== 'queued' || !flow.stateJson) {
    return null
  }
  const stepIndex = flow.stateJson.currentStepIndex
  const step = flow.stateJson.steps[stepIndex]
  if (!step) {
    return null
  }
  if (step.status === 'queued' && step.runId) {
    const run = await getAutonomyRunById(step.runId, rootDir)
    if (run && run.status === 'queued' && !run.startedAt && !run.endedAt) {
      const value = await buildAutonomyTurnPrompt({
        basePrompt: buildManagedFlowStepPrompt(flow, stepIndex),
        trigger: 'managed-flow-step',
        rootDir,
        currentDir: params.currentDir ?? flow.currentDir,
      })
      const origin = {
        kind: 'autonomy',
        trigger: 'managed-flow-step',
        runId: run.runId,
        ...(run.sourceId ? { sourceId: run.sourceId } : {}),
      } as unknown as MessageOrigin
      return {
        value,
        mode: 'prompt',
        priority: params.priority ?? 'later',
        isMeta: true,
        origin,
        workload: params.workload,
        autonomy: {
          runId: run.runId,
          rootDir: run.rootDir,
          trigger: 'managed-flow-step',
          sourceId: run.sourceId,
          sourceLabel: run.sourceLabel,
          ...(run.parentFlowId ? { flowId: run.parentFlowId } : {}),
          ...(run.flowStepId ? { flowStepId: run.flowStepId } : {}),
          ...(run.flowStepName ? { flowStepName: run.flowStepName } : {}),
        },
      }
    }
    return null
  }
  if (step.status !== 'pending' || step.runId) {
    return null
  }
  return createAutonomyQueuedPrompt({
    basePrompt: buildManagedFlowStepPrompt(flow, stepIndex),
    trigger: 'managed-flow-step',
    rootDir,
    currentDir: params.currentDir ?? flow.currentDir,
    sourceId: flow.sourceId ?? flow.flowId,
    sourceLabel: flow.sourceLabel ?? flow.goal,
    workload: params.workload,
    priority: params.priority,
    flow: {
      flowId: flow.flowId,
      flowKey: flow.flowKey,
      syncMode: 'managed',
      ownerKey: flow.ownerKey,
      stepId: step.stepId,
      stepName: step.name,
    },
  })
}

async function queueCurrentManagedFlowStepCommand(params: {
  flowId: string
  rootDir?: string
  currentDir?: string
  priority?: 'now' | 'next' | 'later'
  workload?: string
}): Promise<QueuedCommand | null> {
  return createOrRecoverManagedFlowStepCommand(params)
}

export async function startManagedAutonomyFlowFromHeartbeatTask(params: {
  task: HeartbeatAuthorityTask
  rootDir?: string
  currentDir?: string
  ownerKey?: string
  priority?: 'now' | 'next' | 'later'
  workload?: string
}): Promise<QueuedCommand | null> {
  if (params.task.steps.length === 0) {
    return null
  }
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const currentDir = resolve(params.currentDir ?? getCwd())
  const started = await startManagedAutonomyFlow({
    trigger: 'proactive-tick',
    goal: params.task.prompt,
    steps: params.task.steps.map<ManagedAutonomyFlowStepDefinition>(step => ({
      name: step.name,
      prompt: step.prompt,
      ...(step.waitFor ? { waitFor: step.waitFor } : {}),
    })),
    rootDir,
    currentDir,
    ownerKey: params.ownerKey,
    sourceId: `heartbeat:${params.task.name}`,
    sourceLabel: params.task.name,
  })
  if (!started) {
    return null
  }
  return createOrRecoverManagedFlowStepCommand({
    flowId: started.flow.flowId,
    rootDir,
    currentDir,
    priority: params.priority,
    workload: params.workload,
  })
}

export async function markAutonomyRunRunning(
  runId: string,
  rootDir?: string,
  nowMs?: number,
): Promise<AutonomyRunRecord | null> {
  const updated = await updateAutonomyRun(
    runId,
    current =>
      current.status === 'queued'
        ? {
            ...current,
            status: 'running',
            startedAt: nowMs ?? Date.now(),
            ownerProcessId: process.pid,
            ownerSessionId: getSessionId(),
          }
        : null,
    rootDir,
  )
  if (updated?.parentFlowId && updated.parentFlowSyncMode === 'managed') {
    await markManagedAutonomyFlowStepRunning({
      flowId: updated.parentFlowId,
      runId: updated.runId,
      rootDir,
      nowMs: updated.startedAt,
    })
  }
  return updated
}

export async function markAutonomyRunCompleted(
  runId: string,
  rootDir?: string,
  nowMs?: number,
): Promise<AutonomyRunRecord | null> {
  const updated = await updateAutonomyRun(
    runId,
    current =>
      current.status === 'queued' || current.status === 'running'
        ? {
            ...current,
            status: 'completed',
            endedAt: nowMs ?? Date.now(),
            error: undefined,
          }
        : null,
    rootDir,
  )
  if (updated?.parentFlowId && updated.parentFlowSyncMode === 'managed') {
    await markManagedAutonomyFlowStepCompleted({
      flowId: updated.parentFlowId,
      runId: updated.runId,
      rootDir,
      nowMs: updated.endedAt,
    })
  }
  return updated
}

export async function markAutonomyRunFailed(
  runId: string,
  error: string,
  rootDir?: string,
  nowMs?: number,
): Promise<AutonomyRunRecord | null> {
  const endedAt = nowMs ?? Date.now()
  const updated = await updateAutonomyRun(
    runId,
    current =>
      isActiveAutonomyRunStatus(current.status)
        ? failAutonomyRunRecord(current, error, endedAt)
        : null,
    rootDir,
  )
  if (updated) {
    await syncFailedManagedFlowForRun(updated, rootDir ?? updated.rootDir)
  }
  return updated
}

export async function markAutonomyRunCancelled(
  runId: string,
  rootDir?: string,
  nowMs?: number,
): Promise<AutonomyRunRecord | null> {
  const updated = await updateAutonomyRun(
    runId,
    current =>
      current.status === 'queued' || current.status === 'running'
        ? {
            ...current,
            status: 'cancelled',
            endedAt: nowMs ?? Date.now(),
            error: undefined,
          }
        : null,
    rootDir,
  )
  if (updated?.parentFlowId && updated.parentFlowSyncMode === 'managed') {
    await markManagedAutonomyFlowStepCancelled({
      flowId: updated.parentFlowId,
      runId: updated.runId,
      rootDir,
      nowMs: updated.endedAt,
    })
  }
  return updated
}

export async function finalizeAutonomyRunCompleted(params: {
  runId: string
  rootDir?: string
  currentDir?: string
  priority?: 'now' | 'next' | 'later'
  workload?: string
  nowMs?: number
}): Promise<QueuedCommand[]> {
  const updated = await markAutonomyRunCompleted(
    params.runId,
    params.rootDir,
    params.nowMs,
  )
  if (!updated?.parentFlowId || updated.parentFlowSyncMode !== 'managed') {
    return []
  }
  const next = await queueCurrentManagedFlowStepCommand({
    flowId: updated.parentFlowId,
    rootDir: params.rootDir,
    currentDir: params.currentDir ?? updated.currentDir,
    priority: params.priority,
    workload: params.workload,
  })
  return next ? [next] : []
}

export async function finalizeAutonomyRunFailed(params: {
  runId: string
  error: string
  rootDir?: string
  nowMs?: number
}): Promise<void> {
  await markAutonomyRunFailed(
    params.runId,
    params.error,
    params.rootDir,
    params.nowMs,
  )
}

export async function recoverManagedAutonomyFlowPrompt(params: {
  flowId: string
  rootDir?: string
  currentDir?: string
  priority?: 'now' | 'next' | 'later'
  workload?: string
}): Promise<QueuedCommand | null> {
  return createOrRecoverManagedFlowStepCommand(params)
}

export async function resumeManagedAutonomyFlowPrompt(params: {
  flowId: string
  rootDir?: string
  currentDir?: string
  priority?: 'now' | 'next' | 'later'
  workload?: string
  nowMs?: number
}): Promise<QueuedCommand | null> {
  const resumed = await resumeManagedAutonomyFlow({
    flowId: params.flowId,
    rootDir: params.rootDir,
    nowMs: params.nowMs,
  })
  if (!resumed) {
    return recoverManagedAutonomyFlowPrompt({
      flowId: params.flowId,
      rootDir: params.rootDir,
      currentDir: params.currentDir,
      priority: params.priority,
      workload: params.workload,
    })
  }
  return createOrRecoverManagedFlowStepCommand({
    flowId: resumed.flow.flowId,
    rootDir: params.rootDir,
    currentDir: params.currentDir ?? resumed.flow.currentDir,
    priority: params.priority,
    workload: params.workload,
  })
}

export async function createAutonomyQueuedPrompt(params: {
  trigger: AutonomyTriggerKind
  basePrompt: string
  rootDir?: string
  currentDir?: string
  sourceId?: string
  sourceLabel?: string
  ownerKey?: string
  workload?: string
  priority?: 'now' | 'next' | 'later'
  shouldCreate?: () => boolean
  flow?: AutonomyRunFlowRef
}): Promise<QueuedCommand | null> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const currentDir = resolve(params.currentDir ?? getCwd())
  const prepared = await prepareAutonomyTurnPrompt({
    basePrompt: params.basePrompt,
    trigger: params.trigger,
    rootDir,
    currentDir,
  })
  if (params.shouldCreate && !params.shouldCreate()) {
    return null
  }
  return commitAutonomyQueuedPrompt({
    prepared,
    rootDir,
    currentDir,
    sourceId: params.sourceId,
    sourceLabel: params.sourceLabel,
    ownerKey: params.ownerKey,
    workload: params.workload,
    priority: params.priority,
    flow: params.flow,
  })
}

export async function createAutonomyQueuedPromptIfNoActiveSource(params: {
  trigger: AutonomyTriggerKind
  basePrompt: string
  rootDir?: string
  currentDir?: string
  sourceId: string
  sourceLabel?: string
  ownerKey?: string
  workload?: string
  priority?: 'now' | 'next' | 'later'
  shouldCreate?: () => boolean
}): Promise<QueuedCommand | null> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const currentDir = resolve(params.currentDir ?? getCwd())
  // Cheap optimistic pre-check: skip the AGENTS.md / HEARTBEAT.md disk
  // reads + prompt assembly when an active run for this source already
  // blocks dedup. The lock-side check inside persistAutonomyRunRecord
  // remains authoritative; this only fast-paths the common storm case.
  if (
    await hasActiveAutonomyRunForSource({
      trigger: params.trigger,
      sourceId: params.sourceId,
      rootDir,
      ownerKey: params.ownerKey,
    })
  ) {
    return null
  }
  const prepared = await prepareAutonomyTurnPrompt({
    basePrompt: params.basePrompt,
    trigger: params.trigger,
    rootDir,
    currentDir,
  })
  if (params.shouldCreate && !params.shouldCreate()) {
    return null
  }
  return commitAutonomyQueuedPromptIfNoActiveSource({
    prepared,
    rootDir,
    currentDir,
    sourceId: params.sourceId,
    sourceLabel: params.sourceLabel,
    ownerKey: params.ownerKey,
    workload: params.workload,
    priority: params.priority,
  })
}

export async function commitAutonomyQueuedPrompt(params: {
  prepared: Awaited<ReturnType<typeof prepareAutonomyTurnPrompt>>
  rootDir?: string
  currentDir?: string
  sourceId?: string
  sourceLabel?: string
  ownerKey?: string
  workload?: string
  priority?: 'now' | 'next' | 'later'
  flow?: AutonomyRunFlowRef
}): Promise<QueuedCommand> {
  const command = await commitAutonomyQueuedPromptInternal(params, false)
  if (!command) {
    throw new Error('Autonomy queued prompt was unexpectedly skipped.')
  }
  return command
}

async function commitAutonomyQueuedPromptIfNoActiveSource(params: {
  prepared: Awaited<ReturnType<typeof prepareAutonomyTurnPrompt>>
  rootDir?: string
  currentDir?: string
  sourceId: string
  sourceLabel?: string
  ownerKey?: string
  workload?: string
  priority?: 'now' | 'next' | 'later'
}): Promise<QueuedCommand | null> {
  return commitAutonomyQueuedPromptInternal(params, true)
}

async function commitAutonomyQueuedPromptInternal(
  params: {
    prepared: Awaited<ReturnType<typeof prepareAutonomyTurnPrompt>>
    rootDir?: string
    currentDir?: string
    sourceId?: string
    sourceLabel?: string
    ownerKey?: string
    workload?: string
    priority?: 'now' | 'next' | 'later'
    flow?: AutonomyRunFlowRef
  },
  skipWhenActiveSource: boolean,
): Promise<QueuedCommand | null> {
  const rootDir = resolve(
    params.rootDir ?? params.prepared.rootDir ?? getProjectRoot(),
  )
  const currentDir = resolve(
    params.currentDir ?? params.prepared.currentDir ?? getCwd(),
  )
  const value = params.prepared.prompt
  const runParams: CreateAutonomyRunParams = {
    trigger: params.prepared.trigger,
    prompt: value,
    rootDir,
    currentDir,
    sourceId: params.sourceId,
    sourceLabel: params.sourceLabel,
    ownerKey: params.ownerKey,
    flow: params.flow,
  }
  const useDedup = skipWhenActiveSource && Boolean(params.sourceId)
  const run = await createAutonomyRunCore(runParams, useDedup)
  if (!run) {
    return null
  }
  commitPreparedAutonomyTurn(params.prepared)
  const origin = {
    kind: 'autonomy',
    trigger: params.prepared.trigger,
    runId: run.runId,
    ...(params.sourceId ? { sourceId: params.sourceId } : {}),
  } as unknown as MessageOrigin

  return {
    value,
    mode: 'prompt',
    priority: params.priority ?? 'later',
    isMeta: true,
    origin,
    workload: params.workload,
    autonomy: {
      runId: run.runId,
      rootDir: run.rootDir,
      trigger: params.prepared.trigger,
      sourceId: params.sourceId,
      sourceLabel: params.sourceLabel,
      ...(run.parentFlowId ? { flowId: run.parentFlowId } : {}),
      ...(run.flowStepId ? { flowStepId: run.flowStepId } : {}),
      ...(run.flowStepName ? { flowStepName: run.flowStepName } : {}),
    },
  }
}

export async function createProactiveAutonomyCommands(params: {
  basePrompt: string
  rootDir?: string
  currentDir?: string
  workload?: string
  priority?: 'now' | 'next' | 'later'
  shouldCreate?: () => boolean
}): Promise<QueuedCommand[]> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const currentDir = resolve(params.currentDir ?? getCwd())
  const prepared = await prepareAutonomyTurnPrompt({
    basePrompt: params.basePrompt,
    trigger: 'proactive-tick',
    rootDir,
    currentDir,
  })
  if (params.shouldCreate && !params.shouldCreate()) {
    return []
  }

  const commands: QueuedCommand[] = [
    await commitAutonomyQueuedPrompt({
      prepared,
      rootDir,
      currentDir,
      workload: params.workload,
      priority: params.priority,
    }),
  ]

  for (const task of prepared.dueHeartbeatTasks) {
    if (task.steps.length === 0) {
      continue
    }
    if (params.shouldCreate && !params.shouldCreate()) {
      break
    }
    const flowCommand = await startManagedAutonomyFlowFromHeartbeatTask({
      task,
      rootDir,
      currentDir,
      priority: params.priority,
      workload: params.workload,
    })
    if (flowCommand) {
      commands.push(flowCommand)
    }
  }

  return commands
}

export function formatAutonomyRunsStatus(runs: AutonomyRunRecord[]): string {
  const counts = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  }
  for (const run of runs) {
    counts[run.status] += 1
  }
  const latest = runs[0]
  const latestLine = latest
    ? `Latest: ${latest.trigger} ${latest.status} (${new Date(latest.createdAt).toLocaleString()})`
    : 'Latest: none'
  return [
    `Autonomy runs: ${runs.length}`,
    `Queued: ${counts.queued}`,
    `Running: ${counts.running}`,
    `Completed: ${counts.completed}`,
    `Failed: ${counts.failed}`,
    `Cancelled: ${counts.cancelled}`,
    latestLine,
  ].join('\n')
}

export function formatAutonomyRunsList(
  runs: AutonomyRunRecord[],
  limit = 10,
): string {
  const slice = runs.slice(0, limit)
  if (slice.length === 0) {
    return 'No autonomy runs recorded.'
  }
  return slice
    .map(run => {
      const source = run.sourceLabel ?? run.sourceId ?? 'auto'
      const flow =
        run.parentFlowId && run.flowStepName
          ? ` | flow=${run.parentFlowId} step=${run.flowStepName}`
          : ''
      const ended =
        run.endedAt != null
          ? ` -> ${new Date(run.endedAt).toLocaleTimeString()}`
          : ''
      const error = run.error ? ` | ${run.error}` : ''
      return `${run.runId} | ${run.runtime} | ${run.trigger} | ${run.status} | ${source}${flow} | ${new Date(run.createdAt).toLocaleTimeString()}${ended}\n  ${run.promptPreview}${error}`
    })
    .join('\n')
}
