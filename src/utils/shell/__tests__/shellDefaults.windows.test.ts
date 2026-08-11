/**
 * Windows default shell: PowerShell tool on by default; ! routing prefers it.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const settingsState: { defaultShell?: 'bash' | 'powershell' } = {}

mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => ({ ...settingsState }),
}))

// Force windows platform for these unit tests regardless of host OS.
mock.module('src/utils/platform.js', () => ({
  getPlatform: () => 'windows' as const,
  SUPPORTED_PLATFORMS: ['macos', 'wsl'],
}))

import { isPowerShellToolEnabled } from '../shellToolUtils.js'
import { resolveDefaultShell } from '../resolveDefaultShell.js'

const ENV_KEY = 'CLAUDE_CODE_USE_POWERSHELL_TOOL'
let savedEnv: string | undefined

beforeEach(() => {
  savedEnv = process.env[ENV_KEY]
  delete process.env[ENV_KEY]
  delete settingsState.defaultShell
})

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = savedEnv
  delete settingsState.defaultShell
})

describe('isPowerShellToolEnabled (windows)', () => {
  test('enabled by default when env unset', () => {
    expect(isPowerShellToolEnabled()).toBe(true)
  })

  test('disabled when env is falsy', () => {
    process.env[ENV_KEY] = '0'
    expect(isPowerShellToolEnabled()).toBe(false)
    process.env[ENV_KEY] = 'false'
    expect(isPowerShellToolEnabled()).toBe(false)
  })

  test('enabled when env is truthy', () => {
    process.env[ENV_KEY] = '1'
    expect(isPowerShellToolEnabled()).toBe(true)
  })
})

describe('resolveDefaultShell (windows)', () => {
  test('defaults to powershell when tool enabled and no settings', () => {
    expect(resolveDefaultShell()).toBe('powershell')
  })

  test('honors settings.defaultShell=bash', () => {
    settingsState.defaultShell = 'bash'
    expect(resolveDefaultShell()).toBe('bash')
  })

  test('honors settings.defaultShell=powershell', () => {
    settingsState.defaultShell = 'powershell'
    expect(resolveDefaultShell()).toBe('powershell')
  })

  test('falls back to bash when PowerShell tool is disabled', () => {
    process.env[ENV_KEY] = '0'
    expect(resolveDefaultShell()).toBe('bash')
  })
})
