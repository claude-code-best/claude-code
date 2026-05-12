import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { getProjectRoot } from '../bootstrap/state.js'
import { AUTONOMY_DIR, type AutonomyTriggerKind } from './autonomyAuthority.js'
import {
  retainActiveFirst,
  withAutonomyPersistenceLock,
} from './autonomyPersistence.js'
import { getFsImplementation } from './fsOperations.js'

const AUTONOMY_FLOWS_MAX = 100
const AUTONOMY_FLOWS_RELATIVE_PATH = join(AUTONOMY_DIR, 'flows.json')
export const DEFAULT_AUTONOMY_OWNER_KEY = 'main-thread'

export type AutonomyFlowSyncMode = 'managed'

export type AutonomyFlowStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'blocked'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'lost'

export type AutonomyManagedFlowStepStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ManagedAutonomyFlowStepDefinition = {
  name: string
  prompt: string
  waitFor?: string
}

export type ManagedAutonomyFlowStep = ManagedAutonomyFlowStepDefinition & {
  stepId: string
  status: AutonomyManagedFlowStepStatus
  runId?: string
  startedAt?: number
  endedAt?: number
  error?: string
}

export type ManagedAutonomyFlowState = {
  currentStepIndex: number
  steps: ManagedAutonomyFlowStep[]
}

export type AutonomyFlowWaitState = {
  reason: string
  stepId: string
  stepName: string
  stepIndex: number
}

export type AutonomyFlowRecord = {
  flowId: string
  flowKey: string
  syncMode: AutonomyFlowSyncMode
  ownerKey: string
  revision: number
  trigger: AutonomyTriggerKind
  status: AutonomyFlowStatus
  goal: string
  rootDir: string
  currentDir: string
  sourceId?: string
  sourceLabel?: string
  latestRunId?: string
  runCount: number
  createdAt: number
  updatedAt: number
  startedAt?: number
  endedAt?: number
  currentStep?: string
  blockedRunId?: string
  blockedSummary?: string
  stateJson?: ManagedAutonomyFlowState
  waitJson?: AutonomyFlowWaitState
  cancelRequestedAt?: number
  lastError?: string
  /**
   * Repo-relative POSIX glob patterns describing which paths this flow's
   * `report`-step approval covers. The pre-tool-use hook
   * `require-plan-for-risky-edit.mjs` consults this list to permit edits
   * only when the target file matches at least one entry. Absent or empty
   * means "no boundary declared" — during the pilot window the hook
   * treats this as broad approval (v1 behaviour). Once all production
   * flows declare boundaries, the hook will deny absent-boundary flows.
   *
   * Supported syntax: `*` matches one path segment, `**` matches any
   * number including zero. Examples: `src/utils/autonomy*`,
   * `src/services/api/**`, `src/Tool.ts`.
   */
  boundary?: string[]
}

type AutonomyFlowsFile = {
  flows: AutonomyFlowRecord[]
}

export type ManagedAutonomyFlowQueueInstruction = {
  flowId: string
  flowKey: string
  stepIndex: number
  step: ManagedAutonomyFlowStep
}

export type ManagedAutonomyFlowStartResult = {
  flow: AutonomyFlowRecord
  started: boolean
  nextStep?: ManagedAutonomyFlowQueueInstruction
}

export type ManagedAutonomyFlowAdvanceResult = {
  flow: AutonomyFlowRecord
  nextStep?: ManagedAutonomyFlowQueueInstruction
}

export type ManagedAutonomyFlowCancelResult = {
  flow: AutonomyFlowRecord
  queuedRunIds: string[]
  accepted: boolean
}

function cloneFlowStep(step: ManagedAutonomyFlowStep): ManagedAutonomyFlowStep {
  return { ...step }
}

function cloneManagedState(
  state: ManagedAutonomyFlowState | undefined,
): ManagedAutonomyFlowState | undefined {
  if (!state) {
    return undefined
  }
  return {
    currentStepIndex: state.currentStepIndex,
    steps: state.steps.map(cloneFlowStep),
  }
}

