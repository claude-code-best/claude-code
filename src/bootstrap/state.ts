import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { Attributes, Meter, MetricOptions } from '@opentelemetry/api'
import type { logs } from '@opentelemetry/api-logs'
import type { LoggerProvider } from '@opentelemetry/sdk-logs'
import type { MeterProvider } from '@opentelemetry/sdk-metrics'
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'
import { realpathSync } from 'fs'
import sumBy from 'lodash-es/sumBy.js'
import { cwd } from 'process'
import type { HookEvent, ModelUsage } from 'src/entrypoints/agentSdkTypes.js'
import type { AgentColorName } from '@claude-code-best/builtin-tools/tools/AgentTool/agentColorManager.js'
import type { HookCallbackMatcher } from 'src/types/hooks.js'
// 浏览器 SDK 构建的间接层（package.json 的 "browser" 字段将 crypto.ts 替换为 crypto.browser.ts）。
// 纯叶子重导出 node:crypto —— 零循环依赖风险。使用路径别名导入绕过引导隔离
// （规则只检查 ./ 和 / 前缀）；显式禁用以记录意图。
// eslint-disable-next-line custom-rules/bootstrap-isolation
import { randomUUID } from 'src/utils/crypto.js'
import type { ModelSetting } from 'src/utils/model/model.js'
import type { ModelStrings } from 'src/utils/model/modelStrings.js'
import type { SettingSource } from 'src/utils/settings/constants.js'
import { resetSettingsCache } from 'src/utils/settings/settingsCache.js'
import type { PluginHookMatcher } from 'src/utils/settings/types.js'
import { createSignal } from 'src/utils/signal.js'

// 已注册钩子的联合类型 - 可以是 SDK 回调或原生插件钩子
type RegisteredHookMatcher = HookCallbackMatcher | PluginHookMatcher

import type { SessionId } from 'src/types/ids.js'

// 不要在此处添加更多状态 - 请谨慎使用全局状态

// dev: 对于通过 --dangerously-load-development-channels 来源的条目为 true。
// 允许列表门控会按条目检查此项（而不是会话级的 hasDevChannels 位），
// 因此同时传递两个标志不会让开发对话框的接受操作泄漏允许列表绕过到 --channels 条目。
export type ChannelEntry =
  | { kind: 'plugin'; name: string; marketplace: string; dev?: boolean }
  | { kind: 'server'; name: string; dev?: boolean }

export type AttributedCounter = {
  add(value: number, additionalAttributes?: Attributes): void
}

