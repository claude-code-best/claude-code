import * as React from 'react'
import { useEffect, useMemo } from 'react'
import { getIsRemoteMode } from '../../bootstrap/state.js'
import { useNotifications } from '../../context/notifications.js'
import { Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import { logForDebugging } from '../../utils/debug.js'
import { plural } from '../../utils/stringUtils.js'

export function usePluginInstallationStatus(): void {
  const { addNotification } = useNotifications()
  const installationStatus = useAppState(s => s.plugins.installationStatus)

  // Memoize the failed counts to prevent unnecessary effect triggers
  const { totalFailed, failedMarketplacesCount, failedPluginsCount } =
    useMemo(() => {
      if (!installationStatus) {
        return {
          totalFailed: 0,
          failedMarketplacesCount: 0,
          failedPluginsCount: 0,
        }
      }

      const failedMarketplaces = installationStatus.marketplaces.filter(
        m => m.status === 'failed',
      )
      const failedPlugins = installationStatus.plugins.filter(
        p => p.status === 'failed',
      )

      return {
        totalFailed: failedMarketplaces.length + failedPlugins.length,
        failedMarketplacesCount: failedMarketplaces.length,
        failedPluginsCount: failedPlugins.length,
      }
    }, [installationStatus])

  useEffect(() => {
    if (getIsRemoteMode()) return
    if (!installationStatus) {
      logForDebugging('No installation status to monitor')
      return
    }

    if (totalFailed === 0) {
      return
    }

    logForDebugging(
      `Plugin installation status: ${failedMarketplacesCount} failed marketplaces, ${failedPluginsCount} failed plugins`,
    )

    if (totalFailed === 0) {
      return
    }

    // Add notification for failures
    logForDebugging(
      `Adding notification for ${totalFailed} failed installations`,
    )
    addNotification({
      key: 'plugin-install-failed',
      jsx: (
        <>
          <Text color="error">
            {totalFailed} {plural(totalFailed, 'plugin')} failed to install
          </Text>
          <Text dimColor> · /plugin for details</Text>
        </>
      ),
      priority: 'medium',
    })
  }, [
    addNotification,
    totalFailed,
    failedMarketplacesCount,
    failedPluginsCount,
  ])
}
