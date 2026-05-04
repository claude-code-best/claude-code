// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import {
  toolMatchesName,
  type Tools,
  type ToolUseContext,
  type ToolPermissionContext,
} from '../Tool.js'
import {
  FileReadTool,
  MaxFileReadTokenExceededError,
  type Output as FileReadToolOutput,
  readImageWithTokenBudget,
} from '@claude-code-best/builtin-tools/tools/FileReadTool/FileReadTool.js'
import { FileTooLargeError, readFileInRange } from './readFileInRange.js'
import { expandPath } from './path.js'
import { countCharInString } from './stringUtils.js'
import { count, uniq } from './array.js'
import { getFsImplementation } from './fsOperations.js'
import { readdir, stat } from 'fs/promises'
import type { IDESelection } from '../hooks/useIdeSelection.js'
import { TODO_WRITE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TodoWriteTool/constants.js'
import { TASK_CREATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskCreateTool/constants.js'
import { TASK_UPDATE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/TaskUpdateTool/constants.js'
import { BASH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/BashTool/toolName.js'
import { SKILL_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SkillTool/constants.js'
import type { TodoList } from './todo/types.js'
import {
  type Task,
  listTasks,
  getTaskListId,
  isTodoV2Enabled,
} from './tasks.js'
import { getPlanFilePath, getPlan } from './plans.js'
import { getConnectedIdeName } from './ide.js'
import {
  filterInjectedMemoryFiles,
  getManagedAndUserConditionalRules,
  getMemoryFiles,
  getMemoryFilesForNestedDirectory,
  getConditionalRulesForCwdLevelDirectory,
  type MemoryFileInfo,
} from './claudemd.js'
import { dirname, parse, relative, resolve } from 'path'
import { getCwd } from 'src/utils/cwd.js'
import { getViewedTeammateTask } from '../state/selectors.js'
import { logError } from './log.js'
import { logAntError } from './debug.js'
import { isENOENT, toError } from './errors.js'
import type { DiagnosticFile } from '../services/diagnosticTracking.js'
import { diagnosticTracker } from '../services/diagnosticTracking.js'
import type {
  AttachmentMessage,
  Message,
  MessageOrigin,
} from 'src/types/message.js'
import {
  type QueuedCommand,
  getImagePasteIds,
  isValidImagePaste,
} from 'src/types/textInputTypes.js'
import { randomUUID, type UUID } from 'crypto'
import { getSettings_DEPRECATED } from './settings/settings.js'
import { getSnippetForTwoFileDiff } from '@claude-code-best/builtin-tools/tools/FileEditTool/utils.js'
import type {
  ContentBlockParam,
  ImageBlockParam,
  Base64ImageSource,
} from '@anthropic-ai/sdk/resources/messages.mjs'
import { maybeResizeAndDownsampleImageBlock } from './imageResizer.js'
import type { PastedContent } from './config.js'
import { getGlobalConfig } from './config.js'
import {
  getDefaultSonnetModel,
  getDefaultHaikuModel,
  getDefaultOpusModel,
} from './model/model.js'
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { getSkillToolCommands, getMcpSkillCommands } from '../commands.js'
import type { Command } from '../types/command.js'
import uniqBy from 'lodash-es/uniqBy.js'
import { getProjectRoot } from '../bootstrap/state.js'
import { formatCommandsWithinBudget } from '@claude-code-best/builtin-tools/tools/SkillTool/prompt.js'
import { getContextWindowForModel } from './context.js'
import type { DiscoverySignal } from '../services/skillSearch/signals.js'
// 为 DCE 设置的条件性 require。所有可能泄露到外部构建中的技能
// 搜索字符串字面量都存放在这些模块内。本文件中仅有的对外接口是：mayb
// e() 调用（通过下方的 spread 门控）和 skill_listi
// ng 抑制检查（使用相同的 skillSearchModules 空值检查
// ）。上方仅用于类型的 DiscoverySignal 导入在编译时会被擦除。
/* eslint-disable @typescript-eslint/no-require-imports */
const skillSearchModules = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? {
      featureCheck:
        require('../services/skillSearch/featureCheck.js') as typeof import('../services/skillSearch/featureCheck.js'),
      prefetch:
        require('../services/skillSearch/prefetch.js') as typeof import('../services/skillSearch/prefetch.js'),
    }
  : null
const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('./permissions/autoModeState.js') as typeof import('./permissions/autoModeState.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */
import {
  MAX_LINES_TO_READ,
  FILE_READ_TOOL_NAME,
} from '@claude-code-best/builtin-tools/tools/FileReadTool/prompt.js'
import { getDefaultFileReadingLimits } from '@claude-code-best/builtin-tools/tools/FileReadTool/limits.js'
import { cacheKeys, type FileStateCache } from './fileStateCache.js'
import {
  createAbortController,
  createChildAbortController,
} from './abortController.js'
import { isAbortError } from './errors.js'
import {
  getFileModificationTimeAsync,
  isFileWithinReadSizeLimit,
} from './file.js'
import type { AgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { filterAgentsByMcpRequirements } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { AGENT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/AgentTool/constants.js'
import {
  formatAgentLine,
  shouldInjectAgentListInMessages,
} from '@claude-code-best/builtin-tools/tools/AgentTool/prompt.js'
import { filterDeniedAgents } from './permissions/permissions.js'
import { getSubscriptionType } from './auth.js'
import { mcpInfoFromString } from '../services/mcp/mcpStringUtils.js'
import {
  matchingRuleForInput,
  pathInAllowedWorkingPath,
} from './permissions/filesystem.js'
import {
  generateTaskAttachments,
  applyTaskOffsetsAndEvictions,
} from './task/framework.js'
import { getTaskOutputPath } from './task/diskOutput.js'
import { drainPendingMessages } from '../tasks/LocalAgentTask/LocalAgentTask.js'
import type { TaskType, TaskStatus } from '../Task.js'
import {
  getOriginalCwd,
  getSessionId,
  getSdkBetas,
  getTotalCostUSD,
  getTotalOutputTokens,
  getCurrentTurnTokenBudget,
  getTurnOutputTokens,
  hasExitedPlanModeInSession,
  setHasExitedPlanMode,
  needsPlanModeExitAttachment,
  setNeedsPlanModeExitAttachment,
  needsAutoModeExitAttachment,
  setNeedsAutoModeExitAttachment,
  getLastEmittedDate,
  setLastEmittedDate,
  getKairosActive,
} from '../bootstrap/state.js'
import type { QuerySource } from '../constants/querySource.js'
import {
  getDeferredToolsDelta,
  isDeferredToolsDeltaEnabled,
  isToolSearchEnabledOptimistic,
  isToolSearchToolAvailable,
  modelSupportsToolReference,
  type DeferredToolsDeltaScanContext,
} from './toolSearch.js'
import {
  getMcpInstructionsDelta,
  isMcpInstructionsDeltaEnabled,
  type ClientSideInstruction,
} from './mcpInstructionsDelta.js'
import { CLAUDE_IN_CHROME_MCP_SERVER_NAME } from './claudeInChrome/common.js'
import { CHROME_TOOL_SEARCH_INSTRUCTIONS } from './claudeInChrome/prompt.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import type {
  HookEvent,
  SyncHookJSONOutput,
} from 'src/entrypoints/agentSdkTypes.js'
import {
  checkForAsyncHookResponses,
  removeDeliveredAsyncHooks,
} from './hooks/AsyncHookRegistry.js'
import {
  checkForLSPDiagnostics,
  clearAllLSPDiagnostics,
} from '../services/lsp/LSPDiagnosticRegistry.js'
import { logForDebugging } from './debug.js'
import {
  extractTextContent,
  getUserMessageText,
  isThinkingMessage,
} from './messages.js'
import { isHumanTurn } from './messagePredicates.js'
import { isEnvTruthy, getClaudeConfigHomeDir } from './envUtils.js'
import { feature } from 'bun:bundle'
/* eslint-disable @typescript-eslint/no-require-imports */
const BRIEF_TOOL_NAME: string | null =
  feature('KAIROS') || feature('KAIROS_BRIEF')
    ? (
        require('@claude-code-best/builtin-tools/tools/BriefTool/prompt.js') as typeof import('@claude-code-best/builtin-tools/tools/BriefTool/prompt.js')
      ).BRIEF_TOOL_NAME
    : null
const sessionTranscriptModule = feature('KAIROS')
  ? (require('../services/sessionTranscript/sessionTranscript.js') as typeof import('../services/sessionTranscript/sessionTranscript.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */
import { hasUltrathinkKeyword, isUltrathinkEnabled } from './thinking.js'
import {
  tokenCountFromLastAPIResponse,
  tokenCountWithEstimation,
} from './tokens.js'
import {
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
} from '../services/compact/autoCompact.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import {
  hasInstructionsLoadedHook,
  executeInstructionsLoadedHooks,
  type HookBlockingError,
  type InstructionsMemoryType,
} from './hooks.js'
import { jsonStringify } from './slowOperations.js'
import { isPDFExtension } from './pdfUtils.js'
import { getLocalISODate } from '../constants/common.js'
import { getPDFPageCount } from './pdf.js'
import { PDF_AT_MENTION_INLINE_THRESHOLD } from '../constants/apiLimits.js'
import { isAgentSwarmsEnabled } from './agentSwarmsEnabled.js'
import { findRelevantMemories } from '../memdir/findRelevantMemories.js'
import { memoryAge, memoryFreshnessText } from '../memdir/memoryAge.js'
import { getAutoMemPath, isAutoMemoryEnabled } from '../memdir/paths.js'
import { getAgentMemoryDir } from '@claude-code-best/builtin-tools/tools/AgentTool/agentMemory.js'
import {
  readUnreadMessages,
  markMessagesAsReadByPredicate,
  isShutdownApproved,
  isStructuredProtocolMessage,
  isIdleNotification,
} from './teammateMailbox.js'
import {
  getAgentName,
  getAgentId,
  getTeamName,
  isTeamLead,
} from './teammate.js'
import { isInProcessTeammate } from './teammateContext.js'
import { removeTeammateFromTeamFile } from './swarm/teamHelpers.js'
import { unassignTeammateTasks } from './tasks.js'
import { getCompanionIntroAttachment } from '../buddy/prompt.js'

export const TODO_REMINDER_CONFIG = {
  TURNS_SINCE_WRITE: 10,
  TURNS_BETWEEN_REMINDERS: 10,
} as const

export const PLAN_MODE_ATTACHMENT_CONFIG = {
  TURNS_BETWEEN_ATTACHMENTS: 5,
  FULL_REMINDER_EVERY_N_ATTACHMENTS: 5,
} as const

export const AUTO_MODE_ATTACHMENT_CONFIG = {
  TURNS_BETWEEN_ATTACHMENTS: 5,
  FULL_REMINDER_EVERY_N_ATTACHMENTS: 5,
} as const

const MAX_MEMORY_LINES = 200
// 仅靠行数上限无法限制大小（200 行 × 500 字符/行 = 100K
// B）。surfacer 每轮通过 <system-reminder> 注入
// 最多 5 个文件，绕过了每条消息的工具结果预算，因此严格的单文件字节上限
// 可以限制总注入量（5 × 4KB = 20KB/轮）。通过 rea
// dFileInRange 的 truncateOnByteLimit
// 选项强制执行。截断意味着最相关的记忆仍能浮现：frontmatter 和
// 开头的上下文通常是最重要的。
const MAX_MEMORY_BYTES = 4096

export const RELEVANT_MEMORIES_CONFIG = {
  // 每轮上限（5 × 4KB = 20KB）限制了单次注入，但
  // 在长会话中，选择器会持续浮现不同的文件——在生产环境中观察到
  // 约 26K tokens/会话。限制累计字节数：一旦达到上
  // 限，就完全停止预取。预算大约相当于 3 次完整注入；之后最
  // 相关的记忆已经存在于上下文中。扫描消息（而不是在 too
  // lUseContext 中跟踪）意味着 compact
  // 会自然地重置计数器——旧的附件已从上下文中移除，因此
  // 重新浮现是有效的。
  MAX_SESSION_BYTES: 60 * 1024,
} as const

export const VERIFY_PLAN_REMINDER_CONFIG = {
  TURNS_BETWEEN_REMINDERS: 10,
} as const

export type FileAttachment = {
  type: 'file'
  filename: string
  content: FileReadToolOutput
  /** 文件是否因大小限制而被截断 */
  truncated?: boolean
  /** 创建时相对于 CWD 的路径，用于稳定显示 */
  displayPath: string
}

export type CompactFileReferenceAttachment = {
  type: 'compact_file_reference'
  filename: string
  /** 创建时相对于 CWD 的路径，用于稳定显示 */
  displayPath: string
}

export type PDFReferenceAttachment = {
  type: 'pdf_reference'
  filename: string
  pageCount: number
  fileSize: number
  /** 创建时相对于 CWD 的路径，用于稳定显示 */
  displayPath: string
}

export type AlreadyReadFileAttachment = {
  type: 'already_read_file'
  filename: string
  content: FileReadToolOutput
  /** 文件是否因大小限制而被截断 */
  truncated?: boolean
  /** 创建时相对于 CWD 的路径，用于稳定显示 */
  displayPath: string
}

export type AgentMentionAttachment = {
  type: 'agent_mention'
  agentType: string
}

export type AsyncHookResponseAttachment = {
  type: 'async_hook_response'
  processId: string
  hookName: string
  hookEvent: HookEvent | 'StatusLine' | 'FileSuggestion'
  toolName?: string
  response: SyncHookJSONOutput
  stdout: string
  stderr: string
  exitCode?: number
}

export type HookAttachment =
  | HookCancelledAttachment
  | {
      type: 'hook_blocking_error'
      blockingError: HookBlockingError
      hookName: string
      toolUseID: string
      hookEvent: HookEvent
    }
  | HookNonBlockingErrorAttachment
  | HookErrorDuringExecutionAttachment
  | {
      type: 'hook_stopped_continuation'
      message: string
      hookName: string
      toolUseID: string
      hookEvent: HookEvent
    }
  | HookSuccessAttachment
  | {
      type: 'hook_additional_context'
      content: string[]
      hookName: string
      toolUseID: string
      hookEvent: HookEvent
    }
  | HookSystemMessageAttachment
  | HookPermissionDecisionAttachment

export type HookPermissionDecisionAttachment = {
  type: 'hook_permission_decision'
  decision: 'allow' | 'deny'
  toolUseID: string
  hookEvent: HookEvent
}

export type HookSystemMessageAttachment = {
  type: 'hook_system_message'
  content: string
  hookName: string
  toolUseID: string
  hookEvent: HookEvent
}

export type HookCancelledAttachment = {
  type: 'hook_cancelled'
  hookName: string
  toolUseID: string
  hookEvent: HookEvent
  command?: string
  durationMs?: number
}

export type HookErrorDuringExecutionAttachment = {
  type: 'hook_error_during_execution'
  content: string
  hookName: string
  toolUseID: string
  hookEvent: HookEvent
  command?: string
  durationMs?: number
}

export type HookSuccessAttachment = {
  type: 'hook_success'
  content: string
  hookName: string
  toolUseID: string
  hookEvent: HookEvent
  stdout?: string
  stderr?: string
  exitCode?: number
  command?: string
  durationMs?: number
}

export type HookNonBlockingErrorAttachment = {
  type: 'hook_non_blocking_error'
  hookName: string
  stderr: string
  stdout: string
  exitCode: number
  toolUseID: string
  hookEvent: HookEvent
  command?: string
  durationMs?: number
}

export type Attachment =
  /** 用户 @ 提及了该文件 */
  | FileAttachment
  | CompactFileReferenceAttachment
  | PDFReferenceAttachment
  | AlreadyReadFileAttachment
  /** 一个被 @ 提及的文件被编辑了 */
  | {
      type: 'edited_text_file'
      filename: string
      snippet: string
    }
  | {
      type: 'edited_image_file'
      filename: string
      content: FileReadToolOutput
    }
  | {
      type: 'directory'
      path: string
      content: string
      /** 创建时相对于 CWD 的路径，用于稳定显示 */
      displayPath: string
    }
  | {
      type: 'selected_lines_in_ide'
      ideName: string
      lineStart: number
      lineEnd: number
      filename: string
      content: string
      /** 创建时相对于 CWD 的路径，用于稳定显示 */
      displayPath: string
    }
  | {
      type: 'opened_file_in_ide'
      filename: string
    }
  | {
      type: 'todo_reminder'
      content: TodoList
      itemCount: number
    }
  | {
      type: 'task_reminder'
      content: Task[]
      itemCount: number
    }
  | {
      type: 'nested_memory'
      path: string
      content: MemoryFileInfo
      /** 创建时相对于 CWD 的路径，用于稳定显示 */
      displayPath: string
    }
  | {
      type: 'relevant_memories'
      memories: {
        path: string
        content: string
        mtimeMs: number
        /** 预计算好的头部字符串（时间 + 路径前缀）。在附件创建时计算一次，以便渲染的字节在多个回合中保持稳定——在渲染时重新计算 memoryAge(mtimeMs) 会调用 Date.now()，导致“3 天前保存”在多个回合后变成“4 天前保存”→ 字节不同 → 提示缓存失效。为向后兼容恢复的会话而设为可选；如果缺失，渲染路径会回退到重新计算。 */
        header?: string
        /** 当文件被 readMemoriesForSurfacing 截断时的 lineCount，否则为 undefined。传递给 readFileState 写入，以便 getChangedFiles 跳过被截断的记忆（部分内容会产生误导性的差异）。 */
        limit?: number
      }[]
    }
  | {
      type: 'dynamic_skill'
      skillDir: string
      skillNames: string[]
      /** 创建时相对于 CWD 的路径，用于稳定显示 */
      displayPath: string
    }
  | {
      type: 'skill_listing'
      content: string
      skillCount: number
      isInitial: boolean
    }
  | {
      type: 'skill_discovery'
      skills: {
        name: string
        description: string
        shortId?: string
        score?: number
        autoLoaded?: boolean
        content?: string
        path?: string
      }[]
      signal: DiscoverySignal
      source: 'native' | 'aki' | 'both'
      gap?: {
        key: string
        status: 'pending' | 'draft' | 'active'
        draftName?: string
        draftPath?: string
        activeName?: string
        activePath?: string
      }
    }
  | {
      type: 'queued_command'
      prompt: string | Array<ContentBlockParam>
      source_uuid?: UUID
      imagePasteIds?: number[]
      /** 原始队列模式——用户消息为 'prompt'，系统事件为 'task-notification' */
      commandMode?: string
      /** 从 QueuedCommand 携带的来源信息，以便在回合中清空时保留它 */
      origin?: MessageOrigin
      /** 从 QueuedCommand.isMeta 携带——区分人工输入和系统注入 */
      isMeta?: boolean
    }
  | {
      type: 'output_style'
      style: string
    }
  | {
      type: 'diagnostics'
      files: DiagnosticFile[]
      isNew: boolean
    }
  | {
      type: 'plan_mode'
      reminderType: 'full' | 'sparse'
      isSubAgent?: boolean
      planFilePath: string
      planExists: boolean
    }
  | {
      type: 'plan_mode_reentry'
      planFilePath: string
    }
  | {
      type: 'plan_mode_exit'
      planFilePath: string
      planExists: boolean
    }
  | {
      type: 'auto_mode'
      reminderType: 'full' | 'sparse'
    }
  | {
      type: 'auto_mode_exit'
    }
  | {
      type: 'critical_system_reminder'
      content: string
    }
  | {
      type: 'plan_file_reference'
      planFilePath: string
      planContent: string
    }
  | {
      type: 'mcp_resource'
      server: string
      uri: string
      name: string
      description?: string
      content: ReadResourceResult
    }
  | {
      type: 'command_permissions'
      allowedTools: string[]
      model?: string
    }
  | AgentMentionAttachment
  | {
      type: 'task_status'
      taskId: string
      taskType: TaskType
      status: TaskStatus
      description: string
      deltaSummary: string | null
      outputFilePath?: string
    }
  | AsyncHookResponseAttachment
  | {
      type: 'token_usage'
      used: number
      total: number
      remaining: number
    }
  | {
      type: 'budget_usd'
      used: number
      total: number
      remaining: number
    }
  | {
      type: 'output_token_usage'
      turn: number
      session: number
      budget: number | null
    }
  | {
      type: 'structured_output'
      data: unknown
    }
  | TeammateMailboxAttachment
  | TeamContextAttachment
  | HookAttachment
  | {
      type: 'invoked_skills'
      skills: Array<{
        name: string
        path: string
        content: string
      }>
    }
  | {
      type: 'verify_plan_reminder'
    }
  | {
      type: 'max_turns_reached'
      maxTurns: number
      turnCount: number
    }
  | {
      type: 'current_session_memory'
      content: string
      path: string
      tokenCount: number
    }
  | {
      type: 'teammate_shutdown_batch'
      count: number
    }
  | {
      type: 'compaction_reminder'
    }
  | {
      type: 'context_efficiency'
    }
  | {
      type: 'date_change'
      newDate: string
    }
  | {
      type: 'ultrathink_effort'
      level: 'high'
    }
  | {
      type: 'deferred_tools_delta'
      addedNames: string[]
      addedLines: string[]
      removedNames: string[]
    }
  | {
      type: 'agent_listing_delta'
      addedTypes: string[]
      addedLines: string[]
      removedTypes: string[]
      /** 当这是会话中的第一个公告时为 true，第一次告诉大模型有哪些agent */
      isInitial: boolean
      /** 是否包含“并发启动多个代理”的说明（非专业版订阅） */
      showConcurrencyNote: boolean
    }
  | {
      type: 'mcp_instructions_delta'
      addedNames: string[]
      addedBlocks: string[]
      removedNames: string[]
    }
  | {
      type: 'companion_intro'
      name: string
      species: string
    }
  | {
      type: 'bagel_console'
      errorCount: number
      warningCount: number
      sample: string
    }

export type TeammateMailboxAttachment = {
  type: 'teammate_mailbox'
  messages: Array<{
    from: string
    text: string
    timestamp: string
    color?: string
    summary?: string
  }>
}

export type TeamContextAttachment = {
  type: 'team_context'
  agentId: string
  agentName: string
  teamName: string
  teamConfigPath: string
  taskListPath: string
}

/** 这很粗糙
TODO: 在创建消息时生成附件 */
export async function getAttachments(
  input: string | null,
  toolUseContext: ToolUseContext,
  ideSelection: IDESelection | null,
  queuedCommands: QueuedCommand[],
  messages?: Message[],
  querySource?: QuerySource,
  options?: { skipSkillDiscovery?: boolean },
): Promise<Attachment[]> {
  if (
    isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS) ||
    isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
  ) {
    // query.ts:removeFromQueue 在 getAttachment
    // Messages 运行后无条件地将这些出队——此处返回 [] 会静默丢弃它们。Cowor
    // ker 使用 --bare 运行，并依赖 task-notification 来接
    // 收来自 Local*Task/Remote*Task 的工具调用中通知。
    return getQueuedCommandAttachments(queuedCommands)
  }

  // 这会减慢提交速度 TO
  // DO: 在用户输入时计算附件，而不是在这里（尽管我们
  // 也为斜杠命令提示使用此函数）
  const abortController = createAbortController()
  const timeoutId = setTimeout(ac => ac.abort(), 1000, abortController)
  const context = { ...toolUseContext, abortController }

  const isMainThread = !toolUseContext.agentId

  // 响应用户输入而添加的附件
  const userInputAttachments = input
    ? [
        maybe('at_mentioned_files', () =>
          processAtMentionedFiles(input, context),
        ),
        maybe('mcp_resources', () =>
          processMcpResourceAttachments(input, context),
        ),
        maybe('agent_mentions', () =>
          Promise.resolve(
            processAgentMentions(
              input,
              toolUseContext.options.agentDefinitions.activeAgents,
            ),
          ),
        ),
        // 在第 0 回合进行技能发现（用户输入作为信号）。
        // 回合间技能发现通过 query.ts 中的 startSkillDiscoveryPrefetch 函数运行，
        // 并基于 write-pivot 检测进行门控——参见 skillSearch/prefetch.ts。
        // 此处的 feature() 函数允许 DCE 从外部构建中移除 'skill_discovery' 字符串（及其调用的函数）。
        // skipSkillDiscovery 函数会阻止 SKILL.md 展开路径（getMessagesForPromptSlashCommand）的执行。
        // 当技能被调用时，其 SKILL.md 内容会作为“input”传递到此处以提取 @ 提及——但该内容并非用户意图，
        // 因此不应触发技能发现。如果没有此门控，一个 110KB 的 SKILL.md
        // 文件会在每次技能调用时触发约 3.3 秒的分块 AKI 查询（会话 13a9afae）。
        ...(feature('EXPERIMENTAL_SKILL_SEARCH') &&
        skillSearchModules &&
        !options?.skipSkillDiscovery
          ? [
              maybe('skill_discovery', async () => {
                if (suppressNextDiscovery) {
                  suppressNextDiscovery = false
                  return []
                }
                const result =
                  await skillSearchModules.prefetch.getTurnZeroSkillDiscovery(
                    input,
                    messages ?? [],
                    context,
                  )
                return result ? [result] : []
              }),
            ]
          : []),
      ]
    : []

  // 首先处理用户输入附件（包括 @mentioned 文件）这确保文件在 n
  // ested_memory 处理它们之前被添加到 nestedMemoryAttachmentTriggers
  const userAttachmentResults = await Promise.all(userInputAttachments)

  // 子代理中可用的线程安全附件注意：这些必须在 userI
  // nputAttachments 完成后创建，以确保在 getNestedMemoryA
  // ttachments 运行之前填充 nestedMemoryAttachmentTriggers
  const allThreadAttachments = [
    // queuedCommands 已经通过 query.ts 中的 drain ga
    // te 按代理作用域划分——主线程获取 agentId===undefined，子
    // 代理获取它们自己的 agentId。必须为所有线程运行，否则子代理通知会排入虚空
    // （被 removeFromQueue 从队列中移除但从未附加）。
    maybe('queued_commands', () => getQueuedCommandAttachments(queuedCommands)),
    maybe('date_change', () =>
      Promise.resolve(getDateChangeAttachments(messages)),
    ),
    maybe('ultrathink_effort', () =>
      Promise.resolve(getUltrathinkEffortAttachment(input)),
    ),
    maybe('deferred_tools_delta', () =>
      Promise.resolve(
        getDeferredToolsDeltaAttachment(
          toolUseContext.options.tools,
          toolUseContext.options.mainLoopModel,
          messages,
          {
            callSite: isMainThread
              ? 'attachments_main'
              : 'attachments_subagent',
            querySource,
          },
        ),
      ),
    ),
    maybe('agent_listing_delta', () =>
      Promise.resolve(getAgentListingDeltaAttachment(toolUseContext, messages)),
    ),
    maybe('mcp_instructions_delta', () =>
      Promise.resolve(
        getMcpInstructionsDeltaAttachment(
          toolUseContext.options.mcpClients,
          toolUseContext.options.tools,
          toolUseContext.options.mainLoopModel,
          messages,
        ),
      ),
    ),
    ...(feature('BUDDY')
      ? [
          maybe('companion_intro', () =>
            Promise.resolve(getCompanionIntroAttachment(messages)),
          ),
        ]
      : []),
    maybe('changed_files', () => getChangedFiles(context)),
    maybe('nested_memory', () => getNestedMemoryAttachments(context)),
    // relevant_memories 已移至异步预取（startRelevantMemoryPrefetch）
    maybe('dynamic_skill', () => getDynamicSkillAttachments(context)),
    maybe('skill_listing', () => getSkillListingAttachments(context)),
    // 回合间技能发现现在通过 startSkillDiscoveryPrefetc
    // h 运行（query.ts，与主回合并发）。之前位于此处的阻塞调用是 as
    // sistant_turn 信号——在生产环境中，这些 Haiku 调用中有
    // 97% 没有找到任何内容。预取 + 收集时等待取代了它；参见 src/se
    // rvices/skillSearch/prefetch.ts。
    maybe('plan_mode', () => getPlanModeAttachments(messages, toolUseContext)),
    maybe('plan_mode_exit', () => getPlanModeExitAttachment(toolUseContext)),
    ...(feature('TRANSCRIPT_CLASSIFIER')
      ? [
          maybe('auto_mode', () =>
            getAutoModeAttachments(messages, toolUseContext),
          ),
          maybe('auto_mode_exit', () =>
            getAutoModeExitAttachment(toolUseContext),
          ),
        ]
      : []),
    maybe('todo_reminders', () =>
      isTodoV2Enabled()
        ? getTaskReminderAttachments(messages, toolUseContext)
        : getTodoReminderAttachments(messages, toolUseContext),
    ),
    ...(isAgentSwarmsEnabled()
      ? [
          // 为 session_memory 分叉代理跳过队友邮
          // 箱。它与领导者共享 AppState.teamContext，因
          // 此 isTeamLead 解析为 true，它会读取并将领导者的 D
          // M 标记为已读作为临时附件，静默窃取本应作为永久回合传递的消息。
          ...(querySource === 'session_memory'
            ? []
            : [
                maybe('teammate_mailbox', async () =>
                  getTeammateMailboxAttachments(toolUseContext),
                ),
              ]),
          maybe('team_context', async () =>
            getTeamContextAttachment(messages ?? []),
          ),
        ]
      : []),
    maybe('agent_pending_messages', async () =>
      getAgentPendingMessageAttachments(toolUseContext),
    ),
    maybe('critical_system_reminder', () =>
      Promise.resolve(getCriticalSystemReminderAttachment(toolUseContext)),
    ),
    ...(feature('COMPACTION_REMINDERS')
      ? [
          maybe('compaction_reminder', () =>
            Promise.resolve(
              getCompactionReminderAttachment(
                messages ?? [],
                toolUseContext.options.mainLoopModel,
              ),
            ),
          ),
        ]
      : []),
    ...(feature('HISTORY_SNIP')
      ? [
          maybe('context_efficiency', () =>
            Promise.resolve(getContextEfficiencyAttachment(messages ?? [])),
          ),
        ]
      : []),
  ]

  // 语义上仅适用于主对话或没有并发安全实现的附件
  const mainThreadAttachments = isMainThread
    ? [
        maybe('ide_selection', async () =>
          getSelectedLinesFromIDE(ideSelection, toolUseContext),
        ),
        maybe('ide_opened_file', async () =>
          getOpenedFileFromIDE(ideSelection, toolUseContext),
        ),
        maybe('output_style', async () =>
          Promise.resolve(getOutputStyleAttachment()),
        ),
        maybe('diagnostics', async () =>
          getDiagnosticAttachments(toolUseContext),
        ),
        maybe('lsp_diagnostics', async () =>
          getLSPDiagnosticAttachments(toolUseContext),
        ),
        maybe('unified_tasks', async () =>
          getUnifiedTaskAttachments(toolUseContext),
        ),
        maybe('async_hook_responses', async () =>
          getAsyncHookResponseAttachments(),
        ),
        maybe('token_usage', async () =>
          Promise.resolve(
            getTokenUsageAttachment(
              messages ?? [],
              toolUseContext.options.mainLoopModel,
            ),
          ),
        ),
        maybe('budget_usd', async () =>
          Promise.resolve(
            getMaxBudgetUsdAttachment(toolUseContext.options.maxBudgetUsd),
          ),
        ),
        maybe('output_token_usage', async () =>
          Promise.resolve(getOutputTokenUsageAttachment()),
        ),
        maybe('verify_plan_reminder', async () =>
          getVerifyPlanReminderAttachment(messages, toolUseContext),
        ),
      ]
    : []

  // 并行处理线程和主线程附件（它们之间没有依赖关系）
  const [threadAttachmentResults, mainThreadAttachmentResults] =
    await Promise.all([
      Promise.all(allThreadAttachments),
      Promise.all(mainThreadAttachments),
    ])

  clearTimeout(timeoutId)
  // Defensive: a getter leaking [undefined] crashes .map(a => a.type) below.
  return (
    [
      ...userAttachmentResults.flat(),
      ...threadAttachmentResults.flat(),
      ...mainThreadAttachmentResults.flat(),
    ] as Attachment[]
  ).filter(a => a !== undefined && a !== null)
}

async function maybe<A>(label: string, f: () => Promise<A[]>): Promise<A[]> {
  const startTime = Date.now()
  try {
    const result = await f()
    const duration = Date.now() - startTime
    // 仅记录 5% 的事件以减少数量
    if (Math.random() < 0.05) {
      // jsonStringify(undefined) 返回 undefined，因此 .length 会抛出错误
      const attachmentSizeBytes = result
        .filter(a => a !== undefined && a !== null)
        .reduce((total, attachment) => {
          return total + jsonStringify(attachment).length
        }, 0)
      logEvent('tengu_attachment_compute_duration', {
        label,
        duration_ms: duration,
        attachment_size_bytes: attachmentSizeBytes,
        attachment_count: result.length,
      } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
    }
    return result
  } catch (e) {
    const duration = Date.now() - startTime
    // 仅记录 5% 的事件以减少数量
    if (Math.random() < 0.05) {
      logEvent('tengu_attachment_compute_duration', {
        label,
        duration_ms: duration,
        error: true,
      } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
    }
    logError(e)
    // 对于 Ant 用户，记录完整错误以帮助调试
    logAntError(`附件错误位于 ${label}`, e)

    return []
  }
}

const INLINE_NOTIFICATION_MODES = new Set(['prompt', 'task-notification'])

export async function getQueuedCommandAttachments(
  queuedCommands: QueuedCommand[],
): Promise<Attachment[]> {
  if (!queuedCommands) {
    return []
  }
  // 将 'prompt' 和 'task-notification' 命令都作
  // 为附件包含。在主动代理循环期间，task-notification 命令否则会
  // 永久留在队列中（useQueueProcessor 在查询活动时无法运行），
  // 导致 hasPendingNotifications() 返回 true，并且
  // Sleep 会在无限循环中以 0ms 持续时间立即唤醒。
  const filtered = queuedCommands.filter(_ =>
    INLINE_NOTIFICATION_MODES.has(_.mode),
  )
  return Promise.all(
    filtered.map(async _ => {
      const imageBlocks = await buildImageContentBlocks(_.pastedContents)
      let prompt: string | Array<ContentBlockParam> = _.value
      if (imageBlocks.length > 0) {
        // 构建包含文本和图像的内容块数组，以便模型能看到它们
        const textValue =
          typeof _.value === 'string'
            ? _.value
            : extractTextContent(_.value, '\n')
        prompt = [{ type: 'text' as const, text: textValue }, ...imageBlocks]
      }
      return {
        type: 'queued_command' as const,
        prompt,
        source_uuid: _.uuid,
        imagePasteIds: getImagePasteIds(_.pastedContents),
        commandMode: _.mode,
        origin: _.origin,
        isMeta: _.isMeta,
      }
    }),
  )
}

export function getAgentPendingMessageAttachments(
  toolUseContext: ToolUseContext,
): Attachment[] {
  const agentId = toolUseContext.agentId
  if (!agentId) return []
  const drained = drainPendingMessages(
    agentId,
    toolUseContext.getAppState,
    toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState,
  )
  return drained.map(msg => ({
    type: 'queued_command' as const,
    prompt: msg,
    origin: { kind: 'coordinator' as const } as unknown as MessageOrigin,
    isMeta: true,
  }))
}

async function buildImageContentBlocks(
  pastedContents: Record<number, PastedContent> | undefined,
): Promise<ImageBlockParam[]> {
  if (!pastedContents) {
    return []
  }
  const imageContents = Object.values(pastedContents).filter(isValidImagePaste)
  if (imageContents.length === 0) {
    return []
  }
  const results = await Promise.all(
    imageContents.map(async img => {
      const imageBlock: ImageBlockParam = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: (img.mediaType ||
            'image/png') as Base64ImageSource['media_type'],
          data: img.content,
        },
      }
      const resized = await maybeResizeAndDownsampleImageBlock(imageBlock)
      return resized.block
    }),
  )
  return results
}

function getPlanModeAttachmentTurnCount(messages: Message[]): {
  turnCount: number
  foundPlanModeAttachment: boolean
} {
  let turnsSinceLastAttachment = 0
  let foundPlanModeAttachment = false

  // 向后迭代以找到最近的 plan_mode 附件。计算 HUM
  // AN 回合（非 meta、非 tool-result 的用户消息），而不是助
  // 手消息——query.ts 中的工具循环在每轮工具调用时都会调用 getA
  // ttachmentMessages，因此计算助手消息会导致每 5 次工具调
  // 用就触发一次提醒，而不是每 5 次人类回合。
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]

    if (
      message?.type === 'user' &&
      !message.isMeta &&
      !hasToolResultContent(message.message!.content)
    ) {
      turnsSinceLastAttachment++
    } else if (
      message?.type === 'attachment' &&
      (message.attachment!.type === 'plan_mode' ||
        message.attachment!.type === 'plan_mode_reentry')
    ) {
      foundPlanModeAttachment = true
      break
    }
  }

  return { turnCount: turnsSinceLastAttachment, foundPlanModeAttachment }
}

/** 计算自上次 plan_mode_exit 以来的 plan_mode 附件数量（如果没有退出，则从开始计算）。这确保在重新进入计划模式时，完整/稀疏周期会重置。 */
function countPlanModeAttachmentsSinceLastExit(messages: Message[]): number {
  let count = 0
  // 向后迭代 - 如果遇到 plan_mode_exit，则停止计数
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.type === 'attachment') {
      if (message.attachment!.type === 'plan_mode_exit') {
        break // 在上次退出处停止计数
      }
      if (message.attachment!.type === 'plan_mode') {
        count++
      }
    }
  }
  return count
}

async function getPlanModeAttachments(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const appState = toolUseContext.getAppState()
  const permissionContext = appState.toolPermissionContext
  if (permissionContext.mode !== 'plan') {
    return []
  }

  // 检查是否应根据回合数附加（首次回合除外）
  if (messages && messages.length > 0) {
    const { turnCount, foundPlanModeAttachment } =
      getPlanModeAttachmentTurnCount(messages)
    // 仅当之前已发送过 plan_mode 附件时才进行节
    // 流在计划模式的首次回合，总是附加
    if (
      foundPlanModeAttachment &&
      turnCount < PLAN_MODE_ATTACHMENT_CONFIG.TURNS_BETWEEN_ATTACHMENTS
    ) {
      return []
    }
  }

  const planFilePath = getPlanFilePath(toolUseContext.agentId)
  const existingPlan = getPlan(toolUseContext.agentId)

  const attachments: Attachment[] = []

  // 检查是否重新进入：标志已设置且计划文件存在
  if (hasExitedPlanModeInSession() && existingPlan !== null) {
    attachments.push({ type: 'plan_mode_reentry', planFilePath })
    setHasExitedPlanMode(false) // 清除标志 - 一次性指导
  }

  // 确定这应该是完整提醒还是稀疏提醒完整提醒在
  // 第 1、6、11...次（每第 N 个附件）
  const attachmentCount =
    countPlanModeAttachmentsSinceLastExit(messages ?? []) + 1
  const reminderType: 'full' | 'sparse' =
    attachmentCount %
      PLAN_MODE_ATTACHMENT_CONFIG.FULL_REMINDER_EVERY_N_ATTACHMENTS ===
    1
      ? 'full'
      : 'sparse'

  // 总是添加主要的 plan_mode 附件
  attachments.push({
    type: 'plan_mode',
    reminderType,
    isSubAgent: !!toolUseContext.agentId,
    planFilePath,
    planExists: existingPlan !== null,
  })

  return attachments
}

/** 如果我们刚刚退出计划模式，则返回一个 plan_mode_exit 附件。这是一个一次性通知，告诉模型它不再处于计划模式。 */
async function getPlanModeExitAttachment(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  // 仅当标志已设置时才触发（我们刚刚退出计划模式）
  if (!needsPlanModeExitAttachment()) {
    return []
  }

  const appState = toolUseContext.getAppState()
  if (appState.toolPermissionContext.mode === 'plan') {
    setNeedsPlanModeExitAttachment(false)
    return []
  }

  // 清除标志 - 这是一个一次性通知
  setNeedsPlanModeExitAttachment(false)

  const planFilePath = getPlanFilePath(toolUseContext.agentId)
  const planExists = getPlan(toolUseContext.agentId) !== null

  // 注意：技能发现不会在计划退出时触发。当计划写好时，
  // 已经太晚了——模型在规划时就应该拥有相关技能。us
  // er_message 信号已经在触发规划的请求
  // （“计划如何部署这个”）时触发，这才是正确的时机。
  return [{ type: 'plan_mode_exit', planFilePath, planExists }]
}

function getAutoModeAttachmentTurnCount(messages: Message[]): {
  turnCount: number
  foundAutoModeAttachment: boolean
} {
  let turnsSinceLastAttachment = 0
  let foundAutoModeAttachment = false

  // 向后迭代以找到最近的 auto_mode 附件。计算 HU
  // MAN 回合（非 meta、非 tool-result 的用户消息），而
  // 不是助手消息——query.ts 中的工具循环在每轮工具调用时都会调用
  // getAttachmentMessages，因此如果计算助手消息，一
  // 个包含 100 次工具调用的单个人类回合会触发约 20 次提醒。自动模式
  // 的目标用例是长代理会话，这在每个会话中会累积 60-105 次。
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]

    if (
      message?.type === 'user' &&
      !message.isMeta &&
      !hasToolResultContent(message.message!.content)
    ) {
      turnsSinceLastAttachment++
    } else if (
      message?.type === 'attachment' &&
      message.attachment!.type === 'auto_mode'
    ) {
      foundAutoModeAttachment = true
      break
    } else if (
      message?.type === 'attachment' &&
      message.attachment!.type === 'auto_mode_exit'
    ) {
      // 退出重置节流——视为没有先前的附件存在
      break
    }
  }

  return { turnCount: turnsSinceLastAttachment, foundAutoModeAttachment }
}

/** 计算自上次 auto_mode_exit 以来的 auto_mode 附件数量（如果没有退出，则从开始计算）。这确保在重新进入自动模式时，完整/稀疏周期会重置。 */
function countAutoModeAttachmentsSinceLastExit(messages: Message[]): number {
  let count = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.type === 'attachment') {
      if (message.attachment!.type === 'auto_mode_exit') {
        break
      }
      if (message.attachment!.type === 'auto_mode') {
        count++
      }
    }
  }
  return count
}

