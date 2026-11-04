const SHANGHAI_UTC_OFFSET_MINUTES = 480
const UTC_DESIGNATOR = 'Z'
const SHANGHAI_OFFSET_SUFFIX = '+08:00'

/**
 * Asia/Shanghai has held a fixed UTC+8 offset with no DST since 1991, so the
 * constant 480-minute shift below is exact rather than an approximation.
 */
export function toShanghaiISOString(date: Date = new Date()): string {
  const shifted = new Date(
    date.getTime() + SHANGHAI_UTC_OFFSET_MINUTES * 60_000,
  )
  return shifted.toISOString().replace(UTC_DESIGNATOR, SHANGHAI_OFFSET_SUFFIX)
}

export function toShanghaiTimestamp(value: string): string {
  if (!value.endsWith(UTC_DESIGNATOR)) {
    return value
  }
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    return value
  }
  return toShanghaiISOString(new Date(ms))
}

/**
 * Rewrites a transcript entry's top-level `timestamp` to Shanghai time.
 * Nested timestamps are deliberately left alone: they occur inside tool
 * results and MCP metadata, which are opaque payloads that must round-trip
 * byte-for-byte.
 */
export function withShanghaiTimestamp(entry: unknown): unknown {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return entry
  }
  const record = entry as Record<string, unknown>
  const timestamp = record.timestamp
  if (typeof timestamp !== 'string') {
    return entry
  }
  const converted = toShanghaiTimestamp(timestamp)
  if (converted === timestamp) {
    return entry
  }
  return { ...record, timestamp: converted }
}

/**
 * Chronological comparison that ignores the offset notation, so a transcript
 * mixing legacy `...Z` entries with `+08:00` entries still orders correctly.
 * Lexicographic comparison would not: `13:14Z` sorts after `21:14+08:00`.
 */
export function compareTimestamps(a: string, b: string): number {
  const msA = Date.parse(a)
  const msB = Date.parse(b)
  if (Number.isNaN(msA) || Number.isNaN(msB)) {
    return a < b ? -1 : a > b ? 1 : 0
  }
  return msA - msB
}
