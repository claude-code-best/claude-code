/**
 * Tests for fix: 修复 Bun.hash 不存在的问题 (ecbd5a9)
 *
 * The Node.js polyfill in build.ts injects a FNV-1a hash implementation as
 * globalThis.Bun.hash so bundled output doesn't crash under plain Node.js.
 * We test the algorithm directly here to guard against regressions.
 */
import { describe, expect, test } from 'bun:test'

/**
 * Inline copy of the polyfill from build.ts — keep in sync if the
 * implementation changes.
 */
function bunHashPolyfill(data: string, seed?: number): number {
  let h = ((seed || 0) ^ 0x811c9dc5) >>> 0
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

describe('Bun.hash Node.js polyfill (FNV-1a)', () => {
  test('returns a number', () => {
    expect(typeof bunHashPolyfill('hello')).toBe('number')
  })

  test('returns a 32-bit unsigned integer', () => {
    const h = bunHashPolyfill('test')
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
  })

  test('is deterministic', () => {
    expect(bunHashPolyfill('hello')).toBe(bunHashPolyfill('hello'))
  })

  test('different inputs produce different hashes', () => {
    expect(bunHashPolyfill('abc')).not.toBe(bunHashPolyfill('def'))
  })

  test('empty string returns seed-derived value (no crash)', () => {
    const h = bunHashPolyfill('')
    expect(typeof h).toBe('number')
    expect(h).toBeGreaterThanOrEqual(0)
  })

  test('seed=0 and no seed produce the same result', () => {
    expect(bunHashPolyfill('hello', 0)).toBe(bunHashPolyfill('hello'))
  })

  test('different seeds produce different hashes for same input', () => {
    expect(bunHashPolyfill('hello', 1)).not.toBe(bunHashPolyfill('hello', 2))
  })

  test('result is always an unsigned 32-bit integer (no negative values)', () => {
    const inputs = ['', 'a', 'hello world', '\x00\xff', 'unicode: 你好']
    for (const input of inputs) {
      const h = bunHashPolyfill(input)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(h)).toBe(true)
    }
  })

  test('Bun.hash native returns a numeric type (bigint or number)', () => {
    // Bun.hash returns a bigint (64-bit), while the polyfill returns a 32-bit
    // unsigned int. They use different widths so direct equality is not expected.
    // This test just verifies the native API exists and returns a numeric type.
    if (typeof globalThis.Bun?.hash === 'function') {
      const result = (globalThis.Bun.hash as (s: string) => bigint | number)(
        'hello',
      )
      expect(['number', 'bigint']).toContain(typeof result)
    }
  })
})
