import * as React from 'react'
import { BLACK_CIRCLE } from '../constants/figures.js'
import { Box, Text } from '../ink.js'
import type { Screen } from '../screens/REPL.js'
import type { NormalizedUserMessage } from '../types/message.js'
import { getUserMessageText } from '../utils/messages.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js'
import { MessageResponse } from './MessageResponse.js'

type Props = {
  message: NormalizedUserMessage
  screen: Screen
}

export function CompactSummary({ message, screen }: Props): React.ReactNode {
  const isTranscriptMode = screen === 'transcript'
  const textContent = getUserMessageText(message) || ''
  const metadata = message.summarizeMetadata

  // "Summarize from here" with metadata
  if (metadata) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Box minWidth={2}>
            <Text color="text">{BLACK_CIRCLE}</Text>
          </Box>
          <Box flexDirection="column">
            <Text bold>Summarized conversation</Text>
            {!isTranscriptMode && (
              <MessageResponse>
                <Box flexDirection="column">
                  <Text dimColor>
                    Summarized {metadata.messagesSummarized} messages{' '}
                    {metadata.direction === 'up_to'
                      ? 'up to this point'
                      : 'from this point'}
                  </Text>
                  {metadata.userContext && (
                    <Text dimColor>
                      Context: {'\u201c'}
                      {metadata.userContext}
                      {'\u201d'}
                    </Text>
                  )}
                  <Text dimColor>
                    <ConfigurableShortcutHint
                      action="app:toggleTranscript"
                      context="Global"
                      fallback="ctrl+o"
                      description="expand history"
                      parens
                    />
                  </Text>
                </Box>
              </MessageResponse>
            )}
            {isTranscriptMode && (
              <MessageResponse>
                <Text>{textContent}</Text>
              </MessageResponse>
            )}
          </Box>
        </Box>
      </Box>
    )
  }

  // Default compact summary (auto-compact)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Box minWidth={2}>
          <Text color="text">{BLACK_CIRCLE}</Text>
        </Box>
        <Box flexDirection="column">
          <Text bold>
            Compact summary
            {!isTranscriptMode && (
              <Text dimColor>
                {' '}
                <ConfigurableShortcutHint
                  action="app:toggleTranscript"
                  context="Global"
                  fallback="ctrl+o"
                  description="expand"
                  parens
                />
              </Text>
            )}
          </Text>
        </Box>
      </Box>
      {isTranscriptMode && (
        <MessageResponse>
          <Text>{textContent}</Text>
        </MessageResponse>
      )}
    </Box>
  )
}
