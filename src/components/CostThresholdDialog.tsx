import React from 'react'
import { Box, Dialog, Link, Text } from '@anthropic/ink'
import { Select } from './CustomSelect/index.js'

type Props = {
  onDone: () => void
}

export function CostThresholdDialog({ onDone }: Props): React.ReactNode {
  return (
    <Dialog
      title="You've spent $5 on the Anthropic API this session."
      onCancel={onDone}
    >
      <Box flexDirection="column">
        <Text>Learn more about how to monitor your spending:</Text>
        <Link url="https://code.claude.com/docs/en/costs" />
      </Box>
      <Select
        options={[
          {
            value: 'ok',
            label: 'Got it, thanks!',
          },
        ]}
        onChange={onDone}
      />
    </Dialog>
  )
}
