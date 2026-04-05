import * as React from 'react'
import { useState } from 'react'
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js'
import { Box, Text } from '../ink.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js'
import { Select } from './CustomSelect/index.js'
import { Byline } from './design-system/Byline.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { Pane } from './design-system/Pane.js'

export type Props = {
  currentValue: boolean
  onSelect: (enabled: boolean) => void
  onCancel?: () => void
  isMidConversation?: boolean
}

export function ThinkingToggle({
  currentValue,
  onSelect,
  onCancel,
  isMidConversation,
}: Props): React.ReactNode {
  const exitState = useExitOnCtrlCDWithKeybindings()
  const [confirmationPending, setConfirmationPending] = useState<
    boolean | null
  >(null)

  const options = [
    {
      value: 'true',
      label: 'Enabled',
      description: 'Claude will think before responding',
    },
    {
      value: 'false',
      label: 'Disabled',
      description: 'Claude will respond without extended thinking',
    },
  ]

  // Use configurable keybinding for ESC to cancel/go back
  useKeybinding(
    'confirm:no',
    () => {
      if (confirmationPending !== null) {
        setConfirmationPending(null)
      } else {
        onCancel?.()
      }
    },
    { context: 'Confirmation' },
  )

  // Use configurable keybinding for Enter to confirm in confirmation mode
  useKeybinding(
    'confirm:yes',
    () => {
      if (confirmationPending !== null) {
        onSelect(confirmationPending)
      }
    },
    { context: 'Confirmation', isActive: confirmationPending !== null },
  )

  function handleSelectChange(value: string): void {
    const selected = value === 'true'
    if (isMidConversation && selected !== currentValue) {
      setConfirmationPending(selected)
    } else {
      onSelect(selected)
    }
  }

  return (
    <Pane color="permission">
      <Box flexDirection="column">
        <Box marginBottom={1} flexDirection="column">
          <Text color="remember" bold>
            Toggle thinking mode
          </Text>
          <Text dimColor>Enable or disable thinking for this session.</Text>
        </Box>

        {confirmationPending !== null ? (
          <Box flexDirection="column" marginBottom={1} gap={1}>
            <Text color="warning">
              Changing thinking mode mid-conversation will increase latency and
              may reduce quality. For best results, set this at the start of a
              session.
            </Text>
            <Text color="warning">Do you want to proceed?</Text>
          </Box>
        ) : (
          <Box flexDirection="column" marginBottom={1}>
            <Select
              defaultValue={currentValue ? 'true' : 'false'}
              defaultFocusValue={currentValue ? 'true' : 'false'}
              options={options}
              onChange={handleSelectChange}
              onCancel={onCancel ?? (() => {})}
              visibleOptionCount={2}
            />
          </Box>
        )}
      </Box>
      <Text dimColor italic>
        {exitState.pending ? (
          <>Press {exitState.keyName} again to exit</>
        ) : confirmationPending !== null ? (
          <Byline>
            <KeyboardShortcutHint shortcut="Enter" action="confirm" />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="cancel"
            />
          </Byline>
        ) : (
          <Byline>
            <KeyboardShortcutHint shortcut="Enter" action="confirm" />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="exit"
            />
          </Byline>
        )}
      </Text>
    </Pane>
  )
}
