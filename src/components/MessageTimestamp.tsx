import React from 'react'
import { Box, Text, stringWidth } from '@anthropic/ink'
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
    (Array.isArray(message.message.content) ? (message.message.content as {type: string}[]).some(c => c.type === 'text') : false)

  if (!shouldShowTimestamp) {
    return null
  }

  const formattedTimestamp = new Date(message.timestamp as string | number | Date).toLocaleTimeString(
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
