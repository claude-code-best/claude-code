/**
 * usePipeIpc — Pipe IPC lifecycle hook.
 *
 * Extracted from REPL.tsx's 575-line inline useEffect. Manages:
 * 1. Server creation (UDS + optional TCP for LAN)
 * 2. LAN beacon startup
 * 3. Message handlers (ping, attach, prompt, permission, detach)
 * 4. Heartbeat loop (main: auto-attach + cleanup; sub: detect main alive)
 * 5. Cleanup on unmount
 *
 * Feature-gated by UDS_INBOX. LAN extensions gated by LAN_PIPES.
 */
import { feature } from 'bun:bundle'
import { useEffect } from 'react'
import * as pt from '../utils/pipeTransport.js'
import * as pr from '../utils/pipeRegistry.js'
import * as mm from './useMasterMonitor.js'
import { getSessionId as _getSessionId } from '../bootstrap/state.js'
import * as lb from '../utils/lanBeacon.js'
import * as pp from '../utils/pipePermissionRelay.js'
import * as osm from 'os'
import type {
  PipeMessage,
  PipeServer,
  PipeIpcState,
} from '../utils/pipeTransport.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StoreApi = {
  getState: () => any
  setState: (updater: (prev: any) => any) => void
}

export type UsePipeIpcOptions = {
  store: StoreApi
  handleIncomingPrompt: (content: string) => boolean
}

// ---------------------------------------------------------------------------
// Helper: remove a dead slave from registry + state
// ---------------------------------------------------------------------------

