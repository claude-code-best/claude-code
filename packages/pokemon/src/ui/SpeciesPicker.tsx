import React, { useState, useMemo, useCallback } from 'react'
import { Box, Text, FuzzyPicker } from '@anthropic/ink'
import type { SpeciesId } from '../types'
import { ALL_SPECIES_IDS } from '../types'
import { getSpeciesData } from '../dex/species'

/** Pre-computed species entry for picker */
type SpeciesEntry = {
  id: SpeciesId
  name: string
  displayName: string  // zh name or English name
  dexNumber: number
  types: string[]
}

// Build all entries once (species data is cached internally by getSpeciesData)
const ALL_ENTRIES: SpeciesEntry[] = ALL_SPECIES_IDS.map(id => {
  const data = getSpeciesData(id)
  return {
    id,
    name: data.name,
    displayName: (data.names as Record<string, string>).zh ?? data.name,
    dexNumber: data.dexNumber,
    types: data.types as string[],
  }
})

/** Searchable species picker using FuzzyPicker */
export function SpeciesPicker({
  onSelect,
  onCancel,
  title = '选择精灵',
}: {
  onSelect: (speciesId: SpeciesId) => void
  onCancel: () => void
  title?: string
}) {
  const [filtered, setFiltered] = useState<SpeciesEntry[]>(ALL_ENTRIES.slice(0, 50))

  const handleQueryChange = useCallback((q: string) => {
    if (!q.trim()) {
      setFiltered(ALL_ENTRIES.slice(0, 50))
      return
    }
    const lower = q.toLowerCase()
    const matched = ALL_ENTRIES.filter(e =>
      e.id.includes(lower) ||
      e.name.toLowerCase().includes(lower) ||
      e.displayName.includes(q) ||
      String(e.dexNumber).includes(q)
    )
    setFiltered(matched.slice(0, 100))
  }, [])

  return (
    <FuzzyPicker<SpeciesEntry>
      title={title}
      placeholder="输入名称或编号搜索…"
      items={filtered}
      getKey={item => item.id}
      renderItem={(item, focused) => (
        <Box>
          <Text color={focused ? 'claude' : undefined} bold={focused}>
            #{String(item.dexNumber).padStart(3, '0')} {item.displayName}
          </Text>
          {item.displayName !== item.name && (
            <Text dimColor> {item.name}</Text>
          )}
          <Text color="inactive"> {item.types.join('/')}</Text>
        </Box>
      )}
      onQueryChange={handleQueryChange}
      onSelect={item => onSelect(item.id)}
      onCancel={onCancel}
      emptyMessage={q => `没有找到 "${q}" 相关的精灵`}
      matchLabel={filtered.length < ALL_ENTRIES.length ? `${filtered.length} 个结果` : undefined}
    />
  )
}
