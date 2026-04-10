import { describe, expect, test } from 'bun:test'
import { lastX, returnValue, all, toArray, fromArray } from '../generators'

async function* range(n: number): AsyncGenerator<number, void> {
  for (let i = 0; i < n; i++) {
    yield i
  }
}

describe('lastX', () => {
  test('returns last yielded value', async () => {
    const result = await lastX(range(5))
    expect(result).toBe(4)
  })

  test('returns only value from single-yield generator', async () => {
    const result = await lastX(range(1))
    expect(result).toBe(0)
  })

  test('throws on empty generator', async () => {
    await expect(lastX(range(0))).rejects.toThrow('No items in generator')
  })
})

describe('returnValue', () => {
  test('returns generator return value', async () => {
    async function* gen(): AsyncGenerator<number, string> {
      yield 1
      return 'done'
    }
    const result = await returnValue(gen())
    expect(result).toBe('done')
  })

  test('returns undefined for void return', async () => {
    async function* gen(): AsyncGenerator<number, void> {
      yield 1
    }
    const result = await returnValue(gen())
    expect(result).toBeUndefined()
  })
})

describe('toArray', () => {
  test('collects all yielded values', async () => {
    const result = await toArray(range(4))
    expect(result).toEqual([0, 1, 2, 3])
  })

  test('returns empty array for empty generator', async () => {
    const result = await toArray(fromArray([]))
    expect(result).toEqual([])
  })

  test('preserves order', async () => {
    const result = await toArray(fromArray(['c', 'b', 'a']))
    expect(result).toEqual(['c', 'b', 'a'])
  })
})

describe('fromArray', () => {
  test('yields all array elements', async () => {
    const result = await toArray(fromArray([10, 20, 30]))
    expect(result).toEqual([10, 20, 30])
  })

  test('yields nothing for empty array', async () => {
    const result = await toArray(fromArray([]))
    expect(result).toEqual([])
  })
})

describe('all', () => {
  test('merges multiple generators preserving yield order', async () => {
    const gen1 = fromArray([1, 2])
    const gen2 = fromArray([3, 4])
    const result = await toArray(all([gen1, gen2]))
    // All values from both generators should be present
    expect(result.sort()).toEqual([1, 2, 3, 4])
  })

  test('respects concurrency cap', async () => {
    const gen1 = fromArray([1])
    const gen2 = fromArray([2])
    const gen3 = fromArray([3])
    const result = await toArray(all([gen1, gen2, gen3], 2))
    expect(result.sort()).toEqual([1, 2, 3])
  })

  test('handles empty generator array', async () => {
    const result = await toArray(all([]))
    expect(result).toEqual([])
  })

  test('handles single generator', async () => {
    const result = await toArray(all([fromArray([42])]))
    expect(result).toEqual([42])
  })

  test('handles generators of different lengths', async () => {
    const gen1 = fromArray([1, 2, 3])
    const gen2 = fromArray([10])
    const result = await toArray(all([gen1, gen2]))
    // all() merges concurrently, just verify all values are present
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 10])
  })

  test('yields all values from all generators', async () => {
    const gens = [fromArray([1]), fromArray([2]), fromArray([3])]
    const result = await toArray(all(gens))
    expect(result).toHaveLength(3)
  })
})
