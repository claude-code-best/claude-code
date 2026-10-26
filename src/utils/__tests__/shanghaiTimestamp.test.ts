import { describe, expect, test } from 'bun:test'
import {
  compareTimestamps,
  toShanghaiISOString,
  toShanghaiTimestamp,
  withShanghaiTimestamp,
} from '../shanghaiTimestamp'

describe('toShanghaiISOString', () => {
  test('renders UTC instants with a +08:00 offset', () => {
    expect(toShanghaiISOString(new Date('2026-09-19T09:23:26.000Z'))).toBe(
      '2026-09-19T17:23:26.000+08:00',
    )
  })

  test('represents the same instant as the source date', () => {
    const date = new Date('2026-01-01T00:00:00.000Z')
    expect(Date.parse(toShanghaiISOString(date))).toBe(date.getTime())
  })
})

describe('toShanghaiTimestamp', () => {
  test('converts a Z timestamp to +08:00', () => {
    expect(toShanghaiTimestamp('2026-09-19T09:23:26.000Z')).toBe(
      '2026-09-19T17:23:26.000+08:00',
    )
  })

  test('leaves timestamps that already carry an offset untouched', () => {
    expect(toShanghaiTimestamp('2026-09-19T17:23:26.000+08:00')).toBe(
      '2026-09-19T17:23:26.000+08:00',
    )
  })

  test('leaves unparseable values untouched', () => {
    expect(toShanghaiTimestamp('not-a-dateZ')).toBe('not-a-dateZ')
  })
})

describe('withShanghaiTimestamp', () => {
  test('rewrites the top-level timestamp without mutating the input', () => {
    const entry = { uuid: 'u1', timestamp: '2026-09-19T09:23:26.000Z' }
    expect(withShanghaiTimestamp(entry)).toEqual({
      uuid: 'u1',
      timestamp: '2026-09-19T17:23:26.000+08:00',
    })
    expect(entry.timestamp).toBe('2026-09-19T09:23:26.000Z')
  })

  test('leaves nested timestamps byte-for-byte intact', () => {
    const nested = '2026-09-19T09:23:26.000Z'
    const converted = withShanghaiTimestamp({
      timestamp: nested,
      toolUseResult: { timestamp: nested },
    }) as { timestamp: string; toolUseResult: { timestamp: string } }
    expect(converted.timestamp).toBe('2026-09-19T17:23:26.000+08:00')
    expect(converted.toolUseResult.timestamp).toBe(nested)
  })

  test('passes through non-objects and entries without a string timestamp', () => {
    expect(withShanghaiTimestamp(null)).toBeNull()
    expect(withShanghaiTimestamp('x')).toBe('x')
    expect(withShanghaiTimestamp([1])).toEqual([1])
    const noTimestamp = { uuid: 'u1' }
    expect(withShanghaiTimestamp(noTimestamp)).toBe(noTimestamp)
  })
})

describe('compareTimestamps', () => {
  test('orders mixed Z and +08:00 entries by instant, not lexically', () => {
    const earlier = '2026-09-19T09:23:26.000Z' // 17:23 +08:00
    const later = '2026-09-19T18:23:26.000+08:00' // 10:23Z
    expect(compareTimestamps(earlier, later)).toBeLessThan(0)
    expect(compareTimestamps(later, earlier)).toBeGreaterThan(0)
    expect(compareTimestamps(earlier, earlier)).toBe(0)
  })

  test('falls back to lexicographic order for unparseable values', () => {
    expect(compareTimestamps('abc', 'abd')).toBeLessThan(0)
    expect(compareTimestamps('abd', 'abc')).toBeGreaterThan(0)
    expect(compareTimestamps('abc', 'abc')).toBe(0)
  })
})
