import type { UUID } from 'crypto'
import React, { useCallback } from 'react'
import { Box, Text, Byline, KeyboardShortcutHint, LoadingState } from '@anthropic/ink'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { getAllBaseTools } from '../tools.js'
import type { LogOption } from '../types/logs.js'
import { formatRelativeTimeAgo } from '../utils/format.js'
import {
  getSessionIdFromLog,
  isLiteLog,
  loadFullLog,
} from '../utils/sessionStorage.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js'
import { Messages } from './Messages.js'

type Props = {
  log: LogOption
  onExit: () => void
  onSelect: (log: LogOption) => void
}

export function SessionPreview({
  log,
  onExit,
  onSelect,
}: Props): React.ReactNode {
  // fullLog holds the complete log with messages loaded.
  // The input `log` may be a "lite log" (empty messages array),
  // so we load the full messages on mount and store them here.
  const [fullLog, setFullLog] = React.useState<LogOption | null>(null)

  // Load full messages if this is a lite log
  React.useEffect(() => {
    setFullLog(null)
    if (isLiteLog(log)) {
      void loadFullLog(log).then(setFullLog)
    }
  }, [log])

  const isLoading = isLiteLog(log) && fullLog === null
  const displayLog = fullLog ?? log
  const conversationId = getSessionIdFromLog(displayLog) || ('' as UUID)

  // Get all base tools for preview (no permissions needed for read-only view)
  const tools = getAllBaseTools()

  // Handle keyboard input via keybindings
  useKeybinding('confirm:no', onExit, { context: 'Confirmation' })

  const handleSelect = useCallback(() => {
    onSelect(fullLog ?? log)
  }, [onSelect, fullLog, log])

  useKeybinding('confirm:yes', handleSelect, { context: 'Confirmation' })

  // Show loading state while fetching full log
  if (isLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <LoadingState message="Loading session…" />
        <Text dimColor>
          <Byline>
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="cancel"
            />
          </Byline>
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Messages
        messages={displayLog.messages}
        tools={tools}
        commands={[]}
        verbose={true}
        toolJSX={null}
        toolUseConfirmQueue={[]}
        inProgressToolUseIDs={new Set()}
        isMessageSelectorVisible={false}
        conversationId={conversationId}
        screen="transcript"
        streamingToolUses={[]}
        showAllInTranscript={true}
        isLoading={false}
      />
      <Box
        flexShrink={0}
        flexDirection="column"
        borderTopDimColor
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderStyle="single"
        paddingLeft={2}
      >
        <Text>
          {formatRelativeTimeAgo(displayLog.modified)} ·{' '}
          {displayLog.messageCount} messages
          {displayLog.gitBranch ? ` · ${displayLog.gitBranch}` : ''}
        </Text>
        <Text dimColor>
          <Byline>
            <KeyboardShortcutHint shortcut="Enter" action="resume" />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="cancel"
            />
          </Byline>
        </Text>
      </Box>
    </Box>
  )
}
