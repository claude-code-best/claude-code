import { BASH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/BashTool/toolName.js'
import { POWERSHELL_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/PowerShellTool/toolName.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../envUtils.js'
import { getPlatform } from '../platform.js'

export const SHELL_TOOL_NAMES: string[] = [BASH_TOOL_NAME, POWERSHELL_TOOL_NAME]

export function isVSCodeAcpWindows(): boolean {
  return getPlatform() === 'windows' && process.env.CCB_VSCODE_ACP === '1'
}

export function isBashToolEnabled(): boolean {
  if (!isVSCodeAcpWindows()) return true
  return isEnvTruthy(process.env.CCB_VSCODE_ENABLE_BASH_TOOL)
}

/**
 * Runtime gate for PowerShellTool. Windows-only (the permission engine uses
 * Win32-specific path normalizations). Ant defaults on (opt-out via env=0);
 * external defaults off (opt-in via env=1).
 * VS Code ACP also defaults on because the sidebar must run native Windows
 * commands without routing through Git Bash/WSL's `eval` wrapper.
 *
 * Used by tools.ts (tool-list visibility), processBashCommand (! routing),
 * and promptShellExecution (skill frontmatter routing) so the gate is
 * consistent across all paths that invoke PowerShellTool.call().
 */
export function isPowerShellToolEnabled(): boolean {
  if (getPlatform() !== 'windows') return false
  if (process.env.CCB_VSCODE_ACP === '1') {
    return !isEnvDefinedFalsy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)
  }
  return process.env.USER_TYPE === 'ant'
    ? !isEnvDefinedFalsy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)
}
