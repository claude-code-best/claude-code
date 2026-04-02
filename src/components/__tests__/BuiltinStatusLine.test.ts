import { afterEach, beforeEach, describe, test, expect, spyOn } from 'bun:test'
import { formatCountdown } from 'src/components/BuiltinStatusLine.js'

describe('formatCountdown', () => {
  const FIXED_NOW = 1700000000000 // stable timestamp in ms
  const nowSec = FIXED_NOW / 1000
  let spy: ReturnType<typeof spyOn>

  beforeEach(() => {
    spy = spyOn(Date, 'now').mockReturnValue(FIXED_NOW)
  })

  afterEach(() => {
    spy.mockRestore()
  })

  test('returns "now" for past time', () => {
    expect(formatCountdown(nowSec - 60)).toBe('now')
  })

  test('returns "now" for exactly zero diff', () => {
    expect(formatCountdown(nowSec)).toBe('now')
  })

  test('returns minutes for less than 1 hour', () => {
    expect(formatCountdown(nowSec + 45 * 60)).toBe('45m')
  })

  test('returns hours and minutes for less than 1 day', () => {
    expect(formatCountdown(nowSec + 3 * 3600 + 12 * 60)).toBe('3h12m')
  })

  test('returns hours with 0 minutes', () => {
    expect(formatCountdown(nowSec + 1 * 3600)).toBe('1h0m')
  })

  test('returns days and hours for 1+ days', () => {
    expect(formatCountdown(nowSec + 5 * 86400 + 20 * 3600)).toBe('5d20h')
  })
})
