import { describe, expect, test } from 'bun:test'
import { parseCronExpression, computeNextCronRun, cronToHuman } from '../cron'

describe('parseCronExpression', () => {
  describe('valid expressions', () => {
    test('parses wildcard fields', () => {
      const result = parseCronExpression('* * * * *')
      expect(result).not.toBeNull()
      expect(result!.minute).toHaveLength(60)
      expect(result!.hour).toHaveLength(24)
      expect(result!.dayOfMonth).toHaveLength(31)
      expect(result!.month).toHaveLength(12)
      expect(result!.dayOfWeek).toHaveLength(7)
    })

    test('parses specific values', () => {
      const result = parseCronExpression('30 14 1 6 3')
      expect(result).not.toBeNull()
      expect(result!.minute).toEqual([30])
      expect(result!.hour).toEqual([14])
      expect(result!.dayOfMonth).toEqual([1])
      expect(result!.month).toEqual([6])
      expect(result!.dayOfWeek).toEqual([3])
    })

    test('parses step syntax', () => {
      const result = parseCronExpression('*/5 * * * *')
      expect(result).not.toBeNull()
      expect(result!.minute).toEqual([
        0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
      ])
    })

    test('parses range syntax', () => {
      const result = parseCronExpression('1-5 * * * *')
      expect(result).not.toBeNull()
      expect(result!.minute).toEqual([1, 2, 3, 4, 5])
    })

    test('parses range with step', () => {
      const result = parseCronExpression('1-10/3 * * * *')
      expect(result).not.toBeNull()
      expect(result!.minute).toEqual([1, 4, 7, 10])
    })

    test('parses comma-separated list', () => {
      const result = parseCronExpression('1,15,30 * * * *')
      expect(result).not.toBeNull()
      expect(result!.minute).toEqual([1, 15, 30])
    })

    test('parses day-of-week 7 as Sunday alias', () => {
      const result = parseCronExpression('0 0 * * 7')
      expect(result).not.toBeNull()
      expect(result!.dayOfWeek).toEqual([0])
    })

    test('parses range with day-of-week 7', () => {
      const result = parseCronExpression('0 0 * * 5-7')
      expect(result).not.toBeNull()
      expect(result!.dayOfWeek).toEqual([0, 5, 6])
    })

    test('parses complex combined expression', () => {
      const result = parseCronExpression('0,30 9-17 * * 1-5')
      expect(result).not.toBeNull()
      expect(result!.minute).toEqual([0, 30])
      expect(result!.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
      expect(result!.dayOfWeek).toEqual([1, 2, 3, 4, 5])
    })
  })

  describe('invalid expressions', () => {
    test('returns null for wrong field count', () => {
      expect(parseCronExpression('* * *')).toBeNull()
    })

    test('returns null for out-of-range values', () => {
      expect(parseCronExpression('60 * * * *')).toBeNull()
    })

    test('returns null for invalid step', () => {
      expect(parseCronExpression('*/0 * * * *')).toBeNull()
    })

    test('returns null for reversed range', () => {
      expect(parseCronExpression('10-5 * * * *')).toBeNull()
    })

    test('returns null for empty string', () => {
      expect(parseCronExpression('')).toBeNull()
    })

    test('returns null for non-numeric tokens', () => {
      expect(parseCronExpression('abc * * * *')).toBeNull()
    })
  })

  describe('field range validation', () => {
    test('minute: 0-59', () => {
      expect(parseCronExpression('0 * * * *')).not.toBeNull()
      expect(parseCronExpression('59 * * * *')).not.toBeNull()
      expect(parseCronExpression('60 * * * *')).toBeNull()
    })

    test('hour: 0-23', () => {
      expect(parseCronExpression('* 0 * * *')).not.toBeNull()
      expect(parseCronExpression('* 23 * * *')).not.toBeNull()
      expect(parseCronExpression('* 24 * * *')).toBeNull()
    })

    test('dayOfMonth: 1-31', () => {
      expect(parseCronExpression('* * 1 * *')).not.toBeNull()
      expect(parseCronExpression('* * 31 * *')).not.toBeNull()
      expect(parseCronExpression('* * 0 * *')).toBeNull()
      expect(parseCronExpression('* * 32 * *')).toBeNull()
    })

    test('month: 1-12', () => {
      expect(parseCronExpression('* * * 1 *')).not.toBeNull()
      expect(parseCronExpression('* * * 12 *')).not.toBeNull()
      expect(parseCronExpression('* * * 0 *')).toBeNull()
      expect(parseCronExpression('* * * 13 *')).toBeNull()
    })

    test('dayOfWeek: 0-6 (plus 7 alias)', () => {
      expect(parseCronExpression('* * * * 0')).not.toBeNull()
      expect(parseCronExpression('* * * * 6')).not.toBeNull()
      expect(parseCronExpression('* * * * 7')).not.toBeNull() // alias for 0
      expect(parseCronExpression('* * * * 8')).toBeNull()
    })
  })
})

describe('computeNextCronRun', () => {
  test('finds next minute', () => {
    const fields = parseCronExpression('31 14 * * *')!
    const from = new Date(2026, 0, 15, 14, 30, 45) // 14:30:45
    const next = computeNextCronRun(fields, from)
    expect(next).not.toBeNull()
    expect(next!.getHours()).toBe(14)
    expect(next!.getMinutes()).toBe(31)
  })

  test('finds next hour', () => {
    const fields = parseCronExpression('0 15 * * *')!
    const from = new Date(2026, 0, 15, 14, 30)
    const next = computeNextCronRun(fields, from)
    expect(next).not.toBeNull()
    expect(next!.getHours()).toBe(15)
    expect(next!.getMinutes()).toBe(0)
  })

  test('rolls to next day', () => {
    const fields = parseCronExpression('0 10 * * *')!
    const from = new Date(2026, 0, 15, 14, 30)
    const next = computeNextCronRun(fields, from)
    expect(next).not.toBeNull()
    expect(next!.getDate()).toBe(16)
    expect(next!.getHours()).toBe(10)
  })

  test('is strictly after from date', () => {
    const fields = parseCronExpression('30 14 * * *')!
    const from = new Date(2026, 0, 15, 14, 30, 0) // exactly on cron time
    const next = computeNextCronRun(fields, from)
    expect(next).not.toBeNull()
    expect(next!.getTime()).toBeGreaterThan(from.getTime())
  })

  test('every 5 minutes from arbitrary time', () => {
    const fields = parseCronExpression('*/5 * * * *')!
    const from = new Date(2026, 0, 15, 14, 32)
    const next = computeNextCronRun(fields, from)
    expect(next).not.toBeNull()
    expect(next!.getMinutes()).toBe(35)
  })

  test('every minute', () => {
    const fields = parseCronExpression('* * * * *')!
    const from = new Date(2026, 0, 15, 14, 32, 45)
    const next = computeNextCronRun(fields, from)
    expect(next).not.toBeNull()
    expect(next!.getMinutes()).toBe(33)
  })

  test('handles step across midnight', () => {
    const fields = parseCronExpression('0 0 * * *')!
    const from = new Date(2026, 0, 15, 23, 59)
    const next = computeNextCronRun(fields, from)
    expect(next).not.toBeNull()
    expect(next!.getHours()).toBe(0)
    expect(next!.getDate()).toBe(16)
  })

  test('OR semantics when both dom and dow constrained', () => {
    // dom=15, dow=3(Wed) - matches 15th OR Wednesday
    const fields = parseCronExpression('0 0 15 * 3')!
    const from = new Date(2026, 0, 12, 0, 0) // Monday Jan 12
    const next = computeNextCronRun(fields, from)
    expect(next).not.toBeNull()
    // Should match the first of either: next Wednesday(Jan 14) or 15th(Jan 15)
    const dayOfWeek = next!.getDay()
    const dayOfMonth = next!.getDate()
    expect(dayOfWeek === 3 || dayOfMonth === 15).toBe(true)
  })
})

describe('cronToHuman', () => {
  test('every N minutes', () => {
    expect(cronToHuman('*/5 * * * *')).toBe('Every 5 minutes')
  })

  test('every minute', () => {
    expect(cronToHuman('*/1 * * * *')).toBe('Every minute')
  })

  test('every hour at :00', () => {
    expect(cronToHuman('0 * * * *')).toBe('Every hour')
  })

  test('every hour at :30', () => {
    expect(cronToHuman('30 * * * *')).toBe('Every hour at :30')
  })

  test('every N hours', () => {
    expect(cronToHuman('0 */2 * * *')).toBe('Every 2 hours')
  })

  test('daily at specific time', () => {
    const result = cronToHuman('30 9 * * *')
    expect(result).toContain('Every day at')
    expect(result).toContain('9:30')
  })

  test('specific day of week', () => {
    const result = cronToHuman('0 9 * * 3')
    expect(result).toContain('Wednesday')
    expect(result).toContain('9:00')
  })

  test('weekdays', () => {
    const result = cronToHuman('0 9 * * 1-5')
    expect(result).toContain('Weekdays')
    expect(result).toContain('9:00')
  })

  test('returns raw cron for complex patterns', () => {
    expect(cronToHuman('0,30 9-17 * * 1-5')).toBe('0,30 9-17 * * 1-5')
  })

  test('returns raw cron for wrong field count', () => {
    expect(cronToHuman('* * *')).toBe('* * *')
  })
})
