import * as React from 'react'
import { Text } from '../../../ink.js'
import { MessageResponse } from '../../MessageResponse.js'

export function RejectedToolUseMessage(): React.ReactNode {
  return (
    <MessageResponse height={1}>
      <Text dimColor>Tool use rejected</Text>
    </MessageResponse>
  )
}
