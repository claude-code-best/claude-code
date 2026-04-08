import React, { useCallback, useState } from 'react'
import TextInput from '../../components/TextInput.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Text } from '@anthropic/ink'
import { useKeybindings } from '../../keybindings/useKeybinding.js'

interface ChooseRepoStepProps {
  currentRepo: string | null
  useCurrentRepo: boolean
  repoUrl: string
  onRepoUrlChange: (value: string) => void
  onToggleUseCurrentRepo: (useCurrentRepo: boolean) => void
  onSubmit: () => void
}

export function ChooseRepoStep({
  currentRepo,
  useCurrentRepo,
  repoUrl,
  onRepoUrlChange,
  onSubmit,
  onToggleUseCurrentRepo,
}: ChooseRepoStepProps) {
  const [cursorOffset, setCursorOffset] = useState(0)
  const [showEmptyError, setShowEmptyError] = useState(false)
  const terminalSize = useTerminalSize()
  const textInputColumns = terminalSize.columns

  const handleSubmit = useCallback(() => {
    const repoName = useCurrentRepo ? currentRepo : repoUrl
    if (!repoName?.trim()) {
      setShowEmptyError(true)
      return
    }
    onSubmit()
  }, [useCurrentRepo, currentRepo, repoUrl, onSubmit])

  // When the text input is visible, omit confirm:yes so bare 'y' passes
  // through to the input instead of submitting. TextInput's onSubmit handles
  // Enter. Keep the Confirmation context (not Settings) to avoid j/k bindings.
  const isTextInputVisible = !useCurrentRepo || !currentRepo
  const handlePrevious = useCallback(() => {
    onToggleUseCurrentRepo(true)
    setShowEmptyError(false)
  }, [onToggleUseCurrentRepo])
  const handleNext = useCallback(() => {
    onToggleUseCurrentRepo(false)
    setShowEmptyError(false)
  }, [onToggleUseCurrentRepo])

  useKeybindings(
    {
      'confirm:previous': handlePrevious,
      'confirm:next': handleNext,
      'confirm:yes': handleSubmit,
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
          <Text dimColor>Select GitHub repository</Text>
        </Box>
        {currentRepo && (
          <Box marginBottom={1}>
            <Text
              bold={useCurrentRepo}
              color={useCurrentRepo ? 'permission' : undefined}
            >
              {useCurrentRepo ? '> ' : '  '}
              Use current repository: {currentRepo}
            </Text>
          </Box>
        )}
        <Box marginBottom={1}>
          <Text
            bold={!useCurrentRepo || !currentRepo}
            color={!useCurrentRepo || !currentRepo ? 'permission' : undefined}
          >
            {!useCurrentRepo || !currentRepo ? '> ' : '  '}
            {currentRepo ? 'Enter a different repository' : 'Enter repository'}
          </Text>
        </Box>
        {(!useCurrentRepo || !currentRepo) && (
          <Box marginLeft={2} marginBottom={1}>
            <TextInput
              value={repoUrl}
              onChange={value => {
                onRepoUrlChange(value)
                setShowEmptyError(false)
              }}
              onSubmit={handleSubmit}
              focus={true}
              placeholder="Enter a repo as owner/repo or https://github.com/owner/repo…"
              columns={textInputColumns}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
              showCursor={true}
            />
          </Box>
        )}
      </Box>
      {showEmptyError && (
        <Box marginLeft={3} marginBottom={1}>
          <Text color="error">Please enter a repository name to continue</Text>
        </Box>
      )}
      <Box marginLeft={3}>
        <Text dimColor>
          {currentRepo ? '↑/↓ to select · ' : ''}Enter to continue
        </Text>
      </Box>
    </>
  )
}