async function getAutoModeAttachments(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const appState = toolUseContext.getAppState()
  const permissionContext = appState.toolPermissionContext
  const inAuto = permissionContext.mode === 'auto'
  const inPlanWithAuto =
    permissionContext.mode === 'plan' &&
    (autoModeStateModule?.isAutoModeActive() ?? false)
  if (!inAuto && !inPlanWithAuto) {
    return []
  }

  // 检查是否应根据回合数附加（首次回合除外）
  if (messages && messages.length > 0) {
    const { turnCount, foundAutoModeAttachment } =
      getAutoModeAttachmentTurnCount(messages)
    // 仅当之前已发送过 auto_mode 附件时才进行节
    // 流在自动模式的首次回合，总是附加
    if (
      foundAutoModeAttachment &&
      turnCount < AUTO_MODE_ATTACHMENT_CONFIG.TURNS_BETWEEN_ATTACHMENTS
    ) {
      return []
    }
  }

  // 确定这应该是完整提醒还是稀疏提醒
  const attachmentCount =
    countAutoModeAttachmentsSinceLastExit(messages ?? []) + 1
  const reminderType: 'full' | 'sparse' =
    attachmentCount %
      AUTO_MODE_ATTACHMENT_CONFIG.FULL_REMINDER_EVERY_N_ATTACHMENTS ===
    1
      ? 'full'
      : 'sparse'

  return [{ type: 'auto_mode', reminderType }]
}

