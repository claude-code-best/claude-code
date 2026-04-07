import { basename, relative } from 'path'
import React from 'react'
import { Box, Text, Pane } from '@anthropic/ink'
import { getCwd } from '../utils/cwd.js'
import { isSupportedVSCodeTerminal } from '../utils/ide.js'
import { Select } from './CustomSelect/index.js'
import type {
  PermissionOption,
  PermissionOptionWithLabel,
} from './permissions/FilePermissionDialog/permissionOptions.js'

type Props<A> = {
  filePath: string
  input: A
  onChange: (option: PermissionOption, args: A, feedback?: string) => void
  options: PermissionOptionWithLabel[]
  ideName: string
  symlinkTarget?: string | null
  rejectFeedback: string
  acceptFeedback: string
  setFocusedOption: (value: string) => void
  onInputModeToggle: (value: string) => void
  focusedOption: string
  yesInputMode: boolean
  noInputMode: boolean
}

export function ShowInIDEPrompt<A>({
  onChange,
  options,
  input,
  filePath,
  ideName,
  symlinkTarget,
  rejectFeedback,
  acceptFeedback,
  setFocusedOption,
  onInputModeToggle,
  focusedOption,
  yesInputMode,
  noInputMode,
}: Props<A>): React.ReactNode {
  return (
    <Pane color="permission">
      <Box flexDirection="column" gap={1}>
        <Text bold color="permission">
          Opened changes in {ideName} ⧉
        </Text>
        {symlinkTarget && (
          <Text color="warning">
            {relative(getCwd(), symlinkTarget).startsWith('..')
              ? `This will modify ${symlinkTarget} (outside working directory) via a symlink`
              : `Symlink target: ${symlinkTarget}`}
          </Text>
        )}
        {isSupportedVSCodeTerminal() && (
          <Text dimColor>Save file to continue…</Text>
        )}
        <Box flexDirection="column">
          <Text>
            Do you want to make this edit to{' '}
            <Text bold>{basename(filePath)}</Text>?
          </Text>
          <Select
            options={options}
            inlineDescriptions
            onChange={value => {
              const selected = options.find(opt => opt.value === value)
              if (selected) {
                // For reject option
                if (selected.option.type === 'reject') {
                  const trimmedFeedback = rejectFeedback.trim()
                  onChange(selected.option, input, trimmedFeedback || undefined)
                  return
                }
                // For accept-once option, pass accept feedback if present
                if (selected.option.type === 'accept-once') {
                  const trimmedFeedback = acceptFeedback.trim()
                  onChange(selected.option, input, trimmedFeedback || undefined)
                  return
                }
                onChange(selected.option, input)
              }
            }}
            onCancel={() => onChange({ type: 'reject' }, input)}
            onFocus={value => setFocusedOption(value)}
            onInputModeToggle={onInputModeToggle}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Esc to cancel
            {((focusedOption === 'yes' && !yesInputMode) ||
              (focusedOption === 'no' && !noInputMode)) &&
              ' · Tab to amend'}
          </Text>
        </Box>
      </Box>
    </Pane>
  )
}
