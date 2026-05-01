import { feature } from 'bun:bundle'
import { useEffect, useRef } from 'react'
import { useNotifications } from 'src/context/notifications.js'
import { toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { getIsRemoteMode } from '../../bootstrap/state.js'
import {
  useAppState,
  useAppStateStore,
  useSetAppState,
} from '../../state/AppState.js'
import type { ToolPermissionContext } from '../../Tool.js'
import { verifyAutoModeGateAccess } from './permissionSetup.js'

/**
 * No-op — bypass permissions is always available.
 */
export async function checkAndDisableBypassPermissionsIfNeeded(
  _toolPermissionContext: ToolPermissionContext,
  _setAppState: (
    f: (
      prev: import('../../state/AppState.js').AppState,
    ) => import('../../state/AppState.js').AppState,
  ) => void,
): Promise<void> {
  // Bypass permissions is always available — no gate check needed
}

/**
 * Reset stub — kept for interface compatibility.
 */
export function resetBypassPermissionsCheck(): void {
  // No-op
}

/**
 * No-op hook — bypass permissions is always available.
 */
export function useKickOffCheckAndDisableBypassPermissionsIfNeeded(): void {
  // No-op
}

let autoModeCheckRan = false

export async function checkAndDisableAutoModeIfNeeded(
  toolPermissionContext: ToolPermissionContext,
  setAppState: (
    f: (
      prev: import('../../state/AppState.js').AppState,
    ) => import('../../state/AppState.js').AppState,
  ) => void,
  fastMode?: boolean,
): Promise<void> {
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    if (autoModeCheckRan) {
      return
    }
    autoModeCheckRan = true

    const { updateContext, notification } = await verifyAutoModeGateAccess(
      toolPermissionContext,
      fastMode,
    )
    setAppState(prev => {
      const nextCtx = updateContext(prev.toolPermissionContext)
      const newState =
        nextCtx === prev.toolPermissionContext
          ? prev
          : { ...prev, toolPermissionContext: nextCtx }
      if (!notification) return newState
      return {
        ...newState,
        notifications: {
          ...newState.notifications,
          queue: [
            ...newState.notifications.queue,
            {
              key: 'auto-mode-gate-notification',
              text: notification,
              color: 'warning' as const,
              priority: 'high' as const,
            },
          ],
        },
      }
    })
  }
}

/**
 * Reset the run-once flag for checkAndDisableAutoModeIfNeeded.
 * Call this after /login so the gate check re-runs with the new org.
 */
export function resetAutoModeGateCheck(): void {
  autoModeCheckRan = false
}

export function useKickOffCheckAndDisableAutoModeIfNeeded(): void {
  const mainLoopModel = useAppState(s => s.mainLoopModel)
  const mainLoopModelForSession = useAppState(s => s.mainLoopModelForSession)
  const fastMode = useAppState(s => s.fastMode)
  const setAppState = useSetAppState()
  const store = useAppStateStore()
  const isFirstRunRef = useRef(true)

  // Runs on mount (startup check) AND whenever the model or fast mode changes
  useEffect(() => {
    if (getIsRemoteMode()) return
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false
    } else {
      resetAutoModeGateCheck()
    }
    void checkAndDisableAutoModeIfNeeded(
      store.getState().toolPermissionContext,
      setAppState,
      fastMode,
    ).catch(error => {
      logError(
        new Error('Auto mode gate check failed', { cause: toError(error) }),
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainLoopModel, mainLoopModelForSession, fastMode])
}