function cloneWaitState(
  wait: AutonomyFlowWaitState | undefined,
): AutonomyFlowWaitState | undefined {
  return wait ? { ...wait } : undefined
}

function cloneFlowRecord(flow: AutonomyFlowRecord): AutonomyFlowRecord {
  return {
    ...flow,
    ...(flow.boundary ? { boundary: [...flow.boundary] } : {}),
    ...(flow.stateJson ? { stateJson: cloneManagedState(flow.stateJson) } : {}),
    ...(flow.waitJson ? { waitJson: cloneWaitState(flow.waitJson) } : {}),
  }
}

function isManagedFlowStatusActive(status: AutonomyFlowStatus): boolean {
  return (
    status === 'queued' ||
    status === 'running' ||
    status === 'waiting' ||
    status === 'blocked'
  )
}

function selectPersistedAutonomyFlows(
  flows: AutonomyFlowRecord[],
): AutonomyFlowRecord[] {
  return retainActiveFirst(
    flows.map(cloneFlowRecord),
    flow => isManagedFlowStatusActive(flow.status),
    flow => flow.updatedAt,
    AUTONOMY_FLOWS_MAX,
  )
}

function defaultFlowSource(params: {
  trigger: AutonomyTriggerKind
  sourceId?: string
  sourceLabel?: string
}): { sourceId?: string; sourceLabel?: string } {
  if (params.sourceId || params.sourceLabel) {
    return {
      ...(params.sourceId ? { sourceId: params.sourceId } : {}),
      ...(params.sourceLabel ? { sourceLabel: params.sourceLabel } : {}),
    }
  }
  if (params.trigger === 'proactive-tick') {
    return {
      sourceId: 'heartbeat-loop',
      sourceLabel: 'heartbeat-loop',
    }
  }
  return {}
}

function normalizeManagedState(
  value: unknown,
): ManagedAutonomyFlowState | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('steps' in value) ||
    !Array.isArray((value as { steps: unknown[] }).steps)
  ) {
    return undefined
  }
  const parsed = value as Partial<ManagedAutonomyFlowState>
  const steps = (parsed.steps ?? [])
    .filter((step): step is ManagedAutonomyFlowStep =>
      Boolean(
        step &&
          typeof step.stepId === 'string' &&
          typeof step.name === 'string' &&
          typeof step.prompt === 'string' &&
          typeof step.status === 'string',
      ),
    )
    .map(step => ({
      stepId: step.stepId,
      name: step.name,
      prompt: step.prompt,
      status: step.status,
      ...(step.waitFor ? { waitFor: step.waitFor } : {}),
      ...(step.runId ? { runId: step.runId } : {}),
      ...(step.startedAt != null ? { startedAt: step.startedAt } : {}),
      ...(step.endedAt != null ? { endedAt: step.endedAt } : {}),
      ...(step.error ? { error: step.error } : {}),
    }))
  if (steps.length === 0) {
    return undefined
  }
  const currentStepIndex = Math.min(
    Math.max(parsed.currentStepIndex ?? 0, 0),
    steps.length - 1,
  )
  return {
    currentStepIndex,
    steps,
  }
}

function normalizeWaitState(value: unknown): AutonomyFlowWaitState | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as { reason?: unknown }).reason !== 'string' ||
    typeof (value as { stepId?: unknown }).stepId !== 'string' ||
    typeof (value as { stepName?: unknown }).stepName !== 'string' ||
    typeof (value as { stepIndex?: unknown }).stepIndex !== 'number'
  ) {
    return undefined
  }
  return {
    reason: (value as { reason: string }).reason,
    stepId: (value as { stepId: string }).stepId,
    stepName: (value as { stepName: string }).stepName,
    stepIndex: (value as { stepIndex: number }).stepIndex,
  }
}

function isPosixBoundaryGlob(value: string): boolean {
  if (!value || value.startsWith('/') || value.includes('\\')) {
    return false
  }
  if (value.includes('\0')) {
    return false
  }
  return !value.split('/').some(segment => segment === '..')
}

