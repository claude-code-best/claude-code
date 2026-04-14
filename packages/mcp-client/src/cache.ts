// LRU memoization cache for MCP tool discovery
// Adapted from src/utils/memoize.ts — only memoizeWithLRU needed

import { LRUCache } from 'lru-cache'

type LRUMemoizedFunction<Args extends unknown[], Result> = {
  (...args: Args): Result
  cache: {
    clear: () => void
    size: () => number
    delete: (key: string) => boolean
    get: (key: string) => Result | undefined
    has: (key: string) => boolean
  }
}

/**
 * Creates a memoized function with LRU eviction policy.
 * Prevents unbounded memory growth by evicting least recently used entries.
 *
 * @param f The function to memoize
 * @param cacheFn Key generation function
 * @param maxCacheSize Maximum cache entries (default 100)
 */
export function memoizeWithLRU<
  Args extends unknown[],
  Result extends NonNullable<unknown>,
>(
  f: (...args: Args) => Result,
  cacheFn: (...args: Args) => string,
  maxCacheSize: number = 100,
): LRUMemoizedFunction<Args, Result> {
  const cache = new LRUCache<string, Result>({
    max: maxCacheSize,
  })

  const memoized = (...args: Args): Result => {
    const key = cacheFn(...args)
    const cached = cache.get(key)
    if (cached !== undefined) {
      return cached
    }

    const result = f(...args)
    cache.set(key, result)
    return result
  }

  memoized.cache = {
    clear: () => cache.clear(),
    size: () => cache.size,
    delete: (key: string) => cache.delete(key),
    get: (key: string) => cache.peek(key),
    has: (key: string) => cache.has(key),
  }

  return memoized
}
