import {
  formatAutonomyFlowDetail,
  formatAutonomyFlowsList,
  formatAutonomyFlowsStatus,
  getAutonomyFlowById,
  listAutonomyFlows,
  requestManagedAutonomyFlowCancel,
} from '../../utils/autonomyFlows.js'
import {
  formatAutonomyRunsList,
  formatAutonomyRunsStatus,
  listAutonomyRuns,
  markAutonomyRunCancelled,
  resumeManagedAutonomyFlowPrompt,
} from '../../utils/autonomyRuns.js'
import {
  formatAutonomyDeepStatus,
  formatAutonomyDeepStatusSections,
  type AutonomyDeepStatusSectionId,
} from '../../utils/autonomyStatus.js'
import {
  AUTONOMY_USAGE,
  parseAutonomyArgs,
} from '../../utils/autonomyCommandSpec.js'
import {
  enqueuePendingNotification,
  removeByFilter,
} from '../../utils/messageQueueManager.js'

export function parseAutonomyLimit(raw?: string | number): number {
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10
  }
  return Math.min(parsed, 50)
}

export async function getAutonomyStatusText(options?: {
  deep?: boolean
  rootDir?: string
}): Promise<string> {
  const rootDir = options?.rootDir
  const [runs, flows] = await Promise.all([
    listAutonomyRuns(rootDir),
    listAutonomyFlows(rootDir),
  ])

  if (options?.deep) {
    return formatAutonomyDeepStatus({ runs, flows })
  }

  return [
    formatAutonomyRunsStatus(runs),
    formatAutonomyFlowsStatus(flows),
  ].join('\n')
}

export async function getAutonomyDeepSectionText(
  sectionId: AutonomyDeepStatusSectionId,
  options?: { rootDir?: string },
): Promise<string> {
  const [runs, flows] = await Promise.all([
    listAutonomyRuns(options?.rootDir),
    listAutonomyFlows(options?.rootDir),
  ])
  const sections = await formatAutonomyDeepStatusSections({ runs, flows })
  const section = sections.find(item => item.id === sectionId)
  if (!section) {
    return `Autonomy deep status section not found: ${sectionId}`
  }
  return [`# ${section.title}`, section.content].join('\n')
}

export async function autonomyStatusHandler(options?: {
  deep?: boolean
}): Promise<void> {
  process.stdout.write(`${await getAutonomyStatusText(options)}\n`)
}

export async function getAutonomyRunsText(
  limit?: string | number,
  options?: { rootDir?: string },
): Promise<string> {
  return formatAutonomyRunsList(
    await listAutonomyRuns(options?.rootDir),
    parseAutonomyLimit(limit),
  )
}

export async function autonomyRunsHandler(
  limit?: string | number,
): Promise<void> {
  process.stdout.write(`${await getAutonomyRunsText(limit)}\n`)
}

export async function getAutonomyFlowsText(
  limit?: string | number,
  options?: { rootDir?: string },
): Promise<string> {
  return formatAutonomyFlowsList(
    await listAutonomyFlows(options?.rootDir),
    parseAutonomyLimit(limit),
  )
}

export async function autonomyFlowsHandler(
  limit?: string | number,
): Promise<void> {
  process.stdout.write(`${await getAutonomyFlowsText(limit)}\n`)
}

export async function getAutonomyFlowText(
  flowId: string,
  options?: { rootDir?: string },
): Promise<string> {
  return formatAutonomyFlowDetail(
    await getAutonomyFlowById(flowId, options?.rootDir),
  )
}

export async function autonomyFlowHandler(flowId: string): Promise<void> {
  process.stdout.write(`${await getAutonomyFlowText(flowId)}\n`)
}

export async function cancelAutonomyFlowText(
  flowId: string,
  options?: {
    removeQueuedInMemory?: boolean
    rootDir?: string
  },
): Promise<string> {
  const cancelled = await requestManagedAutonomyFlowCancel({
    flowId,
    rootDir: options?.rootDir,
  })
  if (!cancelled) {
    return 'Autonomy flow not found.'
  }
  if (!cancelled.accepted) {
    return `Autonomy flow ${flowId} is already terminal (${cancelled.flow.status}).`
  }

  let removedCount = 0
  if (options?.removeQueuedInMemory) {
    const removed = removeByFilter(cmd => cmd.autonomy?.flowId === flowId)
    removedCount = removed.length
    for (const command of removed) {
      if (command.autonomy?.runId) {
        await markAutonomyRunCancelled(command.autonomy.runId, options?.rootDir)
      }
    }
  } else {
    for (const runId of cancelled.queuedRunIds) {
      await markAutonomyRunCancelled(runId, options?.rootDir)
    }
    removedCount = cancelled.queuedRunIds.length
  }

  return cancelled.flow.status === 'running'
    ? `Cancellation requested for flow ${flowId}. The current step is still running, and no new steps will be started.`
    : `Cancelled flow ${flowId}. Removed ${removedCount} queued step(s).`
}

export async function autonomyFlowCancelHandler(flowId: string): Promise<void> {
  process.stdout.write(`${await cancelAutonomyFlowText(flowId)}\n`)
}

export async function resumeAutonomyFlowText(
  flowId: string,
  options?: {
    enqueueInMemory?: boolean
    rootDir?: string
    currentDir?: string
  },
): Promise<string> {
  const command = await resumeManagedAutonomyFlowPrompt({
    flowId,
    rootDir: options?.rootDir,
    currentDir: options?.currentDir,
  })
  if (!command) {
    return 'Autonomy flow is not waiting or was not found.'
  }

  if (options?.enqueueInMemory) {
    enqueuePendingNotification(command)
    return `Queued the next managed step for flow ${flowId}.`
  }

  const runId = command.autonomy?.runId ?? 'unknown'
  return [
    `Prepared the next managed step for flow ${flowId}.`,
    `Run ID: ${runId}`,
    '',
    'Prompt:',
    typeof command.value === 'string' ? command.value : String(command.value),
  ].join('\n')
}

export async function autonomyFlowResumeHandler(flowId: string): Promise<void> {
  process.stdout.write(`${await resumeAutonomyFlowText(flowId)}\n`)
}

export async function getAutonomyCommandText(
  args: string,
  options?: {
    enqueueInMemory?: boolean
    removeQueuedInMemory?: boolean
  },
): Promise<string> {
  const parsed = parseAutonomyArgs(args)

  switch (parsed.type) {
    case 'status':
      return getAutonomyStatusText({ deep: parsed.deep })
    case 'runs':
      return getAutonomyRunsText(parsed.limit)
    case 'flows':
      return getAutonomyFlowsText(parsed.limit)
    case 'flow-detail':
      return getAutonomyFlowText(parsed.flowId)
    case 'flow-cancel':
      return cancelAutonomyFlowText(parsed.flowId, {
        removeQueuedInMemory: options?.removeQueuedInMemory,
      })
    case 'flow-resume':
      return resumeAutonomyFlowText(parsed.flowId, {
        enqueueInMemory: options?.enqueueInMemory,
      })
    case 'usage':
      return AUTONOMY_USAGE
  }
}