type State = {
  originalCwd: string
  // 稳定的项目根目录 - 启动时设置一次（包括通过 --worktree 标志），
  // 会话中途的 EnterWorktreeTool 永远不会更新它。
  // 用于项目标识（历史记录、技能、会话），不用于文件操作。
  projectRoot: string
  totalCostUSD: number
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number
  turnHookDurationMs: number
  turnToolDurationMs: number
  turnClassifierDurationMs: number
  turnToolCount: number
  turnHookCount: number
  turnClassifierCount: number
  startTime: number
  lastInteractionTime: number
  totalLinesAdded: number
  totalLinesRemoved: number
  hasUnknownModelCost: boolean
  cwd: string //当前工作目录。
  modelUsage: { [modelName: string]: ModelUsage }
  mainLoopModelOverride: ModelSetting | undefined
  initialMainLoopModel: ModelSetting
  modelStrings: ModelStrings | null
  isInteractive: boolean //true代表是通过REPL进行的交互式操作。
  kairosActive: boolean //KAIROS 助手是否开启（产品里和「助手 / Brief / 定时摘要」等一串能力相关，内部代号 Kairos）
  // 为 true 时，ensureToolResultPairing 会在不匹配时抛出异常，而不是用合成的占位符进行修复。
  // HFI 在启动时选择加入，以便轨迹快速失败，而不是让模型基于虚假的 tool_results 进行条件化。
  strictToolResultPairing: boolean
  sdkAgentProgressSummariesEnabled: boolean
  userMsgOptIn: boolean
  clientType: string
  sessionSource: string | undefined
  questionPreviewFormat: 'markdown' | 'html' | undefined
  flagSettingsPath: string | undefined
  flagSettingsInline: Record<string, unknown> | null
  allowedSettingSources: SettingSource[]
  sessionIngressToken: string | null | undefined
  oauthTokenFromFd: string | null | undefined
  apiKeyFromFd: string | null | undefined
  // 遥测状态
  meter: Meter | null
  sessionCounter: AttributedCounter | null
  locCounter: AttributedCounter | null
  prCounter: AttributedCounter | null
  commitCounter: AttributedCounter | null
  costCounter: AttributedCounter | null
  tokenCounter: AttributedCounter | null
  codeEditToolDecisionCounter: AttributedCounter | null
  activeTimeCounter: AttributedCounter | null
  statsStore: { observe(name: string, value: number): void } | null
  sessionId: SessionId
  // 父会话 ID，用于跟踪会话谱系（例如计划模式 -> 实现）
  parentSessionId: SessionId | undefined
  // 日志状态
  loggerProvider: LoggerProvider | null
  eventLogger: ReturnType<typeof logs.getLogger> | null
  // 度量提供者状态
  meterProvider: MeterProvider | null
  // 追踪提供者状态
  tracerProvider: BasicTracerProvider | null
  // 代理颜色状态
  agentColorMap: Map<string, AgentColorName>
  agentColorIndex: number
  // 用于错误报告的最后一次 API 请求
  lastAPIRequest: Omit<BetaMessageStreamParams, 'messages'> | null
  // 最后一次 API 请求中的消息（仅限 ant 内部；引用，不是克隆）。
  // 捕获压缩后、注入 CLAUDE.md 后实际发送给 API 的消息集，
  // 以便 /share 的 serialized_conversation.json 反映真实情况。
  lastAPIRequestMessages: BetaMessageStreamParams['messages'] | null
  // 用于 /share 对话记录的最后一次自动模式分类器请求
  lastClassifierRequests: unknown[] | null
  // 由 context.ts 缓存的 CLAUDE.md 内容，供自动模式分类器使用。
  // 打破 yoloClassifier → claudemd → 文件系统 → 权限的循环。
  cachedClaudeMdContent: string | null
  // 近期错误的内存错误日志
  inMemoryErrorLog: Array<{ error: string; timestamp: string }>
  // 来自 --plugin-dir 标志的仅会话插件
  inlinePlugins: Array<string>
  // 显式的 --chrome / --no-chrome 标志值（undefined = 未在 CLI 上设置）
  chromeFlagOverride: boolean | undefined
  // 使用 cowork_plugins 目录而不是 plugins（--cowork 标志或环境变量）
  useCoworkPlugins: boolean
  // 仅会话的绕过权限模式标志（不持久化）
  sessionBypassPermissionsMode: boolean
  // 仅会话的标志，用于门控 .claude/scheduled_tasks.json 的监视器
  // （useScheduledTasks）。当 JSON 中有条目时由 cronScheduler.start() 设置，
  // 或由 CronCreateTool 设置。不持久化。
  scheduledTasksEnabled: boolean
  // 通过 CronCreate 创建的仅会话 cron 任务，且 durable: false。
  // 像文件支持的任务一样按计划触发，但永远不会写入 .claude/scheduled_tasks.json ——
  // 它们随进程消亡。类型通过下面的 SessionCronTask 定义（不从 cronTasks.ts 导入
  // 以保持引导是导入 DAG 的叶子）。
  sessionCronTasks: SessionCronTask[]
  // 本次会话通过 TeamCreate 创建的团队。cleanupSessionTeams()
  // 在 gracefulShutdown 时移除这些团队，以便子代理创建的团队不会永久保留在磁盘上（gh-32730）。
  // TeamDelete 会移除条目以避免重复清理。放在这里（而不是 teamHelpers.ts）以便
  // resetStateForTests() 在测试之间清除它。
  sessionCreatedTeams: Set<string>
  // 仅会话的主目录信任标志（不持久化到磁盘）
  // 当从主目录运行时，信任对话框会显示但不会保存到磁盘。
  // 此标志允许需要信任的功能在会话期间工作。
  sessionTrustAccepted: boolean
  // 仅会话的标志，用于禁用会话持久化到磁盘
  sessionPersistenceDisabled: boolean
  // 跟踪用户是否在本次会话中退出了计划模式（用于重新进入指导）
  hasExitedPlanMode: boolean
  // 跟踪是否需要显示计划模式退出附件（一次性通知）
  needsPlanModeExitAttachment: boolean
  // 跟踪是否需要显示自动模式退出附件（一次性通知）
  needsAutoModeExitAttachment: boolean
  // 跟踪本次会话是否已显示 LSP 插件推荐（仅显示一次）
  lspRecommendationShownThisSession: boolean
  // SDK init 事件状态 - 用于结构化输出的 jsonSchema
  initJsonSchema: Record<string, unknown> | null
  // 已注册钩子 - SDK 回调和插件原生钩子
  registeredHooks: Partial<Record<HookEvent, RegisteredHookMatcher[]>> | null
  // 计划短句缓存：sessionId -> wordSlug
  planSlugCache: Map<string, string>
  // 跟踪用于可靠性日志的传送会话信息
  teleportedSessionInfo: {
    isTeleported: boolean
    hasLoggedFirstMessage: boolean
    sessionId: string | null
  } | null
  // 跟踪已调用的技能，以便在压缩时保留
  // 键是组合键：`${agentId ?? ''}:${skillName}`，防止跨代理覆盖
  invokedSkills: Map<
    string,
    {
      skillName: string
      skillPath: string
      content: string
      invokedAt: number
      agentId: string | null
    }
  >
  // 跟踪用于开发栏显示的慢操作（仅限 ant 内部）
  slowOperations: Array<{
    operation: string
    durationMs: number
    timestamp: number
  }>
  // SDK 提供的 betas（例如 context-1m-2025-08-07）
  sdkBetas: string[] | undefined
  // 主线程代理类型（来自 --agent 标志或设置）
  mainThreadAgentType: string | undefined
  // 远程模式（--remote 标志）
  isRemoteMode: boolean
  // 直连服务器 URL（用于在头部显示）
  directConnectServerUrl: string | undefined
  // 系统提示部分缓存状态
  systemPromptSectionCache: Map<string, string | null>
  // 上次发送给模型的日期（用于检测午夜日期变更）
  lastEmittedDate: string | null
  // 来自 --add-dir 标志的额外目录（用于 CLAUDE.md 加载）
  additionalDirectoriesForClaudeMd: string[]
  // 来自 --channels 标志的通道服务器允许列表（其通道通知应注册此会话的服务器）。
  // 在 main.tsx 中解析一次 —— 标签决定信任模型：'plugin' → 市场验证 + 允许列表，
  // 'server' → 允许列表始终失败（模式是插件专用）。任一类型都需要 entry.dev 来绕过允许列表。
  allowedChannels: ChannelEntry[]
  // 如果 allowedChannels 中的任何条目来自 --dangerously-load-development-channels
  // 则为 true（以便 ChannelsNotice 可以在策略阻止的消息中指明正确的标志）
  hasDevChannels: boolean
  // 包含会话 `.jsonl` 的目录；null = 从 originalCwd 派生。
  sessionProjectDir: string | null
  // 来自 GrowthBook 的缓存提示缓存 1 小时 TTL 允许列表（会话稳定）
  promptCache1hAllowlist: string[] | null
  // 缓存的 1 小时 TTL 用户资格（会话稳定）。在首次评估时锁定，
  // 以便会话中期的超额翻转不会更改 cache_control TTL，否则会破坏服务端提示缓存。
  promptCache1hEligible: boolean | null
  // AFK_MODE_BETA_HEADER 的粘性锁定。一旦自动模式首次激活，
  // 在会话剩余时间内持续发送该头部，以便 Shift+Tab 切换不会破坏约 50-70K 令牌的提示缓存。
  afkModeHeaderLatched: boolean | null
  // FAST_MODE_BETA_HEADER 的粘性锁定。一旦快速模式首次启用，
  // 持续发送该头部，以便冷却进入/退出不会双重破坏提示缓存。
  // `speed` 请求体参数保持动态。
  fastModeHeaderLatched: boolean | null
  // 缓存编辑 beta 头部的粘性锁定。一旦缓存微压缩首次启用，
  // 持续发送该头部，以便会话中期的 GrowthBook/设置切换不会破坏提示缓存。
  cacheEditingHeaderLatched: boolean | null
  // Current prompt ID (UUID) correlating a user prompt with subsequent OTel events
  promptId: string | null
  // 主对话链（非子代理）的最后一次 API 请求 ID。
  // 在主会话查询每次成功 API 响应后更新。
  // 在关闭时读取，以向推理服务发送缓存驱逐提示。
  lastMainRequestId: string | undefined
  // 最后一次成功 API 调用完成的 timestamp（Date.now()）。
  // 用于在 tengu_api_success 中计算 timeSinceLastApiCallMs，
  // 以便将缓存未命中与空闲时间关联起来（缓存 TTL 约 5 分钟）。
  lastApiCompletionTimestamp: number | null
  // 在压缩（自动或手动 /compact）后设置为 true。
  // 由 logAPISuccess 消费，用于标记压缩后的第一次 API 调用，
  // 以便区分压缩导致的缓存未命中和 TTL 过期。
  pendingPostCompaction: boolean
}