function normalizeBoundary(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const seen = new Set<string>()
  const boundary = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.trim())
    .filter(isPosixBoundaryGlob)
    .filter(entry => {
      if (seen.has(entry)) {
        return false
      }
      seen.add(entry)
      return true
    })
  return boundary.length > 0 ? boundary : undefined
}

function normalizeFlowRecord(flow: AutonomyFlowRecord): AutonomyFlowRecord {
  const source = defaultFlowSource(flow)
  return {
    ...flow,
    syncMode: 'managed',
    ownerKey: flow.ownerKey || DEFAULT_AUTONOMY_OWNER_KEY,
    revision: Math.max(flow.revision ?? 0, 0),
    goal: flow.goal || flow.sourceLabel || flow.sourceId || flow.flowKey,
    currentDir: flow.currentDir || flow.rootDir,
    runCount: Math.max(flow.runCount ?? 0, 0),
    boundary: normalizeBoundary(flow.boundary),
    stateJson: normalizeManagedState(flow.stateJson),
    waitJson: normalizeWaitState(flow.waitJson),
    ...(flow.sourceId
      ? { sourceId: flow.sourceId }
      : source.sourceId
        ? { sourceId: source.sourceId }
        : {}),
    ...(flow.sourceLabel
      ? { sourceLabel: flow.sourceLabel }
      : source.sourceLabel
        ? { sourceLabel: source.sourceLabel }
        : {}),
  }
}

function buildManagedState(
  steps: ManagedAutonomyFlowStepDefinition[],
): ManagedAutonomyFlowState {
  return {
    currentStepIndex: 0,
    steps: steps.map(step => ({
      stepId: randomUUID(),
      name: step.name,
      prompt: step.prompt,
      status: 'pending',
      ...(step.waitFor ? { waitFor: step.waitFor } : {}),
    })),
  }
}

function getManagedStep(
  flow: AutonomyFlowRecord,
  stepIndex: number,
): ManagedAutonomyFlowStep | null {
  return flow.stateJson?.steps[stepIndex] ?? null
}

function buildQueueInstruction(
  flow: AutonomyFlowRecord,
  stepIndex: number,
): ManagedAutonomyFlowQueueInstruction | undefined {
  const step = getManagedStep(flow, stepIndex)
  if (!step) {
    return undefined
  }
  return {
    flowId: flow.flowId,
    flowKey: flow.flowKey,
    stepIndex,
    step: cloneFlowStep(step),
  }
}

function markRemainingStepsCancelled(
  state: ManagedAutonomyFlowState,
  startIndex: number,
  nowMs: number,
): void {
  for (let i = startIndex; i < state.steps.length; i += 1) {
    const step = state.steps[i]!
    if (
      step.status === 'completed' ||
      step.status === 'failed' ||
      step.status === 'cancelled'
    ) {
      continue
    }
    step.status = 'cancelled'
    step.endedAt = nowMs
  }
}

export function resolveAutonomyFlowsPath(
  rootDir: string = getProjectRoot(),
): string {
  return join(resolve(rootDir), AUTONOMY_FLOWS_RELATIVE_PATH)
}

export async function listAutonomyFlows(
  rootDir: string = getProjectRoot(),
): Promise<AutonomyFlowRecord[]> {
  try {
    const raw = (await getFsImplementation().readFile(
      resolveAutonomyFlowsPath(rootDir),
      {
        encoding: 'utf-8',
      },
    )) as string
    const parsed = JSON.parse(raw) as Partial<AutonomyFlowsFile>
    if (!Array.isArray(parsed.flows)) {
      return []
    }
    return parsed.flows
      .filter((flow): flow is AutonomyFlowRecord => {
        return Boolean(
          flow &&
            typeof flow.flowId === 'string' &&
            typeof flow.flowKey === 'string' &&
            typeof flow.trigger === 'string' &&
            typeof flow.status === 'string' &&
            typeof flow.rootDir === 'string' &&
            typeof flow.createdAt === 'number' &&
            typeof flow.updatedAt === 'number',
        )
      })
      .map(normalizeFlowRecord)
      .sort((left, right) => right.updatedAt - left.updatedAt)
  } catch {
    return []
  }
}

