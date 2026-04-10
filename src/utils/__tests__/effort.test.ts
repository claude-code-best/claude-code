import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'

// Mock heavy dependencies to avoid import chain issues
mock.module('src/utils/thinking.js', () => ({
  isUltrathinkEnabled: () => false,
}))
mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => ({}),
}))
mock.module('src/utils/auth.js', () => ({
  isProSubscriber: () => false,
  isMaxSubscriber: () => false,
  isTeamSubscriber: () => false,
}))
mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: () => null,
}))
mock.module('src/utils/model/modelSupportOverrides.js', () => ({
  get3PModelCapabilityOverride: () => undefined,
}))

const {
  isEffortLevel,
  parseEffortValue,
  isValidNumericEffort,
  convertEffortValueToLevel,
  getEffortLevelDescription,
  resolvePickerEffortPersistence,
  EFFORT_LEVELS,
} = await import('src/utils/effort.js')

// ─── EFFORT_LEVELS constant ────────────────────────────────────────────

describe('EFFORT_LEVELS', () => {
  test('contains the four canonical levels', () => {
    expect(EFFORT_LEVELS).toEqual(['low', 'medium', 'high', 'max'])
  })
})

// ─── isEffortLevel ─────────────────────────────────────────────────────

describe('isEffortLevel', () => {
  test("returns true for 'low'", () => {
    expect(isEffortLevel('low')).toBe(true)
  })

  test("returns true for 'medium'", () => {
    expect(isEffortLevel('medium')).toBe(true)
  })

  test("returns true for 'high'", () => {
    expect(isEffortLevel('high')).toBe(true)
  })

  test("returns true for 'max'", () => {
    expect(isEffortLevel('max')).toBe(true)
  })

  test("returns false for 'invalid'", () => {
    expect(isEffortLevel('invalid')).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isEffortLevel('')).toBe(false)
  })
})

// ─── parseEffortValue ──────────────────────────────────────────────────

describe('parseEffortValue', () => {
  test('returns undefined for undefined', () => {
    expect(parseEffortValue(undefined)).toBeUndefined()
  })

  test('returns undefined for null', () => {
    expect(parseEffortValue(null)).toBeUndefined()
  })

  test('returns undefined for empty string', () => {
    expect(parseEffortValue('')).toBeUndefined()
  })

  test('returns number for integer input', () => {
    expect(parseEffortValue(42)).toBe(42)
  })

  test('returns string for valid effort level string', () => {
    expect(parseEffortValue('low')).toBe('low')
    expect(parseEffortValue('medium')).toBe('medium')
    expect(parseEffortValue('high')).toBe('high')
    expect(parseEffortValue('max')).toBe('max')
  })

  test('parses numeric string to number', () => {
    expect(parseEffortValue('42')).toBe(42)
  })

  test('returns undefined for invalid string', () => {
    expect(parseEffortValue('invalid')).toBeUndefined()
  })

  test('non-integer number falls through to string parsing (parseInt truncates)', () => {
    // 3.14 fails isValidNumericEffort, then String(3.14) -> "3.14" -> parseInt = 3
    expect(parseEffortValue(3.14)).toBe(3)
  })

  test('handles case-insensitive effort level strings', () => {
    expect(parseEffortValue('LOW')).toBe('low')
    expect(parseEffortValue('HIGH')).toBe('high')
  })
})

// ─── isValidNumericEffort ──────────────────────────────────────────────

describe('isValidNumericEffort', () => {
  test('returns true for integer', () => {
    expect(isValidNumericEffort(50)).toBe(true)
  })

  test('returns true for zero', () => {
    expect(isValidNumericEffort(0)).toBe(true)
  })

  test('returns true for negative integer', () => {
    expect(isValidNumericEffort(-1)).toBe(true)
  })

  test('returns false for float', () => {
    expect(isValidNumericEffort(3.14)).toBe(false)
  })

  test('returns false for NaN', () => {
    expect(isValidNumericEffort(NaN)).toBe(false)
  })

  test('returns false for Infinity', () => {
    expect(isValidNumericEffort(Infinity)).toBe(false)
  })
})

