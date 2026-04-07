import * as React from 'react'
import { useContext } from 'react'
import { Box, NoSelect, Text, Ratchet } from '@anthropic/ink'

type Props = {
  children: React.ReactNode
  height?: number
}

export function MessageResponse({ children, height }: Props): React.ReactNode {
  const isMessageResponse = useContext(MessageResponseContext)
  if (isMessageResponse) {
    return children
  }
  const content = (
    <MessageResponseProvider>
      <Box flexDirection="row" height={height} overflowY="hidden">
        <NoSelect fromLeftEdge flexShrink={0}>
          <Text dimColor>{'  '}⎿ &nbsp;</Text>
        </NoSelect>
        <Box flexShrink={1} flexGrow={1}>
          {children}
        </Box>
      </Box>
    </MessageResponseProvider>
  )
  if (height !== undefined) {
    return content
  }
  return <Ratchet lock="offscreen">{content}</Ratchet>
}

// This is a context that is used to determine if the message response
// is rendered as a descendant of another MessageResponse. We use it
// to avoid rendering nested ⎿ characters.
const MessageResponseContext = React.createContext(false)

function MessageResponseProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  return (
    <MessageResponseContext.Provider value={true}>
      {children}
    </MessageResponseContext.Provider>
  )
}
