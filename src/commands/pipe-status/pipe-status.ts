import type { LocalCommandCall } from '../../types/command.js'
import { getAllSlaveClients } from '../../hooks/useMasterMonitor.js'
import {
  getPipeDisplayRole,
  getPipeIpc,
  isPipeControlled,
} from '../../utils/pipeTransport.js'

export const call: LocalCommandCall = async (_args, context) => {
  const currentState = context.getAppState()

  if (getPipeIpc(currentState).role === 'main') {
    return {
      type: 'text',
      value:
        'Main mode — not connected to any CLIs.\nUse /attach <pipe-name> to connect to a sub session.',
    }
  }

  if (isPipeControlled(getPipeIpc(currentState))) {
    return {
      type: 'text',
      value: `${getPipeDisplayRole(getPipeIpc(currentState))} mode — controlled by "${getPipeIpc(currentState).attachedBy}".\nAll session data is being reported to the master.`,
    }
  }

  // Master mode
  const slaves = getPipeIpc(currentState).slaves
  const slaveNames = Object.keys(slaves)
  const clients = getAllSlaveClients()

  if (slaveNames.length === 0) {
    return {
      type: 'text',
      value:
        'Master mode but no sub sessions connected.\nUse /attach <pipe-name> to connect.',
    }
  }

  const lines: string[] = [
    `Master mode — ${slaveNames.length} sub session(s) connected:`,
    '',
  ]

  for (const name of slaveNames) {
    const slave = slaves[name]!
    const client = clients.get(name)
    const connected = client?.connected ? 'connected' : 'disconnected'
    const historyCount = slave.history.length
    const connectedAt = slave.connectedAt.slice(11, 19)

    lines.push(`  ${name}`)
    lines.push(`    Status:    ${slave.status} (${connected})`)
    lines.push(`    Connected: ${connectedAt}`)
    lines.push(`    History:   ${historyCount} entries`)
    lines.push('')
  }

  lines.push('Commands:')
  lines.push('  /send <name> <msg>  — Send a task to a sub session')
  lines.push('  /history <name>     — View sub session transcript')
  lines.push('  /detach [name]      — Disconnect from a sub session (or all)')

  return { type: 'text', value: lines.join('\n') }
}
