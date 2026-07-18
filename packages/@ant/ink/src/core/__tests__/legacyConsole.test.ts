import { afterEach, describe, expect, test } from 'bun:test'
import {
  isLegacyWindowsBuild,
  isLegacyWindowsConsole,
  resetLegacyConsoleCacheForTesting,
} from '../legacyConsole.js'

const savedOverride = process.env.CLAUDE_CODE_LEGACY_CONSOLE

describe('isLegacyWindowsBuild', () => {
  test('build below 17763 (pre-ConPTY) is legacy', () => {
    expect(isLegacyWindowsBuild('10.0.16299')).toBe(true)
    expect(isLegacyWindowsBuild('10.0.14393')).toBe(true)
  })

  test('build 17763 and newer are not legacy', () => {
    expect(isLegacyWindowsBuild('10.0.17763')).toBe(false)
    expect(isLegacyWindowsBuild('10.0.19045')).toBe(false)
    expect(isLegacyWindowsBuild('10.0.22631')).toBe(false)
  })

  test('unparseable release strings are not legacy', () => {
    expect(isLegacyWindowsBuild('')).toBe(false)
    expect(isLegacyWindowsBuild('6.1')).toBe(false)
    expect(isLegacyWindowsBuild('10.0.abc')).toBe(false)
  })
})

describe('isLegacyWindowsConsole', () => {
  afterEach(() => {
    if (savedOverride === undefined) {
      delete process.env.CLAUDE_CODE_LEGACY_CONSOLE
    } else {
      process.env.CLAUDE_CODE_LEGACY_CONSOLE = savedOverride
    }
    resetLegacyConsoleCacheForTesting()
  })

  test('CLAUDE_CODE_LEGACY_CONSOLE=1 forces legacy mode on', () => {
    process.env.CLAUDE_CODE_LEGACY_CONSOLE = '1'
    resetLegacyConsoleCacheForTesting()
    expect(isLegacyWindowsConsole()).toBe(true)
  })

  test('CLAUDE_CODE_LEGACY_CONSOLE=0 forces legacy mode off', () => {
    process.env.CLAUDE_CODE_LEGACY_CONSOLE = '0'
    resetLegacyConsoleCacheForTesting()
    expect(isLegacyWindowsConsole()).toBe(false)
  })

  test('caches the computed value until reset', () => {
    process.env.CLAUDE_CODE_LEGACY_CONSOLE = '1'
    resetLegacyConsoleCacheForTesting()
    expect(isLegacyWindowsConsole()).toBe(true)
    process.env.CLAUDE_CODE_LEGACY_CONSOLE = '0'
    expect(isLegacyWindowsConsole()).toBe(true)
    resetLegacyConsoleCacheForTesting()
    expect(isLegacyWindowsConsole()).toBe(false)
  })
})
