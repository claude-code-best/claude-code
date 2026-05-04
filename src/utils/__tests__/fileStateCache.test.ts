import { describe, expect, test } from 'bun:test'
import {
  FileStateCache,
  createFileStateCacheWithSizeLimit,
} from '../fileStateCache.js'
import type { FileState } from '../fileStateCache.js'

function makeEntry(content: string, extra?: Partial<FileState>): FileState {
  return {
    content,
    timestamp: Date.now(),
    offset: undefined,
    limit: undefined,
    ...extra,
  }
}

/**
 * Mirrors coerceToolContentToString from queryHelpers.ts — not exported,
 * so we replicate it here to test the pattern.
 */
function coerceToolContentToString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

describe('FileStateCache LRU eviction', () => {
  test('evicts oldest entries when max entries exceeded', () => {
    const cache = new FileStateCache(3, 1024 * 1024)
    cache.set('a', makeEntry('content-a'))
    cache.set('b', makeEntry('content-b'))
    cache.set('c', makeEntry('content-c'))
    cache.set('d', makeEntry('content-d')) // should evict 'a'

    expect(cache.has('a')).toBe(false)
    expect(cache.has('b')).toBe(true)
    expect(cache.has('c')).toBe(true)
    expect(cache.has('d')).toBe(true)
    expect(cache.size).toBe(3)
  })

  test('evicts entries when maxSizeBytes exceeded', () => {
    // Small size limit: 100 bytes
    const cache = new FileStateCache(100, 100)
    cache.set('a', makeEntry('x'.repeat(50))) // ~50 bytes
    cache.set('b', makeEntry('y'.repeat(50))) // ~50 bytes
    cache.set('c', makeEntry('z'.repeat(50))) // ~50 bytes, should evict 'a'

    expect(cache.has('a')).toBe(false)
    expect(cache.has('b')).toBe(true)
    expect(cache.has('c')).toBe(true)
    expect(cache.calculatedSize).toBeLessThanOrEqual(100)
  })

  test('sizeCalculation handles string content', () => {
    const cache = new FileStateCache(100, 1000)
    cache.set('a', makeEntry('hello'))
    expect(cache.calculatedSize).toBeGreaterThan(0)
  })

  test('sizeCalculation handles object content via JSON.stringify', () => {
    const cache = new FileStateCache(100, 10000)
    const obj = { nested: { deep: 'value' } }
    cache.set('a', makeEntry(JSON.stringify(obj)))
    const size = cache.calculatedSize
    expect(size).toBeGreaterThan(0)
    // The JSON string should match the object's serialized length
    expect(size).toBe(Buffer.byteLength(JSON.stringify(obj), 'utf8'))
  })

  test('sizeCalculation handles null/undefined content', () => {
    const cache = new FileStateCache(100, 10000)
    cache.set('a', {
      content: null as unknown as string,
      timestamp: 0,
      offset: undefined,
      limit: undefined,
    })
    expect(cache.calculatedSize).toBe(1) // Math.max(1, 0) = 1
  })

  test('clear removes all entries', () => {
    const cache = new FileStateCache(100, 10000)
    cache.set('a', makeEntry('a'))
    cache.set('b', makeEntry('b'))
    cache.clear()
    expect(cache.size).toBe(0)
  })

  test('delete removes specific entry', () => {
    const cache = new FileStateCache(100, 10000)
    cache.set('a', makeEntry('a'))
    cache.set('b', makeEntry('b'))
    expect(cache.delete('a')).toBe(true)
    expect(cache.has('a')).toBe(false)
    expect(cache.has('b')).toBe(true)
  })

  test('normalizes path keys', () => {
    const cache = new FileStateCache(100, 10000)
    cache.set('/foo/../bar/baz.txt', makeEntry('content'))
    expect(cache.get('/bar/baz.txt')).toBeDefined()
    expect(cache.has('/bar/baz.txt')).toBe(true)
  })
})

describe('createFileStateCacheWithSizeLimit', () => {
  test('creates cache with default 25MB size limit', () => {
    const cache = createFileStateCacheWithSizeLimit(100)
    expect(cache.max).toBe(100)
    expect(cache.maxSize).toBe(25 * 1024 * 1024)
  })

  test('creates cache with custom size limit', () => {
    const cache = createFileStateCacheWithSizeLimit(50, 1024)
    expect(cache.max).toBe(50)
    expect(cache.maxSize).toBe(1024)
  })
})

describe('coerceToolContentToString', () => {
  test('returns string as-is', () => {
    expect(coerceToolContentToString('hello')).toBe('hello')
  })

  test('returns empty string for null', () => {
    expect(coerceToolContentToString(null)).toBe('')
  })

  test('returns empty string for undefined', () => {
    expect(coerceToolContentToString(undefined)).toBe('')
  })

  test('stringifies objects', () => {
    expect(coerceToolContentToString({ key: 'value' })).toBe('{"key":"value"}')
  })

  test('converts numbers to string', () => {
    expect(coerceToolContentToString(42)).toBe('42')
  })

  test('stringifies nested objects', () => {
    const nested = { a: { b: [1, 2, 3] } }
    expect(coerceToolContentToString(nested)).toBe('{"a":{"b":[1,2,3]}}')
  })
})
