import { feature } from 'bun:bundle'
import chalk from 'chalk'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import * as React from 'react'
import { use, useEffect, useState } from 'react'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { Box, Text } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { getAutoMemPath, isAutoMemoryEnabled } from '../../memdir/paths.js'
import { logEvent } from '../../services/analytics/index.js'
import { isAutoDreamEnabled } from '../../services/autoDream/config.js'
import { readLastConsolidatedAt } from '../../services/autoDream/consolidationLock.js'
import { useAppState } from '../../state/AppState.js'
import { getAgentMemoryDir } from '../../tools/AgentTool/agentMemory.js'
import { openPath } from '../../utils/browser.js'
import { getMemoryFiles, type MemoryFileInfo } from '../../utils/claudemd.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getDisplayPath } from '../../utils/file.js'
import { formatRelativeTimeAgo } from '../../utils/format.js'
import { projectIsInGitRepo } from '../../utils/memory/versions.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'
import { Select } from '../CustomSelect/index.js'
import { ListItem } from '../design-system/ListItem.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const teamMemPaths = feature('TEAMMEM')
  ? (require('../../memdir/teamMemPaths.js') as typeof import('../../memdir/teamMemPaths.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

interface ExtendedMemoryFileInfo extends MemoryFileInfo {
  isNested?: boolean
  exists: boolean
}

// Remember last selected path
let lastSelectedPath: string | undefined

const OPEN_FOLDER_PREFIX = '__open_folder__'

type Props = {
  onSelect: (path: string) => void
  onCancel: () => void
}

export function MemoryFileSelector({
  onSelect,
  onCancel,
}: Props): React.ReactNode {
  const existingMemoryFiles = use(getMemoryFiles())

  // Create entries for User and Project CLAUDE.md even if they don't exist
  const userMemoryPath = join(getClaudeConfigHomeDir(), 'CLAUDE.md')
  const projectMemoryPath = join(getOriginalCwd(), 'CLAUDE.md')

  // Check if these are already in the existing files
  const hasUserMemory = existingMemoryFiles.some(f => f.path === userMemoryPath)
  const hasProjectMemory = existingMemoryFiles.some(
    f => f.path === projectMemoryPath,
  )

  // Filter out AutoMem/TeamMem entrypoints: these are MEMORY.md files, and
  // /memory already surfaces "Open auto-memory folder" / "Open team memory
  // folder" options below. Listing the entrypoint file separately is redundant.
  const allMemoryFiles: ExtendedMemoryFileInfo[] = [
    ...existingMemoryFiles
      .filter(f => f.type !== 'AutoMem' && f.type !== 'TeamMem')
      .map(f => ({ ...f, exists: true })),
    // Add User memory if it doesn't exist
    ...(hasUserMemory
      ? []
      : [
          {
            path: userMemoryPath,
            type: 'User' as const,
            content: '',
            exists: false,
          },
        ]),
    // Add Project memory if it doesn't exist
    ...(hasProjectMemory
      ? []
      : [
          {
            path: projectMemoryPath,
            type: 'Project' as const,
            content: '',
            exists: false,
          },
        ]),
  ]

  const depths = new Map<string, number>()

  // Create options for the select component
  const memoryOptions = allMemoryFiles.map(file => {
    const displayPath = getDisplayPath(file.path)
    const existsLabel = file.exists ? '' : ' (new)'

    // Calculate depth based on parent
    const depth = file.parent ? (depths.get(file.parent) ?? 0) + 1 : 0
    depths.set(file.path, depth)
    const indent = depth > 0 ? '  '.repeat(depth - 1) : ''

    // Format label based on type
    let label: string
    if (
      file.type === 'User' &&
      !file.isNested &&
      file.path === userMemoryPath
    ) {
      label = `User memory`
    } else if (
      file.type === 'Project' &&
      !file.isNested &&
      file.path === projectMemoryPath
    ) {
      label = `Project memory`
    } else if (depth > 0) {
      // For child nodes (imported files), show indented with L
      label = `${indent}L ${displayPath}${existsLabel}`
    } else {
      // For other memory files, just show the path
      label = `${displayPath}`
    }

    // Create description based on type - keep the original descriptions for built-in types
    let description: string
    const isGit = projectIsInGitRepo(getOriginalCwd())

    if (file.type === 'User' && !file.isNested) {
      description = 'Saved in ~/.claude/CLAUDE.md'
    } else if (
      file.type === 'Project' &&
      !file.isNested &&
      file.path === projectMemoryPath
    ) {
      description = `${isGit ? 'Checked in at' : 'Saved in'} ./CLAUDE.md`
    } else if (file.parent) {
      // For imported files (with @-import)
      description = '@-imported'
    } else if (file.isNested) {
      // For nested files (dynamically loaded)
      description = 'dynamically loaded'
    } else {
      description = ''
    }

    return {
      label,
      value: file.path,
      description,
    }
  })

  // Add "Open folder" options for auto-memory and agent memory directories
  const folderOptions: Array<{
    label: string
    value: string
    description: string
  }> = []

  const agentDefinitions = useAppState(s => s.agentDefinitions)
  if (isAutoMemoryEnabled()) {
    // Always show auto-memory folder option
    folderOptions.push({
      label: 'Open auto-memory folder',
      value: `${OPEN_FOLDER_PREFIX}${getAutoMemPath()}`,
      description: '',
    })

    // Team memory directly below auto-memory (team dir is a subdir of auto dir)
    if (feature('TEAMMEM') && teamMemPaths!.isTeamMemoryEnabled()) {
      folderOptions.push({
        label: 'Open team memory folder',
        value: `${OPEN_FOLDER_PREFIX}${teamMemPaths!.getTeamMemPath()}`,
        description: '',
      })
    }

    // Add agent memory folders for agents that have memory configured
    for (const agent of agentDefinitions.activeAgents) {
      if (agent.memory) {
        const agentDir = getAgentMemoryDir(agent.agentType, agent.memory)
        folderOptions.push({
          label: `Open ${chalk.bold(agent.agentType)} agent memory`,
          value: `${OPEN_FOLDER_PREFIX}${agentDir}`,
          description: `${agent.memory} scope`,
        })
      }
    }
  }

  memoryOptions.push(...folderOptions)

  // Initialize with last selected path if it's still in the options, otherwise use first option
  const initialPath =
    lastSelectedPath &&
    memoryOptions.some(opt => opt.value === lastSelectedPath)
      ? lastSelectedPath
      : memoryOptions[0]?.value || ''

  // Toggle state (local copy of settings so the UI updates immediately)
  const [autoMemoryOn, setAutoMemoryOn] = useState(isAutoMemoryEnabled)
  const [autoDreamOn, setAutoDreamOn] = useState(isAutoDreamEnabled)

  // Dream row is only meaningful when auto-memory is on (dream consolidates
  // that dir). Snapshot at mount so the row doesn't vanish mid-navigation
  // if the user toggles auto-memory off.
  const [showDreamRow] = useState(isAutoMemoryEnabled)

  // Dream status: prefer live task state (this session fired it), fall back
  // to the cross-process lock mtime.
  const isDreamRunning = useAppState(s =>
    Object.values(s.tasks).some(
      t => t.type === 'dream' && t.status === 'running',
    ),
  )
  const [lastDreamAt, setLastDreamAt] = useState<number | null>(null)
  useEffect(() => {
    if (!showDreamRow) return
    void readLastConsolidatedAt().then(setLastDreamAt)
  }, [showDreamRow, isDreamRunning])

  const dreamStatus = isDreamRunning
    ? 'running'
    : lastDreamAt === null
      ? '' // stat in flight
      : lastDreamAt === 0
        ? 'never'
        : `last ran ${formatRelativeTimeAgo(new Date(lastDreamAt))}`

  // null = Select has focus, 0 = auto-memory, 1 = auto-dream (if showDreamRow)
  const [focusedToggle, setFocusedToggle] = useState<number | null>(null)
  const toggleFocused = focusedToggle !== null
  const lastToggleIndex = showDreamRow ? 1 : 0

  function handleToggleAutoMemory(): void {
    const newValue = !autoMemoryOn
    updateSettingsForSource('userSettings', { autoMemoryEnabled: newValue })
    setAutoMemoryOn(newValue)
    logEvent('tengu_auto_memory_toggled', { enabled: newValue })
  }

  function handleToggleAutoDream(): void {
    const newValue = !autoDreamOn
    updateSettingsForSource('userSettings', { autoDreamEnabled: newValue })
    setAutoDreamOn(newValue)
    logEvent('tengu_auto_dream_toggled', { enabled: newValue })
  }

  useExitOnCtrlCDWithKeybindings()

  useKeybinding('confirm:no', onCancel, { context: 'Confirmation' })

  useKeybinding(
    'confirm:yes',
    () => {
      if (focusedToggle === 0) handleToggleAutoMemory()
      else if (focusedToggle === 1) handleToggleAutoDream()
    },
    { context: 'Confirmation', isActive: toggleFocused },
  )
  useKeybinding(
    'select:next',
    () => {
      setFocusedToggle(prev =>
        prev !== null && prev < lastToggleIndex ? prev + 1 : null,
      )
    },
    { context: 'Select', isActive: toggleFocused },
  )
  useKeybinding(
    'select:previous',
    () => {
      setFocusedToggle(prev => (prev !== null && prev > 0 ? prev - 1 : prev))
    },
    { context: 'Select', isActive: toggleFocused },
  )

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" marginBottom={1}>
        <ListItem isFocused={focusedToggle === 0}>
          <Text>Auto-memory: {autoMemoryOn ? 'on' : 'off'}</Text>
        </ListItem>
        {showDreamRow && (
          <ListItem isFocused={focusedToggle === 1} styled={false}>
            <Text color={focusedToggle === 1 ? 'suggestion' : undefined}>
              Auto-dream: {autoDreamOn ? 'on' : 'off'}
              {dreamStatus && <Text dimColor> · {dreamStatus}</Text>}
              {!isDreamRunning && autoDreamOn && (
                <Text dimColor> · /dream to run</Text>
              )}
            </Text>
          </ListItem>
        )}
      </Box>

      <Select
        defaultFocusValue={initialPath}
        options={memoryOptions}
        isDisabled={toggleFocused}
        onChange={value => {
          if (value.startsWith(OPEN_FOLDER_PREFIX)) {
            const folderPath = value.slice(OPEN_FOLDER_PREFIX.length)
            // Ensure folder exists before opening (idempotent; swallow
            // permission errors to match previous behavior)
            void mkdir(folderPath, { recursive: true })
              .catch(() => {})
              .then(() => openPath(folderPath))
            return
          }
          lastSelectedPath = value // Remember the selection
          onSelect(value)
        }}
        onCancel={onCancel}
        onUpFromFirstItem={() => setFocusedToggle(lastToggleIndex)}
      />
    </Box>
  )
}
