import * as React from 'react'
import { useInterval } from 'usehooks-ts'
import { getIsRemoteMode, getIsScrollDraining } from '../../bootstrap/state.js'
import { useNotifications } from '../../context/notifications.js'
import { Text } from '@anthropic/ink'
import {
  getInitializationStatus,
  getLspServerManager,
} from '../../services/lsp/manager.js'
import { useSetAppState } from '../../state/AppState.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

const LSP_POLL_INTERVAL_MS = 5000

/**
 * Hook that polls LSP status and shows a notification when:
 * 1. Manager initialization fails
 * 2. Any LSP server enters an error state
 *
 * Also adds errors to appState.plugins.errors for /doctor display.
 *
 * Only active when ENABLE_LSP_TOOL is set.
 */
export function useLspInitializationNotification(): void {
  const { addNotification } = useNotifications()
  const setAppState = useSetAppState()
  // Lazy initializer — eager form re-evaluates isEnvTruthy on every REPL
  // render (the arg expression runs even though useState ignores it after
  // mount). Showed up as 7.2s isEnvTruthy self-time during PageUp spam
  // after #24498 swapped cheap !!process.env.X for isEnvTruthy().
  const [shouldPoll, setShouldPoll] = React.useState(() =>
    isEnvTruthy("true"),
  )
  // Track which errors we've already notified about to avoid duplicates
  const notifiedErrorsRef = React.useRef<Set<string>>(new Set())

  const addError = React.useCallback(
    (source: string, errorMessage: string) => {
      const errorKey = `${source}:${errorMessage}`
      if (notifiedErrorsRef.current.has(errorKey)) {
        return // Already notified
      }
      notifiedErrorsRef.current.add(errorKey)

      logForDebugging(`LSP error: ${source} - ${errorMessage}`)

      // Add error to appState.plugins.errors
      setAppState(prev => {
        // Check if this error already exists to avoid duplicates
        const existingKeys = new Set(
          prev.plugins.errors.map(e => {
            if (e.type === 'generic-error') {
              return `generic-error:${e.source}:${e.error}`
            }
            return `${e.type}:${e.source}`
          }),
        )

        const stateErrorKey = `generic-error:${source}:${errorMessage}`
        if (existingKeys.has(stateErrorKey)) {
          return prev
        }

        return {
          ...prev,
          plugins: {
            ...prev.plugins,
            errors: [
              ...prev.plugins.errors,
              {
                type: 'generic-error' as const,
                source,
                error: errorMessage,
              },
            ],
          },
        }
      })

      // Show notification - extract plugin name from source like "plugin:typescript-lsp:typescript"
      const displayName = source.startsWith('plugin:')
        ? (source.split(':')[1] ?? source)
        : source

      addNotification({
        key: `lsp-error-${source}`,
        jsx: (
          <>
            <Text color="error">LSP for {displayName} failed</Text>
            <Text dimColor> · /plugin for details</Text>
          </>
        ),
        priority: 'medium',
        timeoutMs: 8000,
      })
    },
    [addNotification, setAppState],
  )

  const poll = React.useCallback(() => {
    if (getIsRemoteMode()) return
    // Skip during scroll drain — iterating all LSP servers + setAppState
    // competes for the event loop with scroll frames. Next interval picks up.
    if (getIsScrollDraining()) return

    const status = getInitializationStatus()

    // Check manager initialization status
    if (status.status === 'failed') {
      addError('lsp-manager', status.error.message)
      setShouldPoll(false)
      return
    }

    if (status.status === 'pending' || status.status === 'not-started') {
      // Still initializing, continue polling
      return
    }

    // Manager initialized successfully - check for server errors
    const manager = getLspServerManager()
    if (manager) {
      const servers = manager.getAllServers()
      for (const [serverName, server] of servers) {
        if (server.state === 'error' && server.lastError) {
          addError(serverName, server.lastError.message)
        }
      }
    }
    // Continue polling to detect future server errors
  }, [addError])

  useInterval(poll, shouldPoll ? LSP_POLL_INTERVAL_MS : null)

  // Initial poll on mount
  React.useEffect(() => {
    if (getIsRemoteMode() || !shouldPoll) return
    poll()
  }, [poll, shouldPoll])
}