/** 如果我们刚刚退出自动模式，则返回一个 auto_mode_exit 附件。这是一个一次性通知，告诉模型它不再处于自动模式。 */
async function getAutoModeExitAttachment(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (!needsAutoModeExitAttachment()) {
    return []
  }

  const appState = toolUseContext.getAppState()
  // 当自动模式仍处于活动状态时抑制——涵盖 mode==='auto' 和 plan-wit
  // h-auto-active（其中 mode==='plan' 但分类器运行）两种情况。
  if (
    appState.toolPermissionContext.mode === 'auto' ||
    (autoModeStateModule?.isAutoModeActive() ?? false)
  ) {
    setNeedsAutoModeExitAttachment(false)
    return []
  }

  setNeedsAutoModeExitAttachment(false)
  return [{ type: 'auto_mode_exit' }]
}

/** 检测自上次回合以来本地日期是否已更改（用户编码到午夜之后）并发出附件以通知模型。date_change 附件附加在对话的尾部，因此模型可以了解新日期而无需修改缓存的 prefix。messages[0]（来自 getUserContext → prependUserContext）有意保留过时的日期——清除该缓存会重新生成 prefix，并在下一个回合将整个对话变为 cache_creation（每个通宵会话每次跨越午夜约 920K 有效 tokens）。导出用于测试——作为缓存清除移除的回归防护。 */
export function getDateChangeAttachments(
  messages: Message[] | undefined,
): Attachment[] {
  const currentDate = getLocalISODate()
  const lastDate = getLastEmittedDate()

  if (lastDate === null) {
    // 首次回合——仅记录，无需附件
    setLastEmittedDate(currentDate)
    return []
  }

  if (currentDate === lastDate) {
    return []
  }

  setLastEmittedDate(currentDate)

  // 助手模式：将昨天的记录刷新到每日文件中，以便 /dream 技
  // 能（本地时间凌晨 1-5 点）即使今天没有触发压缩也能找到它。
  // 触发后不管；writeSessionTranscriptSe
  // gment 按消息时间戳分桶，因此多天的间隔会正确刷新每一天。
  if (feature('KAIROS')) {
    if (getKairosActive() && messages !== undefined) {
      sessionTranscriptModule?.flushOnDateChange(messages, currentDate)
    }
  }

  return [{ type: 'date_change', newDate: currentDate }]
}

function getUltrathinkEffortAttachment(input: string | null): Attachment[] {
  if (!isUltrathinkEnabled() || !input || !hasUltrathinkKeyword(input)) {
    return []
  }
  logEvent('tengu_ultrathink', {})
  return [{ type: 'ultrathink_effort', level: 'high' }]
}

// 导出供 compact.ts 使用——两个调用点的门控必须相同。
export function getDeferredToolsDeltaAttachment(
  tools: Tools,
  model: string,
  messages: Message[] | undefined,
  scanContext?: DeferredToolsDeltaScanContext,
): Attachment[] {
  if (!isDeferredToolsDeltaEnabled()) return []
  // 这三个检查镜像了 isToolSearchEnabled 的同步
  // 部分——附件文本说“可通过 ToolSearch 使用”，因此
  // ToolSearch 必须实际存在于请求中。异步自动阈值检查未复
  // 制（会导致 tengu_tool_search_mode_decis
  // ion 重复触发）；在低于阈值的 tst-auto 中，附件可能在
  // ToolSearch 被过滤掉时触发，但这是个别情况，并且宣布
  // 的工具本身也是可以直接调用的。
  if (!isToolSearchEnabledOptimistic()) return []
  if (!modelSupportsToolReference(model)) return []
  if (!isToolSearchToolAvailable(tools)) return []
  const delta = getDeferredToolsDelta(tools, messages ?? [], scanContext)
  if (!delta) return []
  return [{ type: 'deferred_tools_delta', ...delta }]
}

