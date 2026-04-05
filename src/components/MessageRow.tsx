import * as React from 'react'
import type { Command } from '../commands.js'
import { Box } from '../ink.js'
import type { Screen } from '../screens/REPL.js'
import type { Tools } from '../Tool.js'
import type { RenderableMessage } from '../types/message.js'
import {
  getDisplayMessageFromCollapsed,
  getToolSearchOrReadInfo,
  getToolUseIdsFromCollapsedGroup,
  hasAnyToolInProgress,
} from '../utils/collapseReadSearch.js'
import {
  type buildMessageLookups,
  EMPTY_STRING_SET,
  getProgressMessagesFromLookup,
  getSiblingToolUseIDsFromLookup,
  getToolUseID,
} from '../utils/messages.js'
import { hasThinkingContent, Message } from './Message.js'
import { MessageModel } from './MessageModel.js'
import { shouldRenderStatically } from './Messages.js'
import { MessageTimestamp } from './MessageTimestamp.js'
import { OffscreenFreeze } from './OffscreenFreeze.js'

export type Props = {
  message: RenderableMessage
  /** Whether the previous message in renderableMessages is also a user message. */
  isUserContinuation: boolean
  /**
   * Whether there is non-skippable content after this message in renderableMessages.
   * Only needs to be accurate for `collapsed_read_search` messages — used to decide
   * if the collapsed group spinner should stay active. Pass `false` otherwise.
   */
  hasContentAfter: boolean
  tools: Tools
  commands: Command[]
  verbose: boolean
  inProgressToolUseIDs: Set<string>
  streamingToolUseIDs: Set<string>
  screen: Screen
  canAnimate: boolean
  onOpenRateLimitOptions?: () => void
  lastThinkingBlockId: string | null
  latestBashOutputUUID: string | null
  columns: number
  isLoading: boolean
  lookups: ReturnType<typeof buildMessageLookups>
}

/**
 * Scans forward from `index+1` to check if any "real" content follows. Used to
 * decide whether a collapsed read/search group should stay in its active
 * (grey dot, present-tense "Reading…") state while the query is still loading.
 *
 * Exported so Messages.tsx can compute this once per message and pass the
 * result as a boolean prop — avoids passing the full `renderableMessages` array
 * to each MessageRow (which React Compiler would pin in the fiber's memoCache,
 * accumulating every historical version of the array ≈ 1-2MB over a 7-turn session).
 */
export function hasContentAfterIndex(
  messages: RenderableMessage[],
  index: number,
  tools: Tools,
  streamingToolUseIDs: Set<string>,
): boolean {
  for (let i = index + 1; i < messages.length; i++) {
    const msg = messages[i]
    if (msg?.type === 'assistant') {
      const content = msg.message.content[0]
      if (
        content?.type === 'thinking' ||
        content?.type === 'redacted_thinking'
      ) {
        continue
      }
      if (content?.type === 'tool_use') {
        if (
          getToolSearchOrReadInfo(content.name, content.input, tools)
            .isCollapsible
        ) {
          continue
        }
        // Non-collapsible tool uses appear in syntheticStreamingToolUseMessages
        // before their ID is added to inProgressToolUseIDs. Skip while streaming
        // to avoid briefly finalizing the read group.
        if (streamingToolUseIDs.has(content.id)) {
          continue
        }
      }
      return true
    }
    if (msg?.type === 'system' || msg?.type === 'attachment') {
      continue
    }
    // Tool results arrive while the collapsed group is still being built
    if (msg?.type === 'user') {
      const content = msg.message.content[0]
      if (content?.type === 'tool_result') {
        continue
      }
    }
    // Collapsible grouped_tool_use messages arrive transiently before being
    // merged into the current collapsed group on the next render cycle
    if (msg?.type === 'grouped_tool_use') {
      const firstInput = msg.messages[0]?.message.content[0]?.input
      if (
        getToolSearchOrReadInfo(msg.toolName, firstInput, tools).isCollapsible
      ) {
        continue
      }
    }
    return true
  }
  return false
}