// 也在此处 —— 修改前请三思
function getInitialState(): State {
  // 解析 cwd 中的符号链接，以匹配 shell.ts setCwd 的行为
  // 这确保了与用于会话存储的路径清理方式一致
  let resolvedCwd = ''
  if (
    typeof process !== 'undefined' &&
    typeof process.cwd === 'function' &&
    typeof realpathSync === 'function'
  ) {
    const rawCwd = cwd()
    try {
      resolvedCwd = realpathSync(rawCwd).normalize('NFC')
    } catch {
      // 云存储挂载点上的 File Provider EPERM（按路径组件 lstat）。
      resolvedCwd = rawCwd.normalize('NFC')
    }
  }
  const state: State = {
    originalCwd: resolvedCwd,
    projectRoot: resolvedCwd,
    totalCostUSD: 0,
    totalAPIDuration: 0,
    totalAPIDurationWithoutRetries: 0,
    totalToolDuration: 0,
    turnHookDurationMs: 0,
    turnToolDurationMs: 0,
    turnClassifierDurationMs: 0,
    turnToolCount: 0,
    turnHookCount: 0,
    turnClassifierCount: 0,
    startTime: Date.now(),
    lastInteractionTime: Date.now(),
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    hasUnknownModelCost: false,
    cwd: resolvedCwd,
    modelUsage: {},
    mainLoopModelOverride: undefined,
    initialMainLoopModel: null,
    modelStrings: null,
    isInteractive: false,
    kairosActive: false,
    strictToolResultPairing: false,
    sdkAgentProgressSummariesEnabled: false,
    userMsgOptIn: false,
    clientType: 'cli',
    sessionSource: undefined,
    questionPreviewFormat: undefined,
    sessionIngressToken: undefined,
    oauthTokenFromFd: undefined,
    apiKeyFromFd: undefined,
    flagSettingsPath: undefined,
    flagSettingsInline: null,
    allowedSettingSources: [
      'userSettings',
      'projectSettings',
      'localSettings',
      'flagSettings',
      'policySettings',
    ],
    // 遥测状态
    meter: null,
    sessionCounter: null,
    locCounter: null,
    prCounter: null,
    commitCounter: null,
    costCounter: null,
    tokenCounter: null,
    codeEditToolDecisionCounter: null,
    activeTimeCounter: null,
    statsStore: null,
    sessionId: randomUUID() as SessionId,
    parentSessionId: undefined,
    // 日志状态
    loggerProvider: null,
    eventLogger: null,
    // 度量提供者状态
    meterProvider: null,
    tracerProvider: null,
    // 代理颜色状态
    agentColorMap: new Map(),
    agentColorIndex: 0,
    // 用于错误报告的最后一次 API 请求
    lastAPIRequest: null,
    lastAPIRequestMessages: null,
    // 用于 /share 对话记录的最后一次自动模式分类器请求
    lastClassifierRequests: null,
    cachedClaudeMdContent: null,
    // 近期错误的内存错误日志
    inMemoryErrorLog: [],
    // 来自 --plugin-dir 标志的仅会话插件
    inlinePlugins: [],
    // 显式的 --chrome / --no-chrome 标志值（undefined = 未在 CLI 上设置）
    chromeFlagOverride: undefined,
    // 使用 cowork_plugins 目录而不是 plugins
    useCoworkPlugins: false,
    // 仅会话的绕过权限模式标志（不持久化）
    sessionBypassPermissionsMode: false,
    // 计划任务在标志或对话框启用前禁用
    scheduledTasksEnabled: false,
    sessionCronTasks: [],
    sessionCreatedTeams: new Set(),
    // 仅会话的主目录信任标志（不持久化到磁盘）
    sessionTrustAccepted: false,
    // 仅会话的标志，用于禁用会话持久化到磁盘
    sessionPersistenceDisabled: false,
    // 跟踪用户是否在本次会话中退出了计划模式
    hasExitedPlanMode: false,
    // 跟踪是否需要显示计划模式退出附件
    needsPlanModeExitAttachment: false,
    // 跟踪是否需要显示自动模式退出附件
    needsAutoModeExitAttachment: false,
    // 跟踪本次会话是否已显示 LSP 插件推荐
    lspRecommendationShownThisSession: false,
    // SDK init 事件状态
    initJsonSchema: null,
    registeredHooks: null,
    // 计划短句缓存
    planSlugCache: new Map(),
    // 跟踪用于可靠性日志的传送会话信息
    teleportedSessionInfo: null,
    // 跟踪已调用的技能，以便在压缩时保留
    invokedSkills: new Map(),
    // 跟踪用于开发栏显示的慢操作
    slowOperations: [],
    // SDK 提供的 betas
    sdkBetas: undefined,
    // 主线程代理类型
    mainThreadAgentType: undefined,
    // 远程模式
    isRemoteMode: false,
    ...(process.env.USER_TYPE === 'ant'
      ? {
          replBridgeActive: false,
        }
      : {}),
    // 直连服务器 URL
    directConnectServerUrl: undefined,
    // 系统提示部分缓存状态
    systemPromptSectionCache: new Map(),
    // 上次发送给模型的日期
    lastEmittedDate: null,
    // 来自 --add-dir 标志的额外目录（用于 CLAUDE.md 加载）
    additionalDirectoriesForClaudeMd: [],
    // 来自 --channels 标志的通道服务器允许列表
    allowedChannels: [],
    hasDevChannels: false,
    // 会话项目目录（null = 从 originalCwd 派生）
    sessionProjectDir: null,
    // 提示缓存 1 小时允许列表（null = 尚未从 GrowthBook 获取）
    promptCache1hAllowlist: null,
    // 提示缓存 1 小时资格（null = 尚未评估）
    promptCache1hEligible: null,
    // Beta 头部锁定（null = 尚未触发）
    afkModeHeaderLatched: null,
    fastModeHeaderLatched: null,
    cacheEditingHeaderLatched: null,
    // Current prompt ID
    promptId: null,
    lastMainRequestId: undefined,
    lastApiCompletionTimestamp: null,
    pendingPostCompaction: false,
  }

  return state
}

// 特别是此处
const STATE: State = getInitialState()

export function getSessionId(): SessionId {
  return STATE.sessionId
}

export function regenerateSessionId(
  options: { setCurrentAsParent?: boolean } = {},
): SessionId {
  if (options.setCurrentAsParent) {
    STATE.parentSessionId = STATE.sessionId
  }
  // 删除传出会话的计划短句条目，以便 Map 不会积累过时键。
  // 需要在调用 clearConversation 之前读取短句的调用方会在调用前读取它。
  STATE.planSlugCache.delete(STATE.sessionId)
  // 重新生成的会话位于当前项目中：将 projectDir 重置为 null，
  // 以便 getTranscriptPath() 从 originalCwd 派生。
  STATE.sessionId = randomUUID() as SessionId
  STATE.sessionProjectDir = null
  return STATE.sessionId
}

export function getParentSessionId(): SessionId | undefined {
  return STATE.parentSessionId
}

/**
 * 原子性地切换活动会话。`sessionId` 和 `sessionProjectDir` 总是同时更改
 * —— 没有单独的 setter，因此它们不会出现不同步的情况（CC-34）。
 *
 * @param projectDir — 包含 `<sessionId>.jsonl` 的目录。对于当前项目中的会话，
 *   可以省略（或传递 `null`）—— 路径将在读取时从 originalCwd 派生。
 *   当会话位于不同的项目目录（git worktrees、跨项目恢复）时，传递 `dirname(transcriptPath)`。
 *   每次调用都会重置项目目录；它永远不会从上一个会话继承。
 */
export function switchSession(
  sessionId: SessionId,
  projectDir: string | null = null,
): void {
  // 删除传出会话的计划短句条目，以便 Map 在重复 /resume 时保持有界。
  // 只有当前会话的短句会被读取（plans.ts 中的 getPlanSlug 默认使用 getSessionId()）。
  STATE.planSlugCache.delete(STATE.sessionId)
  STATE.sessionId = sessionId
  STATE.sessionProjectDir = projectDir
  sessionSwitched.emit(sessionId)
}

const sessionSwitched = createSignal<[id: SessionId]>()

/**
 * 注册一个回调，当 switchSession 更改活动 sessionId 时触发。
 * bootstrap 无法直接导入监听器（DAG 叶子），因此调用方自行注册。
 * concurrentSessions.ts 使用此功能使 PID 文件的 sessionId 与 --resume 保持同步。
 */
export const onSessionSwitch = sessionSwitched.subscribe

/**
 * 当前会话对话记录所在的项目目录，如果会话是在当前项目中创建的（常见情况 —— 从 originalCwd 派生），则为 `null`。
 * 参见 `switchSession()`。
 */
export function getSessionProjectDir(): string | null {
  return STATE.sessionProjectDir
}

export function getOriginalCwd(): string {
  return STATE.originalCwd
}

