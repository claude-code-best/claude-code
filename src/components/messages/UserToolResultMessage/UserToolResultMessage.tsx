import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import type { Tools } from '../../../Tool.js'
import type {
  NormalizedUserMessage,
  ProgressMessage,
} from '../../../types/message.js'
import {
  type buildMessageLookups,
  CANCEL_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  REJECT_MESSAGE,
} from '../../../utils/messages.js'
import { UserToolCanceledMessage } from './UserToolCanceledMessage.js'
import { UserToolErrorMessage } from './UserToolErrorMessage.js'
import { UserToolRejectMessage } from './UserToolRejectMessage.js'
import { UserToolSuccessMessage } from './UserToolSuccessMessage.js'
import { useGetToolFromMessages } from './utils.js'

type Props = {
  param: ToolResultBlockParam
  message: NormalizedUserMessage
  lookups: ReturnType<typeof buildMessageLookups>
  progressMessagesForMessage: ProgressMessage[]
  style?: 'condensed'
  tools: Tools
  verbose: boolean
  width: number | string
  isTranscriptMode?: boolean
}

export function UserToolResultMessage({
  param,
  message,
  lookups,
  progressMessagesForMessage,
  style,
  tools,
  verbose,
  width,
  isTranscriptMode,
}: Props): React.ReactNode {
  const toolUse = useGetToolFromMessages(param.tool_use_id, tools, lookups)
  if (!toolUse) {
    return null
  }

  if (
    typeof param.content === 'string' &&
    param.content.startsWith(CANCEL_MESSAGE)
  ) {
    return <UserToolCanceledMessage />
  }

  if (
    (typeof param.content === 'string' &&
      param.content.startsWith(REJECT_MESSAGE)) ||
    param.content === INTERRUPT_MESSAGE_FOR_TOOL_USE
  ) {
    return (
      <UserToolRejectMessage
        input={toolUse.toolUse.input as { [key: string]: unknown }}
        progressMessagesForMessage={progressMessagesForMessage}
        tool={toolUse.tool}
        tools={tools}
        lookups={lookups}
        style={style}
        verbose={verbose}
        isTranscriptMode={isTranscriptMode}
      />
    )
  }

  if (param.is_error) {
    return (
      <UserToolErrorMessage
        progressMessagesForMessage={progressMessagesForMessage}
        tool={toolUse.tool}
        tools={tools}
        param={param}
        verbose={verbose}
        isTranscriptMode={isTranscriptMode}
      />
    )
  }

  return (
    <UserToolSuccessMessage
      message={message}
      lookups={lookups}
      toolUseID={toolUse.toolUse.id}
      progressMessagesForMessage={progressMessagesForMessage}
      style={style}
      tool={toolUse.tool}
      tools={tools}
      verbose={verbose}
      width={width}
      isTranscriptMode={isTranscriptMode}
    />
  )
}
