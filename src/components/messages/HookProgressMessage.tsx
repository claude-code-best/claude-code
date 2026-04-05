import * as React from 'react'
import type { HookEvent } from 'src/entrypoints/agentSdkTypes.js'
import type { buildMessageLookups } from 'src/utils/messages.js'
import { Box, Text } from '../../ink.js'
import { MessageResponse } from '../MessageResponse.js'

type Props = {
  hookEvent: HookEvent
  lookups: ReturnType<typeof buildMessageLookups>
  toolUseID: string
  verbose: boolean
  isTranscriptMode?: boolean
}

export function HookProgressMessage({
  hookEvent,
  lookups,
  toolUseID,
  isTranscriptMode,
}: Props): React.ReactNode {
  const inProgressHookCount =
    lookups.inProgressHookCounts.get(toolUseID)?.get(hookEvent) ?? 0
  const resolvedHookCount =
    lookups.resolvedHookCounts.get(toolUseID)?.get(hookEvent) ?? 0
  if (inProgressHookCount === 0) {
    return null
  }

  if (hookEvent === 'PreToolUse' || hookEvent === 'PostToolUse') {
    // In transcript mode, show a static summary since messages never re-render
    // (so a transient "Running..." would get stuck).
    if (isTranscriptMode) {
      return (
        <MessageResponse>
          <Box flexDirection="row">
            <Text dimColor>{inProgressHookCount} </Text>
            <Text dimColor bold>
              {hookEvent}
            </Text>
            <Text dimColor>
              {inProgressHookCount === 1 ? ' hook' : ' hooks'} ran
            </Text>
          </Box>
        </MessageResponse>
      )
    }
    // Outside transcript mode, hide — completion info is shown via
    // async_hook_response attachments instead.
    return null
  }

  if (resolvedHookCount === inProgressHookCount) {
    return null
  }

  return (
    <MessageResponse>
      <Box flexDirection="row">
        <Text dimColor>Running </Text>
        <Text dimColor bold>
          {hookEvent}
        </Text>
        <Text dimColor>{inProgressHookCount === 1 ? ' hook…' : ' hooks…'}</Text>
      </Box>
    </MessageResponse>
  )
}
