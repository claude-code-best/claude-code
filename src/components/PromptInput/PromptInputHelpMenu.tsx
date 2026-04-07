import { feature } from 'bun:bundle'
import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import { getPlatform } from 'src/utils/platform.js'
import { isKeybindingCustomizationEnabled } from '../../keybindings/loadUserBindings.js'
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { isFastModeAvailable, isFastModeEnabled } from '../../utils/fastMode.js'
import { getNewlineInstructions } from './utils.js'

/** Format a shortcut for display in the help menu (e.g., "ctrl+o" → "ctrl + o") */
function formatShortcut(shortcut: string): string {
  return shortcut.replace(/\+/g, ' + ')
}

type Props = {
  dimColor?: boolean
  fixedWidth?: boolean
  gap?: number
  paddingX?: number
}

export function PromptInputHelpMenu(props: Props): React.ReactNode {
  const { dimColor, fixedWidth, gap, paddingX } = props

  // Get configured shortcuts from keybinding system
  const transcriptShortcut = formatShortcut(
    useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o'),
  )
  const todosShortcut = formatShortcut(
    useShortcutDisplay('app:toggleTodos', 'Global', 'ctrl+t'),
  )
  const undoShortcut = formatShortcut(
    useShortcutDisplay('chat:undo', 'Chat', 'ctrl+_'),
  )
  const stashShortcut = formatShortcut(
    useShortcutDisplay('chat:stash', 'Chat', 'ctrl+s'),
  )
  const cycleModeShortcut = formatShortcut(
    useShortcutDisplay('chat:cycleMode', 'Chat', 'shift+tab'),
  )
  const modelPickerShortcut = formatShortcut(
    useShortcutDisplay('chat:modelPicker', 'Chat', 'alt+p'),
  )
  const fastModeShortcut = formatShortcut(
    useShortcutDisplay('chat:fastMode', 'Chat', 'alt+o'),
  )
  const externalEditorShortcut = formatShortcut(
    useShortcutDisplay('chat:externalEditor', 'Chat', 'ctrl+g'),
  )
  const terminalShortcut = formatShortcut(
    useShortcutDisplay('app:toggleTerminal', 'Global', 'meta+j'),
  )
  const imagePasteShortcut = formatShortcut(
    useShortcutDisplay('chat:imagePaste', 'Chat', 'ctrl+v'),
  )

  // Compute terminal shortcut element outside JSX to satisfy feature() constraint
  const terminalShortcutElement = feature('TERMINAL_PANEL') ? (
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_terminal_panel', false) ? (
      <Box>
        <Text dimColor={dimColor}>{terminalShortcut} for terminal</Text>
      </Box>
    ) : null
  ) : null

  return (
    <Box paddingX={paddingX} flexDirection="row" gap={gap}>
      <Box flexDirection="column" width={fixedWidth ? 24 : undefined}>
        <Box>
          <Text dimColor={dimColor}>! for bash mode</Text>
        </Box>
        <Box>
          <Text dimColor={dimColor}>/ for commands</Text>
        </Box>
        <Box>
          <Text dimColor={dimColor}>@ for file paths</Text>
        </Box>
        <Box>
          <Text dimColor={dimColor}>& for background</Text>
        </Box>
        <Box>
          <Text dimColor={dimColor}>/btw for side question</Text>
        </Box>
      </Box>
      <Box flexDirection="column" width={fixedWidth ? 35 : undefined}>
        <Box>
          <Text dimColor={dimColor}>double tap esc to clear input</Text>
        </Box>
        <Box>
          <Text dimColor={dimColor}>
            {cycleModeShortcut}{' '}
            {process.env.USER_TYPE === 'ant'
              ? 'to cycle modes'
              : 'to auto-accept edits'}
          </Text>
        </Box>
        <Box>
          <Text dimColor={dimColor}>
            {transcriptShortcut} for verbose output
          </Text>
        </Box>
        <Box>
          <Text dimColor={dimColor}>{todosShortcut} to toggle tasks</Text>
        </Box>
        {terminalShortcutElement}
        <Box>
          <Text dimColor={dimColor}>{getNewlineInstructions()}</Text>
        </Box>
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text dimColor={dimColor}>{undoShortcut} to undo</Text>
        </Box>
        {getPlatform() !== 'windows' && (
          <Box>
            <Text dimColor={dimColor}>ctrl + z to suspend</Text>
          </Box>
        )}
        <Box>
          <Text dimColor={dimColor}>{imagePasteShortcut} to paste images</Text>
        </Box>
        <Box>
          <Text dimColor={dimColor}>{modelPickerShortcut} to switch model</Text>
        </Box>
        {isFastModeEnabled() && isFastModeAvailable() && (
          <Box>
            <Text dimColor={dimColor}>
              {fastModeShortcut} to toggle fast mode
            </Text>
          </Box>
        )}
        <Box>
          <Text dimColor={dimColor}>{stashShortcut} to stash prompt</Text>
        </Box>
        <Box>
          <Text dimColor={dimColor}>
            {externalEditorShortcut} to edit in $EDITOR
          </Text>
        </Box>
        {isKeybindingCustomizationEnabled() && (
          <Box>
            <Text dimColor={dimColor}>/keybindings to customize</Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