/** 将当前过滤后的代理池与此对话中已宣布的内容（从先前的 agent_listing_delta 附件重建）进行差异比较。如果无更改或门控关闭，则返回 []。代理列表曾嵌入在 AgentTool 的描述中，导致约 10.2% 的舰队 cache_creation：MCP 异步连接、/reload-plugins 或权限模式更改 → 描述更改 → 完整的工具模式缓存失效。将列表移至此处可保持工具描述静态。导出供 compact.ts 使用——在压缩消耗掉先前的增量后重新宣布完整集合。 */
export function getAgentListingDeltaAttachment(
  toolUseContext: ToolUseContext,
  messages: Message[] | undefined,
): Attachment[] {
  if (!shouldInjectAgentListInMessages()) return []

  // 如果 AgentTool 不在池中则跳过——该列表将无法操作。
  if (
    !toolUseContext.options.tools.some(t => toolMatchesName(t, AGENT_TOOL_NAME))
  ) {
    return []
  }

  const { activeAgents, allowedAgentTypes } =
    toolUseContext.options.agentDefinitions

  // 镜像 AgentTool.prompt() 的过滤：MCP 要求 → 拒绝规则 → a
  // llowedAgentTypes 限制。保持与 AgentTool.tsx 同步。
  const mcpServers = new Set<string>()
  for (const tool of toolUseContext.options.tools) {
    const info = mcpInfoFromString(tool.name)
    if (info) mcpServers.add(info.serverName)
  }
  const permissionContext = toolUseContext.getAppState().toolPermissionContext
  let filtered = filterDeniedAgents(
    filterAgentsByMcpRequirements(activeAgents, [...mcpServers]),
    permissionContext,
    AGENT_TOOL_NAME,
  )
  if (allowedAgentTypes) {
    filtered = filtered.filter(a => allowedAgentTypes.includes(a.agentType))
  }

  // 从对话记录中先前的增量重建已宣布的集合。
  const announced = new Set<string>()
  for (const msg of messages ?? []) {
    if (msg.type !== 'attachment') continue
    if (msg.attachment!.type !== 'agent_listing_delta') continue
    for (const t of msg.attachment!.addedTypes as string[]) announced.add(t)
    for (const t of msg.attachment!.removedTypes as string[])
      announced.delete(t)
  }

  const currentTypes = new Set(filtered.map(a => a.agentType))
  const added = filtered.filter(a => !announced.has(a.agentType))
  const removed: string[] = []
  for (const t of announced) {
    if (!currentTypes.has(t)) removed.push(t)
  }

  if (added.length === 0 && removed.length === 0) return []

  // 排序以确保确定性输出——代理加载顺序是不确定的（插
  // 件加载竞争、MCP异步连接）。
  added.sort((a, b) => a.agentType.localeCompare(b.agentType))
  removed.sort()

  return [
    {
      type: 'agent_listing_delta',
      addedTypes: added.map(a => a.agentType),
      addedLines: added.map(formatAgentLine),
      removedTypes: removed,
      isInitial: announced.size === 0,
      showConcurrencyNote: getSubscriptionType() !== 'pro',
    },
  ]
}

// 导出供 compact.ts / reactiveCompact.ts 使用——作为门控的单一事实来源。
export function getMcpInstructionsDeltaAttachment(
  mcpClients: MCPServerConnection[],
  tools: Tools,
  model: string,
  messages: Message[] | undefined,
): Attachment[] {
  if (!isMcpInstructionsDeltaEnabled()) return []

  // chrome ToolSearch 提示由客户端编写且依赖于 ToolSear
  // ch 条件；实际的服务器 `instructions` 是无条件的。在此处决
  // 定 chrome 部分，将其作为合成条目传递给纯 diff。
  const clientSide: ClientSideInstruction[] = []
  if (
    isToolSearchEnabledOptimistic() &&
    modelSupportsToolReference(model) &&
    isToolSearchToolAvailable(tools)
  ) {
    clientSide.push({
      serverName: CLAUDE_IN_CHROME_MCP_SERVER_NAME,
      block: CHROME_TOOL_SEARCH_INSTRUCTIONS,
    })
  }

  const delta = getMcpInstructionsDelta(mcpClients, messages ?? [], clientSide)
  if (!delta) return []
  return [{ type: 'mcp_instructions_delta', ...delta }]
}

function getCriticalSystemReminderAttachment(
  toolUseContext: ToolUseContext,
): Attachment[] {
  const reminder = toolUseContext.criticalSystemReminder_EXPERIMENTAL
  if (!reminder) {
    return []
  }
  return [{ type: 'critical_system_reminder', content: reminder }]
}

function getOutputStyleAttachment(): Attachment[] {
  const settings = getSettings_DEPRECATED()
  const outputStyle = settings?.outputStyle || 'default'

  // 仅对非默认样式显示
  if (outputStyle === 'default') {
    return []
  }

  return [
    {
      type: 'output_style',
      style: outputStyle,
    },
  ]
}

async function getSelectedLinesFromIDE(
  ideSelection: IDESelection | null,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const ideName = getConnectedIdeName(toolUseContext.options.mcpClients)
  if (
    !ideName ||
    ideSelection?.lineStart === undefined ||
    !ideSelection.text ||
    !ideSelection.filePath
  ) {
    return []
  }

  const appState = toolUseContext.getAppState()
  if (isFileReadDenied(ideSelection.filePath, appState.toolPermissionContext)) {
    return []
  }

  return [
    {
      type: 'selected_lines_in_ide',
      ideName,
      lineStart: ideSelection.lineStart,
      lineEnd: ideSelection.lineStart + ideSelection.lineCount - 1,
      filename: ideSelection.filePath,
      content: ideSelection.text,
      displayPath: relative(getCwd(), ideSelection.filePath),
    },
  ]
}

/** 计算用于嵌套内存文件加载的待处理目录。
返回两个列表：
- nestedDirs：CWD 与 targetPath 之间的目录（处理 CLAUDE.md + 所有规则）
- cwdLevelDirs：从根目录到 CWD 的目录（仅处理条件规则）

@param targetPath 目标文件路径
@param originalCwd 原始当前工作目录
@returns 包含 nestedDirs 和 cwdLevelDirs 数组的对象，两者均按从父级到子级的顺序排列 */
export function getDirectoriesToProcess(
  targetPath: string,
  originalCwd: string,
): { nestedDirs: string[]; cwdLevelDirs: string[] } {
  // 构建从原始 CWD 到 targetPath 所在目录的目录列表
  const targetDir = dirname(resolve(targetPath))
  const nestedDirs: string[] = []
  let currentDir = targetDir

  // 从目标目录向上遍历至原始 CWD
  while (currentDir !== originalCwd && currentDir !== parse(currentDir).root) {
    if (currentDir.startsWith(originalCwd)) {
      nestedDirs.push(currentDir)
    }
    currentDir = dirname(currentDir)
  }

  // 反转以获得从 CWD 向下到目标的顺序
  nestedDirs.reverse()

  // 构建从根目录到 CWD 的目录列表（仅用于条件规则）
  const cwdLevelDirs: string[] = []
  currentDir = originalCwd

  while (currentDir !== parse(currentDir).root) {
    cwdLevelDirs.push(currentDir)
    currentDir = dirname(currentDir)
  }

  // 反转以获得从根目录到 CWD 的顺序
  cwdLevelDirs.reverse()

  return { nestedDirs, cwdLevelDirs }
}

/** 将内存文件转换为附件，过滤掉已加载的文件。

@param memoryFiles 要转换的内存文件
@param toolUseContext 工具使用上下文（用于跟踪已加载文件）
@returns 嵌套内存附件数组 */
function isInstructionsMemoryType(
  type: MemoryFileInfo['type'],
): type is InstructionsMemoryType {
  return (
    type === 'User' ||
    type === 'Project' ||
    type === 'Local' ||
    type === 'Managed'
  )
}

/** 导出供测试使用——作为 LRU 逐出后重新注入的回归防护。 */
export function memoryFilesToAttachments(
  memoryFiles: MemoryFileInfo[],
  toolUseContext: ToolUseContext,
  triggerFilePath?: string,
): Attachment[] {
  const attachments: Attachment[] = []
  const shouldFireHook = hasInstructionsLoadedHook()

  for (const memoryFile of memoryFiles) {
    // 去重：loadedNestedMemoryPaths 是一个不逐出的 Set
    // ；readFileState 是一个 100 条目的 LRU，在繁忙会话中会
    // 丢弃条目，因此仅依赖它会在每次逐出周期中重新注入相同的 CLAUDE.md。
    if (toolUseContext.loadedNestedMemoryPaths?.has(memoryFile.path)) {
      continue
    }
    if (!toolUseContext.readFileState.has(memoryFile.path)) {
      attachments.push({
        type: 'nested_memory',
        path: memoryFile.path,
        content: memoryFile,
        displayPath: relative(getCwd(), memoryFile.path),
      })
      toolUseContext.loadedNestedMemoryPaths?.add(memoryFile.path)

      // 在 readFileState 中标记为已加载——这通过上方的
      // .has() 检查提供跨函数和跨轮次的去重。
      //
      // 当注入的内容与磁盘不匹配时（剥离了 HTML 注释、剥离了 front
      // matter、截断了 MEMORY.md），使用 `isPartial
      // View: true` 缓存原始磁盘字节。编辑/写入操作看到该标志并要求
      // 先进行真正的读取；getChangedFiles 看到真实内容 + 未定
      // 义的偏移/限制，因此会话中的变更检测仍然有效。
      toolUseContext.readFileState.set(memoryFile.path, {
        content: memoryFile.contentDiffersFromDisk
          ? (memoryFile.rawContent ?? memoryFile.content)
          : memoryFile.content,
        timestamp: Date.now(),
        offset: undefined,
        limit: undefined,
        isPartialView: memoryFile.contentDiffersFromDisk,
      })

      // Fire InstructionsLoaded hook for audit/observability (fire-and-forget)
      if (shouldFireHook && isInstructionsMemoryType(memoryFile.type)) {
        const loadReason = memoryFile.globs
          ? 'path_glob_match'
          : memoryFile.parent
            ? 'include'
            : 'nested_traversal'
        void executeInstructionsLoadedHooks(
          memoryFile.path,
          memoryFile.type,
          loadReason,
          {
            globs: memoryFile.globs,
            triggerFilePath,
            parentFilePath: memoryFile.parent,
          },
        )
      }
    }
  }

  return attachments
}

/** 为给定文件路径加载嵌套内存文件并将其作为附件返回。
此函数执行目录遍历以查找适用于目标文件路径的 CLAUDE.md 文件和条件规则。

处理顺序（必须保持）：
1. 匹配 targetPath 的托管/用户条件规则
2. 嵌套目录（CWD → 目标）：CLAUDE.md + 无条件规则 + 条件规则
3. CWD 级别目录（根目录 → CWD）：仅条件规则

@param filePath 要获取嵌套内存文件的文件路径
@param toolUseContext 工具使用上下文
@param appState 包含工具权限上下文的应用程序状态
@returns 嵌套内存附件数组 */
async function getNestedMemoryAttachmentsForFile(
  filePath: string,
  toolUseContext: ToolUseContext,
  appState: { toolPermissionContext: ToolPermissionContext },
): Promise<Attachment[]> {
  const attachments: Attachment[] = []

  try {
    // 如果路径不在允许的工作路径中，则提前返回
    if (!pathInAllowedWorkingPath(filePath, appState.toolPermissionContext)) {
      return attachments
    }

    const processedPaths = new Set<string>()
    const originalCwd = getOriginalCwd()

    // 阶段 1：处理托管和用户条件规则
    const managedUserRules = await getManagedAndUserConditionalRules(
      filePath,
      processedPaths,
    )
    attachments.push(
      ...memoryFilesToAttachments(managedUserRules, toolUseContext, filePath),
    )

    // 阶段 2：获取要处理的目录
    const { nestedDirs, cwdLevelDirs } = getDirectoriesToProcess(
      filePath,
      originalCwd,
    )

    const skipProjectLevel = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_paper_halyard',
      false,
    )

    // 阶段 3：处理嵌套目录（CWD → 目标）
    // 每个目录获取：CLAUDE.md + 无条件规则 + 条件规则
    for (const dir of nestedDirs) {
      const memoryFiles = (
        await getMemoryFilesForNestedDirectory(dir, filePath, processedPaths)
      ).filter(
        f => !skipProjectLevel || (f.type !== 'Project' && f.type !== 'Local'),
      )
      attachments.push(
        ...memoryFilesToAttachments(memoryFiles, toolUseContext, filePath),
      )
    }

    // 阶段 4：处理 CWD 级别目录（根
    // 目录 → CWD）仅条件规则（无条件规则已预先加载）
    for (const dir of cwdLevelDirs) {
      const conditionalRules = (
        await getConditionalRulesForCwdLevelDirectory(
          dir,
          filePath,
          processedPaths,
        )
      ).filter(
        f => !skipProjectLevel || (f.type !== 'Project' && f.type !== 'Local'),
      )
      attachments.push(
        ...memoryFilesToAttachments(conditionalRules, toolUseContext, filePath),
      )
    }
  } catch (error) {
    logError(error)
  }

  return attachments
}

async function getOpenedFileFromIDE(
  ideSelection: IDESelection | null,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (!ideSelection?.filePath || ideSelection.text) {
    return []
  }

  const appState = toolUseContext.getAppState()
  if (isFileReadDenied(ideSelection.filePath, appState.toolPermissionContext)) {
    return []
  }

  // 获取嵌套内存文件
  const nestedMemoryAttachments = await getNestedMemoryAttachmentsForFile(
    ideSelection.filePath,
    toolUseContext,
    appState,
  )

  // 返回嵌套内存附件，后跟已打开的文件附件
  return [
    ...nestedMemoryAttachments,
    {
      type: 'opened_file_in_ide',
      filename: ideSelection.filePath,
    },
  ]
}

async function processAtMentionedFiles(
  input: string,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const files = extractAtMentionedFiles(input)
  if (files.length === 0) return []

  const appState = toolUseContext.getAppState()
  const results = await Promise.all(
    files.map(async file => {
      try {
        const { filename, lineStart, lineEnd } = parseAtMentionedFileLines(file)
        const absoluteFilename = expandPath(filename)

        if (
          isFileReadDenied(absoluteFilename, appState.toolPermissionContext)
        ) {
          return null
        }

        // 检查是否为目录
        try {
          const stats = await stat(absoluteFilename)
          if (stats.isDirectory()) {
            try {
              const entries = await readdir(absoluteFilename, {
                withFileTypes: true,
              })
              const MAX_DIR_ENTRIES = 1000
              const truncated = entries.length > MAX_DIR_ENTRIES
              const names = entries.slice(0, MAX_DIR_ENTRIES).map(e => e.name)
              if (truncated) {
                names.push(
                  `…以及另外 ${entries.length - MAX_DIR_ENTRIES} 个条目`,
                )
              }
              const stdout = names.join('\n')
              logEvent('tengu_at_mention_extracting_directory_success', {})

              return {
                type: 'directory' as const,
                path: absoluteFilename,
                content: stdout,
                displayPath: relative(getCwd(), absoluteFilename),
              }
            } catch {
              return null
            }
          }
        } catch {
          // 如果 stat 失败，则继续执行文件逻辑
        }

        return await generateFileAttachment(
          absoluteFilename,
          toolUseContext,
          'tengu_at_mention_extracting_filename_success',
          'tengu_at_mention_extracting_filename_error',
          'at-mention',
          {
            offset: lineStart,
            limit: lineEnd && lineStart ? lineEnd - lineStart + 1 : undefined,
          },
        )
      } catch {
        logEvent('tengu_at_mention_extracting_filename_error', {})
      }
    }),
  )
  return results.filter(Boolean) as Attachment[]
}

function processAgentMentions(
  input: string,
  agents: AgentDefinition[],
): Attachment[] {
  const agentMentions = extractAgentMentions(input)
  if (agentMentions.length === 0) return []

  const results = agentMentions.map(mention => {
    const agentType = mention.replace('agent-', '')
    const agentDef = agents.find(def => def.agentType === agentType)

    if (!agentDef) {
      logEvent('tengu_at_mention_agent_not_found', {})
      return null
    }

    logEvent('tengu_at_mention_agent_success', {})

    return {
      type: 'agent_mention' as const,
      agentType: agentDef.agentType,
    }
  })

  return results.filter(
    (result): result is NonNullable<typeof result> => result !== null,
  )
}

