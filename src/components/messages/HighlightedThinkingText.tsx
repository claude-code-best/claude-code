import figures from 'figures'
import * as React from 'react'
import { useContext } from 'react'
import { useQueuedMessage } from '../../context/QueuedMessageContext.js'
import { Box, Text } from '../../ink.js'
import { formatBriefTimestamp } from '../../utils/formatBriefTimestamp.js'
import {
  findThinkingTriggerPositions,
  getRainbowColor,
  isUltrathinkEnabled,
} from '../../utils/thinking.js'
import { MessageActionsSelectedContext } from '../messageActions.js'

type Props = {
  text: string
  useBriefLayout?: boolean
  timestamp?: string
}

export function HighlightedThinkingText({
  text,
  useBriefLayout,
  timestamp,
}: Props): React.ReactNode {
  // Brief/assistant mode: chat-style "You" label instead of the ❯ highlight.
  // Parent drops its backgroundColor when this is true, so no grey shows
  // through. No manual wrap needed — Ink wraps inside the parent Box.
  const isQueued = useQueuedMessage()?.isQueued ?? false
  const isSelected = useContext(MessageActionsSelectedContext)
  const pointerColor = isSelected ? 'suggestion' : 'subtle'
  if (useBriefLayout) {
    const ts = timestamp ? formatBriefTimestamp(timestamp) : ''
    return (
      <Box flexDirection="column" paddingLeft={2}>
        <Box flexDirection="row">
          <Text color={isQueued ? 'subtle' : 'briefLabelYou'}>You</Text>
          {ts ? <Text dimColor> {ts}</Text> : null}
        </Box>
        <Text color={isQueued ? 'subtle' : 'text'}>{text}</Text>
      </Box>
    )
  }

  const triggers = isUltrathinkEnabled()
    ? findThinkingTriggerPositions(text)
    : []

  if (triggers.length === 0) {
    return (
      <Text>
        <Text color={pointerColor}>{figures.pointer} </Text>
        <Text color="text">{text}</Text>
      </Text>
    )
  }

  // Static rainbow (no shimmer — transcript messages don't animate)
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const t of triggers) {
    if (t.start > cursor) {
      parts.push(
        <Text key={`plain-${cursor}`} color="text">
          {text.slice(cursor, t.start)}
        </Text>,
      )
    }
    for (let i = t.start; i < t.end; i++) {
      parts.push(
        <Text key={`rb-${i}`} color={getRainbowColor(i - t.start)}>
          {text[i]}
        </Text>,
      )
    }
    cursor = t.end
  }
  if (cursor < text.length) {
    parts.push(
      <Text key={`plain-${cursor}`} color="text">
        {text.slice(cursor)}
      </Text>,
    )
  }

  return (
    <Text>
      <Text color={pointerColor}>{figures.pointer} </Text>
      {parts}
    </Text>
  )
}
