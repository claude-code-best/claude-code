import React from 'react'
import { Box, Text } from '../ink.js'

type Props = {
  query: string
  placeholder?: string
  isFocused: boolean
  isTerminalFocused: boolean
  prefix?: string
  width?: number | string
  cursorOffset?: number
  borderless?: boolean
}

export function SearchBox({
  query,
  placeholder = 'Search…',
  isFocused,
  isTerminalFocused,
  prefix = '⌕',
  width,
  cursorOffset,
  borderless = false,
}: Props): React.ReactNode {
  const offset = cursorOffset ?? query.length

  return (
    <Box
      flexShrink={0}
      borderStyle={borderless ? undefined : 'round'}
      borderColor={isFocused ? 'suggestion' : undefined}
      borderDimColor={!isFocused}
      paddingX={borderless ? 0 : 1}
      width={width}
    >
      <Text dimColor={!isFocused}>
        {prefix}{' '}
        {isFocused ? (
          <>
            {query ? (
              isTerminalFocused ? (
                <>
                  <Text>{query.slice(0, offset)}</Text>
                  <Text inverse>
                    {offset < query.length ? query[offset] : ' '}
                  </Text>
                  {offset < query.length && (
                    <Text>{query.slice(offset + 1)}</Text>
                  )}
                </>
              ) : (
                <Text>{query}</Text>
              )
            ) : isTerminalFocused ? (
              <>
                <Text inverse>{placeholder.charAt(0)}</Text>
                <Text dimColor>{placeholder.slice(1)}</Text>
              </>
            ) : (
              <Text dimColor>{placeholder}</Text>
            )}
          </>
        ) : query ? (
          <Text>{query}</Text>
        ) : (
          <Text>{placeholder}</Text>
        )}
      </Text>
    </Box>
  )
}