function MessageRowImpl({
  message: msg,
  isUserContinuation,
  hasContentAfter,
  tools,
  commands,
  verbose,
  inProgressToolUseIDs,
  streamingToolUseIDs,
  screen,
  canAnimate,
  onOpenRateLimitOptions,
  lastThinkingBlockId,
  latestBashOutputUUID,
  columns,
  isLoading,
  lookups,
}: Props): React.ReactNode {
  const isTranscriptMode = screen === 'transcript'
  const isGrouped = msg.type === 'grouped_tool_use'
  const isCollapsed = msg.type === 'collapsed_read_search'

  // A collapsed group is "active" (grey dot, present tense "Reading…") when its tools
  // are still executing OR when the overall query is still running with nothing after it.
  // hasAnyToolInProgress takes priority: if tools are running, always show active regardless
  // of what else is in the message list (avoids false finalization during parallel execution).
  const isActiveCollapsedGroup =
    isCollapsed &&
    (hasAnyToolInProgress(msg, inProgressToolUseIDs) ||
      (isLoading && !hasContentAfter))

  const displayMsg = isGrouped
    ? msg.displayMessage
    : isCollapsed
      ? getDisplayMessageFromCollapsed(msg)
      : msg

  const progressMessagesForMessage =
    isGrouped || isCollapsed ? [] : getProgressMessagesFromLookup(msg, lookups)

  const siblingToolUseIDs =
    isGrouped || isCollapsed
      ? EMPTY_STRING_SET
      : getSiblingToolUseIDsFromLookup(msg, lookups)

  const isStatic = shouldRenderStatically(
    msg,
    streamingToolUseIDs,
    inProgressToolUseIDs,
    siblingToolUseIDs,
    screen,
    lookups,
  )

  let shouldAnimate = false
  if (canAnimate) {
    if (isGrouped) {
      shouldAnimate = msg.messages.some(m => {
        const content = m.message.content[0]
        return (
          content?.type === 'tool_use' && inProgressToolUseIDs.has(content.id)
        )
      })
    } else if (isCollapsed) {
      shouldAnimate = hasAnyToolInProgress(msg, inProgressToolUseIDs)
    } else {
      const toolUseID = getToolUseID(msg)
      shouldAnimate = !toolUseID || inProgressToolUseIDs.has(toolUseID)
    }
  }

  const hasMetadata =
    isTranscriptMode &&
    displayMsg.type === 'assistant' &&
    displayMsg.message.content.some(c => c.type === 'text') &&
    (displayMsg.timestamp || displayMsg.message.model)

  const messageEl = (
    <Message
      message={msg}
      lookups={lookups}
      addMargin={!hasMetadata}
      containerWidth={hasMetadata ? undefined : columns}
      tools={tools}
      commands={commands}
      verbose={verbose}
      inProgressToolUseIDs={inProgressToolUseIDs}
      progressMessagesForMessage={progressMessagesForMessage}
      shouldAnimate={shouldAnimate}
      shouldShowDot={true}
      isTranscriptMode={isTranscriptMode}
      isStatic={isStatic}
      onOpenRateLimitOptions={onOpenRateLimitOptions}
      isActiveCollapsedGroup={isActiveCollapsedGroup}
      isUserContinuation={isUserContinuation}
      lastThinkingBlockId={lastThinkingBlockId}
      latestBashOutputUUID={latestBashOutputUUID}
    />
  )
  // OffscreenFreeze: the outer React.memo already bails for static messages,
  // so this only wraps rows that DO re-render — in-progress tools, collapsed
  // read/search spinners, bash elapsed timers. When those rows have scrolled
  // into terminal scrollback (non-fullscreen external builds), any content
  // change forces log-update.ts into a full terminal reset per tick. Freezing
  // returns the cached element ref so React bails and produces zero diff.
  if (!hasMetadata) {
    return <OffscreenFreeze>{messageEl}</OffscreenFreeze>
  }
  // Margin on children, not here — else null items (hook_success etc.) get phantom 1-row spacing.
  return (
    <OffscreenFreeze>
      <Box width={columns} flexDirection="column">
        <Box
          flexDirection="row"
          justifyContent="flex-end"
          gap={1}
          marginTop={1}
        >
          <MessageTimestamp
            message={displayMsg}
            isTranscriptMode={isTranscriptMode}
          />
          <MessageModel
            message={displayMsg}
            isTranscriptMode={isTranscriptMode}
          />
        </Box>
        {messageEl}
      </Box>
    </OffscreenFreeze>
  )
}