async function processMcpResourceAttachments(
  input: string,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const resourceMentions = extractMcpResourceMentions(input)
  if (resourceMentions.length === 0) return []

  const mcpClients = toolUseContext.options.mcpClients || []

  const results = await Promise.all(
    resourceMentions.map(async mention => {
      try {
        const [serverName, ...uriParts] = mention.split(':')
        const uri = uriParts.join(':') // 重新拼接，以防 URI 包含冒号

        if (!serverName || !uri) {
          logEvent('tengu_at_mention_mcp_resource_error', {})
          return null
        }

        // 查找 MCP 客户端
        const client = mcpClients.find(c => c.name === serverName)
        if (!client || client.type !== 'connected') {
          logEvent('tengu_at_mention_mcp_resource_error', {})
          return null
        }

        // 在可用资源中查找资源以获取其元数据
        const serverResources =
          toolUseContext.options.mcpResources?.[serverName] || []
        const resourceInfo = serverResources.find(r => r.uri === uri)
        if (!resourceInfo) {
          logEvent('tengu_at_mention_mcp_resource_error', {})
          return null
        }

        try {
          const result = await client.client.readResource({
            uri,
          })

          logEvent('tengu_at_mention_mcp_resource_success', {})

          return {
            type: 'mcp_resource' as const,
            server: serverName,
            uri,
            name: resourceInfo.name || uri,
            description: resourceInfo.description,
            content: result,
          }
        } catch (error) {
          logEvent('tengu_at_mention_mcp_resource_error', {})
          logError(error)
          return null
        }
      } catch {
        logEvent('tengu_at_mention_mcp_resource_error', {})
        return null
      }
    }),
  )

  return results.filter(
    (result): result is NonNullable<typeof result> => result !== null,
  ) as Attachment[]
}

export async function getChangedFiles(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const filePaths = cacheKeys(toolUseContext.readFileState)
  if (filePaths.length === 0) return []

  const appState = toolUseContext.getAppState()
  const results = await Promise.all(
    filePaths.map(async filePath => {
      const fileState = toolUseContext.readFileState.get(filePath)
      if (!fileState) return null

      // TODO：为变更的文件实现偏移/限制支持
      if (fileState.offset !== undefined || fileState.limit !== undefined) {
        return null
      }

      const normalizedPath = expandPath(filePath)

      // 检查文件是否配置了拒绝规则
      if (isFileReadDenied(normalizedPath, appState.toolPermissionContext)) {
        return null
      }

      try {
        const mtime = await getFileModificationTimeAsync(normalizedPath)
        if (mtime <= fileState.timestamp) {
          return null
        }

        const fileInput = { file_path: normalizedPath }

        // 验证文件路径是否有效
        const isValid = await FileReadTool.validateInput(
          fileInput,
          toolUseContext,
        )
        if (!isValid.result) {
          return null
        }

        const result = await FileReadTool.call(fileInput, toolUseContext)
        // 仅提取已更改的部分
        if (result.data.type === 'text') {
          const snippet = getSnippetForTwoFileDiff(
            fileState.content,
            result.data.file.content,
          )

          // 文件被触及但未修改
          if (snippet === '') {
            return null
          }

          return {
            type: 'edited_text_file' as const,
            filename: normalizedPath,
            snippet,
          }
        }

        // 对于非文本文件（如图像），应用与 FileReadTool 相同的令牌限制逻辑
        if (result.data.type === 'image') {
          try {
            const data = await readImageWithTokenBudget(normalizedPath)
            return {
              type: 'edited_image_file' as const,
              filename: normalizedPath,
              content: data,
            }
          } catch (compressionError) {
            logError(compressionError)
            logEvent('tengu_watched_file_compression_failed', {
              file: normalizedPath,
            } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
            return null
          }
        }

        // notebook / pdf / parts —— 无 diff 表
        // 示；显式设为 null，以便 map 回调没有隐式未定义的路径。
        return null
      } catch (err) {
        // 仅在 ENOENT（文件真正被删除）时逐出。瞬时的 s
        // tat 失败——原子保存竞争（编辑器写入 tmp→重命名
        // ，stat 恰好命中间隙）、EACCES 变动、网络文件
        // 系统故障——绝对不能逐出，否则即使文件仍然存在且模型刚
        // 刚读取过，下一次编辑也会失败并报错代码-6。VS
        // Code 自动保存/保存时格式化尤其频繁地触发此竞争。
        // 参见 PR #18525 的回归分析。
        if (isENOENT(err)) {
          toolUseContext.readFileState.delete(filePath)
        }
        return null
      }
    }),
  )
  return results.filter(result => result != null) as Attachment[]
}

/** 处理需要嵌套内存附件的路径并检查嵌套的 CLAUDE.md 文件
使用 ToolUseContext 中的 nestedMemoryAttachmentTriggers 字段 */
async function getNestedMemoryAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  // 首先检查触发器——getAppState() 会等待一个 Reac
  // t 渲染周期，而常见情况是触发器集合为空。
  if (
    !toolUseContext.nestedMemoryAttachmentTriggers ||
    toolUseContext.nestedMemoryAttachmentTriggers.size === 0
  ) {
    return []
  }

  const appState = toolUseContext.getAppState()
  const attachments: Attachment[] = []

  for (const filePath of toolUseContext.nestedMemoryAttachmentTriggers) {
    const nestedAttachments = await getNestedMemoryAttachmentsForFile(
      filePath,
      toolUseContext,
      appState,
    )
    attachments.push(...nestedAttachments)
  }

  toolUseContext.nestedMemoryAttachmentTriggers.clear()

  return attachments
}

async function getRelevantMemoryAttachments(
  input: string,
  agents: AgentDefinition[],
  readFileState: FileStateCache,
  recentTools: readonly string[],
  signal: AbortSignal,
  alreadySurfaced: ReadonlySet<string>,
  parentSpan?: unknown,
): Promise<Attachment[]> {
  // 如果代理被 @ 提及，则仅搜索其内存目录（隔离
  // ）。否则搜索自动内存目录。
  const memoryDirs = extractAgentMentions(input).flatMap(mention => {
    const agentType = mention.replace('agent-', '')
    const agentDef = agents.find(def => def.agentType === agentType)
    return agentDef?.memory
      ? [getAgentMemoryDir(agentType, agentDef.memory)]
      : []
  })
  const dirs = memoryDirs.length > 0 ? memoryDirs : [getAutoMemPath()]

  const allResults = await Promise.all(
    dirs.map(dir =>
      findRelevantMemories(
        input,
        dir,
        signal,
        recentTools,
        alreadySurfaced,
        parentSpan as Parameters<typeof findRelevantMemories>[5],
      ).catch(() => []),
    ),
  )
  // alreadySurfaced 在选择器内部被过滤，因此 Sonn
  // et 将其 5 个槽位的预算用于新候选；readFileStat
  // e 捕获模型通过 FileReadTool 读取的文件。此处冗余的
  // alreadySurfaced 检查是双重保险（多目录结果可能会
  // 重新引入选择器在不同目录中过滤掉的路径）。
  const selected = allResults
    .flat()
    .filter(m => !readFileState.has(m.path) && !alreadySurfaced.has(m.path))
    .slice(0, 5)

  const memories = await readMemoriesForSurfacing(selected, signal)

  if (memories.length === 0) {
    return []
  }
  return [{ type: 'relevant_memories' as const, memories }]
}

/** 扫描消息中过去的相关内存附件。返回已展示路径的集合（用于选择器去重）和累计字节数（用于会话总限制）。
 * 扫描消息而非在 toolUseContext 中跟踪意味着压缩会自然地重置两者——旧附件已从压缩后的记录中消失，
 * 因此重新展示再次有效。 */
export function collectSurfacedMemories(messages: ReadonlyArray<Message>): {
  paths: Set<string>
  totalBytes: number
} {
  const paths = new Set<string>()
  let totalBytes = 0
  for (const m of messages) {
    if (m.type === 'attachment' && m.attachment!.type === 'relevant_memories') {
      for (const mem of m.attachment!.memories as {
        path: string
        content: string
        mtimeMs: number
      }[]) {
        paths.add(mem.path)
        totalBytes += mem.content.length
      }
    }
  }
  return { paths, totalBytes }
}

/** 读取一组相关性排序的内存文件以作为 <system-reminder> 附件注入。通过 readFileInRange 的 truncateOnByteLimit 选项强制执行 MAX_MEMORY_LINES 和 MAX_MEMORY_BYTES 限制。截断会展示带有说明的部分内容，而不是丢弃文件——findRelevantMemories 已将其选为最相关的，因此即使后面的行被截断，frontmatter + 开头上下文也值得展示。

导出供直接测试使用，无需模拟排序器 + GB 门控。 */
export async function readMemoriesForSurfacing(
  selected: ReadonlyArray<{ path: string; mtimeMs: number }>,
  signal?: AbortSignal,
): Promise<
  Array<{
    path: string
    content: string
    mtimeMs: number
    header: string
    limit?: number
  }>
> {
  const results = await Promise.all(
    selected.map(async ({ path: filePath, mtimeMs }) => {
      try {
        const result = await readFileInRange(
          filePath,
          0,
          MAX_MEMORY_LINES,
          MAX_MEMORY_BYTES,
          signal,
          { truncateOnByteLimit: true },
        )
        const truncated =
          result.totalLines > MAX_MEMORY_LINES || result.truncatedByBytes
        const content = truncated
          ? result.content +
            `

> 此内存文件已被截断（${result.truncatedByBytes ? `${MAX_MEMORY_BYTES} byte limit` : `first ${MAX_MEMORY_LINES} lines`}）。使用 ${FILE_READ_TOOL_NAME} 工具查看完整文件：${filePath}`
          : result.content
        return {
          path: filePath,
          content,
          mtimeMs,
          header: memoryHeader(filePath, mtimeMs),
          limit: truncated ? result.lineCount : undefined,
        }
      } catch {
        return null
      }
    }),
  )
  return results.filter(r => r !== null)
}

/** 相关内存块的标题字符串。导出以便 messages.ts 可以在存储的标题缺失的恢复会话中回退使用。 */
export function memoryHeader(path: string, mtimeMs: number): string {
  const staleness = memoryFreshnessText(mtimeMs)
  return staleness
    ? `${staleness}\n\n内存：${path}：`
    : `内存（保存于 ${memoryAge(mtimeMs)}）：${path}：`
}

/**
* 内存相关性选择器预取句柄。该 Promise 仅在
每个用户回合启动一次，并在主模型流和工具执行期间运行。
* 在收集点（工具执行后），调用者读取 SettleAt 以
* 执行“如果就绪则消耗”或“跳过并重试下一次迭代”——预取永远不会
* 阻塞回合。
* 可释放：query.ts 使用 `using` 绑定，因此 [Symbol.dispose] 会在所有
生成器退出路径（return、throw、.return() 闭包）上触发——中止
* 正在进行的请求并发出终端遥测数据，而不会对
* while 循环内的约 13 个返回点进行插桩。
*/
export type MemoryPrefetch = {
  promise: Promise<Attachment[]>
  /** 由 promise.finally() 设置。在 promise 完成前为 null。 */
  settledAt: number | null
  /** 由 query.ts 中的收集点设置。在消费前为 -1。 */
  consumedOnIteration: number
  [Symbol.dispose](): void
}

/** 启动相关内存搜索作为异步预取。
从消息中提取最后一个真实的用户提示（跳过 isMeta 系统注入）并启动非阻塞搜索。
返回一个带有完成状态跟踪的 Disposable 句柄。在 query.ts 中使用 `using` 绑定。 */
export function startRelevantMemoryPrefetch(
  messages: ReadonlyArray<Message>,
  toolUseContext: ToolUseContext,
): MemoryPrefetch | undefined {
  if (
    !isAutoMemoryEnabled() ||
    !getFeatureValue_CACHED_MAY_BE_STALE('tengu_moth_copse', false)
  ) {
    return undefined
  }

  // Poor mode: skip the side-query to save tokens
  const { isPoorModeActive } =
    require('../commands/poor/poorMode.js') as typeof import('../commands/poor/poorMode.js')
  if (isPoorModeActive()) {
    return undefined
  }

  const lastUserMessage = messages.findLast(m => m.type === 'user' && !m.isMeta)
  if (!lastUserMessage) {
    return undefined
  }

  const input = getUserMessageText(lastUserMessage)
  // 单字提示缺乏足够的上下文进行有意义的术语提取
  if (!input || !/\s/.test(input.trim())) {
    return undefined
  }
  //获取已经发送给大模型的“记忆”文件清单。
  const surfaced = collectSurfacedMemories(messages)
  if (surfaced.totalBytes >= RELEVANT_MEMORIES_CONFIG.MAX_SESSION_BYTES) {
    return undefined
  }

  // 链接到轮次级别的 abort，因此用户按 Escape 会立即取消 sideQuery，而
  // 不仅仅是在 queryLoop 退出时通过 [Symbol.dispose] 取消。
  const controller = createChildAbortController(toolUseContext.abortController)
  const firedAt = Date.now()
  const promise = getRelevantMemoryAttachments(
    input,
    toolUseContext.options.agentDefinitions.activeAgents,
    toolUseContext.readFileState,
    collectRecentSuccessfulTools(messages, lastUserMessage),
    controller.signal,
    surfaced.paths,
    toolUseContext.langfuseTrace,
  ).catch(e => {
    if (!isAbortError(e)) {
      logError(e)
    }
    return []
  })

  const handle: MemoryPrefetch = {
    promise,
    settledAt: null,
    consumedOnIteration: -1,
    [Symbol.dispose]() {
      controller.abort()
      logEvent('tengu_memdir_prefetch_collected', {
        hidden_by_first_iteration:
          handle.settledAt !== null && handle.consumedOnIteration === 0,
        consumed_on_iteration: handle.consumedOnIteration,
        latency_ms: (handle.settledAt ?? Date.now()) - firedAt,
      })
    },
  }
  void promise.finally(() => {
    handle.settledAt = Date.now()
  })
  return handle
}

type ToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  is_error?: boolean
}

function isToolResultBlock(b: unknown): b is ToolResultBlock {
  return (
    typeof b === 'object' &&
    b !== null &&
    (b as ToolResultBlock).type === 'tool_result' &&
    typeof (b as ToolResultBlock).tool_use_id === 'string'
  )
}

/** 检查用户消息内容是否包含 tool_result 块。
这比检查 `toolUseResult === undefined` 更可靠，因为当 `preserveToolUseResults` 为 false（Explore 代理的默认值）时，子代理工具结果消息会显式地将 `toolUseResult` 设置为 `undefined`。 */
function hasToolResultContent(content: unknown): boolean {
  return Array.isArray(content) && content.some(isToolResultBlock)
}

/** 自上一个真实轮次边界以来成功（且从未出错）的工具。内存选择器使用此信息来抑制关于正在正常工作的工具的文档——为模型已经在成功调用的工具展示参考材料是噪音。

任何错误 → 工具被排除（模型遇到困难，文档保持可用）。
尚无结果 → 也被排除（结果未知）。

tool_use 存在于助手内容中；tool_result 存在于用户内容中（设置了 toolUseResult，isMeta 为 undefined）。两者都在扫描窗口内。向后扫描先看到结果再看到使用，因此我们按 id 收集两者并在之后解析。 */
export function collectRecentSuccessfulTools(
  messages: ReadonlyArray<Message>,
  lastUserMessage: Message,
): readonly string[] {
  const useIdToName = new Map<string, string>()
  const resultByUseId = new Map<string, boolean>()
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (!m) continue
    if (isHumanTurn(m) && m !== lastUserMessage) break
    if (m.type === 'assistant' && typeof m.message!.content !== 'string') {
      for (const block of m.message!.content as Array<{
        type: string
        id: string
        name: string
      }>) {
        if (block.type === 'tool_use') useIdToName.set(block.id, block.name)
      }
    } else if (
      m.type === 'user' &&
      'message' in m &&
      Array.isArray(m.message!.content)
    ) {
      for (const block of m.message!.content as Array<{ type: string }>) {
        if (isToolResultBlock(block)) {
          resultByUseId.set(block.tool_use_id, block.is_error === true)
        }
      }
    }
  }
  const failed = new Set<string>()
  const succeeded = new Set<string>()
  for (const [id, name] of useIdToName) {
    const errored = resultByUseId.get(id)
    if (errored === undefined) continue
    if (errored) {
      failed.add(name)
    } else {
      succeeded.add(name)
    }
  }
  return [...succeeded].filter(t => !failed.has(t))
}

