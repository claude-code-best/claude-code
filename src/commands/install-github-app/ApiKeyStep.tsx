import React, { useCallback, useState } from 'react'
import TextInput from '../../components/TextInput.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, color, Text, useTheme } from '@anthropic/ink'
import { useKeybindings } from '../../keybindings/useKeybinding.js'

interface ApiKeyStepProps {
  existingApiKey: string | null
  useExistingKey: boolean
  apiKeyOrOAuthToken: string
  onApiKeyChange: (value: string) => void
  onToggleUseExistingKey: (useExisting: boolean) => void
  onSubmit: () => void
  onCreateOAuthToken?: () => void
  selectedOption?: 'existing' | 'new' | 'oauth'
  onSelectOption?: (option: 'existing' | 'new' | 'oauth') => void
}

export function ApiKeyStep({
  existingApiKey,
  apiKeyOrOAuthToken,
  onApiKeyChange,
  onSubmit,
  onToggleUseExistingKey,
  onCreateOAuthToken,
  selectedOption = existingApiKey
    ? 'existing'
    : onCreateOAuthToken
      ? 'oauth'
      : 'new',
  onSelectOption,
}: ApiKeyStepProps) {
  const [cursorOffset, setCursorOffset] = useState(0)
  const terminalSize = useTerminalSize()
  const [theme] = useTheme()

  const handlePrevious = useCallback(() => {
    if (selectedOption === 'new' && onCreateOAuthToken) {
      // From 'new' go up to 'oauth'
      onSelectOption?.('oauth')
    } else if (selectedOption === 'oauth' && existingApiKey) {
      // From 'oauth' go up to 'existing' (only if it exists)
      onSelectOption?.('existing')
      onToggleUseExistingKey(true)
    }
  }, [
    selectedOption,
    onCreateOAuthToken,
    existingApiKey,
    onSelectOption,
    onToggleUseExistingKey,
  ])

  const handleNext = useCallback(() => {
    if (selectedOption === 'existing') {
      // From 'existing' go down to 'oauth' (if available) or 'new'
      onSelectOption?.(onCreateOAuthToken ? 'oauth' : 'new')
      onToggleUseExistingKey(false)
    } else if (selectedOption === 'oauth') {
      // From 'oauth' go down to 'new'
      onSelectOption?.('new')
    }
  }, [
    selectedOption,
    onCreateOAuthToken,
    onSelectOption,
    onToggleUseExistingKey,
  ])

  const handleConfirm = useCallback(() => {
    if (selectedOption === 'oauth' && onCreateOAuthToken) {
      onCreateOAuthToken()
    } else {
      onSubmit()
    }
  }, [selectedOption, onCreateOAuthToken, onSubmit])

  // When the text input is visible, omit confirm:yes so bare 'y' passes
  // through to the input instead of submitting. TextInput's onSubmit handles
  // Enter. Keep the Confirmation context (not Settings) to avoid j/k bindings.
  const isTextInputVisible = selectedOption === 'new'
  useKeybindings(
    {
      'confirm:previous': handlePrevious,
      'confirm:next': handleNext,
      'confirm:yes': handleConfirm,
    },
    { context: 'Confirmation', isActive: !isTextInputVisible },
  )
  useKeybindings(
    {
      'confirm:previous': handlePrevious,
      'confirm:next': handleNext,
    },
    { context: 'Confirmation', isActive: isTextInputVisible },
  )

  return (
    <>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Install GitHub App</Text>
          <Text dimColor>Choose API key</Text>
        </Box>
        {existingApiKey && (
          <Box marginBottom={1}>
            <Text>
              {selectedOption === 'existing'
                ? color('success', theme)('> ')
                : '  '}
              Use your existing Claude Code API key
            </Text>
          </Box>
        )}
        {onCreateOAuthToken && (
          <Box marginBottom={1}>
            <Text>
              {selectedOption === 'oauth'
                ? color('success', theme)('> ')
                : '  '}
              Create a long-lived token with your Claude subscription
            </Text>
          </Box>
        )}
        <Box marginBottom={1}>
          <Text>
            {selectedOption === 'new' ? color('success', theme)('> ') : '  '}
            Enter a new API key
          </Text>
        </Box>
        {selectedOption === 'new' && (
          <TextInput
            value={apiKeyOrOAuthToken}
            onChange={onApiKeyChange}
            onSubmit={onSubmit}
            onPaste={onApiKeyChange}
            focus={true}
            placeholder="sk-ant… (Create a new key at https://platform.claude.com/settings/keys)"
            mask="*"
            columns={terminalSize.columns}
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
            showCursor={true}
          />
        )}
      </Box>
      <Box marginLeft={3}>
        <Text dimColor>↑/↓ to select · Enter to continue</Text>
      </Box>
    </>
  )
}
