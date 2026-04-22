import React from 'react'
import { Box, Text } from '@anthropic/ink'

const CYAN = 'ansi:cyan'
const GRAY = 'ansi:white'

interface ItemPanelProps {
  items: { id: string; name: string; count: number; description?: string }[]
  onSelect: (itemId: string) => void
  onCancel: () => void
}

export function ItemPanel({ items, onSelect, onCancel }: ItemPanelProps) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold color={CYAN}> 道具 </Text>
      {items.length === 0 ? (
        <Text color={GRAY}>  没有可用道具</Text>
      ) : (
        items.map((item, i) => (
          <Box key={item.id}>
            <Text>  [{i + 1}] {item.name} ×{item.count}</Text>
            {item.description && <Text color={GRAY}> {item.description}</Text>}
          </Box>
        ))
      )}
      <Box marginTop={1}>
        <Text color={GRAY}>  [ESC] 取消</Text>
      </Box>
    </Box>
  )
}
