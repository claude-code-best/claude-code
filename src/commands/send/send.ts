import type { LocalCommandCall } from '../../types/command.js'
import { getSlaveClient } from '../../hooks/useMasterMonitor.js'
import { getPipeIpc } from '../../utils/pipeTransport.js'

export const call: LocalCommandCall = async (args, context) => {
  const currentState = context.getAppState()

  if (getPipeIpc(currentState).role !== 'master') {
    return {
      type: 'text',
      value: 'Not in master mode. Use /attach <pipe-name> first.',
    }
  }

  // Parse: first word is pipe name, rest is the message
  const trimmed = args.trim()
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) {
    return {
      type: 'text',
      value: 'Usage: /send <pipe-name> <message>',
    }
  }

  const targetName = trimmed.slice(0, spaceIdx)
  const message = trimmed.slice(spaceIdx + 1).trim()

  if (!message) {
    return {
      type: 'text',
      value: 'Usage: /send <pipe-name> <message>',
    }
  }

  const client = getSlaveClient(targetName)
  if (!client) {
    return {
      type: 'text',
      value: `Not attached to "${targetName}". Use /status to see connected sub sessions.`,
    }
  }

  if (!client.connected) {
    return {
      type: 'text',
      value: `Connection to "${targetName}" is closed. Use /detach ${targetName} and re-attach.`,
    }
  }

  try {
    client.send({
      type: 'prompt',
      data: message,
    })

    // Record the sent prompt in history
    context.setAppState(prev => {
      const slave = getPipeIpc(prev).slaves[targetName]
      if (!slave) return prev
      return {
        ...prev,
        pipeIpc: {
          ...getPipeIpc(prev),
          slaves: {
            ...getPipeIpc(prev).slaves,
            [targetName]: {
              ...slave,
              status: 'busy' as const,
              lastActivityAt: new Date().toISOString(),
              lastSummary: `Queued: ${message}`,
              lastEventType: 'prompt',
              history: [
                ...slave.history,
                {
                  type: 'prompt' as const,
                  content: message,
                  from: getPipeIpc(currentState).serverName ?? 'master',
                  timestamp: new Date().toISOString(),
                },
              ],
            },
          },
        },
      }
    })

    return {
      type: 'text',
      value: `Sent to "${targetName}": ${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`,
    }
  } catch (err) {
    return {
      type: 'text',
      value: `Failed to send to "${targetName}": ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
