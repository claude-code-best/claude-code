import { describe, expect, test } from 'bun:test'

// findChannelEntry extracted from ../channelNotification.ts (line 161)
// Copied to avoid heavy import chain

type ChannelEntry = {
  kind: 'server' | 'plugin'
  name: string
}

function findChannelEntry(
  serverName: string,
  channels: readonly ChannelEntry[],
): ChannelEntry | undefined {
  const parts = serverName.split(':')
  return channels.find(c =>
    c.kind === 'server'
      ? serverName === c.name
      : parts[0] === 'plugin' && parts[1] === c.name,
  )
}

describe('findChannelEntry', () => {
  test('finds server entry by exact name match', () => {
    const channels = [{ kind: 'server' as const, name: 'my-server' }]
    expect(findChannelEntry('my-server', channels)).toBeDefined()
    expect(findChannelEntry('my-server', channels)!.name).toBe('my-server')
  })

  test('finds plugin entry by matching second segment', () => {
    const channels = [{ kind: 'plugin' as const, name: 'slack' }]
    expect(findChannelEntry('plugin:slack:tg', channels)).toBeDefined()
  })

  test('returns undefined for no match', () => {
    const channels = [{ kind: 'server' as const, name: 'other' }]
    expect(findChannelEntry('my-server', channels)).toBeUndefined()
  })

  test('handles empty channels array', () => {
    expect(findChannelEntry('my-server', [])).toBeUndefined()
  })

  test('handles server name without colon', () => {
    const channels = [{ kind: 'server' as const, name: 'simple' }]
    expect(findChannelEntry('simple', channels)).toBeDefined()
  })

  test("handles 'plugin:name' format correctly", () => {
    const channels = [{ kind: 'plugin' as const, name: 'slack' }]
    expect(findChannelEntry('plugin:slack:tg', channels)).toBeDefined()
    expect(findChannelEntry('plugin:discord:tg', channels)).toBeUndefined()
  })

  test('prefers exact match (server kind) over partial match', () => {
    const channels = [
      { kind: 'server' as const, name: 'plugin:slack' },
      { kind: 'plugin' as const, name: 'slack' },
    ]
    const result = findChannelEntry('plugin:slack', channels)
    expect(result).toBeDefined()
    expect(result!.kind).toBe('server')
  })

  test('plugin kind does not match bare name', () => {
    const channels = [{ kind: 'plugin' as const, name: 'slack' }]
    expect(findChannelEntry('slack', channels)).toBeUndefined()
  })
})