async function writeAutonomyFlows(
  flows: AutonomyFlowRecord[],
  rootDir: string = getProjectRoot(),
): Promise<void> {
  const path = resolveAutonomyFlowsPath(rootDir)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    `${JSON.stringify(
      {
        flows: selectPersistedAutonomyFlows(flows),
      } satisfies AutonomyFlowsFile,
      null,
      2,
    )}\n`,
    'utf-8',
  )
}

async function updateAutonomyFlowById(
  flowId: string,
  updater: (current: AutonomyFlowRecord) => AutonomyFlowRecord,
  rootDir: string = getProjectRoot(),
): Promise<AutonomyFlowRecord | null> {
  return withAutonomyPersistenceLock(rootDir, async () => {
    const flows = await listAutonomyFlows(rootDir)
    const index = flows.findIndex(flow => flow.flowId === flowId)
    if (index === -1) {
      return null
    }
    const next = normalizeFlowRecord(updater(cloneFlowRecord(flows[index]!)))
    flows[index] = next
    await writeAutonomyFlows(flows, rootDir)
    return next
  })
}

export function createManagedAutonomyFlowKey(params: {
  trigger: AutonomyTriggerKind
  sourceId?: string
  sourceLabel?: string
  goal: string
}): string {
  const source = defaultFlowSource(params)
  const discriminator = source.sourceId ?? source.sourceLabel ?? params.goal
  return `managed:${params.trigger}:${discriminator}`
}

export async function startManagedAutonomyFlow(params: {
  trigger: AutonomyTriggerKind
  goal: string
  steps: ManagedAutonomyFlowStepDefinition[]
  rootDir?: string
  currentDir?: string
  ownerKey?: string
  sourceId?: string
  sourceLabel?: string
  boundary?: string[]
  nowMs?: number
}): Promise<ManagedAutonomyFlowStartResult | null> {
  if (params.steps.length === 0) {
    return null
  }
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const currentDir = resolve(params.currentDir ?? rootDir)
  const source = defaultFlowSource(params)
  const flowKey = createManagedAutonomyFlowKey({
    trigger: params.trigger,
    sourceId: source.sourceId,
    sourceLabel: source.sourceLabel,
    goal: params.goal,
  })
  const nowMs = params.nowMs ?? Date.now()

  return withAutonomyPersistenceLock(rootDir, async () => {
    const flows = await listAutonomyFlows(rootDir)
    const index = flows.findIndex(flow => flow.flowKey === flowKey)
    const current = index === -1 ? null : flows[index]!

    if (current && isManagedFlowStatusActive(current.status)) {
      return {
        flow: current,
        started: false,
      }
    }

    const stateJson = buildManagedState(params.steps)
    const firstStep = stateJson.steps[0]!
    const boundary =
      normalizeBoundary(params.boundary) ?? normalizeBoundary(current?.boundary)
    const waiting =
      firstStep.waitFor != null
        ? {
            reason: firstStep.waitFor,
            stepId: firstStep.stepId,
            stepName: firstStep.name,
            stepIndex: 0,
          }
        : undefined

    const next: AutonomyFlowRecord = normalizeFlowRecord({
      flowId: current?.flowId ?? randomUUID(),
      flowKey,
      syncMode: 'managed',
      ownerKey:
        params.ownerKey ?? current?.ownerKey ?? DEFAULT_AUTONOMY_OWNER_KEY,
      revision: (current?.revision ?? 0) + 1,
      trigger: params.trigger,
      status: waiting ? 'waiting' : 'queued',
      goal: params.goal,
      rootDir,
      currentDir,
      ...(source.sourceId ? { sourceId: source.sourceId } : {}),
      ...(source.sourceLabel ? { sourceLabel: source.sourceLabel } : {}),
      ...(boundary ? { boundary } : {}),
      latestRunId: undefined,
      runCount: current?.runCount ?? 0,
      createdAt: current?.createdAt ?? nowMs,
      updatedAt: nowMs,
      startedAt: undefined,
      endedAt: undefined,
      currentStep: firstStep.name,
      blockedRunId: undefined,
      blockedSummary: undefined,
      stateJson,
      ...(waiting ? { waitJson: waiting } : {}),
      cancelRequestedAt: undefined,
      lastError: undefined,
    })

    if (index === -1) {
      flows.unshift(next)
    } else {
      flows[index] = next
    }
    await writeAutonomyFlows(flows, rootDir)
    return {
      flow: next,
      started: true,
      ...(waiting ? {} : { nextStep: buildQueueInstruction(next, 0) }),
    }
  })
}

