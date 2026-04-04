import React from 'react'
import { Box, Text } from '../../ink.js'

type Props = {
  addMargin: boolean
}

export function AssistantRedactedThinkingMessage({
  addMargin = false,
}: Props): React.ReactNode {
  return (
    <Box marginTop={addMargin ? 1 : 0}>
      <Text dimColor italic>
        ✻ Thinking…
      </Text>
    </Box>
  )
}
