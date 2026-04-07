import figures from 'figures'
import * as React from 'react'
import { useState } from 'react'
import TextInput from '../../../components/TextInput.js'
import { useExitOnCtrlCDWithKeybindings } from '../../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useTerminalSize } from '../../../hooks/useTerminalSize.js'
import { Box, Newline, Text } from '../../../ink.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { BashTool } from '../../../tools/BashTool/BashTool.js'
import { WebFetchTool } from '../../../tools/WebFetchTool/WebFetchTool.js'
import type {
  PermissionBehavior,
  PermissionRuleValue,
} from '../../../utils/permissions/PermissionRule.js'
import {
  permissionRuleValueFromString,
  permissionRuleValueToString,
} from '../../../utils/permissions/permissionRuleParser.js'

export type PermissionRuleInputProps = {
  onCancel: () => void
  onSubmit: (
    ruleValue: PermissionRuleValue,
    ruleBehavior: PermissionBehavior,
  ) => void
  ruleBehavior: PermissionBehavior
}

export function PermissionRuleInput({
  onCancel,
  onSubmit,
  ruleBehavior,
}: PermissionRuleInputProps): React.ReactNode {
  const [inputValue, setInputValue] = useState('')
  const [cursorOffset, setCursorOffset] = useState(0)
  const exitState = useExitOnCtrlCDWithKeybindings()

  // Use configurable keybinding for ESC to cancel
  // Use Settings context so 'n' key doesn't cancel (allows typing 'n' in input)
  useKeybinding('confirm:no', onCancel, { context: 'Settings' })

  const { columns } = useTerminalSize()
  const textInputColumns = columns - 6

  const handleSubmit = (value: string) => {
    const trimmedValue = value.trim()
    if (trimmedValue.length === 0) {
      return
    }
    const ruleValue = permissionRuleValueFromString(trimmedValue)
    onSubmit(ruleValue, ruleBehavior)
  }

  return (
    <>
      <Box
        flexDirection="column"
        gap={1}
        borderStyle="round"
        paddingLeft={1}
        paddingRight={1}
        borderColor="permission"
      >
        <Text bold color="permission">
          Add {ruleBehavior} permission rule
        </Text>
        <Box flexDirection="column">
          <Text>
            Permission rules are a tool name, optionally followed by a specifier
            in parentheses.
            <Newline />
            e.g.,{' '}
            <Text bold>
              {permissionRuleValueToString({ toolName: WebFetchTool.name })}
            </Text>
            <Text bold={false}> or </Text>
            <Text bold>
              {permissionRuleValueToString({
                toolName: BashTool.name,
                ruleContent: 'ls:*',
              })}
            </Text>
          </Text>
          <Box borderDimColor borderStyle="round" marginY={1} paddingLeft={1}>
            <TextInput
              showCursor
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              placeholder={`Enter permission rule${figures.ellipsis}`}
              columns={textInputColumns}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
            />
          </Box>
        </Box>
      </Box>
      <Box marginLeft={3}>
        {exitState.pending ? (
          <Text dimColor>Press {exitState.keyName} again to exit</Text>
        ) : (
          <Text dimColor>Enter to submit · Esc to cancel</Text>
        )}
      </Box>
    </>
  )
}
