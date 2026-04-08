import * as React from 'react'
import { Text } from '@anthropic/ink'
import { MessageResponse } from '../../MessageResponse.js'

export function RejectedToolUseMessage(): React.ReactNode {
  return (
    <MessageResponse height={1}>
      <Text dimColor>Tool use rejected</Text>
    </MessageResponse>
  )
}
