import React from 'react'
import { Box, Text, stringWidth } from '@anthropic/ink'
import type { NormalizedMessage } from '../types/message.js'

type Props = {
  message: NormalizedMessage
  isTranscriptMode: boolean
}

export function MessageModel({
  message,
  isTranscriptMode,
}: Props): React.ReactNode {
  const shouldShowModel =
    isTranscriptMode &&
    message.type === 'assistant' &&
    message.message.model &&
    message.message.content.some(c => c.type === 'text')

  if (!shouldShowModel) {
    return null
  }

  return (
    <Box minWidth={stringWidth(message.message.model) + 8}>
      <Text dimColor>{message.message.model}</Text>
    </Box>
  )
}