// ─── convertEffortValueToLevel ─────────────────────────────────────────

describe('convertEffortValueToLevel', () => {
  test('returns valid effort level string as-is', () => {
    expect(convertEffortValueToLevel('low')).toBe('low')
    expect(convertEffortValueToLevel('medium')).toBe('medium')
    expect(convertEffortValueToLevel('high')).toBe('high')
    expect(convertEffortValueToLevel('max')).toBe('max')
  })

  test("returns 'high' for unknown string", () => {
    expect(convertEffortValueToLevel('unknown' as any)).toBe('high')
  })

  test("non-ant numeric value returns 'high'", () => {
    const saved = process.env.USER_TYPE
    delete process.env.USER_TYPE

    expect(convertEffortValueToLevel(50)).toBe('high')
    expect(convertEffortValueToLevel(100)).toBe('high')

    process.env.USER_TYPE = saved
  })

  describe('ant numeric mapping', () => {
    let savedUserType: string | undefined

    beforeEach(() => {
      savedUserType = process.env.USER_TYPE
      process.env.USER_TYPE = 'ant'
    })

    afterEach(() => {
      if (savedUserType === undefined) {
        delete process.env.USER_TYPE
      } else {
        process.env.USER_TYPE = savedUserType
      }
    })

    test("value <= 50 maps to 'low'", () => {
      expect(convertEffortValueToLevel(50)).toBe('low')
      expect(convertEffortValueToLevel(0)).toBe('low')
      expect(convertEffortValueToLevel(-10)).toBe('low')
    })

    test("value 51-85 maps to 'medium'", () => {
      expect(convertEffortValueToLevel(51)).toBe('medium')
      expect(convertEffortValueToLevel(85)).toBe('medium')
    })

    test("value 86-100 maps to 'high'", () => {
      expect(convertEffortValueToLevel(86)).toBe('high')
      expect(convertEffortValueToLevel(100)).toBe('high')
    })

    test("value > 100 maps to 'max'", () => {
      expect(convertEffortValueToLevel(101)).toBe('max')
      expect(convertEffortValueToLevel(200)).toBe('max')
    })
  })
})

// ─── getEffortLevelDescription ─────────────────────────────────────────

describe('getEffortLevelDescription', () => {
  test("returns description for 'low'", () => {
    const desc = getEffortLevelDescription('low')
    expect(desc).toContain('Quick')
  })

  test("returns description for 'medium'", () => {
    const desc = getEffortLevelDescription('medium')
    expect(desc).toContain('Balanced')
  })

  test("returns description for 'high'", () => {
    const desc = getEffortLevelDescription('high')
    expect(desc).toContain('Comprehensive')
  })

  test("returns description for 'max'", () => {
    const desc = getEffortLevelDescription('max')
    expect(desc).toContain('Maximum')
  })
})

// ─── resolvePickerEffortPersistence ────────────────────────────────────

describe('resolvePickerEffortPersistence', () => {
  test('returns undefined when picked matches model default and no prior persistence', () => {
    const result = resolvePickerEffortPersistence(
      'high',
      'high',
      undefined,
      false,
    )
    expect(result).toBeUndefined()
  })

  test('returns picked when it differs from model default', () => {
    const result = resolvePickerEffortPersistence(
      'low',
      'high',
      undefined,
      false,
    )
    expect(result).toBe('low')
  })

  test('returns picked when priorPersisted is set (even if same as default)', () => {
    const result = resolvePickerEffortPersistence('high', 'high', 'high', false)
    expect(result).toBe('high')
  })

  test('returns picked when toggledInPicker is true (even if same as default)', () => {
    const result = resolvePickerEffortPersistence(
      'high',
      'high',
      undefined,
      true,
    )
    expect(result).toBe('high')
  })

  test('returns undefined picked value when no explicit and matches default', () => {
    const result = resolvePickerEffortPersistence(
      undefined,
      'high' as any,
      undefined,
      false,
    )
    expect(result).toBeUndefined()
  })
})
