import { relative } from 'path'
import * as React from 'react'
import { getCwd } from 'src/utils/cwd.js'
import { Box, Text } from '@anthropic/ink'
import { MessageResponse } from './MessageResponse.js'

type Props = {
  file_path: string
  operation: 'write' | 'update'
  style?: 'condensed'
  verbose: boolean
}

export function FileEditToolUseRejectedMessage({
  file_path,
  operation,
  style,
  verbose,
}: Props): React.ReactNode {
  const text = (
    <Box flexDirection="row">
      <Text color="subtle">User rejected {operation} to </Text>
      <Text bold color="subtle">
        {verbose ? file_path : relative(getCwd(), file_path)}
      </Text>
    </Box>
  )

  // For condensed style, just show the text
  if (style === 'condensed' && !verbose) {
    return <MessageResponse>{text}</MessageResponse>
  }

  return <MessageResponse>{text}</MessageResponse>
}
