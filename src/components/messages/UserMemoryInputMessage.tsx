import sample from 'lodash-es/sample.js'
import * as React from 'react'
import { useMemo } from 'react'
import { Box, Text } from '@anthropic/ink'
import { extractTag } from '../../utils/messages.js'
import { MessageResponse } from '../MessageResponse.js'

function getSavingMessage(): string {
  return sample(['Got it.', 'Good to know.', 'Noted.'])
}

type Props = {
  addMargin: boolean
  text: string
}

export function UserMemoryInputMessage({
  text,
  addMargin,
}: Props): React.ReactNode {
  const input = extractTag(text, 'user-memory-input')
  const savingText = useMemo(() => getSavingMessage(), [])

  if (!input) {
    return null
  }

  return (
    <Box flexDirection="column" marginTop={addMargin ? 1 : 0} width="100%">
      <Box>
        <Text color="remember" backgroundColor="memoryBackgroundColor">
          #
        </Text>
        <Text backgroundColor="memoryBackgroundColor" color="text">
          {' '}
          {input}{' '}
        </Text>
      </Box>
      <MessageResponse height={1}>
        <Text dimColor>{savingText}</Text>
      </MessageResponse>
    </Box>
  )
}
