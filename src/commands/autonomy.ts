import type { Command, LocalCommandCall } from '../types/command.js'
import {
  formatAutonomyFlowDetail,
  formatAutonomyFlowsList,
  formatAutonomyFlowsStatus,
  getAutonomyFlowById,
  listAutonomyFlows,
  requestManagedAutonomyFlowCancel,
} from '../utils/autonomyFlows.js'
import {
  formatAutonomyRunsList,
  formatAutonomyRunsStatus,
  listAutonomyRuns,
  markAutonomyRunCancelled,
  resumeManagedAutonomyFlowPrompt,
} from '../utils/autonomyRuns.js'
import {
  enqueuePendingNotification,
  removeByFilter,
} from '../utils/messageQueueManager.js'

function parseRunsLimit(raw?: string): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10
  }
  return Math.min(parsed, 50)
}

const call: LocalCommandCall = async (args: string) => {
  const [subcommand = 'status', arg1, arg2] = args.trim().split(/\s+/, 3)
  const runs = await listAutonomyRuns()
  const flows = await listAutonomyFlows()

  if (subcommand === 'runs') {
    return {
      type: 'text',
      value: formatAutonomyRunsList(runs, parseRunsLimit(arg1)),
    }
  }

  if (subcommand === 'flows') {
    return {
      type: 'text',
      value: formatAutonomyFlowsList(flows, parseRunsLimit(arg1)),
    }
  }

  if (subcommand === 'flow') {
    if (arg1 === 'cancel') {
      const flowId = arg2 ?? ''
      const cancelled = await requestManagedAutonomyFlowCancel({ flowId })
      if (!cancelled) {
        return {
          type: 'text',
          value: 'Autonomy flow not found.',
        }
      }
      if (!cancelled.accepted) {
        return {
          type: 'text',
          value: `Autonomy flow ${flowId} is already terminal (${cancelled.flow.status}).`,
        }
      }
      const removed = removeByFilter(cmd => cmd.autonomy?.flowId === flowId)
      for (const command of removed) {
        if (command.autonomy?.runId) {
          await markAutonomyRunCancelled(command.autonomy.runId)
        }
      }
      return {
        type: 'text',
        value:
          cancelled.flow.status === 'running'
            ? `Cancellation requested for flow ${flowId}. The current step is still running, and no new steps will be started.`
            : `Cancelled flow ${flowId}. Removed ${removed.length} queued step(s).`,
      }
    }

    if (arg1 === 'resume') {
      const flowId = arg2 ?? ''
      const command = await resumeManagedAutonomyFlowPrompt({ flowId })
      if (!command) {
        return {
          type: 'text',
          value: 'Autonomy flow is not waiting or was not found.',
        }
      }
      enqueuePendingNotification(command)
      return {
        type: 'text',
        value: `Queued the next managed step for flow ${flowId}.`,
      }
    }

    return {
      type: 'text',
      value: formatAutonomyFlowDetail(await getAutonomyFlowById(arg1 ?? '')),
    }
  }

  if (subcommand !== 'status' && subcommand !== '') {
    return {
      type: 'text',
      value:
        'Usage: /autonomy [status|runs [limit]|flows [limit]|flow <id>|flow cancel <id>|flow resume <id>]',
    }
  }

  return {
    type: 'text',
    value: [formatAutonomyRunsStatus(runs), formatAutonomyFlowsStatus(flows)].join('\n'),
  }
}

const autonomy = {
  type: 'local',
  name: 'autonomy',
  description:
    'Inspect automatic autonomy runs recorded for proactive ticks and scheduled tasks',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default autonomy
