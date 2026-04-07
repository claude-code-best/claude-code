import React from 'react'
import { stringWidth } from '../ink/stringWidth.js'
import { Box, Text } from '../ink.js'
import type { NormalizedMessage } from '../types/message.js'

type Props = {
  message: NormalizedMessage
  isTranscriptMode: boolean
}

export function MessageTimestamp({
  message,
  isTranscriptMode,
}: Props): React.ReactNode {
  const shouldShowTimestamp =
    isTranscriptMode &&
    message.timestamp &&
    message.type === 'assistant' &&
    message.message.content.some(c => c.type === 'text')

  if (!shouldShowTimestamp) {
    return null
  }

  const formattedTimestamp = new Date(message.timestamp).toLocaleTimeString(
    'en-US',
    {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    },
  )

  return (
    <Box minWidth={stringWidth(formattedTimestamp)}>
      <Text dimColor>{formattedTimestamp}</Text>
    </Box>
  )
}
