import { describe, expect, test } from 'bun:test'
import { count, intersperse, uniq } from '../array'

describe('intersperse', () => {
  test('inserts separator between elements', () => {
    const result = intersperse([1, 2, 3], () => 0)
    expect(result).toEqual([1, 0, 2, 0, 3])
  })

  test('returns empty array for empty input', () => {
    expect(intersperse([], () => 0)).toEqual([])
  })

  test('returns single element without separator', () => {
    expect(intersperse([1], () => 0)).toEqual([1])
  })

  test('passes index to separator function', () => {
    const result = intersperse(['a', 'b', 'c'], i => `sep-${i}`)
    expect(result).toEqual(['a', 'sep-1', 'b', 'sep-2', 'c'])
  })
})

describe('count', () => {
  test('counts matching elements', () => {
    expect(count([1, 2, 3, 4, 5], x => x > 3)).toBe(2)
  })

  test('returns 0 for empty array', () => {
    expect(count([], () => true)).toBe(0)
  })

  test('returns 0 when nothing matches', () => {
    expect(count([1, 2, 3], x => x > 10)).toBe(0)
  })

  test('counts all when everything matches', () => {
    expect(count([1, 2, 3], () => true)).toBe(3)
  })
})

describe('uniq', () => {
  test('removes duplicates', () => {
    expect(uniq([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3])
  })

  test('preserves order of first occurrence', () => {
    expect(uniq([3, 1, 2, 1, 3])).toEqual([3, 1, 2])
  })

  test('handles empty array', () => {
    expect(uniq([])).toEqual([])
  })

  test('works with strings', () => {
    expect(uniq(['a', 'b', 'a'])).toEqual(['a', 'b'])
  })
})