/**
 * 获取稳定的项目根目录。
 * 与 getOriginalCwd() 不同，此值永远不会在会话中途被 EnterWorktreeTool 更新
 * （因此当进入一次性工作树时，技能/历史记录保持稳定）。
 * 它在启动时由 --worktree 设置，因为该工作树是会话的项目。
 * 用于项目标识（历史记录、技能、会话），不用于文件操作。
 */
export function getProjectRoot(): string {
  return STATE.projectRoot
}

export function setOriginalCwd(cwd: string): void {
  STATE.originalCwd = cwd.normalize('NFC')
}

/**
 * 仅用于 --worktree 启动标志。会话中途的 EnterWorktreeTool 绝不能调用此函数
 * —— 技能/历史记录应锚定在会话启动的位置。
 */
export function setProjectRoot(cwd: string): void {
  STATE.projectRoot = cwd.normalize('NFC')
}

export function getCwdState(): string {
  return STATE.cwd
}

export function setCwdState(cwd: string): void {
  STATE.cwd = cwd.normalize('NFC')
}

export function getDirectConnectServerUrl(): string | undefined {
  return STATE.directConnectServerUrl
}

export function setDirectConnectServerUrl(url: string): void {
  STATE.directConnectServerUrl = url
}

export function addToTotalDurationState(
  duration: number,
  durationWithoutRetries: number,
): void {
  STATE.totalAPIDuration += duration
  STATE.totalAPIDurationWithoutRetries += durationWithoutRetries
}

export function resetTotalDurationStateAndCost_FOR_TESTS_ONLY(): void {
  STATE.totalAPIDuration = 0
  STATE.totalAPIDurationWithoutRetries = 0
  STATE.totalCostUSD = 0
}

export function addToTotalCostState(
  cost: number,
  modelUsage: ModelUsage,
  model: string,
): void {
  STATE.modelUsage[model] = modelUsage
  STATE.totalCostUSD += cost
}

export function getTotalCostUSD(): number {
  return STATE.totalCostUSD
}

export function getTotalAPIDuration(): number {
  return STATE.totalAPIDuration
}

export function getTotalDuration(): number {
  return Date.now() - STATE.startTime
}

export function getTotalAPIDurationWithoutRetries(): number {
  return STATE.totalAPIDurationWithoutRetries
}

export function getTotalToolDuration(): number {
  return STATE.totalToolDuration
}

export function addToToolDuration(duration: number): void {
  STATE.totalToolDuration += duration
  STATE.turnToolDurationMs += duration
  STATE.turnToolCount++
}

export function getTurnHookDurationMs(): number {
  return STATE.turnHookDurationMs
}

export function addToTurnHookDuration(duration: number): void {
  STATE.turnHookDurationMs += duration
  STATE.turnHookCount++
}

export function resetTurnHookDuration(): void {
  STATE.turnHookDurationMs = 0
  STATE.turnHookCount = 0
}

export function getTurnHookCount(): number {
  return STATE.turnHookCount
}

export function getTurnToolDurationMs(): number {
  return STATE.turnToolDurationMs
}

export function resetTurnToolDuration(): void {
  STATE.turnToolDurationMs = 0
  STATE.turnToolCount = 0
}

export function getTurnToolCount(): number {
  return STATE.turnToolCount
}

export function getTurnClassifierDurationMs(): number {
  return STATE.turnClassifierDurationMs
}

export function addToTurnClassifierDuration(duration: number): void {
  STATE.turnClassifierDurationMs += duration
  STATE.turnClassifierCount++
}

export function resetTurnClassifierDuration(): void {
  STATE.turnClassifierDurationMs = 0
  STATE.turnClassifierCount = 0
}

export function getTurnClassifierCount(): number {
  return STATE.turnClassifierCount
}

export function getStatsStore(): {
  observe(name: string, value: number): void
} | null {
  return STATE.statsStore
}

export function setStatsStore(
  store: { observe(name: string, value: number): void } | null,
): void {
  STATE.statsStore = store
}

/**
 * 标记发生了交互。
 *
 * 默认情况下，实际的 Date.now() 调用会延迟到下一个 Ink 渲染帧（通过 flushInteractionTime()），
 * 以避免在每次按键时都调用 Date.now()。
 *
 * 当从 React useEffect 回调或其他在 Ink 渲染周期已刷新之后运行的代码中调用时，
 * 传递 `immediate = true`。否则时间戳会保持过时状态，直到下一次渲染，
 * 而如果用户空闲（例如权限对话框等待输入），下一次渲染可能永远不会到来。
 */
let interactionTimeDirty = false

export function updateLastInteractionTime(immediate?: boolean): void {
  if (immediate) {
    flushInteractionTime_inner()
  } else {
    interactionTimeDirty = true
  }
}

/**
 * 如果自上次刷新以来记录了交互，则立即更新时间戳。
 * 由 Ink 在每个渲染周期前调用，以便将多次按键批处理为一次 Date.now() 调用。
 */
export function flushInteractionTime(): void {
  if (interactionTimeDirty) {
    flushInteractionTime_inner()
  }
}

function flushInteractionTime_inner(): void {
  STATE.lastInteractionTime = Date.now()
  interactionTimeDirty = false
}

export function addToTotalLinesChanged(added: number, removed: number): void {
  STATE.totalLinesAdded += added
  STATE.totalLinesRemoved += removed
}

export function getTotalLinesAdded(): number {
  return STATE.totalLinesAdded
}

export function getTotalLinesRemoved(): number {
  return STATE.totalLinesRemoved
}

export function getTotalInputTokens(): number {
  return sumBy(Object.values(STATE.modelUsage), 'inputTokens')
}

export function getTotalOutputTokens(): number {
  return sumBy(Object.values(STATE.modelUsage), 'outputTokens')
}

export function getTotalCacheReadInputTokens(): number {
  return sumBy(Object.values(STATE.modelUsage), 'cacheReadInputTokens')
}

export function getTotalCacheCreationInputTokens(): number {
  return sumBy(Object.values(STATE.modelUsage), 'cacheCreationInputTokens')
}

export function getTotalWebSearchRequests(): number {
  return sumBy(Object.values(STATE.modelUsage), 'webSearchRequests')
}

let outputTokensAtTurnStart = 0
let currentTurnTokenBudget: number | null = null
export function getTurnOutputTokens(): number {
  return getTotalOutputTokens() - outputTokensAtTurnStart
}
export function getCurrentTurnTokenBudget(): number | null {
  return currentTurnTokenBudget
}
let budgetContinuationCount = 0
export function snapshotOutputTokensForTurn(budget: number | null): void {
  outputTokensAtTurnStart = getTotalOutputTokens()
  currentTurnTokenBudget = budget
  budgetContinuationCount = 0
}
export function getBudgetContinuationCount(): number {
  return budgetContinuationCount
}
export function incrementBudgetContinuationCount(): void {
  budgetContinuationCount++
}

export function setHasUnknownModelCost(): void {
  STATE.hasUnknownModelCost = true
}

export function hasUnknownModelCost(): boolean {
  return STATE.hasUnknownModelCost
}

export function getLastMainRequestId(): string | undefined {
  return STATE.lastMainRequestId
}

export function setLastMainRequestId(requestId: string): void {
  STATE.lastMainRequestId = requestId
}

export function getLastApiCompletionTimestamp(): number | null {
  return STATE.lastApiCompletionTimestamp
}

export function setLastApiCompletionTimestamp(timestamp: number): void {
  STATE.lastApiCompletionTimestamp = timestamp
}

/** 标记刚刚发生了压缩。下一个 API 成功事件将包含 isPostCompaction=true，然后标志自动重置。 */
export function markPostCompaction(): void {
  STATE.pendingPostCompaction = true
}

