import { isEnvTruthy } from './envUtils.js'

/**
 * 针对代理团队 / teammate 功能的集中式运行时检查。
 * 在所有涉及 teammate 的地方（如提示词、代码、工具 isEnabled、UI 等）
 * 都应统一通过此入口进行判断。
 *
 * Fork 构建中默认启用；如有需要，可通过
 * CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=0 进行关闭。
 */
export function isAgentSwarmsEnabled(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS_DISABLED)) {
    return false
  }

  return true
}