export async function queueManagedAutonomyFlowStepRun(params: {
  flowId: string
  stepId: string
  stepIndex: number
  runId: string
  rootDir?: string
  nowMs?: number
}): Promise<AutonomyFlowRecord | null> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  return updateAutonomyFlowById(
    params.flowId,
    current => {
      const state = cloneManagedState(current.stateJson)
      const step = state?.steps[params.stepIndex]
      if (!state || !step || step.stepId !== params.stepId) {
        return current
      }
      step.status = 'queued'
      step.runId = params.runId
      step.startedAt = undefined
      step.endedAt = undefined
      step.error = undefined
      state.currentStepIndex = params.stepIndex
      return {
        ...current,
        revision: current.revision + 1,
        status: 'queued',
        currentStep: step.name,
        latestRunId: params.runId,
        runCount: current.runCount + 1,
        updatedAt: params.nowMs ?? Date.now(),
        endedAt: undefined,
        blockedRunId: undefined,
        blockedSummary: undefined,
        waitJson: undefined,
        stateJson: state,
        lastError: undefined,
      }
    },
    rootDir,
  )
}

export async function markManagedAutonomyFlowStepRunning(params: {
  flowId: string
  runId: string
  rootDir?: string
  nowMs?: number
}): Promise<AutonomyFlowRecord | null> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  return updateAutonomyFlowById(
    params.flowId,
    current => {
      const state = cloneManagedState(current.stateJson)
      if (!state) {
        return current
      }
      const stepIndex = state.steps.findIndex(
        step => step.runId === params.runId,
      )
      if (stepIndex === -1) {
        return current
      }
      const step = state.steps[stepIndex]!
      step.status = 'running'
      step.startedAt = params.nowMs ?? Date.now()
      state.currentStepIndex = stepIndex
      return {
        ...current,
        revision: current.revision + 1,
        status: 'running',
        currentStep: step.name,
        latestRunId: params.runId,
        updatedAt: step.startedAt,
        startedAt: current.startedAt ?? step.startedAt,
        endedAt: undefined,
        blockedRunId: undefined,
        blockedSummary: undefined,
        waitJson: undefined,
        stateJson: state,
        lastError: undefined,
      }
    },
    rootDir,
  )
}

