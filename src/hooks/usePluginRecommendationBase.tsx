/**
 * Shared state machine + install helper for plugin-recommendation hooks
 * (LSP, claude-code-hint). Centralizes the gate chain, async-guard,
 * and success/failure notification JSX so new sources stay small.
 */

import figures from 'figures'
import * as React from 'react'
import { getIsRemoteMode } from '../bootstrap/state.js'
import type { useNotifications } from '../context/notifications.js'
import { Text } from '@anthropic/ink'
import { logError } from '../utils/log.js'
import { getPluginById } from '../utils/plugins/marketplaceManager.js'

type AddNotification = ReturnType<typeof useNotifications>['addNotification']
type PluginData = NonNullable<Awaited<ReturnType<typeof getPluginById>>>

/**
 * Call tryResolve inside a useEffect; it applies standard gates (remote
 * mode, already-showing, in-flight) then runs resolve(). Non-null return
 * becomes the recommendation. Include tryResolve in effect deps — its
 * identity tracks recommendation, so clearing re-triggers resolution.
 */
export function usePluginRecommendationBase<T>(): {
  recommendation: T | null
  clearRecommendation: () => void
  tryResolve: (resolve: () => Promise<T | null>) => void
} {
  const [recommendation, setRecommendation] = React.useState<T | null>(null)
  const isCheckingRef = React.useRef(false)

  const tryResolve = React.useCallback(
    (resolve: () => Promise<T | null>) => {
      if (getIsRemoteMode()) return
      if (recommendation) return
      if (isCheckingRef.current) return

      isCheckingRef.current = true
      void resolve()
        .then(rec => {
          if (rec) setRecommendation(rec)
        })
        .catch(logError)
        .finally(() => {
          isCheckingRef.current = false
        })
    },
    [recommendation],
  )

  const clearRecommendation = React.useCallback(
    () => setRecommendation(null),
    [],
  )

  return { recommendation, clearRecommendation, tryResolve }
}

/** Look up plugin, run install(), emit standard success/failure notification. */
export async function installPluginAndNotify(
  pluginId: string,
  pluginName: string,
  keyPrefix: string,
  addNotification: AddNotification,
  install: (pluginData: PluginData) => Promise<void>,
): Promise<void> {
  try {
    const pluginData = await getPluginById(pluginId)
    if (!pluginData) {
      throw new Error(`Plugin ${pluginId} not found in marketplace`)
    }
    await install(pluginData)
    addNotification({
      key: `${keyPrefix}-installed`,
      jsx: (
        <Text color="success">
          {figures.tick} {pluginName} installed · restart to apply
        </Text>
      ),
      priority: 'immediate',
      timeoutMs: 5000,
    })
  } catch (error) {
    logError(error)
    addNotification({
      key: `${keyPrefix}-install-failed`,
      jsx: <Text color="error">Failed to install {pluginName}</Text>,
      priority: 'immediate',
      timeoutMs: 5000,
    })
  }
}
