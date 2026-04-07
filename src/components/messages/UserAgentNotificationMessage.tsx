import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { BLACK_CIRCLE } from '../../constants/figures.js'
import { Box, Text, type TextProps } from '../../ink.js'
import { extractTag } from '../../utils/messages.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

function getStatusColor(status: string | null): TextProps['color'] {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'killed':
      return 'warning'
    default:
      return 'text'
  }
}

export function UserAgentNotificationMessage({
  addMargin,
  param: { text },
}: Props): React.ReactNode {
  const summary = extractTag(text, 'summary')
  if (!summary) return null

  const status = extractTag(text, 'status')
  const color = getStatusColor(status)

  return (
    <Box marginTop={addMargin ? 1 : 0}>
      <Text>
        <Text color={color}>{BLACK_CIRCLE}</Text> {summary}
      </Text>
    </Box>
  )
}