export async function markManagedAutonomyFlowStepCompleted(params: {
  flowId: string
  runId: string
  rootDir?: string
  nowMs?: number
}): Promise<ManagedAutonomyFlowAdvanceResult | null> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const nowMs = params.nowMs ?? Date.now()
  return updateAutonomyFlowById(
    params.flowId,
    current => {
      const state = cloneManagedState(current.stateJson)
      if (!state) {
        return current
      }
      const stepIndex = state.steps.findIndex(
        step => step.runId === params.runId,
      )
      if (stepIndex === -1) {
        return current
      }
      const step = state.steps[stepIndex]!
      step.status = 'completed'
      step.endedAt = nowMs
      step.error = undefined
      state.currentStepIndex = stepIndex

      const nextIndex = stepIndex + 1
      const nextStep = state.steps[nextIndex]

      if (current.cancelRequestedAt) {
        markRemainingStepsCancelled(state, nextIndex, nowMs)
        return {
          ...current,
          revision: current.revision + 1,
          status: 'cancelled',
          updatedAt: nowMs,
          endedAt: nowMs,
          currentStep: undefined,
          blockedRunId: undefined,
          blockedSummary: undefined,
          waitJson: undefined,
          stateJson: state,
          lastError: undefined,
        }
      }

      if (!nextStep) {
        return {
          ...current,
          revision: current.revision + 1,
          status: 'succeeded',
          updatedAt: nowMs,
          endedAt: nowMs,
          currentStep: undefined,
          blockedRunId: undefined,
          blockedSummary: undefined,
          waitJson: undefined,
          stateJson: state,
          lastError: undefined,
        }
      }

      state.currentStepIndex = nextIndex
      if (nextStep.waitFor) {
        return {
          ...current,
          revision: current.revision + 1,
          status: 'waiting',
          updatedAt: nowMs,
          endedAt: undefined,
          currentStep: nextStep.name,
          blockedRunId: undefined,
          blockedSummary: undefined,
          waitJson: {
            reason: nextStep.waitFor,
            stepId: nextStep.stepId,
            stepName: nextStep.name,
            stepIndex: nextIndex,
          },
          stateJson: state,
          lastError: undefined,
        }
      }

      return {
        ...current,
        revision: current.revision + 1,
        status: 'queued',
        updatedAt: nowMs,
        endedAt: undefined,
        currentStep: nextStep.name,
        blockedRunId: undefined,
        blockedSummary: undefined,
        waitJson: undefined,
        stateJson: state,
        lastError: undefined,
      }
    },
    rootDir,
  ).then(flow =>
    flow
      ? {
          flow,
          ...(flow.status === 'queued' && flow.stateJson
            ? {
                nextStep: buildQueueInstruction(
                  flow,
                  flow.stateJson.currentStepIndex,
                ),
              }
            : {}),
        }
      : null,
  )
}

export async function markManagedAutonomyFlowStepFailed(params: {
  flowId: string
  runId: string
  error: string
  rootDir?: string
  nowMs?: number
}): Promise<ManagedAutonomyFlowAdvanceResult | null> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const nowMs = params.nowMs ?? Date.now()
  return updateAutonomyFlowById(
    params.flowId,
    current => {
      const state = cloneManagedState(current.stateJson)
      if (!state) {
        return current
      }
      const stepIndex = state.steps.findIndex(
        step => step.runId === params.runId,
      )
      if (stepIndex === -1) {
        return current
      }
      const step = state.steps[stepIndex]!
      step.status = 'failed'
      step.endedAt = nowMs
      step.error = params.error
      state.currentStepIndex = stepIndex

      if (current.cancelRequestedAt) {
        markRemainingStepsCancelled(state, stepIndex + 1, nowMs)
        return {
          ...current,
          revision: current.revision + 1,
          status: 'cancelled',
          updatedAt: nowMs,
          endedAt: nowMs,
          currentStep: undefined,
          blockedRunId: params.runId,
          blockedSummary: params.error,
          waitJson: undefined,
          stateJson: state,
          lastError: params.error,
        }
      }

      return {
        ...current,
        revision: current.revision + 1,
        status: 'failed',
        updatedAt: nowMs,
        endedAt: nowMs,
        currentStep: step.name,
        blockedRunId: params.runId,
        blockedSummary: params.error,
        waitJson: undefined,
        stateJson: state,
        lastError: params.error,
      }
    },
    rootDir,
  ).then(flow => (flow ? { flow } : null))
}

export async function markManagedAutonomyFlowStepCancelled(params: {
  flowId: string
  runId: string
  rootDir?: string
  nowMs?: number
}): Promise<ManagedAutonomyFlowAdvanceResult | null> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const nowMs = params.nowMs ?? Date.now()
  return updateAutonomyFlowById(
    params.flowId,
    current => {
      const state = cloneManagedState(current.stateJson)
      if (!state) {
        return current
      }
      const stepIndex = state.steps.findIndex(
        step => step.runId === params.runId,
      )
      if (stepIndex === -1) {
        return current
      }
      const step = state.steps[stepIndex]!
      step.status = 'cancelled'
      step.endedAt = nowMs
      markRemainingStepsCancelled(state, stepIndex + 1, nowMs)
      state.currentStepIndex = stepIndex
      return {
        ...current,
        revision: current.revision + 1,
        status: 'cancelled',
        updatedAt: nowMs,
        endedAt: nowMs,
        currentStep: undefined,
        blockedRunId: params.runId,
        blockedSummary: undefined,
        waitJson: undefined,
        stateJson: state,
        lastError: undefined,
      }
    },
    rootDir,
  ).then(flow => (flow ? { flow } : null))
}

