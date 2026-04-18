/**
 * useMasterMonitor — master-side slave registry helpers plus an optional hook
 *
 * The module-level registry helpers are the live integration point used by
 * attach/send/status flows. The hook remains available for history syncing if
 * a caller wants AppState to mirror slave session events.
 *
 * The master CLI itself remains fully functional — this hook only collects
 * data from slaves for review via /history and /status commands.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { useAppState, useSetAppState } from '../state/AppState.js'
import {
  getPipeIpc,
  type PipeClient,
  type PipeMessage,
  type PipeIpcSlaveState,
} from '../utils/pipeTransport.js'
import { logForDebugging } from '../utils/debug.js'
import {
  isMasterPipeMuted,
  hasSendOverride,
  removeSendOverride,
} from '../utils/pipeMuteState.js'

/** Session history entry for pipe IPC monitoring. */
export type SessionEntry = {
  type: string
  content: string
  from: string
  timestamp: string
  meta?: Record<string, unknown>
}

function summarizePipeEntry(entry: SessionEntry): string | undefined {
  const content = entry.content.trim()
  switch (entry.type) {
    case 'prompt':
      return content ? `Queued: ${content}` : 'Queued prompt'
    case 'prompt_ack':
      return content || 'Accepted'
    case 'stream':
      return content || undefined
    case 'tool_start':
      return content ? `Tool: ${content}` : 'Tool started'
    case 'tool_result':
      return content ? `Tool result: ${content}` : 'Tool completed'
    case 'done':
      return content || 'Completed'
    case 'error':
      return content || 'Error'
    default:
      return content || undefined
  }
}

function statusForPipeEntry(
  currentStatus: PipeIpcSlaveState['status'],
  entryType: SessionEntry['type'],
): PipeIpcSlaveState['status'] {
  switch (entryType) {
    case 'prompt':
    case 'prompt_ack':
    case 'stream':
    case 'tool_start':
    case 'tool_result':
      return 'busy'
    case 'done':
      return 'idle'
    case 'error':
      return 'error'
    default:
      return currentStatus
  }
}

export function applyPipeEntryToSlaveState(
  slave: PipeIpcSlaveState,
  entry: SessionEntry,
): PipeIpcSlaveState {
  return {
    ...slave,
    status: statusForPipeEntry(slave.status, entry.type),
    lastActivityAt: entry.timestamp,
    lastSummary: summarizePipeEntry(entry),
    lastEventType: entry.type as PipeIpcSlaveState['lastEventType'],
    unreadCount: (slave.unreadCount ?? 0) + 1,
    history: [...slave.history, entry],
  }
}

/**
 * Module-level registry of connected slave PipeClients.
 * Keyed by slave pipe name. Managed by /attach and /detach commands.
 */
const _slaveClients = new Map<string, PipeClient>()
const _slaveClientRegistryListeners = new Set<() => void>()
const _pipeEntryListeners = new Set<
  (slaveName: string, entry: SessionEntry) => void
>()
const _pipeEntryHandlers = new Map<string, (msg: PipeMessage) => void>()
let _slaveClientRegistryVersion = 0

const MONITORED_PIPE_ENTRY_TYPES = [
  'prompt_ack',
  'stream',
  'tool_start',
  'tool_result',
  'done',
  'error',
  'prompt',
  'permission_request',
  'permission_cancel',
]

function isMonitoredPipeEntryType(type: string): boolean {
  return MONITORED_PIPE_ENTRY_TYPES.includes(type)
}

/** Business message types that should be dropped when a slave is muted. */
const MUTED_DROPPABLE_TYPES = new Set([
  'prompt_ack',
  'stream',
  'tool_start',
  'tool_result',
  'done',
  'error',
  'permission_request',
  'permission_cancel',
])

/**
 * Centralized mute check used by both attachPipeEntryEmitter and
 * useMasterMonitor's inline handler — keeps the two gates in sync.
 */
export function shouldDropMutedMessage(
  slaveName: string,
  msgType: string,
): boolean {
  if (hasSendOverride(slaveName)) return false
  if (!isMasterPipeMuted(slaveName)) return false
  return MUTED_DROPPABLE_TYPES.has(msgType)
}

function pipeMessageToSessionEntry(
  slaveName: string,
  msg: PipeMessage,
): SessionEntry {
  return {
    type: msg.type as SessionEntry['type'],
    content: msg.data ?? '',
    from: msg.from ?? slaveName,
    timestamp: msg.ts ?? new Date().toISOString(),
    meta: msg.meta,
  }
}

function emitPipeEntry(slaveName: string, entry: SessionEntry): void {
  for (const listener of _pipeEntryListeners) {
    listener(slaveName, entry)
  }
}

export function subscribePipeEntries(
  listener: (slaveName: string, entry: SessionEntry) => void,
): () => void {
  _pipeEntryListeners.add(listener)
  return () => {
    _pipeEntryListeners.delete(listener)
  }
}

function detachPipeEntryEmitter(name: string, client?: PipeClient): void {
  const handler = _pipeEntryHandlers.get(name)
  if (!handler) return
  client?.removeListener?.('message', handler)
  _pipeEntryHandlers.delete(name)
}

