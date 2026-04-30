import type {
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages.mjs'
import * as React from 'react'
import {
  filterToolProgressMessages,
  findToolByName,
  type Tools,
} from '../../Tool.js'
import type { GroupedToolUseMessage } from '../../types/message.js'
import type { buildMessageLookups } from '../../utils/messages.js'

type Props = {
  message: GroupedToolUseMessage
  tools: Tools
  lookups: ReturnType<typeof buildMessageLookups>
  inProgressToolUseIDs: Set<string>
  shouldAnimate: boolean
}

export function GroupedToolUseContent({
  message,
  tools,
  lookups,
  inProgressToolUseIDs,
  shouldAnimate,
}: Props): React.ReactNode {
  const tool = findToolByName(tools, message.toolName)
  if (!tool?.renderGroupedToolUse) {
    return null
  }

  // Build a map from tool_use_id to result data
  const resultsByToolUseId = new Map<
    string,
    { param: ToolResultBlockParam; output: unknown }
  >()
  for (const resultMsg of message.results) {
    for (const _content of resultMsg.message?.content ?? []) {
      const content = _content as unknown as Record<string, unknown>
      if (content.type === 'tool_result') {
        resultsByToolUseId.set(content.tool_use_id as string, {
          param: content as unknown as ToolResultBlockParam,
          output: resultMsg.toolUseResult,
        })
      }
    }
  }

  const toolUsesData = message.messages.map(msg => {
    const _content = (msg.message?.content ?? [])[0] as unknown as Record<string, unknown>
    const id = _content.id as string
    const result = resultsByToolUseId.get(id)
    return {
      param: _content as unknown as ToolUseBlockParam,
      isResolved: lookups.resolvedToolUseIDs.has(id),
      isError: lookups.erroredToolUseIDs.has(id),
      isInProgress: inProgressToolUseIDs.has(id),
      progressMessages: filterToolProgressMessages(
        lookups.progressMessagesByToolUseID.get(id) ?? [],
      ),
      result,
    }
  })

  const anyInProgress = toolUsesData.some(d => d.isInProgress)

  return tool.renderGroupedToolUse(toolUsesData, {
    shouldAnimate: shouldAnimate && anyInProgress,
    tools,
  })
}
