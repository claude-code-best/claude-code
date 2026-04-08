import React from 'react'
import { Box, color, Link, Text, useTheme, useTabHeaderFocus } from '@anthropic/ink'
import type { CommandResultDisplay } from '../../types/command.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import { Select } from '../CustomSelect/select.js'

type Props = {
  onComplete: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

type OverrideMode = 'open' | 'closed'

export function SandboxOverridesTab({ onComplete }: Props): React.ReactNode {
  const isEnabled = SandboxManager.isSandboxingEnabled()
  const isLocked = SandboxManager.areSandboxSettingsLockedByPolicy()
  const currentAllowUnsandboxed = SandboxManager.areUnsandboxedCommandsAllowed()

  if (!isEnabled) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="subtle">
          Sandbox is not enabled. Enable sandbox to configure override settings.
        </Text>
      </Box>
    )
  }

  if (isLocked) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="subtle">
          Override settings are managed by a higher-priority configuration and
          cannot be changed locally.
        </Text>
        <Box marginTop={1}>
          <Text dimColor>
            Current setting:{' '}
            {currentAllowUnsandboxed
              ? 'Allow unsandboxed fallback'
              : 'Strict sandbox mode'}
          </Text>
        </Box>
      </Box>
    )
  }

  return (
    <OverridesSelect
      onComplete={onComplete}
      currentMode={currentAllowUnsandboxed ? 'open' : 'closed'}
    />
  )
}

// Split so useTabHeaderFocus() only runs when the Select renders. Calling it
// above the early returns registers a down-arrow opt-in even when we return
// static text — pressing ↓ then blurs the header with no way back.
function OverridesSelect({
  onComplete,
  currentMode,
}: Props & { currentMode: OverrideMode }): React.ReactNode {
  const [theme] = useTheme()
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const currentIndicator = color('success', theme)(`(current)`)

  const options = [
    {
      label:
        currentMode === 'open'
          ? `Allow unsandboxed fallback ${currentIndicator}`
          : 'Allow unsandboxed fallback',
      value: 'open',
    },
    {
      label:
        currentMode === 'closed'
          ? `Strict sandbox mode ${currentIndicator}`
          : 'Strict sandbox mode',
      value: 'closed',
    },
  ]

  async function handleSelect(value: string) {
    const mode = value as OverrideMode

    await SandboxManager.setSandboxSettings({
      allowUnsandboxedCommands: mode === 'open',
    })

    const message =
      mode === 'open'
        ? '✓ Unsandboxed fallback allowed - commands can run outside sandbox when necessary'
        : '✓ Strict sandbox mode - all commands must run in sandbox or be excluded via the `excludedCommands` option'

    onComplete(message)
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text bold>Configure Overrides:</Text>
      </Box>
      <Select
        options={options}
        onChange={handleSelect}
        onCancel={() => onComplete(undefined, { display: 'skip' })}
        onUpFromFirstItem={focusHeader}
        isDisabled={headerFocused}
      />
      <Box flexDirection="column" marginTop={1} gap={1}>
        <Text dimColor>
          <Text bold dimColor>
            Allow unsandboxed fallback:
          </Text>{' '}
          When a command fails due to sandbox restrictions, Claude can retry
          with dangerouslyDisableSandbox to run outside the sandbox (falling
          back to default permissions).
        </Text>
        <Text dimColor>
          <Text bold dimColor>
            Strict sandbox mode:
          </Text>{' '}
          All bash commands invoked by the model must run in the sandbox unless
          they are explicitly listed in excludedCommands.
        </Text>
        <Text dimColor>
          Learn more:{' '}
          <Link url="https://code.claude.com/docs/en/sandboxing#configure-sandboxing">
            code.claude.com/docs/en/sandboxing#configure-sandboxing
          </Link>
        </Text>
      </Box>
    </Box>
  )
}