/** 消耗压缩后标志。在压缩后返回 true 一次，然后返回 false 直到下一次压缩。 */
export function consumePostCompaction(): boolean {
  const was = STATE.pendingPostCompaction
  STATE.pendingPostCompaction = false
  return was
}

export function getLastInteractionTime(): number {
  return STATE.lastInteractionTime
}

// 滚动耗尽挂起 — 后台间隔在执行工作前检查此项，以免与滚动帧竞争事件循环。
// 由 ScrollBox scrollBy/scrollTo 设置，在最后一次滚动事件后的 SCROLL_DRAIN_IDLE_MS 后清除。
// 模块作用域（不在 STATE 中）— 瞬时的热路径标志，不需要测试重置，因为防抖计时器自清除。
let scrollDraining = false
let scrollDrainTimer: ReturnType<typeof setTimeout> | undefined
const SCROLL_DRAIN_IDLE_MS = 150

/** 标记刚刚发生了滚动事件。后台间隔通过 getIsScrollDraining() 进行门控，并跳过工作直到防抖清除。 */
export function markScrollActivity(): void {
  scrollDraining = true
  if (scrollDrainTimer) clearTimeout(scrollDrainTimer)
  scrollDrainTimer = setTimeout(() => {
    scrollDraining = false
    scrollDrainTimer = undefined
  }, SCROLL_DRAIN_IDLE_MS)
  scrollDrainTimer.unref?.()
}

/** 当滚动正在主动耗尽时（在最后一次事件后的 150 毫秒内）为 true。
 *  间隔应在设置此项时提前返回 —— 工作会在滚动稳定后的下一个 tick 恢复。 */
export function getIsScrollDraining(): boolean {
  return scrollDraining
}

/** 在可能恰逢滚动的一次性昂贵工作（网络、子进程）之前等待此函数。
 *  如果不滚动则立即解决；否则以空闲间隔轮询直到标志清除。 */
export async function waitForScrollIdle(): Promise<void> {
  while (scrollDraining) {
    // bootstrap-isolation 禁止从 src/utils/ 导入 sleep()
    // eslint-disable-next-line no-restricted-syntax
    await new Promise(r => setTimeout(r, SCROLL_DRAIN_IDLE_MS).unref?.())
  }
}

export function getModelUsage(): { [modelName: string]: ModelUsage } {
  return STATE.modelUsage
}

export function getUsageForModel(model: string): ModelUsage | undefined {
  return STATE.modelUsage[model]
}

/**
 * 获取从 --model CLI 标志设置的模型覆盖，或用户更新其配置模型后的值。
 */
export function getMainLoopModelOverride(): ModelSetting | undefined {
  return STATE.mainLoopModelOverride
}

export function getInitialMainLoopModel(): ModelSetting {
  return STATE.initialMainLoopModel
}

export function setMainLoopModelOverride(
  model: ModelSetting | undefined,
): void {
  STATE.mainLoopModelOverride = model
}

export function setInitialMainLoopModel(model: ModelSetting): void {
  STATE.initialMainLoopModel = model
}

export function getSdkBetas(): string[] | undefined {
  return STATE.sdkBetas
}

export function setSdkBetas(betas: string[] | undefined): void {
  STATE.sdkBetas = betas
}

export function resetCostState(): void {
  STATE.totalCostUSD = 0
  STATE.totalAPIDuration = 0
  STATE.totalAPIDurationWithoutRetries = 0
  STATE.totalToolDuration = 0
  STATE.startTime = Date.now()
  STATE.totalLinesAdded = 0
  STATE.totalLinesRemoved = 0
  STATE.hasUnknownModelCost = false
  STATE.modelUsage = {}
  STATE.promptId = null
}

/**
 * 为会话恢复设置成本状态值。
 * 由 cost-tracker.ts 中的 restoreCostStateForSession 调用。
 */
export function setCostStateForRestore({
  totalCostUSD,
  totalAPIDuration,
  totalAPIDurationWithoutRetries,
  totalToolDuration,
  totalLinesAdded,
  totalLinesRemoved,
  lastDuration,
  modelUsage,
}: {
  totalCostUSD: number
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number
  totalLinesAdded: number
  totalLinesRemoved: number
  lastDuration: number | undefined
  modelUsage: { [modelName: string]: ModelUsage } | undefined
}): void {
  STATE.totalCostUSD = totalCostUSD
  STATE.totalAPIDuration = totalAPIDuration
  STATE.totalAPIDurationWithoutRetries = totalAPIDurationWithoutRetries
  STATE.totalToolDuration = totalToolDuration
  STATE.totalLinesAdded = totalLinesAdded
  STATE.totalLinesRemoved = totalLinesRemoved

  // 恢复每个模型的用量细分
  if (modelUsage) {
    STATE.modelUsage = modelUsage
  }

  // 调整 startTime 以使壁钟持续时间累积
  if (lastDuration) {
    STATE.startTime = Date.now() - lastDuration
  }
}

// 仅在测试中使用
export function resetStateForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetStateForTests 只能在测试中调用')
  }
  Object.entries(getInitialState()).forEach(([key, value]) => {
    STATE[key as keyof State] = value as never
  })
  outputTokensAtTurnStart = 0
  currentTurnTokenBudget = null
  budgetContinuationCount = 0
  sessionSwitched.clear()
}

// 你不应直接使用此函数。请参见 src/utils/model/modelStrings.ts 中的 getModelStrings()
export function getModelStrings(): ModelStrings | null {
  return STATE.modelStrings
}

// 你不应直接使用此函数。请参见 src/utils/model/modelStrings.ts
export function setModelStrings(modelStrings: ModelStrings): void {
  STATE.modelStrings = modelStrings
}

// 用于重新初始化模型字符串的测试工具函数。
// 与 setModelStrings 分离，因为我们只希望在测试中接受 'null'。
export function resetModelStringsForTestingOnly() {
  STATE.modelStrings = null
}

export function setMeter(
  meter: Meter,
  createCounter: (name: string, options: MetricOptions) => AttributedCounter,
): void {
  STATE.meter = meter

  // 使用提供的工厂初始化所有计数器
  STATE.sessionCounter = createCounter('claude_code.session.count', {
    description: '已启动的 CLI 会话计数',
  })
  STATE.locCounter = createCounter('claude_code.lines_of_code.count', {
    description: '修改的代码行数计数，通过 "type" 属性指示行是添加还是删除',
  })
  STATE.prCounter = createCounter('claude_code.pull_request.count', {
    description: '创建的拉取请求数量',
  })
  STATE.commitCounter = createCounter('claude_code.commit.count', {
    description: '创建的 git 提交数量',
  })
  STATE.costCounter = createCounter('claude_code.cost.usage', {
    description: 'Claude Code 会话的成本',
    unit: 'USD',
  })
  STATE.tokenCounter = createCounter('claude_code.token.usage', {
    description: '使用的令牌数量',
    unit: 'tokens',
  })
  STATE.codeEditToolDecisionCounter = createCounter(
    'claude_code.code_edit_tool.decision',
    {
      description:
        '代码编辑工具权限决策计数（接受/拒绝），适用于 Edit、Write 和 NotebookEdit 工具',
    },
  )
  STATE.activeTimeCounter = createCounter('claude_code.active_time.total', {
    description: '总活跃时间（秒）',
    unit: 's',
  })
}

export function getMeter(): Meter | null {
  return STATE.meter
}

export function getSessionCounter(): AttributedCounter | null {
  return STATE.sessionCounter
}

