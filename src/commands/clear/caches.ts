/** * 会话缓存清理工具。
 * 此模块在 main.tsx 启动时导入，请保持导入项最少。 */
import { feature } from 'bun:bundle'
import {
  clearInvokedSkills,
  setLastEmittedDate,
} from '../../bootstrap/state.js'
import { clearCommandsCache } from '../../commands.js'
import { getSessionStartDate } from '../../constants/common.js'
import {
  getGitStatus,
  getSystemContext,
  getUserContext,
  setSystemPromptInjection,
} from '../../context.js'
import { clearFileSuggestionCaches } from '../../hooks/fileSuggestions.js'
import { clearAllPendingCallbacks } from '../../hooks/useSwarmPermissionPoller.js'
import { clearAllDumpState } from '../../services/api/dumpPrompts.js'
import { resetPromptCacheBreakDetection } from '../../services/api/promptCacheBreakDetection.js'
import { clearAllSessions } from '../../services/api/sessionIngress.js'
import { runPostCompactCleanup } from '../../services/compact/postCompactCleanup.js'
import { resetAllLSPDiagnosticState } from '../../services/lsp/LSPDiagnosticRegistry.js'
import { clearTrackedMagicDocs } from '../../services/MagicDocs/magicDocs.js'
import { clearDynamicSkills } from '../../skills/loadSkillsDir.js'
import { resetSentSkillNames } from '../../utils/attachments.js'
import { clearCommandPrefixCaches } from '../../utils/bash/commands.js'
import { resetGetMemoryFilesCache } from '../../utils/claudemd.js'
import { clearRepositoryCaches } from '../../utils/detectRepository.js'
import { clearResolveGitDirCache } from '../../utils/git/gitFilesystem.js'
import { clearStoredImagePaths } from '../../utils/imageStore.js'
import { clearSessionEnvVars } from '../../utils/sessionEnvVars.js'

/** * 清除所有与会话相关的缓存。
 * 在恢复会话时调用此函数，以确保重新发现文件/技能。
 * 这是 clearConversation 功能的一个子集——它只清除缓存，
 * 不影响消息、会话 ID 或触发钩子。
 *
 * @param preservedAgentIds - 其每个代理状态应在清除后保留的代理 ID
 *   （例如，在 /clear 操作中保留的后台任务）。当此参数非空时，
 *   按 agentId 键控的状态（已调用的技能）会被选择性清除，而按 requestId 键控的
 *   状态（待处理的权限回调、转储状态、缓存中断跟踪）将保持不变，
 *   因为它无法安全地限定在主会话范围内。 */
export function clearSessionCaches(
  preservedAgentIds: ReadonlySet<string> = new Set(),
): void {
  const hasPreserved = preservedAgentIds.size > 0
  // 清除上下文缓存
  getUserContext.cache.clear?.()
  getSystemContext.cache.clear?.()
  getGitStatus.cache.clear?.()
  getSessionStartDate.cache.clear?.()
  // 清除文件建议缓存（用于 @ 提及）
  clearFileSuggestionCaches()

  // 清除命令/技能缓存
  clearCommandsCache()

  // 清除提示缓存中断检测状态
  if (!hasPreserved) resetPromptCacheBreakDetection()

  // 清除系统提示注入（缓存中断器）
  setSystemPromptInjection(null)

  // 清除上次发出日期，以便在下一轮重新检测
  setLastEmittedDate(null)

  // 运行压缩后清理（清除系统提示部分、微压缩跟踪、
  // 分类器批准、推测性检查，以及——对于主线程压缩——内存
  // 文件缓存，其加载原因为 'compact'）。
  runPostCompactCleanup()
  // 重置已发送的技能名称，以便在 /clear 后重新发送技能列表。
  // runPostCompactCleanup 特意不重置此项（压缩后
  // 重新注入约消耗 4K token），但 /clear 会完全清空消息，因此
  // 模型需要再次获取完整列表。
  resetSentSkillNames()
  // 用 'session_start' 覆盖内存缓存重置：clearSessionCaches 是从
  // /clear 和 --resume/--continue 调用的，这些不是压缩事件。若无此操作，
  // InstructionsLoaded 钩子将在下一次 getMemoryFiles() 调用时以
  // 'compact' 而非 'session_start' 的加载原因触发。
  resetGetMemoryFilesCache('session_start')

  // 清除存储的图像路径缓存
  clearStoredImagePaths()

  // 清除所有会话入口缓存（lastUuidMap, sequentialAppendBySession）
  clearAllSessions()
  // 清除群组权限待处理回调
  if (!hasPreserved) clearAllPendingCallbacks()

  // 清除 tungsten 会话使用跟踪
  if (process.env.USER_TYPE === 'ant') {
    void import(
      '@claude-code-best/builtin-tools/tools/TungstenTool/TungstenTool.js'
    ).then(({ clearSessionsWithTungstenUsage, resetInitializationState }) => {
      clearSessionsWithTungstenUsage()
      resetInitializationState()
    })
  }
  // 清除归因缓存（文件内容缓存、待处理的 bash 状态）
  // 动态导入以保留 COMMIT_ATTRIBUTION 功能标志的死代码消除
  if (feature('COMMIT_ATTRIBUTION')) {
    void import('../../utils/attributionHooks.js').then(
      ({ clearAttributionCaches }) => clearAttributionCaches(),
    )
  }
  // 清除仓库检测缓存
  clearRepositoryCaches()
  // 清除 bash 命令前缀缓存（Haiku 提取的前缀）
  clearCommandPrefixCaches()
  // 清除转储提示状态
  if (!hasPreserved) clearAllDumpState()
  // 清除已调用技能缓存（每个条目保存完整的技能文件内容）
  clearInvokedSkills(preservedAgentIds)
  // 清除 git 目录解析缓存
  clearResolveGitDirCache()
  // 清除动态技能（从技能目录加载）
  clearDynamicSkills()
  // 清除 LSP 诊断跟踪状态
  resetAllLSPDiagnosticState()
  // 清除已跟踪的魔法文档
  clearTrackedMagicDocs()
  // 清除会话环境变量
  clearSessionEnvVars()
  // Clear WebFetch URL cache (up to 50MB of cached page content)
  void import(
    '@claude-code-best/builtin-tools/tools/WebFetchTool/utils.js'
  ).then(({ clearWebFetchCache }) => clearWebFetchCache())
  // Clear ToolSearch description cache (full tool prompts, ~500KB for 50 MCP tools)
  void import(
    '@claude-code-best/builtin-tools/tools/ToolSearchTool/ToolSearchTool.js'
  ).then(({ clearToolSearchDescriptionCache }) =>
    clearToolSearchDescriptionCache(),
  )
  // Clear agent definitions cache (accumulates per-cwd via EnterWorktreeTool)
  void import(
    '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
  ).then(({ clearAgentDefinitionsCache }) => clearAgentDefinitionsCache())
  // Clear SkillTool prompt cache (accumulates per project root)
  void import('@claude-code-best/builtin-tools/tools/SkillTool/prompt.js').then(
    ({ clearPromptCache }) => clearPromptCache(),
  )
}
