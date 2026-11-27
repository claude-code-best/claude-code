/**
 * Tests for /autocompact — executeAutocompact argument handling, settings
 * persistence via saveGlobalConfig, and env-override conflict notes.
 *
 * config.ts and analytics are mocked with closure-driven impls (same
 * pattern as saveWorkspaceKey.test.ts) so no disk or network I/O happens.
 */
import { afterAll, beforeEach, describe, expect, test, mock } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

// Mock side-effect modules first
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

let mockConfig: Record<string, unknown> = {
  numStartups: 5,
  autoCompactEnabled: true,
}
const loggedEvents: Array<{ name: string; metadata: Record<string, unknown> }> =
  []

// Query suffix: bypass any config mock a previous test file in this
// process installed (mock.module is global — see saveWorkspaceKey.test.ts).
const realConfigModulePath = 'src/utils/config.js?realConfigForAutocompact'
const _realConfig = (await import(
  realConfigModulePath
)) as typeof import('src/utils/config.js')
mock.module('src/utils/config.ts', () => ({
  ..._realConfig,
  getGlobalConfig: () => mockConfig,
  saveGlobalConfig: (
    updater: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    mockConfig = updater(mockConfig)
  },
}))
mock.module('src/services/analytics/index.js', () => ({
  logEvent: (name: string, metadata: Record<string, unknown>) => {
    loggedEvents.push({ name, metadata })
  },
}))

afterAll(() => {
  mock.restore()
  delete process.env.DISABLE_COMPACT
  delete process.env.DISABLE_AUTO_COMPACT
  mockConfig = { numStartups: 5, autoCompactEnabled: true }
  loggedEvents.length = 0
})

// Import the module under test AFTER the mocks are installed
import { executeAutocompact, showCurrentAutoCompact } from '../autocompact.js'

describe('executeAutocompact', () => {
  beforeEach(() => {
    mockConfig = { numStartups: 5, autoCompactEnabled: true }
    loggedEvents.length = 0
    delete process.env.DISABLE_COMPACT
    delete process.env.DISABLE_AUTO_COMPACT
  })

  test('on persists autoCompactEnabled=true', () => {
    mockConfig = { numStartups: 5, autoCompactEnabled: false }
    const result = executeAutocompact('on')
    expect(mockConfig.autoCompactEnabled).toBe(true)
    expect(result.message).toContain('Auto-compact enabled')
    expect(loggedEvents[0]?.metadata).toMatchObject({ enabled: true })
  })

  test('off persists autoCompactEnabled=false', () => {
    const result = executeAutocompact('off')
    expect(mockConfig.autoCompactEnabled).toBe(false)
    expect(result.message).toContain('Auto-compact disabled')
    expect(loggedEvents[0]?.metadata).toMatchObject({ enabled: false })
  })

  test('no args / status shows the current state without changing it', () => {
    const status = executeAutocompact('status')
    expect(status.message).toBe('Auto-compact: on')
    expect(mockConfig.autoCompactEnabled).toBe(true)

    const noArgs = executeAutocompact('')
    expect(noArgs.message).toBe('Auto-compact: on')
    expect(mockConfig.autoCompactEnabled).toBe(true)

    mockConfig = { ...mockConfig, autoCompactEnabled: false }
    expect(showCurrentAutoCompact().message).toBe('Auto-compact: off')
  })

  test('enabling while DISABLE_AUTO_COMPACT is set flags the env override', () => {
    process.env.DISABLE_AUTO_COMPACT = '1'
    const result = executeAutocompact('on')
    expect(mockConfig.autoCompactEnabled).toBe(true)
    expect(result.message).toContain('DISABLE_AUTO_COMPACT')
    expect(result.message).toContain('still disables it this session')
  })

  test('disabling while an env override is set does not claim a conflict', () => {
    process.env.DISABLE_COMPACT = '1'
    const result = executeAutocompact('off')
    expect(result.message).toBe(
      'Auto-compact disabled — use /compact to free context manually',
    )
  })

  test('status reports the env override conflict', () => {
    process.env.DISABLE_AUTO_COMPACT = '1'
    expect(showCurrentAutoCompact().message).toContain('DISABLE_AUTO_COMPACT')
  })

  test('invalid arguments produce a usage hint', () => {
    const result = executeAutocompact('bogus')
    expect(result.message).toContain('Invalid argument: bogus')
    expect(result.message).toContain('on, off, status')
  })

  test('help lists the subcommands and env overrides', () => {
    const result = executeAutocompact('--help')
    expect(result.message).toContain('Usage: /autocompact [on|off|status]')
    expect(result.message).toContain('DISABLE_COMPACT')
  })
})