export function getLocCounter(): AttributedCounter | null {
  return STATE.locCounter
}

export function getPrCounter(): AttributedCounter | null {
  return STATE.prCounter
}

export function getCommitCounter(): AttributedCounter | null {
  return STATE.commitCounter
}

export function getCostCounter(): AttributedCounter | null {
  return STATE.costCounter
}

export function getTokenCounter(): AttributedCounter | null {
  return STATE.tokenCounter
}

export function getCodeEditToolDecisionCounter(): AttributedCounter | null {
  return STATE.codeEditToolDecisionCounter
}

export function getActiveTimeCounter(): AttributedCounter | null {
  return STATE.activeTimeCounter
}

export function getLoggerProvider(): LoggerProvider | null {
  return STATE.loggerProvider
}

export function setLoggerProvider(provider: LoggerProvider | null): void {
  STATE.loggerProvider = provider
}

export function getEventLogger(): ReturnType<typeof logs.getLogger> | null {
  return STATE.eventLogger
}

export function setEventLogger(
  logger: ReturnType<typeof logs.getLogger> | null,
): void {
  STATE.eventLogger = logger
}

export function getMeterProvider(): MeterProvider | null {
  return STATE.meterProvider
}

export function setMeterProvider(provider: MeterProvider | null): void {
  STATE.meterProvider = provider
}
export function getTracerProvider(): BasicTracerProvider | null {
  return STATE.tracerProvider
}
export function setTracerProvider(provider: BasicTracerProvider | null): void {
  STATE.tracerProvider = provider
}

export function getIsNonInteractiveSession(): boolean {
  return !STATE.isInteractive
}

export function getIsInteractive(): boolean {
  return STATE.isInteractive
}

export function setIsInteractive(value: boolean): void {
  STATE.isInteractive = value
}

export function getClientType(): string {
  return STATE.clientType
}

export function setClientType(type: string): void {
  STATE.clientType = type
}

export function getSdkAgentProgressSummariesEnabled(): boolean {
  return STATE.sdkAgentProgressSummariesEnabled
}

export function setSdkAgentProgressSummariesEnabled(value: boolean): void {
  STATE.sdkAgentProgressSummariesEnabled = value
}

export function getKairosActive(): boolean {
  return STATE.kairosActive
}

export function setKairosActive(value: boolean): void {
  STATE.kairosActive = value
}

export function getStrictToolResultPairing(): boolean {
  return STATE.strictToolResultPairing
}

export function setStrictToolResultPairing(value: boolean): void {
  STATE.strictToolResultPairing = value
}

// 字段名 'userMsgOptIn' 避免被排除的子字符串（'BriefTool'、'SendUserMessage' —— 不区分大小写）。
// 所有调用方都在 feature() 守卫内部，因此这些访问器不需要自己的守卫（与 getKairosActive 一致）。
export function getUserMsgOptIn(): boolean {
  return STATE.userMsgOptIn
}

export function setUserMsgOptIn(value: boolean): void {
  STATE.userMsgOptIn = value
}

export function getSessionSource(): string | undefined {
  return STATE.sessionSource
}

export function setSessionSource(source: string): void {
  STATE.sessionSource = source
}

export function getQuestionPreviewFormat(): 'markdown' | 'html' | undefined {
  return STATE.questionPreviewFormat
}

export function setQuestionPreviewFormat(format: 'markdown' | 'html'): void {
  STATE.questionPreviewFormat = format
}

export function getAgentColorMap(): Map<string, AgentColorName> {
  return STATE.agentColorMap
}

export function getFlagSettingsPath(): string | undefined {
  return STATE.flagSettingsPath
}

export function setFlagSettingsPath(path: string | undefined): void {
  STATE.flagSettingsPath = path
}

export function getFlagSettingsInline(): Record<string, unknown> | null {
  return STATE.flagSettingsInline
}

export function setFlagSettingsInline(
  settings: Record<string, unknown> | null,
): void {
  STATE.flagSettingsInline = settings
}

export function getSessionIngressToken(): string | null | undefined {
  return STATE.sessionIngressToken
}

export function setSessionIngressToken(token: string | null): void {
  STATE.sessionIngressToken = token
}

export function getOauthTokenFromFd(): string | null | undefined {
  return STATE.oauthTokenFromFd
}

export function setOauthTokenFromFd(token: string | null): void {
  STATE.oauthTokenFromFd = token
}

export function getApiKeyFromFd(): string | null | undefined {
  return STATE.apiKeyFromFd
}

export function setApiKeyFromFd(key: string | null): void {
  STATE.apiKeyFromFd = key
}

export function setLastAPIRequest(
  params: Omit<BetaMessageStreamParams, 'messages'> | null,
): void {
  STATE.lastAPIRequest = params
}

export function getLastAPIRequest(): Omit<
  BetaMessageStreamParams,
  'messages'
> | null {
  return STATE.lastAPIRequest
}

export function setLastAPIRequestMessages(
  messages: BetaMessageStreamParams['messages'] | null,
): void {
  STATE.lastAPIRequestMessages = messages
}

export function getLastAPIRequestMessages():
  | BetaMessageStreamParams['messages']
  | null {
  return STATE.lastAPIRequestMessages
}

export function setLastClassifierRequests(requests: unknown[] | null): void {
  STATE.lastClassifierRequests = requests
}

export function getLastClassifierRequests(): unknown[] | null {
  return STATE.lastClassifierRequests
}

export function setCachedClaudeMdContent(content: string | null): void {
  STATE.cachedClaudeMdContent = content
}

export function getCachedClaudeMdContent(): string | null {
  return STATE.cachedClaudeMdContent
}

export function addToInMemoryErrorLog(errorInfo: {
  error: string
  timestamp: string
}): void {
  const MAX_IN_MEMORY_ERRORS = 100
  if (STATE.inMemoryErrorLog.length >= MAX_IN_MEMORY_ERRORS) {
    STATE.inMemoryErrorLog.shift() // 移除最旧的错误
  }
  STATE.inMemoryErrorLog.push(errorInfo)
}

export function getAllowedSettingSources(): SettingSource[] {
  return STATE.allowedSettingSources
}

export function setAllowedSettingSources(sources: SettingSource[]): void {
  STATE.allowedSettingSources = sources
}

export function preferThirdPartyAuthentication(): boolean {
  // IDE 扩展在认证方面应表现为第一方。
  return getIsNonInteractiveSession() && STATE.clientType !== 'claude-vscode'
}

export function setInlinePlugins(plugins: Array<string>): void {
  STATE.inlinePlugins = plugins
}

export function getInlinePlugins(): Array<string> {
  return STATE.inlinePlugins
}

export function setChromeFlagOverride(value: boolean | undefined): void {
  STATE.chromeFlagOverride = value
}

export function getChromeFlagOverride(): boolean | undefined {
  return STATE.chromeFlagOverride
}

export function setUseCoworkPlugins(value: boolean): void {
  STATE.useCoworkPlugins = value
  resetSettingsCache()
}

export function getUseCoworkPlugins(): boolean {
  return STATE.useCoworkPlugins
}

export function setSessionBypassPermissionsMode(enabled: boolean): void {
  STATE.sessionBypassPermissionsMode = enabled
}

export function getSessionBypassPermissionsMode(): boolean {
  return STATE.sessionBypassPermissionsMode
}

export function setScheduledTasksEnabled(enabled: boolean): void {
  STATE.scheduledTasksEnabled = enabled
}

export function getScheduledTasksEnabled(): boolean {
  return STATE.scheduledTasksEnabled
}

