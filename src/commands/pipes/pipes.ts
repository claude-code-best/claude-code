import { feature } from 'bun:bundle'
import type { LocalCommandCall } from '../../types/command.js'
import {
  isPipeAlive,
  getPipeIpc,
  getPipeDisplayRole,
  isPipeControlled,
} from '../../utils/pipeTransport.js'
import {
  cleanupStaleEntries,
  readRegistry,
  isMainMachine,
  mergeWithLanPeers,
} from '../../utils/pipeRegistry.js'

export const call: LocalCommandCall = async (_args, context) => {
  const args = _args.trim()

  // Enable status line + toggle selector open
  context.setAppState(prev => {
    const pipeIpc = getPipeIpc(prev)
    return {
      ...prev,
      pipeIpc: {
        ...pipeIpc,
        statusVisible: true,
        selectorOpen: !pipeIpc.selectorOpen,
      },
    }
  })

  // Handle select/deselect subcommands
  if (args.startsWith('select ') || args.startsWith('sel ')) {
    const pipeName = args.replace(/^(select|sel)\s+/, '').trim()
    if (!pipeName)
      return { type: 'text', value: 'Usage: /pipes select <pipe-name>' }
    context.setAppState(prev => {
      const pipeIpc = getPipeIpc(prev)
      const selected = pipeIpc.selectedPipes ?? []
      if (selected.includes(pipeName)) return prev
      return {
        ...prev,
        pipeIpc: { ...pipeIpc, selectedPipes: [...selected, pipeName] },
      }
    })
    return {
      type: 'text',
      value: `Selected ${pipeName} — messages will be broadcast to this pipe.`,
    }
  }

  if (
    args.startsWith('deselect ') ||
    args.startsWith('desel ') ||
    args.startsWith('unsel ')
  ) {
    const pipeName = args.replace(/^(deselect|desel|unsel)\s+/, '').trim()
    if (!pipeName)
      return { type: 'text', value: 'Usage: /pipes deselect <pipe-name>' }
    context.setAppState(prev => {
      const pipeIpc = getPipeIpc(prev)
      const selected = (pipeIpc.selectedPipes ?? []).filter(
        (n: string) => n !== pipeName,
      )
      return { ...prev, pipeIpc: { ...pipeIpc, selectedPipes: selected } }
    })
    return { type: 'text', value: `Deselected ${pipeName}.` }
  }

  if (args === 'select-all' || args === 'all') {
    const currentState = context.getAppState()
    const pipeState = getPipeIpc(currentState)
    const slaveNames = Object.keys(pipeState.slaves)
    context.setAppState(prev => ({
      ...prev,
      pipeIpc: { ...getPipeIpc(prev), selectedPipes: slaveNames },
    }))
    return {
      type: 'text',
      value: `Selected all ${slaveNames.length} connected pipes.`,
    }
  }

  if (args === 'deselect-all' || args === 'none') {
    context.setAppState(prev => ({
      ...prev,
      pipeIpc: { ...getPipeIpc(prev), selectedPipes: [] },
    }))
    return {
      type: 'text',
      value: 'Deselected all pipes. Messages will only run locally.',
    }
  }

  const currentState = context.getAppState()
  const pipeState = getPipeIpc(currentState)
  const myName = pipeState.serverName
  const displayRole = getPipeDisplayRole(pipeState)
  const selected: string[] = pipeState.selectedPipes ?? []

  await cleanupStaleEntries()
  const registry = await readRegistry()

  const lines: string[] = []

  lines.push(`Your pipe:   ${myName ?? '(not started)'}`)
  lines.push(`Role:        ${displayRole}`)
  if (pipeState.machineId)
    lines.push(`Machine ID:  ${pipeState.machineId.slice(0, 8)}...`)
  if (pipeState.localIp) lines.push(`IP:          ${pipeState.localIp}`)
  if (pipeState.hostname) lines.push(`Host:        ${pipeState.hostname}`)

  if (isPipeControlled(pipeState)) {
    lines.push(`Controlled by: ${pipeState.attachedBy}`)
  }

  lines.push('')

  if (registry.mainMachineId) {
    const isMyMachine = isMainMachine(pipeState.machineId ?? '', registry)
    lines.push(
      `Main machine: ${registry.mainMachineId.slice(0, 8)}...${isMyMachine ? ' (this machine)' : ''}`,
    )
  }

  // Show main from registry
  if (registry.main) {
    const m = registry.main
    const alive = await isPipeAlive(m.pipeName, 1000)
    const isSelf = m.pipeName === myName
    lines.push(
      `  [main] ${m.pipeName}  ${m.hostname}/${m.ip}  [${alive ? 'alive' : 'stale'}]${isSelf ? ' (you)' : ''}`,
    )
  }

  // Show subs from registry with selection status
  const discoveredPipes: Array<{
    id: string
    pipeName: string
    role: string
    machineId: string
    ip: string
    hostname: string
    alive: boolean
  }> = []

  for (const sub of registry.subs) {
    const alive = await isPipeAlive(sub.pipeName, 1000)
    const isSelf = sub.pipeName === myName
    const isSelected = selected.includes(sub.pipeName)
    const checkbox = isSelected ? '☑' : '☐'
    const isAttached = pipeState.slaves[sub.pipeName] ? ' [connected]' : ''
    lines.push(
      `  ${checkbox} [sub-${sub.subIndex}] ${sub.pipeName}  ${sub.hostname}/${sub.ip}  [${alive ? 'alive' : 'stale'}]${isAttached}${isSelf ? ' (you)' : ''}`,
    )
    if (alive) {
      discoveredPipes.push({
        id: sub.id,
        pipeName: sub.pipeName,
        role: `sub-${sub.subIndex}`,
        machineId: sub.machineId,
        ip: sub.ip,
        hostname: sub.hostname,
        alive,
      })
    }
  }

  if (!registry.main && registry.subs.length === 0) {
    lines.push('No other pipes in registry.')
  }

  // Show LAN peers (if LAN_PIPES enabled)
  if (feature('LAN_PIPES')) {
    const { getLanBeacon } =
      require('../../utils/lanBeacon.js') as typeof import('../../utils/lanBeacon.js')
    const lanBeaconRef = getLanBeacon()
    if (lanBeaconRef) {
      const lanPeers = lanBeaconRef.getPeers()
      const merged = mergeWithLanPeers(registry, lanPeers)
      const lanOnly = merged.filter(e => e.source === 'lan')
      if (lanOnly.length > 0) {
        lines.push('')
        lines.push('LAN Peers:')
        for (const peer of lanOnly) {
          const isSelected = selected.includes(peer.pipeName)
          const checkbox = isSelected ? '☑' : '☐'
          const ep = peer.tcpEndpoint
            ? `tcp:${peer.tcpEndpoint.host}:${peer.tcpEndpoint.port}`
            : ''
          lines.push(
            `  ${checkbox} [${peer.role}] ${peer.pipeName}  ${peer.hostname}/${peer.ip}  ${ep}  [LAN]`,
          )
          discoveredPipes.push({
            id: peer.id,
            pipeName: peer.pipeName,
            role: peer.role,
            machineId: peer.machineId,
            ip: peer.ip,
            hostname: peer.hostname,
            alive: true,
          })
        }
      } else {
        lines.push('')
        lines.push('LAN Peers: (none discovered)')
      }
    }
  }

  // Update state
  context.setAppState(prev => ({
    ...prev,
    pipeIpc: { ...getPipeIpc(prev), discoveredPipes },
  }))

  lines.push('')
  lines.push(
    `Selected: ${selected.length > 0 ? selected.join(', ') : '(none — messages run locally only)'}`,
  )
  lines.push('')
  lines.push('Commands:')
  lines.push('  /pipes select <name>    — select pipe for broadcast')
  lines.push('  /pipes deselect <name>  — deselect pipe')
  lines.push('  /pipes all              — select all connected')
  lines.push('  /pipes none             — deselect all')
  lines.push('  /send <name> <msg>      — send to specific pipe')
  lines.push('  /claim-main             — claim this machine as main')

  return { type: 'text', value: lines.join('\n') }
}