/**
 * Checks if a message is "streaming" - i.e., its content may still be changing.
 * Exported for testing.
 */
export function isMessageStreaming(
  msg: RenderableMessage,
  streamingToolUseIDs: Set<string>,
): boolean {
  if (msg.type === 'grouped_tool_use') {
    return msg.messages.some(m => {
      const content = m.message.content[0]
      return content?.type === 'tool_use' && streamingToolUseIDs.has(content.id)
    })
  }
  if (msg.type === 'collapsed_read_search') {
    const toolIds = getToolUseIdsFromCollapsedGroup(msg)
    return toolIds.some(id => streamingToolUseIDs.has(id))
  }
  const toolUseID = getToolUseID(msg)
  return !!toolUseID && streamingToolUseIDs.has(toolUseID)
}

/**
 * Checks if all tools in a message are resolved.
 * Exported for testing.
 */
export function allToolsResolved(
  msg: RenderableMessage,
  resolvedToolUseIDs: Set<string>,
): boolean {
  if (msg.type === 'grouped_tool_use') {
    return msg.messages.every(m => {
      const content = m.message.content[0]
      return content?.type === 'tool_use' && resolvedToolUseIDs.has(content.id)
    })
  }
  if (msg.type === 'collapsed_read_search') {
    const toolIds = getToolUseIdsFromCollapsedGroup(msg)
    return toolIds.every(id => resolvedToolUseIDs.has(id))
  }
  if (msg.type === 'assistant') {
    const block = msg.message.content[0]
    if (block?.type === 'server_tool_use') {
      return resolvedToolUseIDs.has(block.id)
    }
  }
  const toolUseID = getToolUseID(msg)
  return !toolUseID || resolvedToolUseIDs.has(toolUseID)
}

/**
 * Conservative memo comparator that only bails out when we're CERTAIN
 * the message won't change. Fails safe by re-rendering when uncertain.
 *
 * Exported for testing.
 */
export function areMessageRowPropsEqual(prev: Props, next: Props): boolean {
  // Different message reference = content may have changed, must re-render
  if (prev.message !== next.message) return false

  // Screen mode change = re-render
  if (prev.screen !== next.screen) return false

  // Verbose toggle changes thinking block visibility
  if (prev.verbose !== next.verbose) return false

  // collapsed_read_search is never static in prompt mode (matches shouldRenderStatically)
  if (
    prev.message.type === 'collapsed_read_search' &&
    next.screen !== 'transcript'
  ) {
    return false
  }

  // Width change affects Box layout
  if (prev.columns !== next.columns) return false

  // latestBashOutputUUID affects rendering (full vs truncated output)
  const prevIsLatestBash = prev.latestBashOutputUUID === prev.message.uuid
  const nextIsLatestBash = next.latestBashOutputUUID === next.message.uuid
  if (prevIsLatestBash !== nextIsLatestBash) return false

  // lastThinkingBlockId affects thinking block visibility — but only for
  // messages that HAVE thinking content. Checking unconditionally busts the
  // memo for every scrollback message whenever thinking starts/stops (CC-941).
  if (
    prev.lastThinkingBlockId !== next.lastThinkingBlockId &&
    hasThinkingContent(next.message)
  ) {
    return false
  }

  // Check if this message is still "in flight"
  const isStreaming = isMessageStreaming(prev.message, prev.streamingToolUseIDs)
  const isResolved = allToolsResolved(
    prev.message,
    prev.lookups.resolvedToolUseIDs,
  )

  // Only bail out for truly static messages
  if (isStreaming || !isResolved) return false

  // Static message - safe to skip re-render
  return true
}

export const MessageRow = React.memo(MessageRowImpl, areMessageRowPropsEqual)
