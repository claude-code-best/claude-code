import { afterEach, describe, expect, test } from 'bun:test'
import {
  effectiveColumns,
  isLegacyWindowsBuild,
  isLegacyWindowsConsole,
  legacyConsoleMode,
  legacyConsoleResetMs,
  parseLegacyConsoleMode,
  parseLegacyConsoleResetMs,
  resetLegacyConsoleCacheForTesting,
} from '../legacyConsole.js'

const savedOverride = process.env.CLAUDE_CODE_LEGACY_CONSOLE
const savedResetMs = process.env.CLAUDE_CODE_LEGACY_CONSOLE_RESET_MS

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

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

describe('parseLegacyConsoleMode', () => {
  test('0 forces off even when auto-detected', () => {
    expect(parseLegacyConsoleMode('0', true)).toBe('off')
  })

  test('1 forces periodic even without auto-detection', () => {
    expect(parseLegacyConsoleMode('1', false)).toBe('periodic')
  })

  test('2 and always select every-frame mode', () => {
    expect(parseLegacyConsoleMode('2', false)).toBe('always')
    expect(parseLegacyConsoleMode('always', false)).toBe('always')
  })

  test('no override follows auto-detection', () => {
    expect(parseLegacyConsoleMode(undefined, true)).toBe('periodic')
    expect(parseLegacyConsoleMode(undefined, false)).toBe('off')
  })

  test('unknown override values follow auto-detection', () => {
    expect(parseLegacyConsoleMode('yes', true)).toBe('periodic')
    expect(parseLegacyConsoleMode('yes', false)).toBe('off')
  })
})

describe('parseLegacyConsoleResetMs', () => {
  test('defaults to 1000 for missing or garbage values', () => {
    expect(parseLegacyConsoleResetMs(undefined)).toBe(1000)
    expect(parseLegacyConsoleResetMs('')).toBe(1000)
    expect(parseLegacyConsoleResetMs('abc')).toBe(1000)
  })

  test('clamps to [100, 10000] and floors', () => {
    expect(parseLegacyConsoleResetMs('50')).toBe(100)
    expect(parseLegacyConsoleResetMs('250.9')).toBe(250)
    expect(parseLegacyConsoleResetMs('99999')).toBe(10000)
  })
})

describe('effectiveColumns', () => {
  afterEach(() => {
    restoreEnv('CLAUDE_CODE_LEGACY_CONSOLE', savedOverride)
    resetLegacyConsoleCacheForTesting()
  })

  test('passes width through when legacy mode is off', () => {
    process.env.CLAUDE_CODE_LEGACY_CONSOLE = '0'
    resetLegacyConsoleCacheForTesting()
    expect(effectiveColumns(120)).toBe(120)
    expect(effectiveColumns(undefined)).toBe(80)
    expect(effectiveColumns(0)).toBe(80)
  })

  test('narrows by one column on legacy consoles (with floor)', () => {
    process.env.CLAUDE_CODE_LEGACY_CONSOLE = '1'
    resetLegacyConsoleCacheForTesting()
    expect(effectiveColumns(120)).toBe(119)
    expect(effectiveColumns(undefined)).toBe(79)
    expect(effectiveColumns(21)).toBe(20)
    expect(effectiveColumns(5)).toBe(20)
  })
})

describe('legacyConsoleMode / isLegacyWindowsConsole / legacyConsoleResetMs', () => {
  afterEach(() => {
    restoreEnv('CLAUDE_CODE_LEGACY_CONSOLE', savedOverride)
    restoreEnv('CLAUDE_CODE_LEGACY_CONSOLE_RESET_MS', savedResetMs)
    resetLegacyConsoleCacheForTesting()
  })

  test('CLAUDE_CODE_LEGACY_CONSOLE=1 forces legacy mode on', () => {
    process.env.CLAUDE_CODE_LEGACY_CONSOLE = '1'
    resetLegacyConsoleCacheForTesting()
    expect(isLegacyWindowsConsole()).toBe(true)
    expect(legacyConsoleMode()).toBe('periodic')
  })

  test('CLAUDE_CODE_LEGACY_CONSOLE=0 forces legacy mode off', () => {
    process.env.CLAUDE_CODE_LEGACY_CONSOLE = '0'
    resetLegacyConsoleCacheForTesting()
    expect(isLegacyWindowsConsole()).toBe(false)
    expect(legacyConsoleMode()).toBe('off')
  })

  test('CLAUDE_CODE_LEGACY_CONSOLE=2 selects every-frame mode', () => {
    process.env.CLAUDE_CODE_LEGACY_CONSOLE = '2'
    resetLegacyConsoleCacheForTesting()
    expect(isLegacyWindowsConsole()).toBe(true)
    expect(legacyConsoleMode()).toBe('always')
  })

  test('reset interval is read from env with clamping', () => {
    process.env.CLAUDE_CODE_LEGACY_CONSOLE_RESET_MS = '250'
    resetLegacyConsoleCacheForTesting()
    expect(legacyConsoleResetMs()).toBe(250)
    process.env.CLAUDE_CODE_LEGACY_CONSOLE_RESET_MS = '1'
    resetLegacyConsoleCacheForTesting()
    expect(legacyConsoleResetMs()).toBe(100)
  })

  test('caches the computed values until reset', () => {
    process.env.CLAUDE_CODE_LEGACY_CONSOLE = '1'
    process.env.CLAUDE_CODE_LEGACY_CONSOLE_RESET_MS = '500'
    resetLegacyConsoleCacheForTesting()
    expect(isLegacyWindowsConsole()).toBe(true)
    expect(legacyConsoleResetMs()).toBe(500)
    process.env.CLAUDE_CODE_LEGACY_CONSOLE = '0'
    process.env.CLAUDE_CODE_LEGACY_CONSOLE_RESET_MS = '9000'
    expect(isLegacyWindowsConsole()).toBe(true)
    expect(legacyConsoleResetMs()).toBe(500)
    resetLegacyConsoleCacheForTesting()
    expect(isLegacyWindowsConsole()).toBe(false)
    expect(legacyConsoleResetMs()).toBe(9000)
  })
})
