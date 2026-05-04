import { describe, expect, test } from 'bun:test'
import { findToolByName, toolMatchesName } from '../registry.js'
import type { CoreTool, Tools } from '../types.js'

describe('toolMatchesName', () => {
  test('matches primary name', () => {
    expect(toolMatchesName({ name: 'bash' }, 'bash')).toBe(true)
  })

  test('does not match different name', () => {
    expect(toolMatchesName({ name: 'bash' }, 'read')).toBe(false)
  })

  test('matches alias', () => {
    expect(
      toolMatchesName({ name: 'bash', aliases: ['shell', 'sh'] }, 'shell'),
    ).toBe(true)
    expect(
      toolMatchesName({ name: 'bash', aliases: ['shell', 'sh'] }, 'sh'),
    ).toBe(true)
  })

  test('handles empty aliases', () => {
    expect(toolMatchesName({ name: 'bash', aliases: [] }, 'bash')).toBe(true)
    expect(toolMatchesName({ name: 'bash', aliases: [] }, 'shell')).toBe(false)
  })

  test('handles undefined aliases', () => {
    expect(toolMatchesName({ name: 'bash' }, 'bash')).toBe(true)
    expect(toolMatchesName({ name: 'bash' }, 'shell')).toBe(false)
  })
})

describe('findToolByName', () => {
  const tools: Tools = [
    { name: 'bash' } as CoreTool,
    { name: 'read', aliases: ['cat'] } as CoreTool,
    { name: 'write', aliases: ['edit'] } as CoreTool,
  ]

  test('finds tool by primary name', () => {
    expect(findToolByName(tools, 'bash')?.name).toBe('bash')
  })

  test('finds tool by alias', () => {
    expect(findToolByName(tools, 'cat')?.name).toBe('read')
    expect(findToolByName(tools, 'edit')?.name).toBe('write')
  })

  test('returns undefined for unknown name', () => {
    expect(findToolByName(tools, 'unknown')).toBeUndefined()
  })

  test('handles empty tools array', () => {
    expect(findToolByName([], 'bash')).toBeUndefined()
  })

  test('returns first match for duplicate names', () => {
    const dupTools: Tools = [
      { name: 'tool', aliases: ['a'] } as CoreTool,
      { name: 'tool', aliases: ['b'] } as CoreTool,
    ]
    const found = findToolByName(dupTools, 'tool')
    expect(found).toBeDefined()
    expect(found!.aliases).toContain('a')
  })
})
