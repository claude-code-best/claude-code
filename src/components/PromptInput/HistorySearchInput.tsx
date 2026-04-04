import * as React from 'react'
import { stringWidth } from '../../ink/stringWidth.js'
import { Box, Text } from '../../ink.js'
import TextInput from '../TextInput.js'

type Props = {
  value: string
  onChange: (value: string) => void
  historyFailedMatch: boolean
}

function HistorySearchInput({
  value,
  onChange,
  historyFailedMatch,
}: Props): React.ReactNode {
  return (
    <Box gap={1}>
      <Text dimColor>
        {historyFailedMatch ? 'no matching prompt:' : 'search prompts:'}
      </Text>
      <TextInput
        value={value}
        onChange={onChange}
        // Force cursor to end of search input since navigation should cancel search
        cursorOffset={value.length}
        onChangeCursorOffset={() => {}}
        columns={stringWidth(value) + 1}
        focus={true}
        showCursor={true}
        multiline={false}
        dimColor={true}
      />
    </Box>
  )
}

export default HistorySearchInput