/**
 * Filters prefetched memory attachments to exclude memories the model already
 * has in context via FileRead/Write/Edit tool calls (any iteration this turn)
 * or a previous turn's memory surfacing — both tracked in the cumulative
 * readFileState. Survivors are then marked in readFileState so subsequent
 * turns won't re-surface them.
 *
 * The mark-after-filter ordering is load-bearing: readMemoriesForSurfacing
 * used to write to readFileState during the prefetch, which meant the filter
 * saw every prefetch-selected path as "already in context" and dropped them
 * all (self-referential filter). Deferring the write to here, after the
 * filter runs, breaks that cycle while still deduping against tool calls
 * from any iteration.
 */
export function filterDuplicateMemoryAttachments(
  attachments: Attachment[],
  readFileState: FileStateCache,
): Attachment[] {
  return attachments
    .map(attachment => {
      if (attachment.type !== 'relevant_memories') return attachment
      const filtered = attachment.memories.filter(
        m => !readFileState.has(m.path),
      )
      for (const m of filtered) {
        readFileState.set(m.path, {
          content: m.content,
          timestamp: m.mtimeMs,
          offset: undefined,
          limit: m.limit,
        })
      }
      return filtered.length > 0 ? { ...attachment, memories: filtered } : null
    })
    .filter((a): a is Attachment => a !== null)
}

/** 处理在文件操作期间发现的技能目录。
使用 ToolUseContext 中的 dynamicSkillDirTriggers 字段 */
async function getDynamicSkillAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const attachments: Attachment[] = []

  if (
    toolUseContext.dynamicSkillDirTriggers &&
    toolUseContext.dynamicSkillDirTriggers.size > 0
  ) {
    // 并行化：并发读取所有技能目录
    const perDirResults = await Promise.all(
      Array.from(toolUseContext.dynamicSkillDirTriggers).map(async skillDir => {
        try {
          const entries = await readdir(skillDir, { withFileTypes: true })
          const candidates = entries
            .filter(e => e.isDirectory() || e.isSymbolicLink())
            .map(e => e.name)
          // 并行化：并发 stat 所有 SKILL.md 候选文件
          const checked = await Promise.all(
            candidates.map(async name => {
              try {
                await stat(resolve(skillDir, name, 'SKILL.md'))
                return name
              } catch {
                return null // SKILL.md 不存在，跳过此条目
              }
            }),
          )
          return {
            skillDir,
            skillNames: checked.filter((n): n is string => n !== null),
          }
        } catch {
          // 忽略读取技能目录时的错误（例如，目录不存在）
          return { skillDir, skillNames: [] }
        }
      }),
    )

    for (const { skillDir, skillNames } of perDirResults) {
      if (skillNames.length > 0) {
        attachments.push({
          type: 'dynamic_skill',
          skillDir,
          skillNames,
          displayPath: relative(getCwd(), skillDir),
        })
      }
    }

    toolUseContext.dynamicSkillDirTriggers.clear()
  }

  return attachments
}

// 跟踪已发送的技能以避免重复发送。按键为 agentId（空字符
// 串 = 主线程），因此子代理获得自己的第 0 轮次列表——如果没
// 有每个代理的作用域，主线程填充此 Set 将导致每个子代理的 f
// ilterToBundledAndMcp 结果去重为空。
const sentSkillNames = new Map<string, Set<string>>()

// 当技能集真正发生变化时调用（插件重新加载、磁盘上的技能
// 文件更改），以便新技能得到通知。不在压缩时调用——压
// 缩后重新注入的成本约为每事件 4K 令牌，收益甚微。
export function resetSentSkillNames(): void {
  sentSkillNames.clear()
  suppressNext = false
  suppressNextDiscovery = false
}

/**
 * Suppress the next skill-listing injection. Called by conversationRecovery
 * on --resume when a skill_listing attachment already exists in the
 * transcript.
 *
 * `sentSkillNames` is module-scope — process-local. Each `claude -p` spawn
 * starts with an empty Map, so without this every resume re-injects the
 * full ~600-token listing even though it's already in the conversation from
 * the prior process. Shows up on every --resume; particularly loud for
 * daemons that respawn frequently.
 *
 * Trade-off: skills added between sessions won't be announced until the
 * next non-resume session. Acceptable — skill_listing was never meant to
 * cover cross-process deltas, and the agent can still call them (they're
 * in the Skill tool's runtime registry regardless).
 */
export function suppressNextSkillListing(): void {
  suppressNext = true
}
let suppressNext = false

/**
 * Suppress the next skill-discovery injection on resume. Same rationale as
 * suppressNextSkillListing: skill_discovery attachments are not persisted to
 * transcript for non-ant users, so the prior process's discovery result is
 * already in the conversation history the model sees. Re-generating it would
 * inject duplicate content and bust the prompt cache prefix.
 */
export function suppressNextSkillDiscovery(): void {
  suppressNextDiscovery = true
}
let suppressNextDiscovery = false

// When skill-search is enabled and the filtered (bundled + MCP) listing exceeds
// this count, fall back to bundled-only. Protects MCP-heavy users (100+ servers)
// from truncation while keeping the turn-0 guarantee for typical setups.
const FILTERED_LISTING_MAX = 30

/**
 * Filter skills to bundled (Anthropic-curated) + MCP (user-connected) only.
 * Used when skill-search is enabled to resolve the turn-0 gap for subagents:
 * these sources are small, intent-signaled, and won't hit the truncation budget.
 * User/project/plugin skills (the long tail — 200+) go through discovery instead.
 *
 * Falls back to bundled-only if bundled+mcp exceeds FILTERED_LISTING_MAX.
 */
export function filterToBundledAndMcp(commands: Command[]): Command[] {
  const filtered = commands.filter(
    cmd => cmd.loadedFrom === 'bundled' || cmd.loadedFrom === 'mcp',
  )
  if (filtered.length > FILTERED_LISTING_MAX) {
    return filtered.filter(cmd => cmd.loadedFrom === 'bundled')
  }
  return filtered
}

async function getSkillListingAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (process.env.NODE_ENV === 'test') {
    return []
  }

  // 跳过没有 Skill 工具的代理的技能列表——它们无法直接使用技能。
  if (
    !toolUseContext.options.tools.some(t => toolMatchesName(t, SKILL_TOOL_NAME))
  ) {
    return []
  }

  const cwd = getProjectRoot()
  const localCommands = await getSkillToolCommands(cwd)
  const mcpSkills = getMcpSkillCommands(
    toolUseContext.getAppState().mcp.commands,
  )
  let allCommands =
    mcpSkills.length > 0
      ? uniqBy([...localCommands, ...mcpSkills], 'name')
      : localCommands

  // 当技能搜索激活时，过滤到捆绑 + MCP 而不是完全抑制。解决第
  // 0 轮次间隙：主线程通过 getTurnZeroSkillDiscov
  // ery（阻塞）获得第 0 轮次发现，但子代理使用异步的 subage
  // nt_spawn 信号（在工具后收集，第 1 轮次可见）。捆绑 + M
  // CP 规模小且有意图信号；用户/项目/插件技能通过发现机制处理。首先使
  // 用 feature() 进行 DCE——否则即使对 null 使用
  // ?.，属性访问字符串也会泄漏。
  if (
    feature('EXPERIMENTAL_SKILL_SEARCH') &&
    skillSearchModules?.featureCheck.isSkillSearchEnabled()
  ) {
    allCommands = filterToBundledAndMcp(allCommands)
  }

  const agentKey = toolUseContext.agentId ?? ''
  let sent = sentSkillNames.get(agentKey)
  if (!sent) {
    sent = new Set()
    sentSkillNames.set(agentKey, sent)
  }

  // 恢复路径：前一个进程已注入列表；它已在记录中。将所有当
  // 前技能标记为已发送，以便只有恢复后的增量（稍后通过 /re
  // load-plugins 等加载的技能）得到通知。
  if (suppressNext) {
    suppressNext = false
    for (const cmd of allCommands) {
      sent.add(cmd.name)
    }
    return []
  }

  // 查找我们尚未发送的技能
  const newSkills = allCommands.filter(cmd => !sent.has(cmd.name))

  if (newSkills.length === 0) {
    return []
  }

  // 如果尚未发送任何技能，则为初始批次
  const isInitial = sent.size === 0

  // 标记为已发送
  for (const cmd of newSkills) {
    sent.add(cmd.name)
  }

  logForDebugging(
    `通过附件发送 ${newSkills.length} 个技能（${isInitial ? 'initial' : 'dynamic'}，总计已发送 ${sent.size}）`,
  )

  // 使用现有逻辑在预算内格式化
  const contextWindowTokens = getContextWindowForModel(
    toolUseContext.options.mainLoopModel,
    getSdkBetas(),
  )
  const content = formatCommandsWithinBudget(newSkills, contextWindowTokens)

  return [
    {
      type: 'skill_listing',
      content,
      skillCount: newSkills.length,
      isInitial,
    },
  ]
}

// getSkillDiscoveryAttachment 已移至 skillSearc
// h/prefetch.ts 作为 getTurnZeroSkillDiscovery——将 'skill
// _discovery' 字符串字面量保留在功能门控模块内，使其不会泄漏到外部构建中。

export function extractAtMentionedFiles(content: string): string[] {
  // 提取带有 @ 符号提及的文件名，包括行范围语法：@file.txt#L10-20 也支持带引号的路径用于包含
  // 空格的文件：@"my/file with spaces.txt" 示例："foo bar @
  // baz moo" 将提取 "baz" 示例：'check
  // @"my file.txt" please' 将提取 "my file.txt"

  // 两种模式：带引号的路径和常规路径
  const quotedAtMentionRegex = /(^|\s)@"([^"]+)"/g
  const regularAtMentionRegex = /(^|\s)@([^\s]+)\b/g

  const quotedMatches: string[] = []
  const regularMatches: string[] = []

  // 首先提取带引号的提及（跳过像 @"code-reviewer (agent)" 这样的代理提及）
  let match
  while ((match = quotedAtMentionRegex.exec(content)) !== null) {
    if (match[2] && !match[2].endsWith(' (agent)')) {
      quotedMatches.push(match[2]) // 引号内的内容
    }
  }

  // 提取常规提及
  const regularMatchArray: string[] = content.match(regularAtMentionRegex) ?? []
  regularMatchArray.forEach(match => {
    const filename = match.slice(match.indexOf('@') + 1)
    // 如果以引号开头则不包含（已作为引用内容处理）
    if (!filename.startsWith('"')) {
      regularMatches.push(filename)
    }
  })

  // 合并并去重
  return uniq([...quotedMatches, ...regularMatches])
}

export function extractMcpResourceMentions(content: string): string[] {
  // 提取以 @ 符号提及的 MCP 资源，格式为 @server:uri。例如："@serv
  // er1:resource/path" 将提取出 "server1:resource/path"
  const atMentionRegex = /(^|\s)@([^\s]+:[^\s]+)\b/g
  const matches = content.match(atMentionRegex) || []

  // 从每个匹配项中移除前缀（@ 之前的所有内容）
  return uniq(matches.map(match => match.slice(match.indexOf('@') + 1)))
}

export function extractAgentMentions(content: string): string[] {
  // 提取两种格式的智能体提及：1. @agent-<age
  // nt-type>（旧版/手动输入） 例如："@agent-cod
  // e-elegance-refiner" → "agent-code-elegance-refiner"
  // 2. @"<agent-type> (agent)"（来自自动补全选择） 例如
  // ：'@"code-reviewer (agent)"' → "code-re
  // viewer" 支持冒号、点号和 at 符号，用于插件作用域的智能体，如 "@agent-asana:project-status-updater"
  const results: string[] = []

  // 匹配带引号的格式：@"<type> (agent)"
  const quotedAgentRegex = /(^|\s)@"([\w:.@-]+) \(agent\)"/g
  let match
  while ((match = quotedAgentRegex.exec(content)) !== null) {
    if (match[2]) {
      results.push(match[2])
    }
  }

  // 匹配不带引号的格式：@agent-<type>
  const unquotedAgentRegex = /(^|\s)@(agent-[\w:.@-]+)/g
  const unquotedMatches = content.match(unquotedAgentRegex) || []
  for (const m of unquotedMatches) {
    results.push(m.slice(m.indexOf('@') + 1))
  }

  return uniq(results)
}

interface AtMentionedFileLines {
  filename: string
  lineStart?: number
  lineEnd?: number
}

