import * as React from 'react'
import { useCallback, useState } from 'react'
import { useDoublePress } from '../hooks/useDoublePress.js'
import { Box, Text } from '../ink.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { useShortcutDisplay } from '../keybindings/useShortcutDisplay.js'
import {
  useAppState,
  useAppStateStore,
  useSetAppState,
} from '../state/AppState.js'
import {
  backgroundAll,
  hasForegroundTasks,
} from '../tasks/LocalShellTask/LocalShellTask.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { env } from '../utils/env.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'

type Props = {
  onBackgroundSession: () => void
  isLoading: boolean
}

/**
 * Shows a hint when user presses Ctrl+B to background the current session.
 * Uses double-press pattern: first press shows hint, second press within 800ms backgrounds.
 *
 * Only activates when:
 * 1. isLoading is true (a query is in progress)
 * 2. No foreground tasks (bash/agent) are running (those take priority for Ctrl+B)
 */
export function SessionBackgroundHint({
  onBackgroundSession,
  isLoading,
}: Props): React.ReactElement | null {
  const setAppState = useSetAppState()
  const appStateStore = useAppStateStore()

  const [showSessionHint, setShowSessionHint] = useState(false)

  const handleDoublePress = useDoublePress(
    setShowSessionHint,
    onBackgroundSession,
    () => {}, // First press just shows the hint
  )

  // Handler for task:background - prioritizes foreground tasks, falls back to session backgrounding
  // Skip all background functionality if background tasks are disabled
  const handleBackground = useCallback(() => {
    if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
      return
    }
    const state = appStateStore.getState()
    if (hasForegroundTasks(state)) {
      // Existing behavior - background running bash/agent tasks
      backgroundAll(() => appStateStore.getState(), setAppState)
      if (!getGlobalConfig().hasUsedBackgroundTask) {
        saveGlobalConfig(c =>
          c.hasUsedBackgroundTask ? c : { ...c, hasUsedBackgroundTask: true },
        )
      }
    } else if (
      isEnvTruthy("false") &&
      isLoading
    ) {
      // New behavior - double-press to background session (gated)
      handleDoublePress()
    }
  }, [setAppState, appStateStore, isLoading, handleDoublePress])

  // Only eat ctrl+b when there's something to background. Without this gate
  // the binding double-fires with readline backward-char at an idle prompt.
  const hasForeground = useAppState(hasForegroundTasks)
  const sessionBgEnabled = isEnvTruthy("false")
  useKeybinding('task:background', handleBackground, {
    context: 'Task',
    isActive: hasForeground || (sessionBgEnabled && isLoading),
  })

  // Get the configured shortcut for task:background
  const baseShortcut = useShortcutDisplay('task:background', 'Task', 'ctrl+b')
  // In tmux, ctrl+b is the prefix key, so users need to press it twice to send ctrl+b
  const shortcut =
    env.terminal === 'tmux' && baseShortcut === 'ctrl+b'
      ? 'ctrl+b ctrl+b'
      : baseShortcut

  if (!isLoading || !showSessionHint) {
    return null
  }

  return (
    <Box paddingLeft={2}>
      <Text dimColor>
        <KeyboardShortcutHint shortcut={shortcut} action="background" />
      </Text>
    </Box>
  )
}
