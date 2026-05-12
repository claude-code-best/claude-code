import { mock, describe, expect, test } from 'bun:test'

mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: () => false,
}))

const {
  filterPermissionRelayClients,
  shortRequestId,
  truncateForPreview,
  PERMISSION_REPLY_RE,
  createChannelPermissionCallbacks,
} = await import('../channelPermissions')

describe('shortRequestId', () => {
  test('returns 5-char string from tool use ID', () => {
    const result = shortRequestId('toolu_abc123')
    expect(result).toHaveLength(5)
  })

  test('is deterministic (same input = same output)', () => {
    const a = shortRequestId('toolu_abc123')
    const b = shortRequestId('toolu_abc123')
    expect(a).toBe(b)
  })

  test('different inputs produce different outputs', () => {
    const a = shortRequestId('toolu_aaa')
    const b = shortRequestId('toolu_bbb')
    expect(a).not.toBe(b)
  })

  test("result contains only valid letters (no 'l')", () => {
    const validChars = new Set('abcdefghijkmnopqrstuvwxyz')
    for (let i = 0; i < 50; i++) {
      const result = shortRequestId(`toolu_${i}`)
      for (const ch of result) {
        expect(validChars.has(ch)).toBe(true)
      }
    }
  })

  test('handles empty string', () => {
    const result = shortRequestId('')
    expect(result).toHaveLength(5)
  })
})

describe('truncateForPreview', () => {
  test('returns JSON string for object input', () => {
    const result = truncateForPreview({ key: 'value' })
    expect(result).toBe('{"key":"value"}')
  })

  test('truncates to <=200 chars with ellipsis when input is long', () => {
    const longObj = { data: 'x'.repeat(300) }
    const result = truncateForPreview(longObj)
    expect(result.length).toBeLessThanOrEqual(203) // 200 + '…'
    expect(result.endsWith('…')).toBe(true)
  })

  test('returns short input unchanged', () => {
    const result = truncateForPreview({ a: 1 })
    expect(result).toBe('{"a":1}')
    expect(result.endsWith('…')).toBe(false)
  })

  test('handles string input', () => {
    const result = truncateForPreview('hello')
    expect(result).toBe('"hello"')
  })

  test('handles null input', () => {
    const result = truncateForPreview(null)
    expect(result).toBe('null')
  })

  test('handles undefined input', () => {
    const result = truncateForPreview(undefined)
    // JSON.stringify(undefined) returns undefined, then .length throws → catch returns '(unserializable)'
    expect(result).toBe('(unserializable)')
  })
})

describe('PERMISSION_REPLY_RE', () => {
  test("matches 'y abcde'", () => {
    expect(PERMISSION_REPLY_RE.test('y abcde')).toBe(true)
  })

  test("matches 'yes abcde'", () => {
    expect(PERMISSION_REPLY_RE.test('yes abcde')).toBe(true)
  })

  test("matches 'n abcde'", () => {
    expect(PERMISSION_REPLY_RE.test('n abcde')).toBe(true)
  })

  test("matches 'no abcde'", () => {
    expect(PERMISSION_REPLY_RE.test('no abcde')).toBe(true)
  })

  test('is case-insensitive', () => {
    expect(PERMISSION_REPLY_RE.test('Y abcde')).toBe(true)
    expect(PERMISSION_REPLY_RE.test('YES abcde')).toBe(true)
  })

  test('does not match without ID', () => {
    expect(PERMISSION_REPLY_RE.test('yes')).toBe(false)
  })

  test('captures the ID from reply', () => {
    const match = 'y abcde'.match(PERMISSION_REPLY_RE)
    expect(match?.[2]).toBe('abcde')
  })
})

describe('createChannelPermissionCallbacks', () => {
  test('resolve returns false for unknown request ID', () => {
    const cb = createChannelPermissionCallbacks()
    expect(cb.resolve('unknown-id', 'allow', 'server')).toBe(false)
  })

  test('onResponse + resolve triggers handler', () => {
    const cb = createChannelPermissionCallbacks()
    let received: any = null
    cb.onResponse('test-id', response => {
      received = response
    })
    expect(cb.resolve('test-id', 'allow', 'test-server')).toBe(true)
    expect(received).toEqual({
      behavior: 'allow',
      fromServer: 'test-server',
    })
  })

  test('onResponse unsubscribe prevents resolve', () => {
    const cb = createChannelPermissionCallbacks()
    let called = false
    const unsub = cb.onResponse('test-id', () => {
      called = true
    })
    unsub()
    expect(cb.resolve('test-id', 'allow', 'server')).toBe(false)
    expect(called).toBe(false)
  })

  test('duplicate resolve returns false (already consumed)', () => {
    const cb = createChannelPermissionCallbacks()
    cb.onResponse('test-id', () => {})
    expect(cb.resolve('test-id', 'allow', 'server')).toBe(true)
    expect(cb.resolve('test-id', 'allow', 'server')).toBe(false)
  })

  test('is case-insensitive for request IDs', () => {
    const cb = createChannelPermissionCallbacks()
    let received: any = null
    cb.onResponse('ABC', response => {
      received = response
    })
    expect(cb.resolve('abc', 'deny', 'server')).toBe(true)
    expect(received?.behavior).toBe('deny')
  })
})

describe('filterPermissionRelayClients', () => {
  test('requires truthy permission capability', () => {
    const clients = [
      {
        type: 'connected',
        name: 'plugin:weixin:weixin',
        capabilities: {
          experimental: {
            'claude/channel': {},
            'claude/channel/permission': false,
          },
        },
      },
      {
        type: 'connected',
        name: 'plugin:telegram:telegram',
        capabilities: {
          experimental: {
            'claude/channel': {},
            'claude/channel/permission': {},
          },
        },
      },
    ]

    expect(
      filterPermissionRelayClients(clients, () => true).map(
        client => client.name,
      ),
    ).toEqual(['plugin:telegram:telegram'])
  })
})