export function parseAtMentionedFileLines(
  mention: string,
): AtMentionedFileLines {
  // 解析类似 "file.txt#L10-20"、"file.txt#heading" 或仅 "fi
  // le.txt" 的提及。支持行范围（#L10, #L10-20）并移除非行范围的片段（#heading）
  const match = mention.match(/^([^#]+)(?:#L(\d+)(?:-(\d+))?)?(?:#[^#]*)?$/)

  if (!match) {
    return { filename: mention }
  }

  const [, filename, lineStartStr, lineEndStr] = match
  const lineStart = lineStartStr ? parseInt(lineStartStr, 10) : undefined
  const lineEnd = lineEndStr ? parseInt(lineEndStr, 10) : lineStart

  return { filename: filename ?? mention, lineStart, lineEnd }
}

async function getDiagnosticAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  // 只有当智能体拥有 Bash 工具来操作它们时，诊断信息才有用
  if (
    !toolUseContext.options.tools.some(t => toolMatchesName(t, BASH_TOOL_NAME))
  ) {
    return []
  }

  // 从跟踪器获取新的诊断信息（通过 MCP 的 IDE 诊断）
  const newDiagnostics = await diagnosticTracker.getNewDiagnostics()
  if (newDiagnostics.length === 0) {
    return []
  }

  return [
    {
      type: 'diagnostics',
      files: newDiagnostics,
      isNew: true,
    },
  ]
}

/** 从被动 LSP 服务器获取 LSP 诊断附件。遵循 AsyncHookRegistry 模式，以实现一致的异步附件交付。 */
async function getLSPDiagnosticAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  // 只有当智能体拥有 Bash 工具来操作它们时，LSP 诊断才有用
  if (
    !toolUseContext.options.tools.some(t => toolMatchesName(t, BASH_TOOL_NAME))
  ) {
    return []
  }

  logForDebugging('LSP 诊断：已调用 getLSPDiagnosticAttachments')

  try {
    const diagnosticSets = checkForLSPDiagnostics()

    if (diagnosticSets.length === 0) {
      return []
    }

    logForDebugging(`LSP 诊断：找到 ${diagnosticSets.length} 个待处理的诊断集`)

    // 将每个诊断集转换为一个附件
    const attachments: Attachment[] = diagnosticSets.map(({ files }) => ({
      type: 'diagnostics' as const,
      files,
      isNew: true,
    }))

    // 从注册表中清除已交付的诊断，以防止内存泄漏。遵循与 removeD
    // eliveredAsyncHooks 相同的模式。
    if (diagnosticSets.length > 0) {
      clearAllLSPDiagnostics()
      logForDebugging(
        `LSP 诊断：已从注册表中清除 ${diagnosticSets.length} 个已交付的诊断`,
      )
    }

    logForDebugging(`LSP 诊断：返回 ${attachments.length} 个诊断附件`)

    return attachments
  } catch (error) {
    const err = toError(error)
    logError(new Error(`获取 LSP 诊断附件失败：${err.message}`))
    // 返回空数组以允许其他附件继续处理
    return []
  }
}

export async function* getAttachmentMessages(
  input: string | null,
  toolUseContext: ToolUseContext,
  ideSelection: IDESelection | null,
  queuedCommands: QueuedCommand[],
  messages?: Message[],
  querySource?: QuerySource,
  options?: { skipSkillDiscovery?: boolean },
): AsyncGenerator<AttachmentMessage, void> {
  // 待办：在上游计算此值
  const attachments = await getAttachments(
    input,
    toolUseContext,
    ideSelection,
    queuedCommands,
    messages,
    querySource,
    options,
  )

  if (attachments.length === 0) {
    return
  }

  logEvent('tengu_attachments', {
    attachment_types: attachments.map(
      _ => _.type,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  for (const attachment of attachments) {
    yield createAttachmentMessage(attachment)
  }
}

/** 通过读取文件并执行适当的验证和截断来生成文件附件。这是 @ 提及的文件和压缩后恢复之间共享的核心文件读取逻辑。

@param filename 要读取文件的绝对路径
@param toolUseContext 用于调用 FileReadTool 的工具使用上下文
@param options 文件读取的可选配置
@returns 一个 new_file 附件，如果文件无法读取则返回 null */
/** 检查 PDF 文件是否应表示为轻量级引用，而不是内联。对于大型 PDF（超过 PDF_AT_MENTION_INLINE_THRESHOLD 页数）返回 PDFReferenceAttachment，否则返回 null。 */
export async function tryGetPDFReference(
  filename: string,
): Promise<PDFReferenceAttachment | null> {
  const ext = parse(filename).ext.toLowerCase()
  if (!isPDFExtension(ext)) {
    return null
  }
  try {
    const [stats, pageCount] = await Promise.all([
      getFsImplementation().stat(filename),
      getPDFPageCount(filename),
    ])
    // 如果可用则使用页数，否则回退到大小启发式方法（约每页 100KB）
    const effectivePageCount = pageCount ?? Math.ceil(stats.size / (100 * 1024))
    if (effectivePageCount > PDF_AT_MENTION_INLINE_THRESHOLD) {
      logEvent('tengu_pdf_reference_attachment', {
        pageCount: effectivePageCount,
        fileSize: stats.size,
        hadPdfinfo: pageCount !== null,
      } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
      return {
        type: 'pdf_reference',
        filename,
        pageCount: effectivePageCount,
        fileSize: stats.size,
        displayPath: relative(getCwd(), filename),
      }
    }
  } catch {
    // 如果无法获取文件状态，则返回 null 以继续正常读取
  }
  return null
}

export async function generateFileAttachment(
  filename: string,
  toolUseContext: ToolUseContext,
  successEventName: string,
  errorEventName: string,
  mode: 'compact' | 'at-mention',
  options?: {
    offset?: number
    limit?: number
  },
): Promise<
  | FileAttachment
  | CompactFileReferenceAttachment
  | PDFReferenceAttachment
  | AlreadyReadFileAttachment
  | null
> {
  const { offset, limit } = options ?? {}

  // 检查文件是否配置了拒绝规则
  const appState = toolUseContext.getAppState()
  if (isFileReadDenied(filename, appState.toolPermissionContext)) {
    return null
  }

  // 在尝试读取前检查文件大小（PDF 文件跳过此检查——它们下面有自己的大小/页数处理）
  if (
    mode === 'at-mention' &&
    !isFileWithinReadSizeLimit(
      filename,
      getDefaultFileReadingLimits().maxSizeBytes,
    )
  ) {
    const ext = parse(filename).ext.toLowerCase()
    if (!isPDFExtension(ext)) {
      try {
        const stats = await getFsImplementation().stat(filename)
        logEvent('tengu_attachment_file_too_large', {
          size_bytes: stats.size,
          mode,
        } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
        return null
      } catch {
        // 如果无法获取文件状态，则继续正常读取（如果文件不存在，稍后会失败）
      }
    }
  }

  // 对于 @ 提及的大型 PDF 文件，返回轻量级引用而不是内联
  if (mode === 'at-mention') {
    const pdfRef = await tryGetPDFReference(filename)
    if (pdfRef) {
      return pdfRef
    }
  }

  // 检查文件是否已以最新版本存在于上下文中
  const existingFileState = toolUseContext.readFileState.get(filename)
  if (existingFileState && mode === 'at-mention') {
    try {
      // 检查文件自上次读取后是否已被修改
      const mtimeMs = await getFileModificationTimeAsync(filename)

      // 处理时间戳格式不一致问题：- FileRea
      // dTool 存储 Date.now()（读取时的当前时间）- Fi
      // leEdit/WriteTools 存储 mtimeMs（文件修改时间）
      //
      // 如果 timestamp > mtimeMs，则表示它是由 FileReadToo
      // l 使用 Date.now() 存储的。在这种情况下，我们不应使用优化，因为我们无法
      // 可靠地比较修改时间。仅当 timestamp <= mtimeMs 时使用优化，这表明它是
      // 由 FileEdit/WriteTool 使用实际的 mtimeMs 存储的。

      if (
        existingFileState.timestamp <= mtimeMs &&
        mtimeMs === existingFileState.timestamp
      ) {
        // 文件未被修改，返回 already_read_
        // file 附件。这告诉系统文件已在上下文中，无需发送到 API。
        logEvent(successEventName, {})
        return {
          type: 'already_read_file',
          filename,
          displayPath: relative(getCwd(), filename),
          content: {
            type: 'text',
            file: {
              filePath: filename,
              content: existingFileState.content,
              numLines: countCharInString(existingFileState.content, '\n') + 1,
              startLine: offset ?? 1,
              totalLines:
                countCharInString(existingFileState.content, '\n') + 1,
            },
          },
        }
      }
    } catch {
      // 如果无法获取文件状态，则继续正常读取
    }
  }

  try {
    const fileInput = {
      file_path: filename,
      offset,
      limit,
    }

    async function readTruncatedFile(): Promise<
      | FileAttachment
      | CompactFileReferenceAttachment
      | AlreadyReadFileAttachment
      | null
    > {
      if (mode === 'compact') {
        return {
          type: 'compact_file_reference',
          filename,
          displayPath: relative(getCwd(), filename),
        }
      }

      // 在读取截断文件前检查拒绝规则
      const appState = toolUseContext.getAppState()
      if (isFileReadDenied(filename, appState.toolPermissionContext)) {
        return null
      }

      try {
        // 对于过大的文件，仅读取前 MAX_LINES_TO_READ 行
        const truncatedInput = {
          file_path: filename,
          offset: offset ?? 1,
          limit: MAX_LINES_TO_READ,
        }
        const result = await FileReadTool.call(truncatedInput, toolUseContext)
        logEvent(successEventName, {})

        return {
          type: 'file' as const,
          filename,
          content: result.data,
          truncated: true,
          displayPath: relative(getCwd(), filename),
        }
      } catch {
        logEvent(errorEventName, {})
        return null
      }
    }

    // 验证文件路径是否有效
    const isValid = await FileReadTool.validateInput(fileInput, toolUseContext)
    if (!isValid.result) {
      return null
    }

    try {
      const result = await FileReadTool.call(fileInput, toolUseContext)
      logEvent(successEventName, {})
      return {
        type: 'file',
        filename,
        content: result.data,
        displayPath: relative(getCwd(), filename),
      }
    } catch (error) {
      if (
        error instanceof MaxFileReadTokenExceededError ||
        error instanceof FileTooLargeError
      ) {
        return await readTruncatedFile()
      }
      throw error
    }
  } catch {
    logEvent(errorEventName, {})
    return null
  }
}

export function createAttachmentMessage(
  attachment: Attachment,
): AttachmentMessage<Attachment> {
  return {
    attachment,
    type: 'attachment',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
  } as unknown as AttachmentMessage<Attachment>
}

function getTodoReminderTurnCounts(messages: Message[]): {
  turnsSinceLastTodoWrite: number
  turnsSinceLastReminder: number
} {
  let lastTodoWriteIndex = -1
  let lastReminderIndex = -1
  let assistantTurnsSinceWrite = 0
  let assistantTurnsSinceReminder = 0

  // 向后迭代以查找最近的事件
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]

    if (message?.type === 'assistant') {
      if (isThinkingMessage(message)) {
        // 跳过思考消息
        continue
      }

      // 在递增计数器之前检查 TodoWrite 的使用情
      // 况（我们不希望将 TodoWrite 消息本身计为“自上次写入后的一轮”）
      if (
        lastTodoWriteIndex === -1 &&
        'message' in message &&
        Array.isArray(message.message?.content) &&
        message.message.content.some(
          block => block.type === 'tool_use' && block.name === 'TodoWrite',
        )
      ) {
        lastTodoWriteIndex = i
      }

      // 在查找事件之前计算助手轮次
      if (lastTodoWriteIndex === -1) assistantTurnsSinceWrite++
      if (lastReminderIndex === -1) assistantTurnsSinceReminder++
    } else if (
      lastReminderIndex === -1 &&
      message?.type === 'attachment' &&
      message.attachment!.type === 'todo_reminder'
    ) {
      lastReminderIndex = i
    }

    if (lastTodoWriteIndex !== -1 && lastReminderIndex !== -1) {
      break
    }
  }

  return {
    turnsSinceLastTodoWrite: assistantTurnsSinceWrite,
    turnsSinceLastReminder: assistantTurnsSinceReminder,
  }
}

async function getTodoReminderAttachments(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  // 如果 TodoWrite 工具不可用，则跳过
  if (
    !toolUseContext.options.tools.some(t =>
      toolMatchesName(t, TODO_WRITE_TOOL_NAME),
    )
  ) {
    return []
  }

  // 当 SendUserMessage 在工具包中时，它是主
  // 要的通信渠道，模型总是被告知使用它（#20467）。T
  // odoWrite 成为一个辅助渠道——提醒模型使用它会与
  // 简洁的工作流程冲突。该工具本身保持可用；这仅用于控制“你
  // 有一段时间没使用它了”的提醒。
  if (
    BRIEF_TOOL_NAME &&
    toolUseContext.options.tools.some(t => toolMatchesName(t, BRIEF_TOOL_NAME))
  ) {
    return []
  }

  // 如果未提供消息，则跳过
  if (!messages || messages.length === 0) {
    return []
  }

  const { turnsSinceLastTodoWrite, turnsSinceLastReminder } =
    getTodoReminderTurnCounts(messages)

  // 检查是否应显示提醒
  if (
    turnsSinceLastTodoWrite >= TODO_REMINDER_CONFIG.TURNS_SINCE_WRITE &&
    turnsSinceLastReminder >= TODO_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS
  ) {
    const todoKey = toolUseContext.agentId ?? getSessionId()
    const appState = toolUseContext.getAppState()
    const todos = appState.todos[todoKey] ?? []
    return [
      {
        type: 'todo_reminder',
        content: todos,
        itemCount: todos.length,
      },
    ]
  }

  return []
}

function getTaskReminderTurnCounts(messages: Message[]): {
  turnsSinceLastTaskManagement: number
  turnsSinceLastReminder: number
} {
  let lastTaskManagementIndex = -1
  let lastReminderIndex = -1
  let assistantTurnsSinceTaskManagement = 0
  let assistantTurnsSinceReminder = 0

  // 向后迭代以查找最近的事件
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]

    if (message?.type === 'assistant') {
      if (isThinkingMessage(message)) {
        // 跳过思考消息
        continue
      }

      // 在递增计数器之前检查 TaskCreate 或 TaskUpdate 的使用情况
      if (
        lastTaskManagementIndex === -1 &&
        'message' in message &&
        Array.isArray(message.message?.content) &&
        message.message.content.some(
          block =>
            block.type === 'tool_use' &&
            (block.name === TASK_CREATE_TOOL_NAME ||
              block.name === TASK_UPDATE_TOOL_NAME),
        )
      ) {
        lastTaskManagementIndex = i
      }

      // 在查找事件之前计算助手轮次
      if (lastTaskManagementIndex === -1) assistantTurnsSinceTaskManagement++
      if (lastReminderIndex === -1) assistantTurnsSinceReminder++
    } else if (
      lastReminderIndex === -1 &&
      message?.type === 'attachment' &&
      message.attachment!.type === 'task_reminder'
    ) {
      lastReminderIndex = i
    }

    if (lastTaskManagementIndex !== -1 && lastReminderIndex !== -1) {
      break
    }
  }

  return {
    turnsSinceLastTaskManagement: assistantTurnsSinceTaskManagement,
    turnsSinceLastReminder: assistantTurnsSinceReminder,
  }
}

async function getTaskReminderAttachments(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (!isTodoV2Enabled()) {
    return []
  }

  // 对 ant 用户跳过
  if (process.env.USER_TYPE === 'ant') {
    return []
  }

  // 当 SendUserMessage 在工具包中时，它是主
  // 要的通信渠道，模型总是被告知使用它（#20467）。T
  // askUpdate 成为一个辅助渠道——提醒模型使用它会
  // 与简洁的工作流程冲突。该工具本身保持可用；这仅用于控制提醒。
  if (
    BRIEF_TOOL_NAME &&
    toolUseContext.options.tools.some(t => toolMatchesName(t, BRIEF_TOOL_NAME))
  ) {
    return []
  }

  // 如果 TaskUpdate 工具不可用，则跳过
  if (
    !toolUseContext.options.tools.some(t =>
      toolMatchesName(t, TASK_UPDATE_TOOL_NAME),
    )
  ) {
    return []
  }

  // 如果未提供消息，则跳过
  if (!messages || messages.length === 0) {
    return []
  }

  const { turnsSinceLastTaskManagement, turnsSinceLastReminder } =
    getTaskReminderTurnCounts(messages)

  // 检查是否应显示提醒
  if (
    turnsSinceLastTaskManagement >= TODO_REMINDER_CONFIG.TURNS_SINCE_WRITE &&
    turnsSinceLastReminder >= TODO_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS
  ) {
    const tasks = await listTasks(getTaskListId())
    return [
      {
        type: 'task_reminder',
        content: tasks,
        itemCount: tasks.length,
      },
    ]
  }

  return []
}

/** 使用 Task 框架获取所有统一任务的附件。取代旧的 getBackgroundShellAttachments、getBackgroundRemoteSessionAttachments 和 getAsyncAgentAttachments 函数。 */
async function getUnifiedTaskAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  const appState = toolUseContext.getAppState()
  const { attachments, updatedTaskOffsets, evictedTaskIds } =
    await generateTaskAttachments(appState)

  applyTaskOffsetsAndEvictions(
    toolUseContext.setAppState,
    updatedTaskOffsets,
    evictedTaskIds,
  )

  // 将 TaskAttachment 转换为 Attachment 格式
  return attachments.map(taskAttachment => ({
    type: 'task_status' as const,
    taskId: taskAttachment.taskId,
    taskType: taskAttachment.taskType,
    status: taskAttachment.status,
    description: taskAttachment.description,
    deltaSummary: taskAttachment.deltaSummary,
    outputFilePath: getTaskOutputPath(taskAttachment.taskId),
  }))
}

async function getAsyncHookResponseAttachments(): Promise<Attachment[]> {
  const responses = await checkForAsyncHookResponses()

  if (responses.length === 0) {
    return []
  }

  logForDebugging(
    `钩子：getAsyncHookResponseAttachments 找到 ${responses.length} 个响应`,
  )

  const attachments = responses.map(
    ({
      processId,
      response,
      hookName,
      hookEvent,
      toolName,
      pluginId,
      stdout,
      stderr,
      exitCode,
    }) => {
      logForDebugging(
        `钩子：正在为 ${processId} (${hookName}) 创建附件：${jsonStringify(response)}`,
      )
      return {
        type: 'async_hook_response' as const,
        processId,
        hookName,
        hookEvent,
        toolName,
        response,
        stdout,
        stderr,
        exitCode,
      }
    },
  )

  // 从注册表中移除已交付的钩子，以防止重复处理
  if (responses.length > 0) {
    const processIds = responses.map(r => r.processId)
    removeDeliveredAsyncHooks(processIds)
    logForDebugging(
      `钩子：已从注册表中移除 ${processIds.length} 个已交付的钩子`,
    )
  }

  logForDebugging(
    `钩子：getAsyncHookResponseAttachments 找到 ${attachments.length} 个附件`,
  )

  return attachments
}

/** 获取用于智能体群通信的队友邮箱附件。队友是并行运行的独立 Claude Code 会话（群），而非父子级子智能体关系。

此函数检查两个消息来源：
1. 基于文件的邮箱（用于轮询之间到达的消息）
2. AppState.inbox（用于由 useInboxPoller 在轮次中间排队的消息）

来自 AppState.inbox 的消息在轮次中间作为附件交付，允许队友无需等待轮次结束即可接收消息。 */
async function getTeammateMailboxAttachments(
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (!isAgentSwarmsEnabled()) {
    return []
  }
  if (process.env.USER_TYPE !== 'ant') {
    return []
  }

  // 尽早获取 AppState 以检查团队领导状态
  const appState = toolUseContext.getAppState()

  // 使用来自助手的智能体名称（检查 AsyncLocalStorage，然后是 dynamicTeamContext）
  const envAgentName = getAgentName()

  // 获取团队名称（检查 AsyncLocalStorage、dynamicTeamContext，然后是 AppState）
  const teamName = getTeamName(appState.teamContext)

  // 检查我们是否是团队领导（使用群工具中的共享逻辑）
  const teamLeadStatus = isTeamLead(appState.teamContext)

  // 检查是否正在查看队友的转录（针对进程内队友）
  const viewedTeammate = getViewedTeammateTask(appState)

  // 根据我们正在查看的对象解析智能体名称：-
  // 如果正在查看队友，使用他们的名称（以从他们的邮箱读取）- 否则，
  // 如果设置了环境变量则使用它，或者如果我们是团队领导则使用领导的名称
  let agentName = viewedTeammate?.identity.agentName ?? envAgentName
  if (!agentName && teamLeadStatus && appState.teamContext) {
    const leadAgentId = appState.teamContext.leadAgentId
    // 从智能体映射中查找领导的名称（不是 UUID）
    agentName = appState.teamContext.teammates[leadAgentId]?.name || 'team-lead'
  }

  logForDebugging(
    `[SwarmMailbox] getTeammateMailboxAttachments 被调用：envAgentName=${envAgentName}, isTeamLead=${teamLeadStatus}, 解析后的 agentName=${agentName}, teamName=${teamName}`,
  )

  // 仅当作为群或团队领导中的智能体运行时才检查收件箱
  if (!agentName) {
    logForDebugging(`[SwarmMailbox] 不检查收件箱 - 不在群或团队领导中`)
    return []
  }

  logForDebugging(
    `[SwarmMailbox] 正在为智能体="${agentName}" 团队="${teamName || 'default'}" 检查收件箱`,
  )

  // 检查邮箱中的未读消息（路由到进程内或基于文件的邮箱）。过滤掉
  // 结构化协议消息（权限请求/响应、关闭消息等）——这些必须保持未读状态
  // ，以便 useInboxPoller 将它们路由到适当的处理程序（w
  // orkerPermissions 队列、沙箱队列等）。如果不进行过滤，
  // 附件生成会与 InboxPoller 竞争：无论哪个先读取，都会将
  // 所有消息标记为已读，如果附件生成获胜，协议消息将作为原始 LLM 上
  // 下文文本捆绑，而不是被路由到它们的 UI 处理程序。
  const allUnreadMessages = await readUnreadMessages(agentName, teamName)
  const unreadMessages = allUnreadMessages.filter(
    m => !isStructuredProtocolMessage(m.text),
  )
  logForDebugging(
    `[MailboxBridge] 为 "${agentName}" 找到 ${allUnreadMessages.length} 条未读消息（过滤掉 ${allUnreadMessages.length - unreadMessages.length} 条结构化协议消息）`,
  )

  // 同时检查 AppState.inbox 中的待处理消息（由 useInb
  // oxPoller 在轮次中间排队）。重要：appState.in
  // box 包含来自队友发送给领导的消息。仅当查看领导的转录（而非
  // 队友的）时才显示这些消息。查看队友时，他们的消息来自上述基于文件的邮
  // 箱。进程内队友与领导共享 AppState——appState.in
  // box 包含领导的排队消息，而非队友的。跳过它以防止泄漏（包括来自
  // 广播的自我回显）。队友专门通过他们的基于文件的邮箱 + waitFo
  // rNextPromptOrShutdown 接收消息。注
  // 意：viewedTeammate 已在上述智能体名称解析中计算
  const pendingInboxMessages =
    viewedTeammate || isInProcessTeammate()
      ? [] // 正在查看队友或作为进程内队友运行 - 不显示领导的收件箱
      : appState.inbox.messages.filter(m => m.status === 'pending')
  logForDebugging(
    `[SwarmMailbox] 在 AppState.inbox 中找到 ${pendingInboxMessages.length} 条待处理消息`,
  )

  // 合并两个消息源并进行去重。由于竞态条件，同一消息可能同时存在于文
  // 件邮箱和 AppState.inbox 中：1. getTeammateMailboxAttachments 读取
  // 文件 -> 发现消息 M；2. InboxPoller 读取同一文件 ->
  // 将 M 排队到 AppState.inbox；3. getTeammate
  // MailboxAttachments 读取 AppState -> 再次发现 M
  // 。我们使用 from+timestamp+text 前缀作为键进行去重。
  const seen = new Set<string>()
  let allMessages: Array<{
    from: string
    text: string
    timestamp: string
    color?: string
    summary?: string
  }> = []

  for (const m of [...unreadMessages, ...pendingInboxMessages]) {
    const key = `${m.from}|${m.timestamp}|${m.text.slice(0, 100)}`
    if (!seen.has(key)) {
      seen.add(key)
      allMessages.push({
        from: m.from,
        text: m.text,
        timestamp: m.timestamp,
        color: m.color,
        summary: m.summary,
      })
    }
  }

  // 合并每位代理的多个空闲通知——只保留最新的。
  // 单次解析，然后过滤，无需重新解析。
  const idleAgentByIndex = new Map<number, string>()
  const latestIdleByAgent = new Map<string, number>()
  for (let i = 0; i < allMessages.length; i++) {
    const idle = isIdleNotification(allMessages[i]!.text)
    if (idle) {
      idleAgentByIndex.set(i, idle.from)
      latestIdleByAgent.set(idle.from, i)
    }
  }
  if (idleAgentByIndex.size > latestIdleByAgent.size) {
    const beforeCount = allMessages.length
    allMessages = allMessages.filter((_m, i) => {
      const agent = idleAgentByIndex.get(i)
      if (agent === undefined) return true
      return latestIdleByAgent.get(agent) === i
    })
    logForDebugging(
      `[SwarmMailbox] 合并了 ${beforeCount - allMessages.length} 条重复的空闲通知`,
    )
  }

  if (allMessages.length === 0) {
    logForDebugging(`[SwarmMailbox] 没有要投递的消息，返回空结果`)
    return []
  }

  logForDebugging(
    `[SwarmMailbox] 为 "${agentName}" 返回 ${allMessages.length} 条消息作为附件（去重后，${unreadMessages.length} 条来自文件，${pendingInboxMessages.length} 条来自 AppState）`,
  )

  // 在将消息标记为已处理之前构建附件。这
  // 可以防止后续任何操作失败时丢失消息。
  const attachment: Attachment[] = [
    {
      type: 'teammate_mailbox',
      messages: allMessages,
    },
  ]

  // 仅在附件构建完成后，将非结构化邮箱消息标记为已读。结构化协议消
  // 息保持未读状态，供 useInboxPoller 处理。
  if (unreadMessages.length > 0) {
    await markMessagesAsReadByPredicate(
      agentName,
      m => !isStructuredProtocolMessage(m.text),
      teamName,
    )
    logForDebugging(
      `[MailboxBridge] 为代理="${agentName}"、团队="${teamName || 'default'}" 将 ${unreadMessages.length} 条非结构化消息标记为已读`,
    )
  }

  // 处理 shutdown_approved 消息 - 从团队文件中移除队友。这模
  // 拟了 useInboxPoller 在交互模式下的行为（第 546-606 行）。在
  // -p 模式下，useInboxPoller 不运行，因此我们必须在此处处理。
  if (teamLeadStatus && teamName) {
    for (const m of allMessages) {
      const shutdownApproval = isShutdownApproved(m.text)
      if (shutdownApproval) {
        const teammateToRemove = shutdownApproval.from
        logForDebugging(
          `[SwarmMailbox] 正在处理来自 ${teammateToRemove} 的 shutdown_approved`,
        )

        // 通过名称查找队友 ID
        const teammateId = appState.teamContext?.teammates
          ? Object.entries(appState.teamContext.teammates).find(
              ([, t]) => t.name === teammateToRemove,
            )?.[0]
          : undefined

        if (teammateId) {
          // 从团队文件中移除
          removeTeammateFromTeamFile(teamName, {
            agentId: teammateId,
            name: teammateToRemove,
          })
          logForDebugging(
            `[SwarmMailbox] 已将 ${teammateToRemove} 从团队文件中移除`,
          )

          // 取消分配此队友拥有的任务
          await unassignTeammateTasks(
            teamName,
            teammateId,
            teammateToRemove,
            'shutdown',
          )

          // 从 AppState 的 teamContext 中移除
          toolUseContext.setAppState(prev => {
            if (!prev.teamContext?.teammates) return prev
            if (!(teammateId in prev.teamContext.teammates)) return prev
            const { [teammateId]: _, ...remainingTeammates } =
              prev.teamContext.teammates
            return {
              ...prev,
              teamContext: {
                ...prev.teamContext,
                teammates: remainingTeammates,
              },
            }
          })
        }
      }
    }
  }

  // 在附件构建完成后，最后将 AppState 收件箱消息标记为
  // 已处理。这确保了如果之前的操作失败，消息不会丢失。
  if (pendingInboxMessages.length > 0) {
    const pendingIds = new Set(pendingInboxMessages.map(m => m.id))
    toolUseContext.setAppState(prev => ({
      ...prev,
      inbox: {
        messages: prev.inbox.messages.map(m =>
          pendingIds.has(m.id) ? { ...m, status: 'processed' as const } : m,
        ),
      },
    }))
  }

  return attachment
}

/** 获取群组中队友的团队上下文附件。仅在首次轮次注入，以提供团队协作指令。 */
function getTeamContextAttachment(messages: Message[]): Attachment[] {
  const teamName = getTeamName()
  const agentId = getAgentId()
  const agentName = getAgentName()

  // 仅对队友注入（不对团队领导或非团队会话注入）
  if (!teamName || !agentId) {
    return []
  }

  // 仅在首次轮次注入 - 检查是否还没有助手消息
  const hasAssistantMessage = messages.some(m => m.type === 'assistant')
  if (hasAssistantMessage) {
    return []
  }

  const configDir = getClaudeConfigHomeDir()
  const teamConfigPath = `${configDir}/teams/${teamName}/config.json`
  const taskListPath = `${configDir}/tasks/${teamName}/`

  return [
    {
      type: 'team_context',
      agentId,
      agentName: agentName || agentId,
      teamName,
      teamConfigPath,
      taskListPath,
    },
  ]
}

function getTokenUsageAttachment(
  messages: Message[],
  model: string,
): Attachment[] {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT)) {
    return []
  }

  const contextWindow = getEffectiveContextWindowSize(model)
  const usedTokens = tokenCountFromLastAPIResponse(messages)

  return [
    {
      type: 'token_usage',
      used: usedTokens,
      total: contextWindow,
      remaining: contextWindow - usedTokens,
    },
  ]
}

