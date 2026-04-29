/** 提取出的纯权限类型定义，用于打破导入循环。

此文件仅包含类型定义和常量，无运行时依赖。
实现文件仍位于 src/utils/permissions/ 中，但现在可以从此处导入以避免循环依赖。 */

import { feature } from 'bun:bundle'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'

// =======================================================================
// ===== 权限模式 ====
// ========================================================================

export const EXTERNAL_PERMISSION_MODES = [
  'acceptEdits',
  'bypassPermissions',
  'default',
  'dontAsk',
  'plan',
] as const

export type ExternalPermissionMode = (typeof EXTERNAL_PERMISSION_MODES)[number]

// 用于类型检查的详尽模式联合类型。用户可访问的运行时集合是下面的 INTERNA
// L_PERMISSION_MODES。
export type InternalPermissionMode = ExternalPermissionMode | 'auto' | 'bubble'
export type PermissionMode = InternalPermissionMode

// Runtime validation set: modes that are user-addressable (settings.json
// defaultMode, --permission-mode CLI flag, conversation recovery).
// 'auto' is always available — when TRANSCRIPT_CLASSIFIER is off, the
// classifier is unavailable and auto mode falls back to prompting.
export const INTERNAL_PERMISSION_MODES = [
  ...EXTERNAL_PERMISSION_MODES,
  'auto' as const,
] as const satisfies readonly PermissionMode[]

export const PERMISSION_MODES = INTERNAL_PERMISSION_MODES

// ======================================================================
// ====== 权限行为 ======
// ======================================================================

export type PermissionBehavior = 'allow' | 'deny' | 'ask'

// =======================================================================
// ===== 权限规则 ====
// ========================================================================

/** 权限规则的来源。
包含所有 SettingSource 值以及额外的规则特定来源。 */
export type PermissionRuleSource =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'flagSettings'
  | 'policySettings'
  | 'cliArg'
  | 'command'
  | 'session'

/** 权限规则的值 - 指定了哪个工具以及可选的内容 */
export type PermissionRuleValue = {
  toolName: string
  ruleContent?: string
}

/** 包含来源和行为的权限规则 */
export type PermissionRule = {
  source: PermissionRuleSource
  ruleBehavior: PermissionBehavior
  ruleValue: PermissionRuleValue
}

// =======================================================================
// ===== 权限更新 ======
// ======================================================================

/** 权限更新应持久化到何处 */
export type PermissionUpdateDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'
  | 'cliArg'

/** 权限配置的更新操作 */
export type PermissionUpdate =
  | {
      type: 'addRules'
      destination: PermissionUpdateDestination
      rules: PermissionRuleValue[]
      behavior: PermissionBehavior
    }
  | {
      type: 'replaceRules'
      destination: PermissionUpdateDestination
      rules: PermissionRuleValue[]
      behavior: PermissionBehavior
    }
  | {
      type: 'removeRules'
      destination: PermissionUpdateDestination
      rules: PermissionRuleValue[]
      behavior: PermissionBehavior
    }
  | {
      type: 'setMode'
      destination: PermissionUpdateDestination
      mode: ExternalPermissionMode
    }
  | {
      type: 'addDirectories'
      destination: PermissionUpdateDestination
      directories: string[]
    }
  | {
      type: 'removeDirectories'
      destination: PermissionUpdateDestination
      directories: string[]
    }

/** 额外工作目录权限的来源。
注意：目前与 PermissionRuleSource 相同，但为了语义清晰和未来可能的分化，保留为单独的类型。 */
export type WorkingDirectorySource = PermissionRuleSource

/** 权限范围内包含的额外目录 */
export type AdditionalWorkingDirectory = {
  path: string
  source: WorkingDirectorySource
}

// ===================================================================
// ========= 权限决策与结果 =========
// ===================================================================

/** 权限元数据的最小命令结构。
这特意是完整 Command 类型的子集，以避免导入循环。
仅包含权限相关组件所需的属性。 */
export type PermissionCommandMetadata = {
  name: string
  description?: string
  // 允许额外属性以保持向前兼容性
  [key: string]: unknown
}

