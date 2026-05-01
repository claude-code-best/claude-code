import { BASH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/BashTool/toolName.js'
import { POWERSHELL_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/PowerShellTool/toolName.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../envUtils.js'
import { getPlatform } from '../platform.js'

export const SHELL_TOOL_NAMES: string[] = [BASH_TOOL_NAME, POWERSHELL_TOOL_NAME]

/**
 * PowerShellTool 的运行时门控。仅限 Windows 平台（权限引擎使用 Win32 特定的路径规范化）。
 * Ant 用户默认启用（通过设置环境变量为 0 可退出）；外部用户默认禁用（需显式设置环境变量为 1 启用）。
 *
 * 被 tools.ts（工具列表可见性）、processBashCommand（! 路由）以及 promptShellExecution（技能 frontmatter 路由）使用，
 * 以确保所有调用 PowerShellTool.call() 的路径上该门控行为一致。
 */
export function isPowerShellToolEnabled(): boolean {
  if (getPlatform() !== 'windows') return false
  return process.env.USER_TYPE === 'ant'
    ? !isEnvDefinedFalsy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)
}
