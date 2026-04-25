import { afterEach, describe, expect, test } from 'bun:test'
import { BASH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/BashTool/toolName.js'
import { POWERSHELL_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/PowerShellTool/toolName.js'
import { getAllBaseTools } from '../tools'
import { getPlatform } from '../utils/platform'

const savedEnv = {
  CCB_VSCODE_ACP: process.env.CCB_VSCODE_ACP,
  CCB_VSCODE_ENABLE_BASH_TOOL: process.env.CCB_VSCODE_ENABLE_BASH_TOOL,
  CLAUDE_CODE_USE_POWERSHELL_TOOL:
    process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL,
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('VS Code ACP shell tools', () => {
  const windowsOnly = getPlatform() === 'windows' ? test : test.skip

  windowsOnly('exposes PowerShell instead of Bash by default', () => {
    process.env.CCB_VSCODE_ACP = '1'
    delete process.env.CCB_VSCODE_ENABLE_BASH_TOOL
    delete process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL

    const toolNames = getAllBaseTools().map(tool => tool.name)

    expect(toolNames).toContain(POWERSHELL_TOOL_NAME)
    expect(toolNames).not.toContain(BASH_TOOL_NAME)
  })
})