export type SessionCronTask = {
  id: string
  cron: string
  prompt: string
  createdAt: number
  recurring?: boolean
  /**
   * 当设置时，任务由进程内的队友（而非团队负责人）创建。
   * 调度器将触发路由到该队友的 pendingUserMessages 队列，
   * 而不是主 REPL 命令队列。仅会话 —— 从不写入磁盘。
   */
  agentId?: string
}

export function getSessionCronTasks(): SessionCronTask[] {
  return STATE.sessionCronTasks
}

export function addSessionCronTask(task: SessionCronTask): void {
  STATE.sessionCronTasks.push(task)
}

/**
 * 返回实际移除的任务数量。调用方使用此信息在所有 ID 都由此处理时跳过下游工作（例如 removeCronTasks 中的磁盘读取）。
 */
export function removeSessionCronTasks(ids: readonly string[]): number {
  if (ids.length === 0) return 0
  const idSet = new Set(ids)
  const remaining = STATE.sessionCronTasks.filter(t => !idSet.has(t.id))
  const removed = STATE.sessionCronTasks.length - remaining.length
  if (removed === 0) return 0
  STATE.sessionCronTasks = remaining
  return removed
}

export function setSessionTrustAccepted(accepted: boolean): void {
  STATE.sessionTrustAccepted = accepted
}

export function getSessionTrustAccepted(): boolean {
  return STATE.sessionTrustAccepted
}

export function setSessionPersistenceDisabled(disabled: boolean): void {
  STATE.sessionPersistenceDisabled = disabled
}

export function isSessionPersistenceDisabled(): boolean {
  return STATE.sessionPersistenceDisabled
}

export function hasExitedPlanModeInSession(): boolean {
  return STATE.hasExitedPlanMode
}

export function setHasExitedPlanMode(value: boolean): void {
  STATE.hasExitedPlanMode = value
}

export function needsPlanModeExitAttachment(): boolean {
  return STATE.needsPlanModeExitAttachment
}

export function setNeedsPlanModeExitAttachment(value: boolean): void {
  STATE.needsPlanModeExitAttachment = value
}

export function handlePlanModeTransition(
  fromMode: string,
  toMode: string,
): void {
  // 如果切换为计划模式，清除任何待处理的退出附件
  // 防止用户快速切换时同时发送 plan_mode 和 plan_mode_exit
  if (toMode === 'plan' && fromMode !== 'plan') {
    STATE.needsPlanModeExitAttachment = false
  }

  // 如果退出计划模式，触发 plan_mode_exit 附件
  if (fromMode === 'plan' && toMode !== 'plan') {
    STATE.needsPlanModeExitAttachment = true
  }
}

export function needsAutoModeExitAttachment(): boolean {
  return STATE.needsAutoModeExitAttachment
}

export function setNeedsAutoModeExitAttachment(value: boolean): void {
  STATE.needsAutoModeExitAttachment = value
}

export function handleAutoModeTransition(
  fromMode: string,
  toMode: string,
): void {
  // 自动↔计划模式之间的转换由 prepareContextForPlanMode（如果用户选择加入，自动模式可能在计划模式期间保持活动）
  // 和 ExitPlanMode（恢复模式）处理。跳过两个方向，以便此函数仅处理直接的自动模式转换。
  if (
    (fromMode === 'auto' && toMode === 'plan') ||
    (fromMode === 'plan' && toMode === 'auto')
  ) {
    return
  }
  const fromIsAuto = fromMode === 'auto'
  const toIsAuto = toMode === 'auto'

  // 如果切换为自动模式，清除任何待处理的退出附件
  // 防止用户快速切换时同时发送 auto_mode 和 auto_mode_exit
  if (toIsAuto && !fromIsAuto) {
    STATE.needsAutoModeExitAttachment = false
  }

  // 如果退出自动模式，触发 auto_mode_exit 附件
  if (fromIsAuto && !toIsAuto) {
    STATE.needsAutoModeExitAttachment = true
  }
}

// LSP 插件推荐会话跟踪
export function hasShownLspRecommendationThisSession(): boolean {
  return STATE.lspRecommendationShownThisSession
}

export function setLspRecommendationShownThisSession(value: boolean): void {
  STATE.lspRecommendationShownThisSession = value
}

// SDK init 事件状态
export function setInitJsonSchema(schema: Record<string, unknown>): void {
  STATE.initJsonSchema = schema
}

export function getInitJsonSchema(): Record<string, unknown> | null {
  return STATE.initJsonSchema
}

export function registerHookCallbacks(
  hooks: Partial<Record<HookEvent, RegisteredHookMatcher[]>>,
): void {
  if (!STATE.registeredHooks) {
    STATE.registeredHooks = {}
  }

  // `registerHookCallbacks` 可能被多次调用，因此我们需要合并（而不是覆盖）
  for (const [event, matchers] of Object.entries(hooks)) {
    const eventKey = event as HookEvent
    if (!STATE.registeredHooks[eventKey]) {
      STATE.registeredHooks[eventKey] = []
    }
    STATE.registeredHooks[eventKey]!.push(...(matchers ?? []))
  }
}

export function getRegisteredHooks(): Partial<
  Record<HookEvent, RegisteredHookMatcher[]>
> | null {
  return STATE.registeredHooks
}

export function clearRegisteredHooks(): void {
  STATE.registeredHooks = null
}

export function clearRegisteredPluginHooks(): void {
  if (!STATE.registeredHooks) {
    return
  }

  const filtered: Partial<Record<HookEvent, RegisteredHookMatcher[]>> = {}
  for (const [event, matchers] of Object.entries(STATE.registeredHooks)) {
    // 仅保留回调钩子（那些没有 pluginRoot 的）
    const callbackHooks = (matchers ?? []).filter(m => !('pluginRoot' in m))
    if (callbackHooks.length > 0) {
      filtered[event as HookEvent] = callbackHooks
    }
  }

  STATE.registeredHooks = Object.keys(filtered).length > 0 ? filtered : null
}

export function resetSdkInitState(): void {
  STATE.initJsonSchema = null
  STATE.registeredHooks = null
}

export function getPlanSlugCache(): Map<string, string> {
  return STATE.planSlugCache
}

export function setPlanSlugCacheEntry(sessionId: string, slug: string): void {
  if (STATE.planSlugCache.size >= 50) {
    const firstKey = STATE.planSlugCache.keys().next().value
    if (firstKey !== undefined) {
      STATE.planSlugCache.delete(firstKey)
    }
  }
  STATE.planSlugCache.set(sessionId, slug)
}

export function getSessionCreatedTeams(): Set<string> {
  return STATE.sessionCreatedTeams
}

// 用于可靠性日志的传送会话跟踪
export function setTeleportedSessionInfo(info: {
  sessionId: string | null
}): void {
  STATE.teleportedSessionInfo = {
    isTeleported: true,
    hasLoggedFirstMessage: false,
    sessionId: info.sessionId,
  }
}

export function getTeleportedSessionInfo(): {
  isTeleported: boolean
  hasLoggedFirstMessage: boolean
  sessionId: string | null
} | null {
  return STATE.teleportedSessionInfo
}

export function markFirstTeleportMessageLogged(): void {
  if (STATE.teleportedSessionInfo) {
    STATE.teleportedSessionInfo.hasLoggedFirstMessage = true
  }
}

// 跟踪已调用的技能，以便在压缩时保留
export type InvokedSkillInfo = {
  skillName: string
  skillPath: string
  content: string
  invokedAt: number
  agentId: string | null
}

