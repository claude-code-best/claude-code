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
  const content = message.message?.content
  const contentArray = Array.isArray(content) ? content : []
  const shouldShowModel =
    isTranscriptMode &&
    message.type === 'assistant' &&
    message.message?.model &&
    contentArray.some((c: any) => c?.type === 'text')

  if (!shouldShowModel) {
    return null
  }

  const model = message.message!.model as string

  return (
    <Box minWidth={stringWidth(model) + 8}>
      <Text dimColor>{model}</Text>
    </Box>
  )
}