/** 附加到权限决策的元数据 */
export type PermissionMetadata =
  | { command: PermissionCommandMetadata }
  | undefined

/** 权限被授予时的结果 */
export type PermissionAllowDecision<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> = {
  behavior: 'allow'
  updatedInput?: Input
  userModified?: boolean
  decisionReason?: PermissionDecisionReason
  toolUseID?: string
  acceptFeedback?: string
  contentBlocks?: ContentBlockParam[]
}

/** 将异步运行的待处理分类器检查的元数据。
用于启用非阻塞的允许分类器评估。 */
export type PendingClassifierCheck = {
  command: string
  cwd: string
  descriptions: string[]
}

/** 需要提示用户时的结果 */
export type PermissionAskDecision<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> = {
  behavior: 'ask'
  message: string
  updatedInput?: Input
  decisionReason?: PermissionDecisionReason
  suggestions?: PermissionUpdate[]
  blockedPath?: string
  metadata?: PermissionMetadata
  /** 如果为 true，此询问决策是由 bashCommandIsSafe_DEPRECATED 安全检查触发的，针对 splitCommand_DEPRECATED 可能错误解析的模式（例如，行继续符、shell 引号转换）。由 bashToolHasPermission 在 splitCommand_DEPRECATED 转换命令之前用于早期阻止。对于简单的换行复合命令不设置此标志。 */
  isBashSecurityCheckForMisparsing?: boolean
  /** 如果设置，应异步运行允许分类器检查。
分类器可能在用户响应之前自动批准该权限。 */
  pendingClassifierCheck?: PendingClassifierCheck
  /** 可选的内容块（例如，图像），用于在工具结果中与拒绝消息一起显示。当用户粘贴图像作为反馈时使用。 */
  contentBlocks?: ContentBlockParam[]
}

/** 权限被拒绝时的结果 */
export type PermissionDenyDecision = {
  behavior: 'deny'
  message: string
  decisionReason: PermissionDecisionReason
  toolUseID?: string
}

/** 权限决策 - 允许、询问或拒绝 */
export type PermissionDecision<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> =
  | PermissionAllowDecision<Input>
  | PermissionAskDecision<Input>
  | PermissionDenyDecision

/** 包含额外直通选项的权限结果 */
export type PermissionResult<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> =
  | PermissionDecision<Input>
  | {
      behavior: 'passthrough'
      message: string
      decisionReason?: PermissionDecision<Input>['decisionReason']
      suggestions?: PermissionUpdate[]
      blockedPath?: string
      /** 如果设置，应异步运行允许分类器检查。
分类器可能在用户响应之前自动批准该权限。 */
      pendingClassifierCheck?: PendingClassifierCheck
    }

/** 解释权限决策的原因 */
export type PermissionDecisionReason =
  | {
      type: 'rule'
      rule: PermissionRule
    }
  | {
      type: 'mode'
      mode: PermissionMode
    }
  | {
      type: 'subcommandResults'
      reasons: Map<string, PermissionResult>
    }
  | {
      type: 'permissionPromptTool'
      permissionPromptToolName: string
      toolResult: unknown
    }
  | {
      type: 'hook'
      hookName: string
      hookSource?: string
      reason?: string
    }
  | {
      type: 'asyncAgent'
      reason: string
    }
  | {
      type: 'sandboxOverride'
      reason: 'excludedCommand' | 'dangerouslyDisableSandbox'
    }
  | {
      type: 'classifier'
      classifier: string
      reason: string
    }
  | {
      type: 'workingDir'
      reason: string
    }
  | {
      type: 'safetyCheck'
      reason: string
      // 当为 true 时，自动模式让分类器评估此操作，而不是强制提示
      // 。对于敏感文件路径（.claude/、.git/、shell
      // 配置文件）为 true —— 分类器可以查看上下文并决定。对于
      // Windows 路径绕过尝试和跨机器桥接消息为 false。
      classifierApprovable: boolean
    }
  | {
      type: 'other'
      reason: string
    }

