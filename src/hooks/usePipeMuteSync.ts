/**
 * usePipeMuteSync — Sync master's UI selection state to slave relay mute flags.
 *
 * Watches routeMode, selectedPipes, slave client registry, and send-override
 * changes. When a slave is deselected or routeMode switches to 'local', sends
 * relay_mute. When re-selected, sends relay_unmute. Also maintains the
 * master-side muted set for in-flight message filtering.
 *
 * Feature-gated by UDS_INBOX (conditional import in REPL.tsx).
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useAppState } from '../state/AppState.js'
import { getPipeIpc } from '../utils/pipeTransport.js'
import {
  setMasterMutedPipes,
  clearMasterMutedPipes,
  hasSendOverride,
  clearSendOverrides,
  subscribeSendOverride,
  getSendOverrideVersion,
} from '../utils/pipeMuteState.js'
import {
  getAllSlaveClients,
  subscribeToSlaveClientRegistry,
  getSlaveClientRegistryVersion,
} from './useMasterMonitor.js'

type UsePipeMuteSyncDeps = {
  setToolUseConfirmQueue: (action: React.SetStateAction<Record<string, unknown>[]>) => void
}

export function usePipeMuteSync({
  setToolUseConfirmQueue,
}: UsePipeMuteSyncDeps): void {
  // Subscribe to individual scalars to avoid object-selector re-render churn
  // (AppState.tsx warns against object-returning selectors)
  const routeMode = useAppState(
    s => (getPipeIpc(s).routeMode as 'selected' | 'local') ?? 'selected',
  )
  const selectedPipes: string[] = useAppState(
    s => (getPipeIpc(s).selectedPipes as string[]) ?? [],
  )

  // Subscribe to slave client registry changes
  const registryVersion = useSyncExternalStore(
    subscribeToSlaveClientRegistry,
    getSlaveClientRegistryVersion,
    getSlaveClientRegistryVersion,
  )

  // Subscribe to send-override changes so mute recalculates after /send completes
  const sendOverrideVersion = useSyncExternalStore(
    subscribeSendOverride,
    getSendOverrideVersion,
    getSendOverrideVersion,
  )

  const prevMutedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const slaves = getAllSlaveClients()

    // Compute which slaves should be muted now
    const nextMuted = new Set<string>()
    if (routeMode === 'local') {
      // All connected slaves muted
      for (const name of slaves.keys()) {
        if (!hasSendOverride(name)) {
          nextMuted.add(name)
        }
      }
    } else {
      // routeMode === 'selected': mute slaves NOT in selectedPipes
      const selectedSet = new Set(selectedPipes)
      for (const name of slaves.keys()) {
        if (!selectedSet.has(name) && !hasSendOverride(name)) {
          nextMuted.add(name)
        }
      }
    }

    // Step 1: Update master-side muted set FIRST (before sending control packets)
    setMasterMutedPipes(nextMuted)

    const prevMuted = prevMutedRef.current

    // Step 2: For newly muted slaves — abort pending permissions, then send relay_mute
    for (const name of nextMuted) {
      if (!prevMuted.has(name)) {
        // Abort pending permission prompts for this slave
        setToolUseConfirmQueue((queue: Record<string, unknown>[]) => {
          const toAbort = queue.filter(
            (item: Record<string, unknown>) => item.pipeName === name,
          )
          for (const item of toAbort) {
            try {
              ;(item.onAbort as (() => void) | undefined)?.()
            } catch {
              // onAbort may throw if client disconnected — safe to ignore
            }
          }
          return queue.filter((item: Record<string, unknown>) => item.pipeName !== name)
        })

        // Send relay_mute to slave
        const client = slaves.get(name)
        if (client?.connected) {
          try {
            client.send({ type: 'relay_mute' })
          } catch {
            // send may fail if socket is closing — non-fatal
          }
        }
      }
    }

    // Step 3: For newly unmuted slaves — send relay_unmute
    for (const name of prevMuted) {
      if (!nextMuted.has(name)) {
        const client = slaves.get(name)
        if (client?.connected) {
          try {
            client.send({ type: 'relay_unmute' })
          } catch {
            // non-fatal
          }
        }
      }
    }

    prevMutedRef.current = nextMuted
  }, [routeMode, selectedPipes, registryVersion, sendOverrideVersion, setToolUseConfirmQueue])

  // Cleanup on unmount: clear all master-side mute state
  useEffect(() => {
    return () => {
      clearMasterMutedPipes()
      clearSendOverrides()
    }
  }, [])
}
