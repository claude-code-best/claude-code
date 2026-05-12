import { describe, test, expect } from 'bun:test'
import { parseLocalMemoryArgs } from '../parseArgs.js'

describe('parseLocalMemoryArgs', () => {
  test('empty string → list', () => {
    expect(parseLocalMemoryArgs('')).toEqual({ action: 'list' })
  })

  test('"list" → list', () => {
    expect(parseLocalMemoryArgs('list')).toEqual({ action: 'list' })
  })

  test('create with store name', () => {
    expect(parseLocalMemoryArgs('create my-store')).toEqual({
      action: 'create',
      store: 'my-store',
    })
  })

  test('create without store name → invalid', () => {
    expect(parseLocalMemoryArgs('create').action).toBe('invalid')
  })

  test('store with store, key, value', () => {
    expect(parseLocalMemoryArgs('store my-store my-key my value here')).toEqual(
      {
        action: 'store',
        store: 'my-store',
        key: 'my-key',
        value: 'my value here',
      },
    )
  })

  test('store without key → invalid', () => {
    expect(parseLocalMemoryArgs('store my-store').action).toBe('invalid')
  })

  test('store without value → invalid', () => {
    expect(parseLocalMemoryArgs('store my-store my-key').action).toBe('invalid')
  })

  test('fetch with store and key', () => {
    expect(parseLocalMemoryArgs('fetch notes hello')).toEqual({
      action: 'fetch',
      store: 'notes',
      key: 'hello',
    })
  })

  test('fetch without key → invalid', () => {
    expect(parseLocalMemoryArgs('fetch notes').action).toBe('invalid')
  })

  test('entries with store name', () => {
    expect(parseLocalMemoryArgs('entries my-store')).toEqual({
      action: 'entries',
      store: 'my-store',
    })
  })

  test('entries without store name → invalid', () => {
    expect(parseLocalMemoryArgs('entries').action).toBe('invalid')
  })

  test('archive with store name', () => {
    expect(parseLocalMemoryArgs('archive old-store')).toEqual({
      action: 'archive',
      store: 'old-store',
    })
  })

  test('archive without store name → invalid', () => {
    expect(parseLocalMemoryArgs('archive').action).toBe('invalid')
  })

  test('unknown sub-command → invalid with reason', () => {
    const result = parseLocalMemoryArgs('frobnicate')
    expect(result.action).toBe('invalid')
    if (result.action === 'invalid') {
      expect(result.reason).toContain('frobnicate')
    }
  })

  test('"list" with trailing args still returns list action', () => {
    // 'list extra' bypasses the short-circuit on line 33 and hits the
    // tokens-based branch on line 41-43.
    expect(parseLocalMemoryArgs('list extra-arg')).toEqual({ action: 'list' })
  })

  test('store sub-command with no args → invalid (missing store name)', () => {
    const r = parseLocalMemoryArgs('store')
    expect(r.action).toBe('invalid')
    if (r.action === 'invalid') {
      expect(r.reason).toContain('store name')
    }
  })

  test('fetch sub-command with no args → invalid (missing store name)', () => {
    const r = parseLocalMemoryArgs('fetch')
    expect(r.action).toBe('invalid')
    if (r.action === 'invalid') {
      expect(r.reason).toContain('store name')
    }
  })
})
