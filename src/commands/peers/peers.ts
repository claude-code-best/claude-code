import type { LocalCommandCall } from '../../types/command.js'
import { listPeers, isPeerAlive } from '../../utils/udsClient.js'
import {
  formatUdsAddress,
  getUdsMessagingSocketPath,
} from '../../utils/udsMessaging.js'

export const call: LocalCommandCall = async (_args, _context) => {
  const mySocket = getUdsMessagingSocketPath()
  const peers = await listPeers()

  const lines: string[] = []

  // Show own socket
  lines.push(`Your socket: ${mySocket ?? '(not started)'}`)
  lines.push('')

  if (peers.length === 0) {
    lines.push('No other Claude Code peers found.')
  } else {
    lines.push(`Peers (${peers.length}):`)
    lines.push('')

    for (const peer of peers) {
      const alive = peer.messagingSocketPath
        ? await isPeerAlive(peer.messagingSocketPath)
        : false
      const status = alive ? 'reachable' : 'unreachable'
      const label = peer.name ?? peer.kind ?? 'interactive'
      const cwd = peer.cwd ? `  cwd: ${peer.cwd}` : ''
      const age = peer.startedAt
        ? `  started: ${formatAge(peer.startedAt)}`
        : ''

      lines.push(`  [${status}] PID ${peer.pid} (${label})${cwd}${age}`)
      if (peer.messagingSocketPath) {
        lines.push(
          `           socket: ${formatUdsAddress(peer.messagingSocketPath)}`,
        )
      }
      if (peer.sessionId) {
        lines.push(`           session: ${peer.sessionId}`)
      }
    }
  }

  lines.push('')
  lines.push(
    'To message a peer: use SendMessage with the shown uds:<socket-path> address',
  )

  return { type: 'text', value: lines.join('\n') }
}

function formatAge(startedAt: number): string {
  const elapsed = Date.now() - startedAt
  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m ago`
}
