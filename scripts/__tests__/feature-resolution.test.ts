import { describe, expect, test } from 'bun:test'
import { DEFAULT_BUILD_FEATURES, getMacroDefines } from '../defines.js'
import { resolveEnabledFeatures } from '../feature-resolution.js'

describe('resolveEnabledFeatures', () => {
  test('applies recognized true and false values case-insensitively', () => {
    const warnings: string[] = []
    const result = resolveEnabledFeatures(
      ['DEFAULT', 'DISABLED'],
      {
        FEATURE_DEFAULT: '0',
        FEATURE_DISABLED: 'FaLsE',
        FEATURE_ADDED: 'YeS',
        FEATURE_OTHER: 'on',
        FEATURE_UNKNOWN: 'maybe',
      },
      warning => warnings.push(warning),
    )

    expect(result).toEqual(['ADDED', 'OTHER'])
    expect(warnings).toEqual([
      'Ignoring FEATURE_UNKNOWN=maybe; expected 1/true/yes/on or 0/false/no/off',
    ])
  })

  test('preserves default order and sorts environment additions', () => {
    expect(
      resolveEnabledFeatures(['SECOND', 'FIRST'], {
        FEATURE_ZETA: '1',
        FEATURE_ALPHA: 'true',
      }),
    ).toEqual(['SECOND', 'FIRST', 'ALPHA', 'ZETA'])
  })

  test('ignores empty values with the same actionable warning', () => {
    const warnings: string[] = []

    expect(
      resolveEnabledFeatures([], { FEATURE_EMPTY: '' }, warning =>
        warnings.push(warning),
      ),
    ).toEqual([])
    expect(warnings).toEqual([
      'Ignoring FEATURE_EMPTY=; expected 1/true/yes/on or 0/false/no/off',
    ])
  })
})

test('Remote Control required features remain enabled by default', () => {
  expect(DEFAULT_BUILD_FEATURES).toContain('BRIDGE_MODE')
  expect(DEFAULT_BUILD_FEATURES).toContain('SESSION_TERMINALS')
  expect(DEFAULT_BUILD_FEATURES).toContain('DAEMON')
})

test('macro defines embed the final compiled feature manifest', () => {
  const defines = getMacroDefines(['A', 'B'])

  expect(JSON.parse(defines['MACRO.COMPILED_FEATURES']!)).toEqual(['A', 'B'])
})
