import { BASH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/BashTool/toolName.js'
import { POWERSHELL_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/PowerShellTool/toolName.js'
import { isEnvDefinedFalsy } from '../envUtils.js'
import { getPlatform } from '../platform.js'

export const SHELL_TOOL_NAMES: string[] = [BASH_TOOL_NAME, POWERSHELL_TOOL_NAME]

/**
 * Runtime gate for PowerShellTool. Windows-only (the permission engine uses
 * Win32-specific path normalizations).
 *
 * Default: ON on Windows for all builds (opt-out via
 * CLAUDE_CODE_USE_POWERSHELL_TOOL=0 / false / off). Non-Windows always off.
 *
 * Used by tools.ts (tool-list visibility), processBashCommand (! routing),
 * and promptShellExecution (skill frontmatter routing) so the gate is
 * consistent across all paths that invoke PowerShellTool.call().
 */
export function isPowerShellToolEnabled(): boolean {
  if (getPlatform() !== 'windows') return false
  return !isEnvDefinedFalsy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)
}