export async function resumeManagedAutonomyFlow(params: {
  flowId: string
  rootDir?: string
  nowMs?: number
}): Promise<ManagedAutonomyFlowAdvanceResult | null> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const nowMs = params.nowMs ?? Date.now()
  return updateAutonomyFlowById(
    params.flowId,
    current => {
      if (
        current.status !== 'waiting' ||
        !current.stateJson ||
        !current.waitJson
      ) {
        return current
      }
      if (current.cancelRequestedAt) {
        return {
          ...current,
          revision: current.revision + 1,
          status: 'cancelled',
          updatedAt: nowMs,
          endedAt: nowMs,
          currentStep: undefined,
          waitJson: undefined,
          lastError: undefined,
        }
      }
      const state = cloneManagedState(current.stateJson)!
      state.currentStepIndex = current.waitJson.stepIndex
      return {
        ...current,
        revision: current.revision + 1,
        status: 'queued',
        updatedAt: nowMs,
        endedAt: undefined,
        currentStep: current.waitJson.stepName,
        waitJson: undefined,
        stateJson: state,
        lastError: undefined,
      }
    },
    rootDir,
  ).then(flow =>
    flow
      ? {
          flow,
          ...(flow.status === 'queued' && flow.stateJson
            ? {
                nextStep: buildQueueInstruction(
                  flow,
                  flow.stateJson.currentStepIndex,
                ),
              }
            : {}),
        }
      : null,
  )
}

export async function requestManagedAutonomyFlowCancel(params: {
  flowId: string
  rootDir?: string
  nowMs?: number
}): Promise<ManagedAutonomyFlowCancelResult | null> {
  const rootDir = resolve(params.rootDir ?? getProjectRoot())
  const nowMs = params.nowMs ?? Date.now()
  return withAutonomyPersistenceLock(rootDir, async () => {
    const flows = await listAutonomyFlows(rootDir)
    const index = flows.findIndex(flow => flow.flowId === params.flowId)
    if (index === -1) {
      return null
    }
    const current = cloneFlowRecord(flows[index]!)
    const queuedRunIds =
      current.stateJson?.steps
        .filter(
          step => step.status === 'queued' && typeof step.runId === 'string',
        )
        .map(step => step.runId!) ?? []

    if (!isManagedFlowStatusActive(current.status)) {
      return {
        flow: current,
        queuedRunIds,
        accepted: false,
      }
    }

    const state = cloneManagedState(current.stateJson)
    if (!state) {
      return {
        flow: current,
        queuedRunIds,
        accepted: false,
      }
    }

    const next =
      current.status === 'running'
        ? normalizeFlowRecord({
            ...current,
            revision: current.revision + 1,
            updatedAt: nowMs,
            cancelRequestedAt: current.cancelRequestedAt ?? nowMs,
          })
        : normalizeFlowRecord({
            ...current,
            revision: current.revision + 1,
            status: 'cancelled',
            updatedAt: nowMs,
            endedAt: nowMs,
            currentStep: undefined,
            waitJson: undefined,
            stateJson: (() => {
              markRemainingStepsCancelled(state, state.currentStepIndex, nowMs)
              return state
            })(),
            cancelRequestedAt: current.cancelRequestedAt ?? nowMs,
            lastError: undefined,
            blockedRunId: undefined,
            blockedSummary: undefined,
          })

    flows[index] = next
    await writeAutonomyFlows(flows, rootDir)
    return {
      flow: next,
      queuedRunIds,
      accepted: true,
    }
  })
}