// ========================================================================
// ==== Bash 分类器类型 ====
// ========================================================================

export type ClassifierResult = {
  matches: boolean
  matchedDescription?: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export type ClassifierBehavior = 'deny' | 'ask' | 'allow'

export type ClassifierUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

export type YoloClassifierResult = {
  thinking?: string
  shouldBlock: boolean
  reason: string
  unavailable?: boolean
  /** API 返回 "prompt is too long" — 分类器转录文本超出了上下文窗口。这是确定性的（相同的转录文本 → 相同的错误），因此调用方应回退到正常提示，而不是重试或失败关闭。 */
  transcriptTooLong?: boolean
  /** 此分类器调用所使用的模型 */
  model: string
  /** 分类器 API 调用的令牌使用量（用于开销遥测） */
  usage?: ClassifierUsage
  /** 分类器 API 调用的持续时间（毫秒） */
  durationMs?: number
  /** 发送给分类器的提示组件的字符长度 */
  promptLengths?: {
    systemPrompt: number
    toolCalls: number
    userPrompts: number
  }
  /** 错误提示转储的路径（仅在因 API 错误而不可用时设置） */
  errorDumpPath?: string
  /** 哪个分类器阶段产生了最终决策（仅限 2 阶段 XML） */
  stage?: 'fast' | 'thinking'
  /** 当阶段 2 也运行时，阶段 1（快速）的令牌使用量 */
  stage1Usage?: ClassifierUsage
  /** 当阶段 2 也运行时，阶段 1 的持续时间（毫秒） */
  stage1DurationMs?: number
  /** 阶段 1 的 API request_id (req_xxx)。用于关联服务器端 api_usage 日志以进行缓存未命中/路由归因。也用于传统的 1 阶段 (tool_use) 分类器 — 单个请求放在这里。 */
  stage1RequestId?: string
  /** 阶段 1 的 API message id (msg_xxx)。用于在事后分析中将 tengu_auto_mode_decision 分析事件关联到分类器的实际提示/完成。 */
  stage1MsgId?: string
  /** 当阶段 2 运行时，阶段 2（思考）的令牌使用量 */
  stage2Usage?: ClassifierUsage
  /** 当阶段 2 运行时，阶段 2 的持续时间（毫秒） */
  stage2DurationMs?: number
  /** 阶段 2 的 API request_id（只要阶段 2 运行就会设置） */
  stage2RequestId?: string
  /** 阶段 2 的 API message id (msg_xxx)（只要阶段 2 运行就会设置） */
  stage2MsgId?: string
}

// =====================================================================
// ======= 权限解释器类型 ========
// ====================================================================

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export type PermissionExplanation = {
  riskLevel: RiskLevel
  explanation: string
  reasoning: string
  risk: string
}

// ======================================================================
// ====== 工具权限上下文 ======
// ======================================================================

/** 按来源映射的权限规则 */
export type ToolPermissionRulesBySource = {
  [T in PermissionRuleSource]?: string[]
}

/** 工具中进行权限检查所需的上下文
注意：在此仅包含类型的文件中使用了简化的 DeepImmutable 近似 */
export type ToolPermissionContext = {
  readonly mode: PermissionMode
  readonly additionalWorkingDirectories: ReadonlyMap<
    string,
    AdditionalWorkingDirectory
  >
  readonly alwaysAllowRules: ToolPermissionRulesBySource
  readonly alwaysDenyRules: ToolPermissionRulesBySource
  readonly alwaysAskRules: ToolPermissionRulesBySource
  readonly isBypassPermissionsModeAvailable: boolean
  readonly strippedDangerousRules?: ToolPermissionRulesBySource
  readonly shouldAvoidPermissionPrompts?: boolean
  readonly awaitAutomatedChecksBeforeDialog?: boolean
  readonly prePlanMode?: PermissionMode
}
