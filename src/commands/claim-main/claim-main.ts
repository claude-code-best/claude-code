import type { LocalCommandCall } from '../../types/command.js'
import { getPipeIpc } from '../../utils/pipeTransport.js'
import {
  getMachineId,
  getMacAddress,
  claimMain,
  readRegistry,
} from '../../utils/pipeRegistry.js'
import { getLocalIp } from '../../utils/pipeTransport.js'

export const call: LocalCommandCall = async (_args, context) => {
  const currentState = context.getAppState()
  const pipeState = getPipeIpc(currentState)
  const myName = pipeState.serverName

  if (!myName) {
    return {
      type: 'text',
      value: 'Pipe server not started. Cannot claim main.',
    }
  }

  const machineId = await getMachineId()
  const registry = await readRegistry()

  // Already main machine?
  if (registry.mainMachineId === machineId && registry.main?.id === myName) {
    return {
      type: 'text',
      value: 'This instance is already the main. No change needed.',
    }
  }

  const { hostname } = require('os') as typeof import('os')

  const entry = {
    id: myName,
    pid: process.pid,
    machineId,
    startedAt: Date.now(),
    ip: getLocalIp(),
    mac: getMacAddress(),
    hostname: hostname(),
    pipeName: myName,
  }

  await claimMain(machineId, entry)

  // Update local state
  context.setAppState(prev => ({
    ...prev,
    pipeIpc: {
      ...getPipeIpc(prev),
      role: 'main',
      subIndex: null,
      displayRole: 'main',
      machineId,
      attachedBy: null,
    },
  }))

  const lines: string[] = []
  lines.push('Main role claimed successfully.')
  lines.push(`Machine ID: ${machineId.slice(0, 8)}...`)
  lines.push(`Pipe:       ${myName}`)
  if (registry.mainMachineId && registry.mainMachineId !== machineId) {
    lines.push(
      `Previous main machine: ${registry.mainMachineId.slice(0, 8)}...`,
    )
  }
  lines.push('')
  lines.push('All existing subs are now bound to this instance.')
  lines.push('Use /pipes to verify.')

  return { type: 'text', value: lines.join('\n') }
}
