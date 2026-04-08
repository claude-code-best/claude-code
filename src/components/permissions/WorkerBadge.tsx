import * as React from 'react'
import { BLACK_CIRCLE } from '../../constants/figures.js'
import { Box, Text } from '@anthropic/ink'
import { toInkColor } from '../../utils/ink.js'

export type WorkerBadgeProps = {
  name: string
  color: string
}

/**
 * Renders a colored badge showing the worker's name for permission prompts.
 * Used to indicate which swarm worker is requesting the permission.
 */
export function WorkerBadge({
  name,
  color,
}: WorkerBadgeProps): React.ReactNode {
  const inkColor = toInkColor(color)
  return (
    <Box flexDirection="row" gap={1}>
      <Text color={inkColor}>
        {BLACK_CIRCLE} <Text bold>@{name}</Text>
      </Text>
    </Box>
  )
}
