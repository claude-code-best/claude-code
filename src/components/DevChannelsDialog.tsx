import React, { useCallback } from 'react'
import type { ChannelEntry } from '../bootstrap/state.js'
import { Box, Text } from '../ink.js'
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'

type Props = {
  channels: ChannelEntry[]
  onAccept(): void
}

export function DevChannelsDialog({
  channels,
  onAccept,
}: Props): React.ReactNode {
  function onChange(value: 'accept' | 'exit') {
    switch (value) {
      case 'accept':
        onAccept()
        break
      case 'exit':
        gracefulShutdownSync(1)
        break
    }
  }

  const handleEscape = useCallback(() => {
    gracefulShutdownSync(0)
  }, [])

  return (
    <Dialog
      title="WARNING: Loading development channels"
      color="error"
      onCancel={handleEscape}
    >
      <Box flexDirection="column" gap={1}>
        <Text>
          --dangerously-load-development-channels is for local channel
          development only. Do not use this option to run channels you have
          downloaded off the internet.
        </Text>
        <Text>Please use --channels to run a list of approved channels.</Text>
        <Text dimColor>
          Channels:{' '}
          {channels
            .map(c =>
              c.kind === 'plugin'
                ? `plugin:${c.name}@${c.marketplace}`
                : `server:${c.name}`,
            )
            .join(', ')}
        </Text>
      </Box>

      <Select
        options={[
          { label: 'I am using this for local development', value: 'accept' },
          { label: 'Exit', value: 'exit' },
        ]}
        onChange={value => onChange(value as 'accept' | 'exit')}
      />
    </Dialog>
  )
}
