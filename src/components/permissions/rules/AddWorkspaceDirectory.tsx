import figures from 'figures'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebounceCallback } from 'usehooks-ts'
import {
  addDirHelpMessage,
  validateDirectoryForWorkspace,
} from '../../../commands/add-dir/validation.js'
import TextInput from '../../../components/TextInput.js'
import { type KeyboardEvent, Box, Text } from '@anthropic/ink'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import type { ToolPermissionContext } from '../../../Tool.js'
import { getDirectoryCompletions } from '../../../utils/suggestions/directoryCompletion.js'
import { ConfigurableShortcutHint } from '../../ConfigurableShortcutHint.js'
import { Select } from '../../CustomSelect/select.js'
import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink'
import {
  PromptInputFooterSuggestions,
  type SuggestionItem,
} from '../../PromptInput/PromptInputFooterSuggestions.js'

type Props = {
  onAddDirectory: (path: string, remember?: boolean) => void
  onCancel: () => void
  permissionContext: ToolPermissionContext
  directoryPath?: string // When directoryPath is provided, show selection options instead of input
}

type RememberDirectoryOption = 'yes-session' | 'yes-remember' | 'no'

const REMEMBER_DIRECTORY_OPTIONS: Array<{
  value: RememberDirectoryOption
  label: string
}> = [
  {
    value: 'yes-session',
    label: 'Yes, for this session',
  },
  {
    value: 'yes-remember',
    label: 'Yes, and remember this directory',
  },
  {
    value: 'no',
    label: 'No',
  },
]

function PermissionDescription(): React.ReactNode {
  return (
    <Text dimColor>
      Claude Code will be able to read files in this directory and make edits
      when auto-accept edits is on.
    </Text>
  )
}

function DirectoryDisplay({ path }: { path: string }): React.ReactNode {
  return (
    <Box flexDirection="column" paddingX={2} gap={1}>
      <Text color="permission">{path}</Text>
      <PermissionDescription />
    </Box>
  )
}

function DirectoryInput({
  value,
  onChange,
  onSubmit,
  error,
  suggestions,
  selectedSuggestion,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  error: string | null
  suggestions: SuggestionItem[]
  selectedSuggestion: number
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text>Enter the path to the directory:</Text>
      <Box borderDimColor borderStyle="round" marginY={1} paddingLeft={1}>
        <TextInput
          showCursor
          placeholder={`Directory path${figures.ellipsis}`}
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          columns={80}
          cursorOffset={value.length}
          onChangeCursorOffset={() => {}}
        />
      </Box>
      {suggestions.length > 0 && (
        <Box marginBottom={1}>
          <PromptInputFooterSuggestions
            suggestions={suggestions}
            selectedSuggestion={selectedSuggestion}
          />
        </Box>
      )}
      {error && <Text color="error">{error}</Text>}
    </Box>
  )
}

export function AddWorkspaceDirectory({
  onAddDirectory,
  onCancel,
  permissionContext,
  directoryPath,
}: Props): React.ReactNode {
  const [directoryInput, setDirectoryInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState(0)
  const options = useMemo(() => REMEMBER_DIRECTORY_OPTIONS, [])

  // Fetch directory completions
  const fetchSuggestions = useCallback(async (path: string) => {
    if (!path) {
      setSuggestions([])
      setSelectedSuggestion(0)
      return
    }
    const completions = await getDirectoryCompletions(path)
    setSuggestions(completions)
    setSelectedSuggestion(0)
  }, [])

  const debouncedFetchSuggestions = useDebounceCallback(fetchSuggestions, 100)

  useEffect(() => {
    void debouncedFetchSuggestions(directoryInput)
  }, [directoryInput, debouncedFetchSuggestions])

  const applySuggestion = useCallback((suggestion: SuggestionItem) => {
    const newPath = suggestion.id + '/'
    setDirectoryInput(newPath)
    setError(null)
    // Suggestions will update via the useEffect
  }, [])

  // Handle directory submission from input
  const handleSubmit = useCallback(
    async (newPath: string) => {
      const result = await validateDirectoryForWorkspace(
        newPath,
        permissionContext,
      )

      if (result.resultType === 'success') {
        onAddDirectory(result.absolutePath, false)
      } else {
        setError(addDirHelpMessage(result))
      }
    },
    [permissionContext, onAddDirectory],
  )

  // Handle Esc to cancel (Ctrl+C handled by global keybindings)
  // Use Settings context so 'n' key doesn't cancel (allows typing 'n' in input)
  useKeybinding('confirm:no', onCancel, { context: 'Settings' })

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (suggestions.length > 0) {
        // Tab: accept selected suggestion and continue (for drilling into subdirs)
        if (e.key === 'tab') {
          e.preventDefault()
          const suggestion = suggestions[selectedSuggestion]
          if (suggestion) {
            applySuggestion(suggestion)
          }
          return
        }

        // Enter: apply selected suggestion and submit
        if (e.key === 'return') {
          e.preventDefault()
          const suggestion = suggestions[selectedSuggestion]
          if (suggestion) {
            void handleSubmit(suggestion.id + '/')
          }
          return
        }

        if (e.key === 'up' || (e.ctrl && e.key === 'p')) {
          e.preventDefault()
          setSelectedSuggestion(prev =>
            prev <= 0 ? suggestions.length - 1 : prev - 1,
          )
          return
        }

        if (e.key === 'down' || (e.ctrl && e.key === 'n')) {
          e.preventDefault()
          setSelectedSuggestion(prev =>
            prev >= suggestions.length - 1 ? 0 : prev + 1,
          )
          return
        }
      }
    },
    [suggestions, selectedSuggestion, applySuggestion, handleSubmit],
  )

  const handleSelect = useCallback(
    (value: string) => {
      if (!directoryPath) return

      const selectionValue = value as RememberDirectoryOption

      switch (selectionValue) {
        case 'yes-session':
          onAddDirectory(directoryPath, false)
          break
        case 'yes-remember':
          onAddDirectory(directoryPath, true)
          break
        case 'no':
          onCancel()
          break
      }
    },
    [directoryPath, onAddDirectory, onCancel],
  )

  return (
    <Box
      flexDirection="column"
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      <Dialog
        title="Add directory to workspace"
        onCancel={onCancel}
        color="permission"
        isCancelActive={false}
        inputGuide={
          directoryPath
            ? undefined
            : exitState =>
                exitState.pending ? (
                  <Text>Press {exitState.keyName} again to exit</Text>
                ) : (
                  <Byline>
                    <KeyboardShortcutHint shortcut="Tab" action="complete" />
                    <KeyboardShortcutHint shortcut="Enter" action="add" />
                    <ConfigurableShortcutHint
                      action="confirm:no"
                      context="Settings"
                      fallback="Esc"
                      description="cancel"
                    />
                  </Byline>
                )
        }
      >
        {directoryPath ? (
          <Box flexDirection="column" gap={1}>
            <DirectoryDisplay path={directoryPath} />
            <Select
              options={options}
              onChange={handleSelect}
              onCancel={() => handleSelect('no')}
            />
          </Box>
        ) : (
          <Box flexDirection="column" gap={1} marginX={2}>
            <PermissionDescription />
            <DirectoryInput
              value={directoryInput}
              onChange={setDirectoryInput}
              onSubmit={handleSubmit}
              error={error}
              suggestions={suggestions}
              selectedSuggestion={selectedSuggestion}
            />
          </Box>
        )}
      </Dialog>
    </Box>
  )
}
