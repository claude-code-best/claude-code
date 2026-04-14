/**
 * usePipeRouter — Route user input to selected pipe targets.
 *
 * Returns `routeToSelectedPipes(input)` which checks selectedPipes +
 * routeMode and sends the prompt to all connected slave targets.
 * Returns true if routed (caller should skip local execution).
 */
import { feature } from 'bun:bundle'
import { useCallback } from 'react'

type StoreApi = { getState: () => any }
type SetAppState = (updater: (prev: any) => any) => void
type AddNotification = (opts: {
  key: string
  text: string
  color: string
  priority: string
  timeoutMs: number
}) => void

type Deps = {
  store: StoreApi
  setAppState: SetAppState
  addNotification: AddNotification
}

/**
 * Attempt to route user input to selected pipes.
 * Returns true if routed to at least one pipe (skip local execution).
 */
export function usePipeRouter({ store, setAppState, addNotification }: Deps): {
  routeToSelectedPipes: (input: string) => boolean
} {
  const routeToSelectedPipes = useCallback(
    (input: string): boolean => {
      if (!feature('UDS_INBOX')) return false
      if (!input.trim() || input.trim().startsWith('/')) return false

      /* eslint-disable @typescript-eslint/no-require-imports */
      const pipeState = (store.getState() as any).pipeIpc
      const selectedPipes: string[] = pipeState?.selectedPipes ?? []
      const routeMode: 'selected' | 'local' = pipeState?.routeMode ?? 'selected'

      if (selectedPipes.length === 0 || routeMode === 'local') return false

      const { getConnectedSlaveTargets } =
        require('./useMasterMonitor.js') as typeof import('./useMasterMonitor.js')
      const { getPipeIpc } =
        require('../utils/pipeTransport.js') as typeof import('../utils/pipeTransport.js')
      /* eslint-enable @typescript-eslint/no-require-imports */

      const targets = getConnectedSlaveTargets(selectedPipes)
      const pipeIpcForDisplay = getPipeIpc(store.getState())
      const discovered: Array<{
        pipeName: string
        role: string
        ip: string
        hostname: string
      }> = pipeIpcForDisplay.discoveredPipes ?? []

      const sentTargetNames: string[] = []
      const sentTargetLabels: string[] = []
      const failedTargetNames: string[] = []

      for (const { name, client } of targets) {
        try {
          client.send({ type: 'prompt', data: input.trim() })
          sentTargetNames.push(name)
          // Build display label: [role] hostname/ip for LAN, [role] for local
          const info = discovered.find((d: any) => d.pipeName === name)
          if (info) {
            const isLan = info.ip && info.ip !== pipeIpcForDisplay.localIp
            sentTargetLabels.push(
              isLan
                ? `[${info.role}] ${info.hostname}/${info.ip}`
                : `[${info.role}]`,
            )
          } else {
            sentTargetLabels.push(name)
          }
        } catch {
          failedTargetNames.push(name)
        }
      }

      if (sentTargetNames.length > 0) {
        const promptText = input.trim()
        const promptTimestamp = new Date().toISOString()
        setAppState((prev: any) => {
          const pipeIpc = getPipeIpc(prev)
          const nextSlaves = { ...pipeIpc.slaves }
          for (const name of sentTargetNames) {
            const slave = nextSlaves[name]
            if (!slave) continue
            nextSlaves[name] = {
              ...slave,
              status: 'busy',
              lastActivityAt: promptTimestamp,
              lastSummary: `Queued: ${promptText}`,
              lastEventType: 'prompt',
              history: [
                ...slave.history,
                {
                  type: 'prompt',
                  content: promptText,
                  from: pipeIpc.serverName ?? 'master',
                  timestamp: promptTimestamp,
                },
              ],
            }
          }
          return {
            ...prev,
            pipeIpc: { ...pipeIpc, slaves: nextSlaves },
          }
        })

        addNotification({
          key: 'pipe-route-success',
          text: `Routed to ${sentTargetLabels.join(', ')}; main can continue other tasks`,
          color: 'success',
          priority: 'immediate',
          timeoutMs: 3000,
        })
      } else {
        addNotification({
          key: 'pipe-route-fallback',
          text: 'Selected pipes are unavailable; processing locally.',
          color: 'warning',
          priority: 'immediate',
          timeoutMs: 4000,
        })
      }

      if (failedTargetNames.length > 0) {
        addNotification({
          key: 'pipe-route-partial-failure',
          text: `Failed to send to: ${failedTargetNames.join(', ')}`,
          color: 'warning',
          priority: 'immediate',
          timeoutMs: 4000,
        })
      }

      return sentTargetNames.length > 0
    },
    [store, setAppState, addNotification],
  )

  return { routeToSelectedPipes }
}
