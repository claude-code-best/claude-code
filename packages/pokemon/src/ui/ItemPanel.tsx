import React from 'react'
import { Box, Text } from '@anthropic/ink'

interface ItemPanelProps {
  items: { id: string; name: string; count: number; description?: string }[]
  cursorIndex: number
  categoryIndex: number
  phase: 'category' | 'items'
  onSelect: (itemId: string) => void
  onCancel: () => void
}

/** Item categories */
const CATEGORIES = [
  { id: 'healing', label: '回复药', filter: (id: string) => id.includes('potion') || id.includes('berry') || id.includes('heal') },
  { id: 'ball', label: '精灵球', filter: (id: string) => id.includes('ball') },
  { id: 'battle', label: '战斗道具', filter: (id: string) => id.includes('x-') || id.includes('dire') || id.includes('guard') },
]

export function ItemPanel({ items, cursorIndex, categoryIndex, phase, onSelect, onCancel }: ItemPanelProps) {
  if (phase === 'category') {
    return (
      <Box flexDirection="column">
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="success"
          borderText={{ content: ' 背包 ', position: 'top', align: 'start' }}
          paddingX={1}
        >
          {CATEGORIES.map((cat, i) => (
            <Box key={cat.id}>
              {categoryIndex === i ? (
                <Text color="success" bold> ▶ {cat.label} </Text>
              ) : (
                <Text>   {cat.label} </Text>
              )}
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor> [ESC] 返回</Text>
        </Box>
      </Box>
    )
  }

  // Phase: items — show items in selected category
  const cat = CATEGORIES[categoryIndex]
  const filtered = cat
    ? items.filter(item => cat.filter(item.id))
    : items
  const displayItems = filtered.length > 0 ? filtered : items

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="success"
        borderText={{ content: ` ${cat?.label ?? '道具'} `, position: 'top', align: 'start' }}
        paddingX={1}
      >
        {displayItems.length === 0 ? (
          <Text dimColor> 没有可用道具</Text>
        ) : (
          displayItems.map((item, i) => (
            <Box key={item.id}>
              {cursorIndex === i ? (
                <Text color="success" bold> ▶ {item.name}</Text>
              ) : (
                <Text>   {item.name}</Text>
              )}
              <Text dimColor> ×{item.count}</Text>
            </Box>
          ))
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor> [ESC] 返回</Text>
      </Box>
    </Box>
  )
}
