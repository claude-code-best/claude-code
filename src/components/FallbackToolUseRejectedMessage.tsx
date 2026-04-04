import * as React from 'react'
import { InterruptedByUser } from './InterruptedByUser.js'
import { MessageResponse } from './MessageResponse.js'

export function FallbackToolUseRejectedMessage(): React.ReactNode {
  return (
    <MessageResponse height={1}>
      <InterruptedByUser />
    </MessageResponse>
  )
}
