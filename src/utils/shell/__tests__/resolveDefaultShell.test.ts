import { afterEach, describe, expect, mock, test } from 'bun:test'
import { getPlatform } from '../../platform'

let mockedDefaultShell: 'bash' | 'powershell' | undefined

mock.module('../../settings/settings.js', () => ({
  getInitialSettings: () =>
    mockedDefaultShell ? { defaultShell: mockedDefaultShell } : {},
}))

const { resolveDefaultShell } = await import('../resolveDefaultShell')

const savedCcbVscodeAcp = process.env.CCB_VSCODE_ACP

afterEach(() => {
  mockedDefaultShell = undefined
  if (savedCcbVscodeAcp === undefined) delete process.env.CCB_VSCODE_ACP
  else process.env.CCB_VSCODE_ACP = savedCcbVscodeAcp
})

describe('resolveDefaultShell', () => {
  test('respects configured defaultShell', () => {
    process.env.CCB_VSCODE_ACP = '1'
    mockedDefaultShell = 'bash'

    expect(resolveDefaultShell()).toBe('bash')
  })

  const windowsOnly = getPlatform() === 'windows' ? test : test.skip
  const nonWindowsOnly = getPlatform() === 'windows' ? test.skip : test

  windowsOnly('defaults VS Code ACP on Windows to PowerShell', () => {
    process.env.CCB_VSCODE_ACP = '1'

    expect(resolveDefaultShell()).toBe('powershell')
  })

  nonWindowsOnly('keeps Bash default outside Windows', () => {
    process.env.CCB_VSCODE_ACP = '1'

    expect(resolveDefaultShell()).toBe('bash')
  })
})