export async function getAutonomyFlowById(
  flowId: string,
  rootDir: string = getProjectRoot(),
): Promise<AutonomyFlowRecord | null> {
  const flows = await listAutonomyFlows(rootDir)
  return flows.find(flow => flow.flowId === flowId) ?? null
}

export function formatAutonomyFlowsStatus(flows: AutonomyFlowRecord[]): string {
  const counts = {
    queued: 0,
    running: 0,
    waiting: 0,
    blocked: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    lost: 0,
  }
  for (const flow of flows) {
    counts[flow.status] += 1
  }
  return [
    `Autonomy flows: ${flows.length}`,
    `Queued: ${counts.queued}`,
    `Running: ${counts.running}`,
    `Waiting: ${counts.waiting}`,
    `Blocked: ${counts.blocked}`,
    `Succeeded: ${counts.succeeded}`,
    `Failed: ${counts.failed}`,
    `Cancelled: ${counts.cancelled}`,
  ].join('\n')
}

export function formatAutonomyFlowsList(
  flows: AutonomyFlowRecord[],
  limit = 10,
): string {
  const slice = flows.slice(0, limit)
  if (slice.length === 0) {
    return 'No autonomy flows recorded.'
  }
  return slice
    .map(flow => {
      const source = flow.sourceLabel ?? flow.sourceId ?? 'automatic'
      const stepSummary = flow.currentStep ? ` | step=${flow.currentStep}` : ''
      const waitSummary =
        flow.status === 'waiting' && flow.waitJson
          ? ` | waiting=${flow.waitJson.reason}`
          : ''
      return `${flow.flowId} | managed | rev=${flow.revision} | ${flow.status} | ${source}${stepSummary}${waitSummary}\n  goal=${flow.goal} | runs=${flow.runCount}`
    })
    .join('\n')
}

export function formatAutonomyFlowDetail(
  flow: AutonomyFlowRecord | null | undefined,
): string {
  if (!flow) {
    return 'Autonomy flow not found.'
  }
  const stepLines = flow.stateJson?.steps.map((step, index) => {
    const runId = step.runId ?? 'none'
    const wait = step.waitFor ? ` | wait=${step.waitFor}` : ''
    const error = step.error ? ` | error=${step.error}` : ''
    return `${index + 1}. ${step.name} | ${step.status} | run=${runId}${wait}${error}`
  }) ?? ['none']

  return [
    `Flow: ${flow.flowId}`,
    `Key: ${flow.flowKey}`,
    `Mode: ${flow.syncMode}`,
    `Revision: ${flow.revision}`,
    `Trigger: ${flow.trigger}`,
    `Status: ${flow.status}`,
    `Goal: ${flow.goal}`,
    `Source: ${flow.sourceLabel ?? flow.sourceId ?? 'automatic'}`,
    `Owner: ${flow.ownerKey}`,
    `Current step: ${flow.currentStep ?? 'none'}`,
    `Run count: ${flow.runCount}`,
    `Latest run: ${flow.latestRunId ?? 'none'}`,
    `Created: ${new Date(flow.createdAt).toLocaleString()}`,
    `Updated: ${new Date(flow.updatedAt).toLocaleString()}`,
    ...(flow.startedAt
      ? [`Started: ${new Date(flow.startedAt).toLocaleString()}`]
      : []),
    ...(flow.endedAt
      ? [`Ended: ${new Date(flow.endedAt).toLocaleString()}`]
      : []),
    ...(flow.waitJson
      ? [
          `Waiting: ${flow.waitJson.reason} (${flow.waitJson.stepName} @ ${flow.waitJson.stepIndex + 1})`,
        ]
      : []),
    ...(flow.cancelRequestedAt
      ? [
          `Cancel requested: ${new Date(flow.cancelRequestedAt).toLocaleString()}`,
        ]
      : []),
    ...(flow.blockedRunId ? [`Blocked run: ${flow.blockedRunId}`] : []),
    ...(flow.blockedSummary ? [`Blocked summary: ${flow.blockedSummary}`] : []),
    ...(flow.lastError ? [`Error: ${flow.lastError}`] : []),
    'Steps:',
    ...stepLines,
  ].join('\n')
}