function removeDeadSlave(slaveName: string, store: StoreApi): void {
  mm.removeSlaveClient(slaveName)
  store.setState((prev: any) => {
    const pipeIpc = pt.getPipeIpc(prev)
    const { [slaveName]: _removed, ...remainingSlaves } = pipeIpc.slaves
    return {
      ...prev,
      pipeIpc: {
        ...pipeIpc,
        role: Object.keys(remainingSlaves).length > 0 ? 'master' : 'main',
        displayRole:
          Object.keys(remainingSlaves).length > 0 ? 'master' : 'main',
        slaves: remainingSlaves,
        selectedPipes: (pipeIpc.selectedPipes ?? []).filter(
          (name: string) => name !== slaveName,
        ),
        discoveredPipes: (pipeIpc.discoveredPipes ?? []).filter(
          (pipe: { pipeName: string }) => pipe.pipeName !== slaveName,
        ),
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Helper: refresh discovered pipes (local subs + LAN peers)
// ---------------------------------------------------------------------------

function refreshDiscoveredPipes(
  pipeName: string,
  aliveSubs: Array<{
    id: string
    pipeName: string
    subIndex: number
    machineId: string
    ip: string
    hostname: string
  }>,
  store: StoreApi,
): void {
  const freshDiscovered = aliveSubs
    .filter(sub => sub.pipeName !== pipeName)
    .map(sub => ({
      id: sub.id,
      pipeName: sub.pipeName,
      role: `sub-${sub.subIndex}`,
      machineId: sub.machineId,
      ip: sub.ip,
      hostname: sub.hostname,
      alive: true,
    }))

  // Include LAN beacon peers so they aren't wiped out by heartbeat
  let lanDiscovered: typeof freshDiscovered = []
  if (feature('LAN_PIPES')) {
    const beacon = lb.getLanBeacon()
    if (beacon) {
      const localNames = new Set(freshDiscovered.map(p => p.pipeName))
      localNames.add(pipeName)
      for (const [pName, peer] of beacon.getPeers()) {
        if (!localNames.has(pName)) {
          lanDiscovered.push({
            id: `lan-${pName}`,
            pipeName: pName,
            role: peer.role,
            machineId: peer.machineId,
            ip: peer.ip,
            hostname: peer.hostname,
            alive: true,
          })
        }
      }
    }
  }

  const allDiscovered = [...freshDiscovered, ...lanDiscovered]

  // Only update state if the list actually changed
  const prev = pt.getPipeIpc(store.getState())
  const prevNames = (prev.discoveredPipes ?? [])
    .map((p: any) => p.pipeName)
    .join(',')
  const newNames = allDiscovered.map(p => p.pipeName).join(',')
  if (prevNames === newNames) return

  store.setState((prev: any) => {
    const pipeIpc = pt.getPipeIpc(prev)
    const aliveNames = new Set(allDiscovered.map(pipe => pipe.pipeName))
    return {
      ...prev,
      pipeIpc: {
        ...pipeIpc,
        discoveredPipes: allDiscovered,
        selectedPipes: (pipeIpc.selectedPipes ?? []).filter((name: string) =>
          aliveNames.has(name),
        ),
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Phase: Register message handlers on server
// ---------------------------------------------------------------------------

function registerMessageHandlers(
  server: PipeServer,
  pipeName: string,
  machineId: string,
  store: StoreApi,
  handleIncomingPrompt: (content: string) => boolean,
): void {
  // Auto-reply pings for health checks
  server.onMessage((msg: PipeMessage, reply) => {
    if (msg.type === 'ping') reply({ type: 'pong' })
  })

  // Handle attach requests
  server.onMessage((msg: PipeMessage, reply) => {
    if (msg.type !== 'attach_request') return
    const state = store.getState()
    const currentPipeState = pt.getPipeIpc(state)
    if (pt.isPipeControlled(currentPipeState)) {
      reply({ type: 'attach_reject', data: 'Already controlled' })
      return
    }
    // Allow LAN peers (different machineId) to attach regardless of role.
    const isLanPeer = msg.meta?.machineId && msg.meta.machineId !== machineId
    if (!isLanPeer && currentPipeState.role !== 'sub') {
      reply({
        type: 'attach_reject',
        data: 'Only sub sessions can be attached.',
      })
      return
    }
    reply({ type: 'attach_accept' })

    const clients = Array.from((server as any).clients as Set<any>)
    const masterSocket = clients[clients.length - 1]
    pp.setPipeRelay((relayMsg: any) => {
      if (masterSocket && !masterSocket.destroyed) {
        relayMsg.from = relayMsg.from ?? pipeName
        relayMsg.ts = relayMsg.ts ?? new Date().toISOString()
        masterSocket.write(JSON.stringify(relayMsg) + '\n')
      }
    })

    store.setState((prev: any) => ({
      ...prev,
      pipeIpc: {
        ...pt.getPipeIpc(prev),
        role: 'sub',
        displayRole: pt.getPipeDisplayRole(pt.getPipeIpc(prev)),
        attachedBy: msg.from ?? 'unknown',
      },
    }))
  })

  // Handle prompts from master
  server.onMessage((msg: PipeMessage, reply) => {
    if (msg.type === 'prompt' && msg.data) {
      const accepted = handleIncomingPrompt(msg.data)
      if (accepted) {
        reply({ type: 'prompt_ack', data: 'accepted' })
      } else {
        reply({
          type: 'error',
          data: 'Slave is busy and could not accept the prompt.',
        })
      }
    }
  })

  // Handle permission decisions from master
  server.onMessage((msg: PipeMessage, _reply) => {
    if (msg.type !== 'permission_response' && msg.type !== 'permission_cancel')
      return
    const { resolvePipePermissionResponse, cancelPipePermissionRequest } = pp

    try {
      const payload = msg.data ? JSON.parse(msg.data) : undefined
      if (!payload?.requestId) return
      if (msg.type === 'permission_response') {
        resolvePipePermissionResponse(payload)
      } else {
        cancelPipePermissionRequest(payload.requestId, payload.reason)
      }
    } catch {
      // Malformed — ignore
    }
  })

  // Handle relay mute/unmute from master
  server.onMessage((msg: PipeMessage, _reply) => {
    if (msg.type === 'relay_mute') {
      pp.setRelayMuted(true)
    } else if (msg.type === 'relay_unmute') {
      pp.setRelayMuted(false)
    }
  })

  // Handle detach
  server.onMessage((msg: PipeMessage, _reply) => {
    if (msg.type !== 'detach') return
    const { clearPendingPipePermissions } = pp
    clearPendingPipePermissions('Pipe detached before permission was resolved.')
    pp.setPipeRelay(null)
    store.setState((prev: any) => ({
      ...prev,
      pipeIpc: (() => {
        const pipeIpc = pt.getPipeIpc(prev)
        const nextRole = pipeIpc.subIndex != null ? 'sub' : 'main'
        const nextPipeState = { ...pipeIpc, role: nextRole, attachedBy: null }
        return {
          ...nextPipeState,
          displayRole: pt.getPipeDisplayRole(nextPipeState as PipeIpcState),
        }
      })(),
    }))
  })
}

// ---------------------------------------------------------------------------
// Phase: Heartbeat
// ---------------------------------------------------------------------------

function runMainHeartbeat(
  pipeName: string,
  machineId: string,
  store: StoreApi,
  disposed: { current: boolean },
): void {
  void (async () => {
    try {
      await pr.cleanupStaleEntries()
      const aliveSubs = await pr.getAliveSubs()
      refreshDiscoveredPipes(pipeName, aliveSubs, store)

      const connectedSlaves = mm.getAllSlaveClients()
      const aliveSubNames = new Set(aliveSubs.map(sub => sub.pipeName))

      // Build unified attach target list: local subs + LAN peers
      type AttachTarget = {
        pipeName: string
        tcpEndpoint?: { host: string; port: number }
      }
      const attachTargets: AttachTarget[] = aliveSubs.map(sub => ({
        pipeName: sub.pipeName,
      }))

      // Add LAN peers as attach targets
      if (feature('LAN_PIPES')) {
        const beacon = lb.getLanBeacon()
        if (beacon) {
          const localNames = new Set(attachTargets.map(t => t.pipeName))
          localNames.add(pipeName)
          for (const [pName, peer] of beacon.getPeers()) {
            if (!localNames.has(pName)) {
              attachTargets.push({
                pipeName: pName,
                tcpEndpoint: { host: peer.ip, port: peer.tcpPort },
              })
              aliveSubNames.add(pName)
            }
          }
        }
      }

      const currentPipeState = pt.getPipeIpc(store.getState())

      for (const target of attachTargets) {
        if (target.pipeName === pipeName) continue
        if (connectedSlaves.has(target.pipeName)) continue

        try {
          const myName = currentPipeState.serverName ?? pipeName
          const client = await pt.connectToPipe(
            target.pipeName,
            myName,
            3000,
            target.tcpEndpoint,
          )

          const attached = await new Promise<boolean>(resolve => {
            const timeout = setTimeout(() => {
              client.disconnect()
              resolve(false)
            }, 3000)

            client.onMessage((msg: any) => {
              if (msg.type === 'attach_accept') {
                clearTimeout(timeout)
                resolve(true)
              } else if (msg.type === 'attach_reject') {
                clearTimeout(timeout)
                client.disconnect()
                resolve(false)
              }
            })

            client.send({
              type: 'attach_request',
              meta: { machineId },
            })
          })

          if (attached && !disposed.current) {
            mm.addSlaveClient(target.pipeName, client)

            client.on('disconnect', () => {
              removeDeadSlave(target.pipeName, store)
            })

            store.setState((prev: any) => ({
              ...prev,
              pipeIpc: {
                ...pt.getPipeIpc(prev),
                role: 'master',
                displayRole: 'master',
                slaves: {
                  ...pt.getPipeIpc(prev).slaves,
                  [target.pipeName]: {
                    name: target.pipeName,
                    connectedAt: new Date().toISOString(),
                    status: 'idle',
                    unreadCount: 0,
                    history: [],
                  },
                },
              },
            }))
          }
        } catch {
          // Connection failed — skip this cycle
        }
      }

      // Clean up slaves that are no longer alive
      let lanPeerNames: Set<string> | null = null
      if (feature('LAN_PIPES')) {
        const beacon = lb.getLanBeacon()
        if (beacon) {
          lanPeerNames = new Set(beacon.getPeers().keys())
        }
      }
      for (const [slaveName, client] of connectedSlaves.entries()) {
        const inLocalRegistry = aliveSubNames.has(slaveName)
        const inLanBeacon = lanPeerNames?.has(slaveName) ?? false
        if (!client.connected || (!inLocalRegistry && !inLanBeacon)) {
          removeDeadSlave(slaveName, store)
        }
      }
    } catch {
      // Heartbeat cycle error — non-fatal
    }
  })()
}

function runSubHeartbeat(
  pipeName: string,
  machineId: string,
  entry: any,
  store: StoreApi,
  disposed: { current: boolean },
): void {
  void (async () => {
    try {
      const mainAlive = await pr.isMainAlive()
      if (!mainAlive && !disposed.current) {
        const registry = await pr.readRegistry()
        const isSameMachine = pr.isMainMachine(machineId, registry)

        if (isSameMachine) {
          await pr.registerAsMain(entry)
        } else {
          await pr.revertToIndependent(pipeName)
        }

        store.setState((prev: any) => ({
          ...prev,
          pipeIpc: {
            ...pt.getPipeIpc(prev),
            role: 'main',
            subIndex: null,
            displayRole: 'main',
            attachedBy: null,
          },
        }))
        pp.setPipeRelay(null)
      }
    } catch {
      // Heartbeat check error — non-fatal
    }
  })()
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export function usePipeIpc({
  store,
  handleIncomingPrompt,
}: UsePipeIpcOptions): void {
  if (!feature('UDS_INBOX')) return

  useEffect(() => {
    const sessionId = _getSessionId()
    if (!sessionId) return
    const pipeName = `cli-${sessionId.slice(0, 8)}`
    const disposed = { current: false }
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let heartbeatBusy = false
    let pipeServer: PipeServer | null = null

    void (async () => {
      try {
        // --- Phase 1: Role determination ---
        const machId = await pr.getMachineId()
        const mac = pr.getMacAddress()
        const localIp = pt.getLocalIp()
        const host = osm.hostname()
        const roleResult = await pr.determineRole(machId)

        const entry = {
          id: pipeName,
          pid: process.pid,
          machineId: machId,
          startedAt: Date.now(),
          ip: localIp,
          mac,
          hostname: host,
          pipeName,
        }

        let initialRole: 'main' | 'sub' = 'main'
        let subIndex: number | null = null
        let displayRole = 'main'

        if (roleResult.role === 'main' || roleResult.role === 'main-recover') {
          await pr.registerAsMain(entry)
        } else {
          subIndex = roleResult.subIndex
          await pr.registerAsSub(entry, subIndex)
          initialRole = 'sub'
          displayRole = `sub-${subIndex}`
        }

        // --- Phase 2: Server creation ---
        const server = await pt.createPipeServer(
          pipeName,
          feature('LAN_PIPES') ? { enableTcp: true, tcpPort: 0 } : undefined,
        )
        pipeServer = server
        if (disposed.current) {
          await server.close()
          await pr.unregister(pipeName)
          return
        }

        // --- Phase 3: LAN beacon ---
        if (feature('LAN_PIPES') && server.tcpAddress) {
          const beacon = new (lb.LanBeacon)({
            pipeName,
            machineId: machId,
            hostname: host,
            ip: localIp,
            tcpPort: server.tcpAddress.port,
            role: initialRole,
          })
          beacon.start()
          lb.setLanBeacon(beacon)

          const entryWithTcp = {
            ...entry,
            tcpPort: server.tcpAddress.port,
            lanVisible: true,
          }
          if (initialRole === 'main') {
            await pr.registerAsMain(entryWithTcp)
          } else if (subIndex != null) {
            await pr.registerAsSub(entryWithTcp, subIndex)
          }
        }

        // Update store
        store.setState((prev: any) => ({
          ...prev,
          pipeIpc: {
            ...pt.getPipeIpc(prev),
            serverName: pipeName,
            role: initialRole,
            subIndex,
            displayRole,
            localIp,
            hostname: host,
            machineId: machId,
            mac,
          },
        }))

        // --- Phase 4: Message handlers ---
        registerMessageHandlers(
          server,
          pipeName,
          machId,
          store,
          handleIncomingPrompt,
        )

        // --- Phase 5: Heartbeat ---
        const HEARTBEAT_INTERVAL_MS = 5000

        heartbeatTimer = setInterval(() => {
          if (disposed.current || heartbeatBusy) return
          heartbeatBusy = true

          const currentPipeState = pt.getPipeIpc(store.getState())

          if (
            currentPipeState.role === 'main' ||
            currentPipeState.role === 'master'
          ) {
            runMainHeartbeat(pipeName, machId, store, disposed)
          } else if (currentPipeState.role === 'sub') {
            runSubHeartbeat(pipeName, machId, entry, store, disposed)
          }

          // Reset busy flag after a short delay to allow the async work to settle
          setTimeout(() => {
            heartbeatBusy = false
          }, 4000)
        }, HEARTBEAT_INTERVAL_MS)
      } catch {
        // PipeServer creation failed — non-fatal
      }
    })()

    // --- Phase 6: Cleanup ---
    return () => {
      disposed.current = true
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }

      // Send detach to all slaves
      const allClients = mm.getAllSlaveClients()
      for (const [name, client] of allClients.entries()) {
        try {
          client.send({ type: 'detach' })
        } catch {}
        client.disconnect()
        removeDeadSlave(name, store)
      }

      // Stop LAN beacon
      const beacon = lb.getLanBeacon()
      if (beacon) {
        try {
          beacon.stop()
        } catch {}
        lb.setLanBeacon(null)
      }

      // Unregister + close server
      pr.unregister(pipeName).catch(() => {})
      if (pipeServer) {
        void pipeServer.close().catch(() => {})
        pipeServer = null
      }
      pp.setPipeRelay(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