export function addInvokedSkill(
  skillName: string,
  skillPath: string,
  content: string,
  agentId: string | null = null,
): void {
  const key = `${agentId ?? ''}:${skillName}`
  STATE.invokedSkills.set(key, {
    skillName,
    skillPath,
    content,
    invokedAt: Date.now(),
    agentId,
  })
}

export function getInvokedSkills(): Map<string, InvokedSkillInfo> {
  return STATE.invokedSkills
}

export function getInvokedSkillsForAgent(
  agentId: string | undefined | null,
): Map<string, InvokedSkillInfo> {
  const normalizedId = agentId ?? null
  const filtered = new Map<string, InvokedSkillInfo>()
  for (const [key, skill] of STATE.invokedSkills) {
    if (skill.agentId === normalizedId) {
      filtered.set(key, skill)
    }
  }
  return filtered
}

export function clearInvokedSkills(
  preservedAgentIds?: ReadonlySet<string>,
): void {
  if (!preservedAgentIds || preservedAgentIds.size === 0) {
    STATE.invokedSkills.clear()
    return
  }
  for (const [key, skill] of STATE.invokedSkills) {
    if (skill.agentId === null || !preservedAgentIds.has(skill.agentId)) {
      STATE.invokedSkills.delete(key)
    }
  }
}

export function clearInvokedSkillsForAgent(agentId: string): void {
  for (const [key, skill] of STATE.invokedSkills) {
    if (skill.agentId === agentId) {
      STATE.invokedSkills.delete(key)
    }
  }
}

// 用于开发栏的慢操作跟踪
const MAX_SLOW_OPERATIONS = 10
const SLOW_OPERATION_TTL_MS = 10000

export function addSlowOperation(operation: string, durationMs: number): void {
  if (process.env.USER_TYPE !== 'ant') return
  // 跳过对编辑器会话的跟踪（用户在 $EDITOR 中编辑提示文件）
  // 这些操作是有意缓慢的，因为用户正在起草文本
  if (operation.includes('exec') && operation.includes('claude-prompt-')) {
    return
  }
  const now = Date.now()
  // 移除过时的操作
  STATE.slowOperations = STATE.slowOperations.filter(
    op => now - op.timestamp < SLOW_OPERATION_TTL_MS,
  )
  // 添加新操作
  STATE.slowOperations.push({ operation, durationMs, timestamp: now })
  // 仅保留最近的操作
  if (STATE.slowOperations.length > MAX_SLOW_OPERATIONS) {
    STATE.slowOperations = STATE.slowOperations.slice(-MAX_SLOW_OPERATIONS)
  }
}

const EMPTY_SLOW_OPERATIONS: ReadonlyArray<{
  operation: string
  durationMs: number
  timestamp: number
}> = []

export function getSlowOperations(): ReadonlyArray<{
  operation: string
  durationMs: number
  timestamp: number
}> {
  // 最常见的情况：没有跟踪任何内容。返回一个稳定的引用，以便调用方的 setState()
  // 可以通过 Object.is 退出，而不是以 2fps 重新渲染。
  if (STATE.slowOperations.length === 0) {
    return EMPTY_SLOW_OPERATIONS
  }
  const now = Date.now()
  // 仅在实际有过期内容时分配新数组；否则在操作仍然新鲜时保持引用稳定。
  if (
    STATE.slowOperations.some(op => now - op.timestamp >= SLOW_OPERATION_TTL_MS)
  ) {
    STATE.slowOperations = STATE.slowOperations.filter(
      op => now - op.timestamp < SLOW_OPERATION_TTL_MS,
    )
    if (STATE.slowOperations.length === 0) {
      return EMPTY_SLOW_OPERATIONS
    }
  }
  // 可以直接返回：addSlowOperation() 在推送之前重新赋值 STATE.slowOperations，
  // 因此 React 状态中持有的数组永远不会被修改。
  return STATE.slowOperations
}

export function getMainThreadAgentType(): string | undefined {
  return STATE.mainThreadAgentType
}

export function setMainThreadAgentType(agentType: string | undefined): void {
  STATE.mainThreadAgentType = agentType
}

export function getIsRemoteMode(): boolean {
  return STATE.isRemoteMode
}

export function setIsRemoteMode(value: boolean): void {
  STATE.isRemoteMode = value
}

// 系统提示部分访问器

export function getSystemPromptSectionCache(): Map<string, string | null> {
  return STATE.systemPromptSectionCache
}

export function setSystemPromptSectionCacheEntry(
  name: string,
  value: string | null,
): void {
  if (STATE.systemPromptSectionCache.size >= 100) {
    const firstKey = STATE.systemPromptSectionCache.keys().next().value
    if (firstKey !== undefined) {
      STATE.systemPromptSectionCache.delete(firstKey)
    }
  }
  STATE.systemPromptSectionCache.set(name, value)
}

export function clearSystemPromptSectionState(): void {
  STATE.systemPromptSectionCache.clear()
}

// 最后发送日期的访问器（用于检测午夜日期变更）

export function getLastEmittedDate(): string | null {
  return STATE.lastEmittedDate
}

export function setLastEmittedDate(date: string | null): void {
  STATE.lastEmittedDate = date
}

export function getAdditionalDirectoriesForClaudeMd(): string[] {
  return STATE.additionalDirectoriesForClaudeMd
}

export function setAdditionalDirectoriesForClaudeMd(
  directories: string[],
): void {
  STATE.additionalDirectoriesForClaudeMd = directories
}

export function getAllowedChannels(): ChannelEntry[] {
  return STATE.allowedChannels
}

export function setAllowedChannels(entries: ChannelEntry[]): void {
  STATE.allowedChannels = entries
}

export function getHasDevChannels(): boolean {
  return STATE.hasDevChannels
}

export function setHasDevChannels(value: boolean): void {
  STATE.hasDevChannels = value
}

export function getPromptCache1hAllowlist(): string[] | null {
  return STATE.promptCache1hAllowlist
}

export function setPromptCache1hAllowlist(allowlist: string[] | null): void {
  STATE.promptCache1hAllowlist = allowlist
}

export function getPromptCache1hEligible(): boolean | null {
  return STATE.promptCache1hEligible
}

export function setPromptCache1hEligible(eligible: boolean | null): void {
  STATE.promptCache1hEligible = eligible
}

export function getAfkModeHeaderLatched(): boolean | null {
  return STATE.afkModeHeaderLatched
}

export function setAfkModeHeaderLatched(v: boolean): void {
  STATE.afkModeHeaderLatched = v
}

export function getFastModeHeaderLatched(): boolean | null {
  return STATE.fastModeHeaderLatched
}

export function setFastModeHeaderLatched(v: boolean): void {
  STATE.fastModeHeaderLatched = v
}

export function getCacheEditingHeaderLatched(): boolean | null {
  return STATE.cacheEditingHeaderLatched
}

export function setCacheEditingHeaderLatched(v: boolean): void {
  STATE.cacheEditingHeaderLatched = v
}

/**
 * 重置 beta 头部锁定为 null。在 /clear 和 /compact 上调用，以便新的对话获得新的头部评估。
 */
export function clearBetaHeaderLatches(): void {
  STATE.afkModeHeaderLatched = null
  STATE.fastModeHeaderLatched = null
  STATE.cacheEditingHeaderLatched = null
}

export function getPromptId(): string | null {
  return STATE.promptId
}

export function setPromptId(id: string | null): void {
  STATE.promptId = id
}
export function isReplBridgeActive(): boolean {
  return false
}