function getOutputTokenUsageAttachment(): Attachment[] {
  if (feature('TOKEN_BUDGET')) {
    const budget = getCurrentTurnTokenBudget()
    if (budget === null || budget <= 0) {
      return []
    }
    return [
      {
        type: 'output_token_usage',
        turn: getTurnOutputTokens(),
        session: getTotalOutputTokens(),
        budget,
      },
    ]
  }
  return []
}

function getMaxBudgetUsdAttachment(maxBudgetUsd?: number): Attachment[] {
  if (maxBudgetUsd === undefined) {
    return []
  }

  const usedCost = getTotalCostUSD()
  const remainingBudget = maxBudgetUsd - usedCost

  return [
    {
      type: 'budget_usd',
      used: usedCost,
      total: maxBudgetUsd,
      remaining: remainingBudget,
    },
  ]
}

/** 统计自计划模式退出（plan_mode_exit 附件）以来的人类轮次。如果未找到 plan_mode_exit 附件，则返回 0。tool_result 消息类型为 'user' 且没有 isMeta 标记，因此通过 toolUseResult 进行过滤以避免计入它们——否则，10 轮提醒间隔会在每约 10 次工具调用时触发，而不是每约 10 次人类轮次。 */
export function getVerifyPlanReminderTurnCount(messages: Message[]): number {
  let turnCount = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message && isHumanTurn(message)) {
      turnCount++
    }
    // 在 plan_mode_exit 附件处停止计数（标记实现开始的时间点）
    if (
      message?.type === 'attachment' &&
      message.attachment!.type === 'plan_mode_exit'
    ) {
      return turnCount
    }
  }
  // 未找到 plan_mode_exit
  return 0
}

/** 如果模型尚未调用 VerifyPlanExecution，则获取验证计划提醒附件。 */
async function getVerifyPlanReminderAttachment(
  messages: Message[] | undefined,
  toolUseContext: ToolUseContext,
): Promise<Attachment[]> {
  if (
    process.env.USER_TYPE !== 'ant' ||
    !isEnvTruthy(process.env.CLAUDE_CODE_VERIFY_PLAN)
  ) {
    return []
  }

  const appState = toolUseContext.getAppState()
  const pending = appState.pendingPlanVerification

  // 仅当计划存在且验证未开始或未完成时才提醒
  if (
    !pending ||
    pending.verificationStarted ||
    pending.verificationCompleted
  ) {
    return []
  }

  // 仅每 N 轮提醒一次
  if (messages && messages.length > 0) {
    const turnCount = getVerifyPlanReminderTurnCount(messages)
    if (
      turnCount === 0 ||
      turnCount % VERIFY_PLAN_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS !== 0
    ) {
      return []
    }
  }

  return [{ type: 'verify_plan_reminder' }]
}

export function getCompactionReminderAttachment(
  messages: Message[],
  model: string,
): Attachment[] {
  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_marble_fox', false)) {
    return []
  }

  if (!isAutoCompactEnabled()) {
    return []
  }

  const contextWindow = getContextWindowForModel(model, getSdkBetas())
  if (contextWindow < 1_000_000) {
    return []
  }

  const effectiveWindow = getEffectiveContextWindowSize(model)
  const usedTokens = tokenCountWithEstimation(messages)
  if (usedTokens < effectiveWindow * 0.25) {
    return []
  }

  return [{ type: 'compaction_reminder' }]
}

/** 上下文效率提示。在每增长 N 个令牌且未进行片段截取后注入。节奏完全由 shouldNudgeForSnips 处理——10k 间隔会在之前的提示、片段标记、片段边界和紧凑边界处重置。 */
export function getContextEfficiencyAttachment(
  messages: Message[],
): Attachment[] {
  if (!feature('HISTORY_SNIP')) {
    return []
  }
  // 检查条件必须与 SnipTool.isEnabled() 匹配——不要提示
  // 使用不在工具列表中的工具。延迟 require 保持此文件不包含片段字符串。
  const { isSnipRuntimeEnabled, shouldNudgeForSnips } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../services/compact/snipCompact.js') as typeof import('../services/compact/snipCompact.js')
  if (!isSnipRuntimeEnabled()) {
    return []
  }

  if (!shouldNudgeForSnips(messages)) {
    return []
  }

  return [{ type: 'context_efficiency' }]
}

function isFileReadDenied(
  filePath: string,
  toolPermissionContext: ToolPermissionContext,
): boolean {
  const denyRule = matchingRuleForInput(
    filePath,
    toolPermissionContext,
    'read',
    'deny',
  )
  return denyRule !== null
}
