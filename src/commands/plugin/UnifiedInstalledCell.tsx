import figures from 'figures'
import * as React from 'react'
import { Box, color, Text, useTheme } from '@anthropic/ink'
import { plural } from '../../utils/stringUtils.js'
import type { UnifiedInstalledItem } from './unifiedTypes.js'

type Props = {
  item: UnifiedInstalledItem
  isSelected: boolean
}

export function UnifiedInstalledCell({
  item,
  isSelected,
}: Props): React.ReactNode {
  const [theme] = useTheme()

  if (item.type === 'plugin') {
    // Status icon and text
    let statusIcon: string
    let statusText: string

    // Show pending toggle status if set, otherwise show current status
    if (item.pendingToggle) {
      statusIcon = color('suggestion', theme)(figures.arrowRight)
      statusText =
        item.pendingToggle === 'will-enable' ? 'will enable' : 'will disable'
    } else if (item.errorCount > 0) {
      statusIcon = color('error', theme)(figures.cross)
      statusText = `${item.errorCount} ${plural(item.errorCount, 'error')}`
    } else if (!item.isEnabled) {
      statusIcon = color('inactive', theme)(figures.radioOff)
      statusText = 'disabled'
    } else {
      statusIcon = color('success', theme)(figures.tick)
      statusText = 'enabled'
    }

    return (
      <Box>
        <Text color={isSelected ? 'suggestion' : undefined}>
          {isSelected ? `${figures.pointer} ` : '  '}
        </Text>
        <Text color={isSelected ? 'suggestion' : undefined}>{item.name}</Text>
        <Text dimColor={!isSelected}>
          {' '}
          <Text backgroundColor="userMessageBackground">Plugin</Text>
        </Text>
        <Text dimColor> · {item.marketplace}</Text>
        <Text dimColor={!isSelected}> · {statusIcon} </Text>
        <Text dimColor={!isSelected}>{statusText}</Text>
      </Box>
    )
  }

  if (item.type === 'flagged-plugin') {
    const statusIcon = color('warning', theme)(figures.warning)

    return (
      <Box>
        <Text color={isSelected ? 'suggestion' : undefined}>
          {isSelected ? `${figures.pointer} ` : '  '}
        </Text>
        <Text color={isSelected ? 'suggestion' : undefined}>{item.name}</Text>
        <Text dimColor={!isSelected}>
          {' '}
          <Text backgroundColor="userMessageBackground">Plugin</Text>
        </Text>
        <Text dimColor> · {item.marketplace}</Text>
        <Text dimColor={!isSelected}> · {statusIcon} </Text>
        <Text dimColor={!isSelected}>removed</Text>
      </Box>
    )
  }

  if (item.type === 'failed-plugin') {
    const statusIcon = color('error', theme)(figures.cross)
    const statusText = `failed to load · ${item.errorCount} ${plural(item.errorCount, 'error')}`

    return (
      <Box>
        <Text color={isSelected ? 'suggestion' : undefined}>
          {isSelected ? `${figures.pointer} ` : '  '}
        </Text>
        <Text color={isSelected ? 'suggestion' : undefined}>{item.name}</Text>
        <Text dimColor={!isSelected}>
          {' '}
          <Text backgroundColor="userMessageBackground">Plugin</Text>
        </Text>
        <Text dimColor> · {item.marketplace}</Text>
        <Text dimColor={!isSelected}> · {statusIcon} </Text>
        <Text dimColor={!isSelected}>{statusText}</Text>
      </Box>
    )
  }

  // MCP server
  let statusIcon: string
  let statusText: string

  if (item.status === 'connected') {
    statusIcon = color('success', theme)(figures.tick)
    statusText = 'connected'
  } else if (item.status === 'disabled') {
    statusIcon = color('inactive', theme)(figures.radioOff)
    statusText = 'disabled'
  } else if (item.status === 'pending') {
    statusIcon = color('inactive', theme)(figures.radioOff)
    statusText = 'connecting…'
  } else if (item.status === 'needs-auth') {
    statusIcon = color('warning', theme)(figures.triangleUpOutline)
    statusText = 'Enter to auth'
  } else {
    statusIcon = color('error', theme)(figures.cross)
    statusText = 'failed'
  }

  // Indented MCPs (child of a plugin)
  if (item.indented) {
    return (
      <Box>
        <Text color={isSelected ? 'suggestion' : undefined}>
          {isSelected ? `${figures.pointer} ` : '  '}
        </Text>
        <Text dimColor={!isSelected}>└ </Text>
        <Text color={isSelected ? 'suggestion' : undefined}>{item.name}</Text>
        <Text dimColor={!isSelected}>
          {' '}
          <Text backgroundColor="userMessageBackground">MCP</Text>
        </Text>
        <Text dimColor={!isSelected}> · {statusIcon} </Text>
        <Text dimColor={!isSelected}>{statusText}</Text>
      </Box>
    )
  }

  return (
    <Box>
      <Text color={isSelected ? 'suggestion' : undefined}>
        {isSelected ? `${figures.pointer} ` : '  '}
      </Text>
      <Text color={isSelected ? 'suggestion' : undefined}>{item.name}</Text>
      <Text dimColor={!isSelected}>
        {' '}
        <Text backgroundColor="userMessageBackground">MCP</Text>
      </Text>
      <Text dimColor={!isSelected}> · {statusIcon} </Text>
      <Text dimColor={!isSelected}>{statusText}</Text>
    </Box>
  )
}