function attachPipeEntryEmitter(name: string, client: PipeClient): void {
  detachPipeEntryEmitter(name, _slaveClients.get(name))
  if (typeof client.on !== 'function') return
  const handler = (msg: PipeMessage) => {
    if (!isMonitoredPipeEntryType(msg.type)) return

    // Mute gate: drop business messages from muted slaves
    if (shouldDropMutedMessage(name, msg.type)) {
      // Auto-deny permission_request to prevent slave deadlock
      if (msg.type === 'permission_request') {
        try {
          const payload = JSON.parse(msg.data ?? '{}')
          if (payload.requestId) {
            client.send({
              type: 'permission_response',
              data: JSON.stringify({
                requestId: payload.requestId,
                behavior: 'deny',
                feedback:
                  'Permission auto-denied: pipe is logically disconnected.',
              }),
            })
          }
        } catch {
          // Malformed payload — safe to ignore
        }
      }
      return
    }

    // Clear /send override when slave turn completes
    if (
      (msg.type === 'done' || msg.type === 'error') &&
      hasSendOverride(name)
    ) {
      removeSendOverride(name)
    }

    emitPipeEntry(name, pipeMessageToSessionEntry(name, msg))
  }
  _pipeEntryHandlers.set(name, handler)
  client.on('message', handler)
}

function emitSlaveClientRegistryChanged(): void {
  _slaveClientRegistryVersion += 1
  for (const listener of _slaveClientRegistryListeners) {
    listener()
  }
}

export function subscribeToSlaveClientRegistry(
  listener: () => void,
): () => void {
  _slaveClientRegistryListeners.add(listener)
  return () => {
    _slaveClientRegistryListeners.delete(listener)
  }
}

export function getSlaveClientRegistryVersion(): number {
  return _slaveClientRegistryVersion
}

export function addSlaveClient(name: string, client: PipeClient): void {
  attachPipeEntryEmitter(name, client)
  _slaveClients.set(name, client)
  emitSlaveClientRegistryChanged()
}

export function removeSlaveClient(name: string): PipeClient | undefined {
  const client = _slaveClients.get(name)
  detachPipeEntryEmitter(name, client)
  _slaveClients.delete(name)
  emitSlaveClientRegistryChanged()
  return client
}

export function getSlaveClient(name: string): PipeClient | undefined {
  return _slaveClients.get(name)
}

export function getAllSlaveClients(): Map<string, PipeClient> {
  return _slaveClients
}

export type ConnectedSlaveTarget = {
  name: string
  client: PipeClient
}

/**
 * Resolve a selection list to currently connected slave clients.
 *
 * The pipe selector can include discovered-but-not-attached names. Routing
 * should only treat attached, connected clients as broadcast targets.
 */
export function getConnectedSlaveTargets(
  selectedNames: string[],
): ConnectedSlaveTarget[] {
  const targets: ConnectedSlaveTarget[] = []
  for (const name of selectedNames) {
    const client = _slaveClients.get(name)
    if (client?.connected) {
      targets.push({ name, client })
    }
  }
  return targets
}

export function resetSlaveClientsForTesting(): void {
  for (const [name, client] of _slaveClients.entries()) {
    detachPipeEntryEmitter(name, client)
  }
  _slaveClients.clear()
  emitSlaveClientRegistryChanged()
}

export function useMasterMonitor(): void {
  const role = useAppState(s => getPipeIpc(s).role)
  const setAppState = useSetAppState()
  const registryVersion = useSyncExternalStore(
    subscribeToSlaveClientRegistry,
    getSlaveClientRegistryVersion,
    getSlaveClientRegistryVersion,
  )

  useEffect(() => {
    if (role !== 'master' && _slaveClients.size === 0) return

    // Set up listeners for each connected slave client
    const cleanups: (() => void)[] = []

    for (const [slaveName, client] of _slaveClients.entries()) {
      const handler = (msg: PipeMessage) => {
        // Only record relevant message types
        if (!isMonitoredPipeEntryType(msg.type)) {
          return
        }

        // Mute gate (second gate, same helper as attachPipeEntryEmitter)
        if (shouldDropMutedMessage(slaveName, msg.type)) {
          return
        }

        // Clear /send override when slave turn completes
        if (
          (msg.type === 'done' || msg.type === 'error') &&
          hasSendOverride(slaveName)
        ) {
          removeSendOverride(slaveName)
        }

        const entry = pipeMessageToSessionEntry(slaveName, msg)

        setAppState(prev => {
          const slave = getPipeIpc(prev).slaves[slaveName]
          if (!slave) return prev

          const newStatus =
            msg.type === 'done' || msg.type === 'error'
              ? 'idle'
              : msg.type === 'prompt'
                ? 'busy'
                : slave.status

          return {
            ...prev,
            pipeIpc: {
              ...getPipeIpc(prev),
              slaves: {
                ...getPipeIpc(prev).slaves,
                [slaveName]: applyPipeEntryToSlaveState(
                  {
                    ...slave,
                    status: newStatus,
                  },
                  entry,
                ),
              },
            },
          }
        })

        if (msg.type === 'done') {
          logForDebugging(`[MasterMonitor] Slave "${slaveName}" turn complete`)
        }
      }

      client.on('message', handler)

      // Handle slave disconnect
      const onDisconnect = () => {
        logForDebugging(`[MasterMonitor] Slave "${slaveName}" disconnected`)
        // Clear any lingering /send override before removing client
        removeSendOverride(slaveName)
        removeSlaveClient(slaveName)
        setAppState(prev => {
          const { [slaveName]: _removed, ...remainingSlaves } =
            getPipeIpc(prev).slaves
          const hasSlaves = Object.keys(remainingSlaves).length > 0
          return {
            ...prev,
            pipeIpc: {
              ...getPipeIpc(prev),
              role: hasSlaves ? 'master' : 'main',
              displayRole: hasSlaves ? 'master' : 'main',
              slaves: remainingSlaves,
            },
          }
        })
      }

      client.on('disconnect', onDisconnect)
      cleanups.push(() => {
        client.removeListener('message', handler)
        client.removeListener('disconnect', onDisconnect)
      })
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }, [registryVersion, role, setAppState])
}
