import { afterEach, describe, expect, test } from 'bun:test'
import { getPlatform } from '../../platform'
import {
  isBashToolEnabled,
  isPowerShellToolEnabled,
  isVSCodeAcpWindows,
} from '../shellToolUtils'

const savedEnv = {
  CCB_VSCODE_ACP: process.env.CCB_VSCODE_ACP,
  CCB_VSCODE_ENABLE_BASH_TOOL: process.env.CCB_VSCODE_ENABLE_BASH_TOOL,
  CLAUDE_CODE_USE_POWERSHELL_TOOL:
    process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL,
  USER_TYPE: process.env.USER_TYPE,
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('shell tool gates', () => {
  const windowsOnly = getPlatform() === 'windows' ? test : test.skip
  const nonWindowsOnly = getPlatform() === 'windows' ? test.skip : test

  windowsOnly('uses native PowerShell by default for VS Code ACP on Windows', () => {
    process.env.CCB_VSCODE_ACP = '1'
    delete process.env.CCB_VSCODE_ENABLE_BASH_TOOL
    delete process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL
    delete process.env.USER_TYPE

    expect(isVSCodeAcpWindows()).toBe(true)
    expect(isPowerShellToolEnabled()).toBe(true)
    expect(isBashToolEnabled()).toBe(false)
  })

  windowsOnly('allows explicit Bash opt-in for VS Code ACP diagnostics', () => {
    process.env.CCB_VSCODE_ACP = '1'
    process.env.CCB_VSCODE_ENABLE_BASH_TOOL = '1'

    expect(isBashToolEnabled()).toBe(true)
  })

  windowsOnly('honors PowerShell opt-out in VS Code ACP', () => {
    process.env.CCB_VSCODE_ACP = '1'
    process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL = '0'

    expect(isPowerShellToolEnabled()).toBe(false)
  })

  nonWindowsOnly('does not enable PowerShell outside Windows', () => {
    process.env.CCB_VSCODE_ACP = '1'
    process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL = '1'

    expect(isVSCodeAcpWindows()).toBe(false)
    expect(isPowerShellToolEnabled()).toBe(false)
    expect(isBashToolEnabled()).toBe(true)
  })
})
