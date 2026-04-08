/**
 * App-specific wrapper around ink's KeybindingSetup.
 *
 * Wires up app-specific dependencies (notification system, binding loading,
 * file watching, debug logging) and re-exports as KeybindingSetup.
 */
import { useCallback } from 'react'
import { useNotifications } from '../context/notifications.js'
import { count } from '../utils/array.js'
import { logForDebugging } from '../utils/debug.js'
import { plural } from '../utils/stringUtils.js'
import { KeybindingSetup as InkKeybindingSetup } from '@anthropic/ink'
import type { KeybindingWarning } from '@anthropic/ink'
import {
  initializeKeybindingWatcher,
  loadKeybindingsSyncWithWarnings,
  subscribeToKeybindingChanges,
} from './loadUserBindings.js'

type Props = {
  children: React.ReactNode
}

/**
 * Keybinding provider with default + user bindings and hot-reload support.
 *
 * Usage: Wrap your app with this provider to enable keybinding support.
 *
 * ```tsx
 * <AppStateProvider>
 *   <KeybindingSetup>
 *     <REPL ... />
 *   </KeybindingSetup>
 * </AppStateProvider>
 * ```
 *
 * Features:
 * - Loads default bindings from code
 * - Merges with user bindings from ~/.claude/keybindings.json
 * - Watches for file changes and reloads automatically (hot-reload)
 * - User bindings override defaults (later entries win)
 * - Chord support with automatic timeout
 */
export function KeybindingSetup({ children }: Props): React.ReactNode {
  const { addNotification, removeNotification } = useNotifications()

  const handleWarnings = useCallback(
    (warnings: KeybindingWarning[], _isReload: boolean) => {
      const notificationKey = 'keybinding-config-warning'

      if (warnings.length === 0) {
        removeNotification(notificationKey)
        return
      }

      const errorCount = count(warnings, w => w.severity === 'error')
      const warnCount = count(warnings, w => w.severity === 'warning')

      let message: string
      if (errorCount > 0 && warnCount > 0) {
        message = `Found ${errorCount} keybinding ${plural(errorCount, 'error')} and ${warnCount} ${plural(warnCount, 'warning')}`
      } else if (errorCount > 0) {
        message = `Found ${errorCount} keybinding ${plural(errorCount, 'error')}`
      } else {
        message = `Found ${warnCount} keybinding ${plural(warnCount, 'warning')}`
      }
      message += ' · /doctor for details'

      addNotification({
        key: notificationKey,
        text: message,
        color: errorCount > 0 ? 'error' : 'warning',
        priority: errorCount > 0 ? 'immediate' : 'high',
        timeoutMs: 60000,
      })
    },
    [addNotification, removeNotification],
  )

  return (
    <InkKeybindingSetup
      loadBindings={loadKeybindingsSyncWithWarnings}
      subscribeToChanges={subscribeToKeybindingChanges}
      initWatcher={initializeKeybindingWatcher}
      onWarnings={handleWarnings}
      onDebugLog={logForDebugging}
    >
      {children}
    </InkKeybindingSetup>
  )
}
