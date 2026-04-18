import { describe, expect, test } from 'bun:test'
import { difference, every, intersects, union } from '../set'

describe('difference', () => {
  test('returns elements in a but not in b', () => {
    const result = difference(new Set([1, 2, 3]), new Set([2, 3, 4]))
    expect(result).toEqual(new Set([1]))
  })

  test('returns empty set when a is subset of b', () => {
    expect(difference(new Set([1, 2]), new Set([1, 2, 3]))).toEqual(new Set())
  })

  test('returns a when b is empty', () => {
    expect(difference(new Set([1, 2]), new Set())).toEqual(new Set([1, 2]))
  })
})

describe('intersects', () => {
  test('returns true when sets share elements', () => {
    expect(intersects(new Set([1, 2]), new Set([2, 3]))).toBe(true)
  })

  test('returns false when sets are disjoint', () => {
    expect(intersects(new Set([1, 2]), new Set([3, 4]))).toBe(false)
  })

  test('returns false for empty sets', () => {
    expect(intersects(new Set(), new Set([1]))).toBe(false)
    expect(intersects(new Set([1]), new Set())).toBe(false)
  })
})

describe('every', () => {
  test('returns true when a is subset of b', () => {
    expect(every(new Set([1, 2]), new Set([1, 2, 3]))).toBe(true)
  })

  test('returns false when a has elements not in b', () => {
    expect(every(new Set([1, 4]), new Set([1, 2, 3]))).toBe(false)
  })

  test('returns true for empty a', () => {
    expect(every(new Set(), new Set([1, 2]))).toBe(true)
  })
})

describe('union', () => {
  test('combines both sets', () => {
    const result = union(new Set([1, 2]), new Set([3, 4]))
    expect(result).toEqual(new Set([1, 2, 3, 4]))
  })

  test('deduplicates shared elements', () => {
    const result = union(new Set([1, 2]), new Set([2, 3]))
    expect(result).toEqual(new Set([1, 2, 3]))
  })

  test('handles empty sets', () => {
    expect(union(new Set(), new Set([1]))).toEqual(new Set([1]))
    expect(union(new Set([1]), new Set())).toEqual(new Set([1]))
  })
})
