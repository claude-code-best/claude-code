import type { QueuedCommand } from '../types/textInputTypes.js'
import {
  finalizeAutonomyRunCompleted,
  finalizeAutonomyRunFailed,
  listAutonomyRuns,
  markAutonomyRunCancelled,
  markAutonomyRunRunning,
} from './autonomyRuns.js'

export type AutonomyQueuePartition = {
  attachmentCommands: QueuedCommand[]
  staleCommands: QueuedCommand[]
}

export type AutonomyQueueClaim = AutonomyQueuePartition & {
  claimedRunIds: string[]
  claimedCommands: QueuedCommand[]
}

export type AutonomyTurnOutcome =
  | { type: 'completed' }
  | { type: 'cancelled' }
  | { type: 'failed'; error?: unknown; message?: string }

type AutonomyRunRef = {
  runId: string
  rootDir?: string
}

function getCommandRootDir(
  command: QueuedCommand,
  fallbackRootDir?: string,
): string | undefined {
  return command.autonomy?.rootDir ?? fallbackRootDir
}

function refKey(ref: AutonomyRunRef): string {
  return `${ref.rootDir ?? ''}\0${ref.runId}`
}

function getAutonomyRunRefs(
  commands: QueuedCommand[],
  fallbackRootDir?: string,
): AutonomyRunRef[] {
  const refs = new Map<string, AutonomyRunRef>()
  for (const command of commands) {
    const runId = command.autonomy?.runId
    if (!runId) {
      continue
    }
    const ref = {
      runId,
      rootDir: getCommandRootDir(command, fallbackRootDir),
    }
    refs.set(refKey(ref), ref)
  }
  return [...refs.values()]
}

function isInlineQueuedCommand(command: QueuedCommand): boolean {
  return command.mode === 'prompt' || command.mode === 'task-notification'
}

function groupRefsByRootDir(
  refs: AutonomyRunRef[],
): Map<string, AutonomyRunRef[]> {
  const grouped = new Map<string, AutonomyRunRef[]>()
  for (const ref of refs) {
    const key = ref.rootDir ?? ''
    const group = grouped.get(key)
    if (group) {
      group.push(ref)
    } else {
      grouped.set(key, [ref])
    }
  }
  return grouped
}

/**
 * Exclude queued autonomy commands whose persisted run is no longer queued.
 * This prevents stale in-memory commands from reviving flows after cancellation
 * or after another path has already consumed the run.
 */
export async function partitionConsumableQueuedAutonomyCommands(
  commands: QueuedCommand[],
  rootDir?: string,
): Promise<AutonomyQueuePartition> {
  const attachmentCommands: QueuedCommand[] = []
  const staleCommands: QueuedCommand[] = []
  const refs = getAutonomyRunRefs(commands, rootDir)
  const runsByRef = new Map<
    string,
    Awaited<ReturnType<typeof listAutonomyRuns>>[number]
  >()
  for (const [rootKey, group] of groupRefsByRootDir(refs)) {
    const runs = await listAutonomyRuns(rootKey || undefined)
    const wanted = new Set(group.map(ref => ref.runId))
    for (const run of runs) {
      if (wanted.has(run.runId)) {
        runsByRef.set(
          refKey({ runId: run.runId, rootDir: rootKey || undefined }),
          run,
        )
      }
    }
  }

  for (const command of commands) {
    const runId = command.autonomy?.runId
    if (!runId) {
      attachmentCommands.push(command)
      continue
    }

    const commandRootDir = getCommandRootDir(command, rootDir)
    const run = runsByRef.get(refKey({ runId, rootDir: commandRootDir }))
    if (run?.status === 'queued' && !run.startedAt && !run.endedAt) {
      attachmentCommands.push(command)
    } else {
      staleCommands.push(command)
    }
  }

  return { attachmentCommands, staleCommands }
}

export async function claimConsumableQueuedAutonomyCommands(
  commands: QueuedCommand[],
  rootDir?: string,
): Promise<AutonomyQueueClaim> {
  const partition = await partitionConsumableQueuedAutonomyCommands(
    commands,
    rootDir,
  )
  const claimedRunIds: string[] = []
  const claimedRunKeys: string[] = []
  const staleRunKeys = new Set<string>()
  const candidateRefs = getAutonomyRunRefs(
    partition.attachmentCommands.filter(isInlineQueuedCommand),
    rootDir,
  )

  for (const ref of candidateRefs) {
    const updated = await markAutonomyRunRunning(ref.runId, ref.rootDir)
    if (updated?.status === 'running') {
      claimedRunIds.push(ref.runId)
      claimedRunKeys.push(refKey(ref))
    } else {
      staleRunKeys.add(refKey(ref))
    }
  }

  const claimedRunKeySet = new Set(claimedRunKeys)
  const attachmentCommands: QueuedCommand[] = []
  const claimedCommands: QueuedCommand[] = []
  const staleCommands = [...partition.staleCommands]

  for (const command of partition.attachmentCommands) {
    const runId = command.autonomy?.runId
    if (!runId) {
      attachmentCommands.push(command)
      continue
    }
    const key = refKey({
      runId,
      rootDir: getCommandRootDir(command, rootDir),
    })
    if (claimedRunKeySet.has(key)) {
      attachmentCommands.push(command)
      claimedCommands.push(command)
    } else if (staleRunKeys.has(key)) {
      staleCommands.push(command)
    }
  }

  return {
    attachmentCommands,
    staleCommands,
    claimedRunIds,
    claimedCommands,
  }
}

export async function cancelQueuedAutonomyCommands(params: {
  commands: QueuedCommand[]
  rootDir?: string
}): Promise<void> {
  for (const ref of getAutonomyRunRefs(params.commands, params.rootDir)) {
    await markAutonomyRunCancelled(ref.runId, ref.rootDir)
  }
}

function stringifyAutonomyError(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function sanitizeAutonomyFailureForPersistence(
  error: unknown,
  fallback = 'query failed',
): string {
  const message = stringifyAutonomyError(error)
  const lower = message.toLowerCase()
  if (
    lower.includes('api_error') ||
    lower.includes('provider') ||
    lower.includes('openai') ||
    lower.includes('gemini') ||
    lower.includes('grok') ||
    lower.includes('anthropic') ||
    lower.includes('bedrock') ||
    lower.includes('vertex')
  ) {
    return 'provider api_error'
  }
  return fallback
}

export async function finalizeAutonomyCommandsForTurn(params: {
  commands: QueuedCommand[]
  outcome: AutonomyTurnOutcome
  currentDir?: string
  priority?: 'now' | 'next' | 'later'
  workload?: string
}): Promise<QueuedCommand[]> {
  const nextCommands: QueuedCommand[] = []
  for (const command of params.commands) {
    const autonomy = command.autonomy
    if (!autonomy?.runId) {
      continue
    }
    if (params.outcome.type === 'completed') {
      nextCommands.push(
        ...(await finalizeAutonomyRunCompleted({
          runId: autonomy.runId,
          rootDir: autonomy.rootDir,
          currentDir: params.currentDir,
          priority: params.priority,
          workload: command.workload ?? params.workload,
        })),
      )
    } else if (params.outcome.type === 'cancelled') {
      await markAutonomyRunCancelled(autonomy.runId, autonomy.rootDir)
    } else {
      await finalizeAutonomyRunFailed({
        runId: autonomy.runId,
        rootDir: autonomy.rootDir,
        error:
          params.outcome.message ??
          sanitizeAutonomyFailureForPersistence(params.outcome.error),
      })
    }
  }
  return nextCommands
}
