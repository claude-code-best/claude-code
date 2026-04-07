import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import { extractTag } from '../../utils/messages.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

export function UserBashInputMessage({
  param: { text },
  addMargin,
}: Props): React.ReactNode {
  const input = extractTag(text, 'bash-input')
  if (!input) {
    return null
  }
  return (
    <Box
      flexDirection="row"
      marginTop={addMargin ? 1 : 0}
      backgroundColor="bashMessageBackgroundColor"
      paddingRight={1}
    >
      <Text color="bashBorder">! </Text>
      <Text color="text">{input}</Text>
    </Box>
  )
}
