import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { getProjectRoot } from '../bootstrap/state.js'
import { safeParseJSON } from './json.js'

const WORKFLOW_RUNS_REL = join('.claude', 'workflow-runs')
const MAX_WORKFLOW_RUNS = 200

const WORKFLOW_RUN_STATUSES = ['running', 'completed', 'cancelled'] as const
const WORKFLOW_STEP_STATUSES = [
  'pending',
  'running',
  'completed',
  'cancelled',
] as const

type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number]
type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number]

export type WorkflowRunStepRecord = {
  name: string
  prompt?: string
  status: WorkflowStepStatus
  startedAt?: number
  completedAt?: number
}

export type WorkflowRunRecord = {
  runId: string
  workflow: string
  args?: string
  status: WorkflowRunStatus
  createdAt: number
  updatedAt: number
  currentStepIndex: number
  steps: WorkflowRunStepRecord[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWorkflowRunStatus(value: unknown): value is WorkflowRunStatus {
  return (
    typeof value === 'string' &&
    WORKFLOW_RUN_STATUSES.includes(value as WorkflowRunStatus)
  )
}

function isWorkflowStepStatus(value: unknown): value is WorkflowStepStatus {
  return (
    typeof value === 'string' &&
    WORKFLOW_STEP_STATUSES.includes(value as WorkflowStepStatus)
  )
}

function normalizeWorkflowStep(value: unknown): WorkflowRunStepRecord | null {
  if (!isRecord(value)) return null
  if (typeof value.name !== 'string') return null
  if (!isWorkflowStepStatus(value.status)) return null
  return {
    name: value.name,
    ...(typeof value.prompt === 'string' ? { prompt: value.prompt } : {}),
    status: value.status,
    ...(typeof value.startedAt === 'number'
      ? { startedAt: value.startedAt }
      : {}),
    ...(typeof value.completedAt === 'number'
      ? { completedAt: value.completedAt }
      : {}),
  }
}

function normalizeWorkflowRun(value: unknown): WorkflowRunRecord | null {
  if (!isRecord(value)) return null
  if (typeof value.runId !== 'string') return null
  if (typeof value.workflow !== 'string') return null
  if (!isWorkflowRunStatus(value.status)) return null
  if (typeof value.createdAt !== 'number') return null
  if (typeof value.updatedAt !== 'number') return null
  if (typeof value.currentStepIndex !== 'number') return null
  if (!Array.isArray(value.steps)) return null
  const steps = value.steps
    .map(normalizeWorkflowStep)
    .filter((step): step is WorkflowRunStepRecord => step !== null)
  if (steps.length !== value.steps.length) return null
  return {
    runId: value.runId,
    workflow: value.workflow,
    ...(typeof value.args === 'string' ? { args: value.args } : {}),
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    currentStepIndex: value.currentStepIndex,
    steps,
  }
}

async function readWorkflowRun(
  rootDir: string,
  runId: string,
): Promise<WorkflowRunRecord | null> {
  try {
    const parsed = safeParseJSON(
      await readFile(
        join(rootDir, WORKFLOW_RUNS_REL, `${runId}.json`),
        'utf-8',
      ),
      false,
    )
    return normalizeWorkflowRun(parsed)
  } catch {
    return null
  }
}

export async function listWorkflowRuns(
  rootDir: string = getProjectRoot(),
): Promise<WorkflowRunRecord[]> {
  let files: string[]
  try {
    files = await readdir(join(rootDir, WORKFLOW_RUNS_REL))
  } catch {
    return []
  }
  const jsonFiles = files.filter(file => file.endsWith('.json'))
  const runs = await Promise.all(
    jsonFiles
      .slice(0, MAX_WORKFLOW_RUNS)
      .map(file => readWorkflowRun(rootDir, file.slice(0, -'.json'.length))),
  )
  return runs
    .filter((run): run is WorkflowRunRecord => run !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function formatWorkflowRunsStatus(runs: WorkflowRunRecord[]): string {
  if (runs.length === 0) {
    return ['Workflow runs: 0', '  none'].join('\n')
  }
  const running = runs.filter(run => run.status === 'running').length
  const completed = runs.filter(run => run.status === 'completed').length
  const cancelled = runs.filter(run => run.status === 'cancelled').length
  const lines = [
    `Workflow runs: ${runs.length}`,
    `  Running: ${running}`,
    `  Completed: ${completed}`,
    `  Cancelled: ${cancelled}`,
  ]
  for (const run of runs.slice(0, 10)) {
    const currentStep = run.steps[run.currentStepIndex]
    lines.push(
      `  ${run.runId}: ${run.workflow}: ${run.status} step=${currentStep?.name ?? 'none'} updated=${new Date(run.updatedAt).toLocaleString()}`,
    )
  }
  if (runs.length > 10) {
    lines.push(`  ... ${runs.length - 10} more workflow run(s)`)
  }
  return lines.join('\n')
}
