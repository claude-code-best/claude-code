import { GrowthBook } from '@growthbook/growthbook'
import { isEqual, memoize } from 'lodash-es'
import {
  getIsNonInteractiveSession,
  getSessionTrustAccepted,
} from '../../bootstrap/state.js'
import { getGrowthBookClientKey } from '../../constants/keys.js'
import {
  checkHasTrustDialogAccepted,
  getGlobalConfig,
  saveGlobalConfig,
} from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { toError } from '../../utils/errors.js'
import { getAuthHeaders } from '../../utils/http.js'
import { logError } from '../../utils/log.js'
import { createSignal } from '../../utils/signal.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  type GitHubActionsMetadata,
  getUserForGrowthBook,
} from '../../utils/user.js'
import {
  is1PEventLoggingEnabled,
  logGrowthBookExperimentTo1P,
} from './firstPartyEventLogger.js'

/**
 * 发送给 GrowthBook 用于定向的用户属性。
 * 使用 UUID 后缀（而非 Uuid）以符合 GrowthBook 的命名惯例。
 */
export type GrowthBookUserAttributes = {
  id: string
  sessionId: string
  deviceID: string
  platform: 'win32' | 'darwin' | 'linux'
  apiBaseUrlHost?: string
  organizationUUID?: string
  accountUUID?: string
  userType?: string
  subscriptionType?: string
  rateLimitTier?: string
  firstTokenTime?: number
  email?: string
  appVersion?: string
  github?: GitHubActionsMetadata
}

/**
 * 来自 API 的错误格式的功能响应，使用了 "value" 而非 "defaultValue"。
 * 这是一个临时解决方案，直到 API 被修复。
 */
type MalformedFeatureDefinition = {
  value?: unknown
  defaultValue?: unknown
  [key: string]: unknown
}

let client: GrowthBook | null = null

// 命名处理程序引用，以便 resetGrowthBook 可以移除它们以防止累积
let currentBeforeExitHandler: (() => void) | null = null
let currentExitHandler: (() => void) | null = null

// 跟踪创建客户端时认证是否可用
// 这使我们能够检测何时需要使用新的认证头重新创建
let clientCreatedWithAuth = false

// 存储来自负载的实验数据，以便稍后记录曝光
type StoredExperimentData = {
  experimentId: string
  variationId: number
  inExperiment?: boolean
  hashAttribute?: string
  hashValue?: string
}
const experimentDataByFeature = new Map<string, StoredExperimentData>()

// 远程评估功能值的缓存 - 解决 SDK 不尊重 remoteEval 响应的问题
// SDK 的 setForcedFeatures 与 remoteEval 配合使用时也不可靠
const remoteEvalFeatureValues = new Map<string, unknown>()

// 跟踪在初始化之前访问过且需要记录曝光的功能
const pendingExposures = new Set<string>()

// 跟踪本次会话中已经记录过曝光的功能（去重）
// 防止在热路径（例如渲染循环中的 isAutoMemoryEnabled）重复调用 getFeatureValue_CACHED_MAY_BE_STALE 时触发重复的曝光事件
const loggedExposures = new Set<string>()

// 跟踪安全门控检查的重新初始化 Promise
// 当 GrowthBook 正在重新初始化时（例如认证变更后），安全门控检查应等待初始化完成，以避免返回过时的值
let reinitializingPromise: Promise<unknown> | null = null

// 当 GrowthBook 功能值刷新时通知的监听器（初始初始化或周期性刷新）。
// 用于那些在构造时将功能值烘焙到长期存活对象中的系统（例如 firstPartyEventLogger 读取一次 tengu_1p_event_batch_config 并构建一个 LoggerProvider），
// 并且需要在配置变更时重建。每次调用的读取器如 getEventSamplingConfig / isSinkKilled 不需要这个 —— 它们已经是响应式的。
//
// 不会被 resetGrowthBook 清除 —— 订阅者通常只注册一次（在 init.ts 中）并且必须在认证变更重置后继续存在。
type GrowthBookRefreshListener = () => void | Promise<void>
const refreshed = createSignal()

/** 安全地调用监听器：同步抛出和异步拒绝都被路由到 logError。 */
function callSafe(listener: GrowthBookRefreshListener): void {
  try {
    // Promise.resolve() 规范化同步返回和 Promise，以便同步抛出（被外部 try 捕获）和异步拒绝（被 .catch 捕获）都能命中 logError。
    // 如果没有 .catch，一个拒绝的异步监听器将成为未处理的拒绝 —— try/catch 只能看到 Promise，看不到其最终的拒绝。
    void Promise.resolve(listener()).catch(e => {
      logError(e)
    })
  } catch (e) {
    logError(e)
  }
}

/**
 * 注册一个回调，当 GrowthBook 功能值刷新时触发。
 * 返回一个取消订阅函数。
 *
 * 如果在调用此函数时初始化已经完成并且功能已填充（remoteEvalFeatureValues 不为空），
 * 监听器将在下一个微任务中触发一次。这种“追赶”机制处理了 GB 的网络响应在 REPL 的 useEffect 提交之前到达的情况
 * —— 在具有快速网络和 MCP 密集型配置的外部构建中，初始化可能在约 100ms 内完成，而 REPL 挂载需要约 600ms（参见 #20951 外部构建跟踪 30.540 与 31.046）。
 *
 * 变更检测由订阅者负责：回调会在每次刷新时触发；使用 isEqual 与上次看到的配置进行比较来决定是否采取行动。
 */
export function onGrowthBookRefresh(
  listener: GrowthBookRefreshListener,
): () => void {
  let subscribed = true
  const unsubscribe = refreshed.subscribe(() => callSafe(listener))
  if (remoteEvalFeatureValues.size > 0) {
    queueMicrotask(() => {
      // 重新检查：在注册和此微任务运行之间，监听器可能已被移除，或者 resetGrowthBook 可能已清空 Map。
      if (subscribed && remoteEvalFeatureValues.size > 0) {
        callSafe(listener)
      }
    })
  }
  return () => {
    subscribed = false
    unsubscribe()
  }
}

/**
 * 解析用于 GrowthBook 功能的环境变量覆盖。
 * 设置 CLAUDE_INTERNAL_FC_OVERRIDES 为一个 JSON 对象，将功能键映射到值，
 * 以绕过远程评估和磁盘缓存。对于需要测试特定功能标志配置的评估工具很有用。
 * 仅在 USER_TYPE 为 'ant' 时生效。
 *
 * 示例：CLAUDE_INTERNAL_FC_OVERRIDES='{"my_feature": true, "my_config": {"key": "val"}}'
 */
let envOverrides: Record<string, unknown> | null = null
let envOverridesParsed = false

function getEnvOverrides(): Record<string, unknown> | null {
  if (!envOverridesParsed) {
    envOverridesParsed = true
    if (process.env.USER_TYPE === 'ant') {
      const raw = process.env.CLAUDE_INTERNAL_FC_OVERRIDES
      if (raw) {
        try {
          envOverrides = JSON.parse(raw) as Record<string, unknown>
          logForDebugging(
            `GrowthBook: 使用环境变量覆盖 ${Object.keys(envOverrides!).length} 个功能: ${Object.keys(envOverrides!).join(', ')}`,
          )
        } catch {
          logError(
            new Error(
              `GrowthBook: 解析 CLAUDE_INTERNAL_FC_OVERRIDES 失败: ${raw}`,
            ),
          )
        }
      }
    }
  }
  return envOverrides
}

/**
 * 检查一个功能是否有环境变量覆盖（CLAUDE_INTERNAL_FC_OVERRIDES）。
 * 如果为 true，_CACHED_MAY_BE_STALE 将返回覆盖值而不触及磁盘或网络 —— 调用方可以跳过等待该功能的初始化。
 */
export function hasGrowthBookEnvOverride(feature: string): boolean {
  const overrides = getEnvOverrides()
  return overrides !== null && feature in overrides
}

/**
 * 通过 /config Gates 选项卡设置的本地配置覆盖（仅限 ant 内部）。在环境变量覆盖之后检查 —— 环境变量优先，以便评估工具保持确定性。
 * 与 getEnvOverrides 不同，此函数不会被记忆化：用户可以在运行时更改覆盖，而 getGlobalConfig() 已通过内存缓存（指针追踪）直到下一次 saveGlobalConfig() 使其失效。
 */
function getConfigOverrides(): Record<string, unknown> | undefined {
  if (process.env.USER_TYPE !== 'ant') return undefined
  try {
    return getGlobalConfig().growthBookOverrides
  } catch {
    // getGlobalConfig() 在 configReadingAllowed 设置之前（main.tsx 早期启动路径）会抛出异常。与下面的磁盘缓存回退相同降级处理。
    return undefined
  }
}

/**
 * 枚举所有已知的 GrowthBook 功能及其当前解析值（不包括覆盖）。
 * 首先使用内存中的负载，然后回退到磁盘缓存 —— 与 getter 的优先级相同。由 /config Gates 选项卡使用。
 */
export function getAllGrowthBookFeatures(): Record<string, unknown> {
  if (remoteEvalFeatureValues.size > 0) {
    return Object.fromEntries(remoteEvalFeatureValues)
  }
  return getGlobalConfig().cachedGrowthBookFeatures ?? {}
}

export function getGrowthBookConfigOverrides(): Record<string, unknown> {
  return getConfigOverrides() ?? {}
}

/**
 * 设置或清除单个配置覆盖。传递 undefined 以清除。
 * 触发 onGrowthBookRefresh 监听器，以便将门控值烘焙到长期存活对象中的系统（useMainLoopModel、useSkillsChange 等）进行重建 ——
 * 否则覆盖例如 tengu_ant_model_override 实际上不会改变模型，直到下一次周期性刷新。
 */
export function setGrowthBookConfigOverride(
  feature: string,
  value: unknown,
): void {
  if (process.env.USER_TYPE !== 'ant') return
  try {
    saveGlobalConfig(c => {
      const current = c.growthBookOverrides ?? {}
      if (value === undefined) {
        if (!(feature in current)) return c
        const { [feature]: _, ...rest } = current
        if (Object.keys(rest).length === 0) {
          const { growthBookOverrides: __, ...configWithout } = c
          return configWithout
        }
        return { ...c, growthBookOverrides: rest }
      }
      if (isEqual(current[feature], value)) return c
      return { ...c, growthBookOverrides: { ...current, [feature]: value } }
    })
    // 订阅者自己进行变更检测（参见 onGrowthBookRefresh 文档），因此在无操作的写入上触发是可以的。
    refreshed.emit()
  } catch (e) {
    logError(e)
  }
}

export function clearGrowthBookConfigOverrides(): void {
  if (process.env.USER_TYPE !== 'ant') return
  try {
    saveGlobalConfig(c => {
      if (
        !c.growthBookOverrides ||
        Object.keys(c.growthBookOverrides).length === 0
      ) {
        return c
      }
      const { growthBookOverrides: _, ...rest } = c
      return rest
    })
    refreshed.emit()
  } catch (e) {
    logError(e)
  }
}

/**
 * 如果一个功能有实验数据，则记录实验曝光。
 * 在会话内去重 —— 每个功能最多记录一次。
 */
function logExposureForFeature(feature: string): void {
  // 如果本次会话已经记录过，则跳过（去重）
  if (loggedExposures.has(feature)) {
    return
  }

  const expData = experimentDataByFeature.get(feature)
  if (expData) {
    loggedExposures.add(feature)
    logGrowthBookExperimentTo1P({
      experimentId: expData.experimentId,
      variationId: expData.variationId,
      userAttributes: getUserAttributes(),
      experimentMetadata: {
        feature_id: feature,
      },
    })
  }
}

/**
 * 处理来自 GrowthBook 服务器的远程评估负载，并填充本地缓存。
 * 在初始 client.init() 和 client.refreshFeatures() 之后调用，以便 _BLOCKS_ON_INIT 调用方在整个进程生命周期中看到新值，而不仅仅是初始化时的快照。
 *
 * 如果不在刷新时运行此函数，remoteEvalFeatureValues 将冻结在其初始化时的快照，并且 getDynamicConfig_BLOCKS_ON_INIT 将在整个进程生命周期中返回过时的值
 * —— 这破坏了长期运行会话中 tengu_max_version_config 终止开关的功能。
 */
async function processRemoteEvalPayload(
  gbClient: GrowthBook,
): Promise<boolean> {
  // 临时解决方案：转换远程评估响应格式
  // API 返回 { "value": ... } 但 SDK 期望 { "defaultValue": ... }
  // TODO: 一旦 API 修复为返回正确格式，移除这段代码
  const payload = gbClient.getPayload()
  // 空对象为真值 —— 如果没有长度检查，`{features: {}}`（瞬时服务器错误、截断的响应）将通过，清空下面的映射，返回 true，
  // 并且 syncRemoteEvalToDisk 会将 `{}` 整体写入磁盘：每个共享 ~/.claude.json 的进程都会出现功能标志完全黑屏。
  if (!payload?.features || Object.keys(payload.features).length === 0) {
    return false
  }

  // 在重建前清空，以便在两次刷新之间移除的功能不会留下过时的幽灵条目，从而在 getFeatureValueInternal 中短路。
  experimentDataByFeature.clear()

  const transformedFeatures: Record<string, MalformedFeatureDefinition> = {}
  for (const [key, feature] of Object.entries(payload.features)) {
    const f = feature as MalformedFeatureDefinition
    if ('value' in f && !('defaultValue' in f)) {
      transformedFeatures[key] = {
        ...f,
        defaultValue: f.value,
      }
    } else {
      transformedFeatures[key] = f
    }

    // 存储实验数据，以便在后续访问功能时记录曝光
    if (f.source === 'experiment' && f.experimentResult) {
      const expResult = f.experimentResult as {
        variationId?: number
      }
      const exp = f.experiment as { key?: string } | undefined
      if (exp?.key && expResult.variationId !== undefined) {
        experimentDataByFeature.set(key, {
          experimentId: exp.key,
          variationId: expResult.variationId,
        })
      }
    }
  }
  // 使用转换后的功能重新设置负载
  await gbClient.setPayload({
    ...payload,
    features: transformedFeatures,
  })

  // 临时解决方案：直接从远程评估响应中缓存评估后的值。
  // SDK 的 evalFeature() 会尝试在本地重新评估规则，忽略来自 remoteEval 的预评估 'value'。setForcedFeatures 也不可靠。
  // 因此我们自己缓存值，并在 getFeatureValueInternal 中使用它们。
  remoteEvalFeatureValues.clear()
  for (const [key, feature] of Object.entries(transformedFeatures)) {
    // 在 remoteEval:true 下，服务器会预评估。无论答案落在 `value`（当前 API）还是 `defaultValue`（TODO 后的 API 形状），
    // 它都是该用户的权威值。同时检查两者可以确保 syncRemoteEvalToDisk 在部分或完整的 API 迁移中保持正确。
    const v = 'value' in feature ? feature.value : feature.defaultValue
    if (v !== undefined) {
      remoteEvalFeatureValues.set(key, v)
    }
  }
  return true
}

/**
 * 将完整的 remoteEvalFeatureValues 映射写入磁盘。
 * 每次成功的 processRemoteEvalPayload 恰好调用一次 —— 绝不会从失败路径调用，
 * 因此从结构上不可能出现初始化超时毒化（init 中的 .catch() 永远不会到达这里）。
 *
 * 整体替换（非合并）：在服务器端删除的功能将在下一次成功负载后从磁盘中删除。
 * Ant 构建 ⊇ 外部构建，因此切换构建是安全的 —— 写入始终是针对此进程 SDK 密钥的完整答案。
 */
function syncRemoteEvalToDisk(): void {
  const fresh = Object.fromEntries(remoteEvalFeatureValues)
  const config = getGlobalConfig()
  if (isEqual(config.cachedGrowthBookFeatures, fresh)) {
    return
  }
  saveGlobalConfig(current => ({
    ...current,
    cachedGrowthBookFeatures: fresh,
  }))
}

/**
 * GrowthBook 功能门控的本地默认覆盖。
 *
 * 当 GrowthBook 未连接时（例如没有 1P 事件日志记录，没有适配器），
 * 这些值将代替硬编码的默认值（通常为 false）使用。
 * 这允许启用具有真实实现的功能，而无需 GrowthBook 服务器连接。
 *
 * 设置 CLAUDE_CODE_DISABLE_LOCAL_GATES=1 以绕过这些默认值。
 *
 * 分类：
 *   P0 — 纯本地功能（无外部依赖）
 *   P1 — 需要 Claude API（适用于任何有效的 API 密钥）
 *   KS — 终止开关（默认为 true，保持为 true）
 */
const LOCAL_GATE_DEFAULTS: Record<string, unknown> = {
  // ── P0: 纯本地功能 ──────────────────────────────────────
  tengu_keybinding_customization_release: true, // 自定义快捷键
  tengu_streaming_tool_execution2: true, // 流式工具执行
  tengu_kairos_cron: true, // Cron/计划任务
  tengu_amber_json_tools: true, // 令牌高效的 JSON 工具（约节省 4.5%）
  tengu_immediate_model_command: true, // 查询期间的即时 /model、/fast、/effort
  tengu_basalt_3kr: true, // MCP 指令增量（仅发送变更）
  tengu_pebble_leaf_prune: true, // 会话存储叶修剪
  tengu_chair_sermon: true, // 消息合并（合并相邻块）
  tengu_lodestone_enabled: true, // 深度链接协议（claude://）
  tengu_auto_background_agents: true, // 120 秒后自动后台代理
  tengu_fgts: true, // 系统提示中的细粒度工具状态

  // ── P1: 依赖 API 的功能 ───────────────────────────────────
  tengu_session_memory: true, // 会话内存（跨会话持久化）
  tengu_passport_quail: true, // 自动内存提取
  tengu_moth_copse: false, // 跳过内存索引，使用预取的内存
  tengu_coral_fern: true, // “搜索过往上下文”部分
  tengu_chomp_inflection: true, // 提示建议
  tengu_hive_evidence: true, // 验证代理
  tengu_kairos_brief: true, // 简洁模式
  tengu_kairos_brief_config: { enable_slash_command: true }, // 简洁 /slash 命令可见性
  tengu_sedge_lantern: true, // 离开摘要
  tengu_onyx_plover: { enabled: true }, // 自动记忆整理
  tengu_willow_mode: 'dialog', // 空闲返回提示

  // ── 终止开关（保持为 true 以防止远程禁用） ──────────
  tengu_turtle_carbon: true, // Ultrathink 扩展思考
  tengu_amber_stoat: true, // 内置 Explore/Plan 代理
  tengu_amber_flint: true, // 代理团队/群组
  tengu_slim_subagent_claudemd: true, // 子代理的轻量 CLAUDE.md
  tengu_birch_trellis: true, // Tree-sitter bash 安全分析
  tengu_collage_kaleidoscope: true, // macOS 剪贴板图像读取
  tengu_compact_cache_prefix: true, // 压缩期间重用提示缓存
  tengu_kairos_assistant: true, // KAIROS 助手模式激活
  tengu_kairos_cron_durable: true, // 持久化 cron 任务
  tengu_attribution_header: true, // API 请求归属头
  tengu_slate_prism: true, // 代理进度摘要

  // ── Ultrareview (cloud code review via CCR) ─────────────────────
  tengu_review_bughunter_config: { enabled: true }, // /ultrareview command visibility
  tengu_ccr_bundle_seed_enabled: true, // Bundle seed: skip GitHub App check for branch mode
}

/**
 * 查找本地门控默认值。如果未配置则返回 undefined，
 * 允许调用方回退到原始的 defaultValue。
 */
function getLocalGateDefault(feature: string): unknown | undefined {
  if (process.env.CLAUDE_CODE_DISABLE_LOCAL_GATES) {
    return undefined
  }
  return LOCAL_GATE_DEFAULTS[feature]
}

/**
 * 检查是否应启用 GrowthBook 操作
 */
function isGrowthBookEnabled(): boolean {
  // 适配器模式：有自定义服务器配置时直接启用
  if (process.env.CLAUDE_GB_ADAPTER_URL && process.env.CLAUDE_GB_ADAPTER_KEY) {
    return true
  }
  // GrowthBook 依赖 1P 事件日志记录。
  return is1PEventLoggingEnabled()
}

/**
 * 当 ANTHROPIC_BASE_URL 指向非 Anthropic 代理时的主机名。
 *
 * 企业代理部署（Epic、Marble 等）通常使用 apiKeyHelper 认证，
 * 这意味着 isAnthropicAuthEnabled() 返回 false，并且 organizationUUID/accountUUID/email
 * 都不在 GrowthBook 属性中。如果没有这个，就没有稳定的属性来针对它们进行定向
 * —— 只有每个设备的 ID。参见 src/utils/auth.ts 中的 isAnthropicAuthEnabled()。
 *
 * 对于未设置/默认值（api.anthropic.com）返回 undefined，以便该属性对于直接 API 用户不存在。
 * 仅主机名 —— 无路径/查询/凭证。
 */
export function getApiBaseUrlHost(): string | undefined {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) return undefined
  try {
    const host = new URL(baseUrl).host
    if (host === 'api.anthropic.com') return undefined
    return host
  } catch {
    return undefined
  }
}

/**
 * 从 CoreUserData 获取 GrowthBook 的用户属性
 */
function getUserAttributes(): GrowthBookUserAttributes {
  const user = getUserForGrowthBook()

  // 对于 ants，即使设置了 ANTHROPIC_API_KEY，也始终尝试包含来自 OAuth 配置的 email。
  // 这确保了无论认证方法如何，基于 email 的 GrowthBook 定向都能正常工作。
  let email = user.email
  if (!email && process.env.USER_TYPE === 'ant') {
    email = getGlobalConfig().oauthAccount?.emailAddress
  }

  const apiBaseUrlHost = getApiBaseUrlHost()

  const attributes = {
    id: user.deviceId,
    sessionId: user.sessionId,
    deviceID: user.deviceId,
    platform: user.platform,
    ...(apiBaseUrlHost && { apiBaseUrlHost }),
    ...(user.organizationUuid && { organizationUUID: user.organizationUuid }),
    ...(user.accountUuid && { accountUUID: user.accountUuid }),
    ...(user.userType && { userType: user.userType }),
    ...(user.subscriptionType && { subscriptionType: user.subscriptionType }),
    ...(user.rateLimitTier && { rateLimitTier: user.rateLimitTier }),
    ...(user.firstTokenTime && { firstTokenTime: user.firstTokenTime }),
    ...(email && { email }),
    ...(user.appVersion && { appVersion: user.appVersion }),
    ...(user.githubActionsMetadata && {
      githubActionsMetadata: user.githubActionsMetadata,
    }),
  }
  return attributes
}

/**
 * 获取或创建 GrowthBook 客户端实例
 */
const getGrowthBookClient = memoize(
  (): { client: GrowthBook; initialized: Promise<void> } | null => {
    if (!isGrowthBookEnabled()) {
      return null
    }

    const attributes = getUserAttributes()
    const clientKey = getGrowthBookClientKey()
    const baseUrl =
      process.env.CLAUDE_GB_ADAPTER_URL ||
      (process.env.USER_TYPE === 'ant'
        ? process.env.CLAUDE_CODE_GB_BASE_URL || 'https://api.anthropic.com/'
        : 'https://api.anthropic.com/')
    const isAdapterMode = !!(
      process.env.CLAUDE_GB_ADAPTER_URL && process.env.CLAUDE_GB_ADAPTER_KEY
    )
    if (process.env.USER_TYPE === 'ant') {
      logForDebugging(
        `GrowthBook: 创建客户端，clientKey=${clientKey}, 属性: ${jsonStringify(attributes)}`,
      )
    }

    // 如果尚未建立信任，则跳过认证
    // 这可以防止在信任对话框之前执行 apiKeyHelper 命令
    // 非交互式会话隐式具有工作区信任
    // getSessionTrustAccepted() 涵盖了 TrustDialog 自动解决而未将信任持久化到特定 CWD 的情况（例如主目录）——
    // showSetupScreens() 在信任对话框流程完成后设置此项。
    const hasTrust =
      checkHasTrustDialogAccepted() ||
      getSessionTrustAccepted() ||
      getIsNonInteractiveSession()
    const authHeaders = hasTrust
      ? getAuthHeaders()
      : { headers: {}, error: 'trust not established' }
    // 适配器模式下不需要 auth，GrowthBook Cloud 使用 clientKey 即可
    const hasAuth = isAdapterMode || !authHeaders.error
    clientCreatedWithAuth = hasAuth

    // 捕获到局部变量中，以便初始化回调操作的是此客户端，
    // 而不是如果在初始化完成之前发生重新初始化时的后续客户端
    const thisClient = new GrowthBook({
      apiHost: baseUrl,
      clientKey,
      attributes,
      // remoteEval 仅适用于 Anthropic 内部 API，GrowthBook Cloud 不支持
      remoteEval: !isAdapterMode,
      // cacheKeyAttributes 仅在 remoteEval 时有效
      ...(!isAdapterMode
        ? { cacheKeyAttributes: ['id', 'organizationUUID'] }
        : {}),
      // 如果可用则添加认证头
      ...(authHeaders.error
        ? {}
        : { apiHostRequestHeaders: authHeaders.headers }),
      // 为 Ants 启用调试日志
      ...(process.env.USER_TYPE === 'ant'
        ? {
            log: (msg: string, ctx: Record<string, unknown>) => {
              logForDebugging(`GrowthBook: ${msg} ${jsonStringify(ctx)}`)
            },
          }
        : {}),
    })
    client = thisClient

    if (!hasAuth) {
      // 尚无认证可用 —— 跳过 HTTP 初始化，依赖磁盘缓存的值。
      // 当认证可用时，initializeGrowthBook() 将重置并使用认证重新创建。
      return { client: thisClient, initialized: Promise.resolve() }
    }

    const initialized = thisClient
      .init({ timeout: 5000 })
      .then(async result => {
        // 防护：如果此客户端已被较新的客户端替换，则跳过处理
        if (client !== thisClient) {
          if (process.env.USER_TYPE === 'ant') {
            logForDebugging(
              'GrowthBook: 跳过已替换客户端的初始化回调',
            )
          }
          return
        }

        if (process.env.USER_TYPE === 'ant') {
          logForDebugging(
            `GrowthBook 已初始化，来源: ${result.source}, 成功: ${result.success}`,
          )
        }

        const hadFeatures = await processRemoteEvalPayload(thisClient)
        // 重新检查：processRemoteEvalPayload 在 `await setPayload` 处让出。
        // 目前仅有微任务（无加密，无粘性存储桶服务），但此回调顶部的防护在该 await 之前运行；
        // 此防护在该 await 之后运行。
        if (client !== thisClient) return

        if (hadFeatures) {
          //记录初始化之前执行的实验曝光。这些实验在初始化完成之前就已经执行了。
          for (const feature of pendingExposures) {
            logExposureForFeature(feature)
          }
          pendingExposures.clear()
          syncRemoteEvalToDisk()
          // 通知订阅者：remoteEvalFeatureValues 已填充且磁盘已同步。
          // _CACHED_MAY_BE_STALE 首先读取内存（#22295），因此订阅者立即看到新值。
          refreshed.emit()
        }

        // 记录加载了哪些功能
        if (process.env.USER_TYPE === 'ant') {
          const features = thisClient.getFeatures()
          if (features) {
            const featureKeys = Object.keys(features)
            logForDebugging(
              `GrowthBook 加载了 ${featureKeys.length} 个功能: ${featureKeys.slice(0, 10).join(', ')}${featureKeys.length > 10 ? '...' : ''}`,
            )
          }
        }
      })
      .catch(error => {
        if (process.env.USER_TYPE === 'ant') {
          logError(toError(error))
        }
      })

    // 注册用于优雅关闭的清理处理程序（命名引用，以便 resetGrowthBook 可以移除它们）
    currentBeforeExitHandler = () => client?.destroy()
    currentExitHandler = () => client?.destroy()
    process.on('beforeExit', currentBeforeExitHandler)
    process.on('exit', currentExitHandler)

    return { client: thisClient, initialized }
  },
)

/**
 * 初始化 GrowthBook 客户端（阻塞直到就绪）
 */
export const initializeGrowthBook = memoize(
  async (): Promise<GrowthBook | null> => {
    let clientWrapper = getGrowthBookClient()
    if (!clientWrapper) {
      return null
    }

    // 检查自创建客户端以来认证是否已变为可用
    // 如果是，我们需要使用新的认证头重新创建客户端
    // 仅在信任建立后检查，以避免在信任对话框之前触发 apiKeyHelper
    if (!clientCreatedWithAuth) {
      const hasTrust =
        checkHasTrustDialogAccepted() ||
        getSessionTrustAccepted() ||
        getIsNonInteractiveSession()
      if (hasTrust) {
        const currentAuth = getAuthHeaders()
        if (!currentAuth.error) {
          if (process.env.USER_TYPE === 'ant') {
            logForDebugging(
              'GrowthBook: 认证在客户端创建后变为可用，重新初始化',
            )
          }
          // 使用 resetGrowthBook 正确销毁旧客户端并停止周期性刷新
          // 这防止了旧客户端的 init promise 继续运行而导致双重初始化
          resetGrowthBook()
          clientWrapper = getGrowthBookClient()
          if (!clientWrapper) {
            return null
          }
        }
      }
    }

    await clientWrapper.initialized

    // 在成功初始化后设置周期性刷新
    // 在这里调用（而不是单独调用）以便在任何重新初始化后始终重新建立
    setupPeriodicGrowthBookRefresh()

    return clientWrapper.client
  },
)

/**
 * 获取具有默认回退的功能值 - 阻塞直到初始化完成。
 * @internal 由已弃用函数和缓存函数使用。
 */
async function getFeatureValueInternal<T>(
  feature: string,
  defaultValue: T,
  logExposure: boolean,
): Promise<T> {
  // 首先检查环境变量覆盖（用于评估工具）
  const overrides = getEnvOverrides()
  if (overrides && feature in overrides) {
    return overrides[feature] as T
  }
  const configOverrides = getConfigOverrides()
  if (configOverrides && feature in configOverrides) {
    return configOverrides[feature] as T
  }

  if (!isGrowthBookEnabled()) {
    const localDefault = getLocalGateDefault(feature)
    return localDefault !== undefined ? (localDefault as T) : defaultValue
  }

  const growthBookClient = await initializeGrowthBook()
  if (!growthBookClient) {
    const localDefault = getLocalGateDefault(feature)
    return localDefault !== undefined ? (localDefault as T) : defaultValue
  }

  // 如果可用，使用缓存的远程评估值（解决 SDK 错误的临时方案）
  let result: T
  if (remoteEvalFeatureValues.has(feature)) {
    result = remoteEvalFeatureValues.get(feature) as T
  } else {
    result = growthBookClient.getFeatureValue(feature, defaultValue) as T
  }

  // 使用存储的实验数据记录实验曝光
  if (logExposure) {
    logExposureForFeature(feature)
  }

  if (process.env.USER_TYPE === 'ant') {
    logForDebugging(
      `GrowthBook: getFeatureValue("${feature}") = ${jsonStringify(result)}`,
    )
  }
  return result
}

/**
 * @deprecated 请改用非阻塞的 getFeatureValue_CACHED_MAY_BE_STALE。
 * 此函数会阻塞等待 GrowthBook 初始化，可能减慢启动速度。
 */
export async function getFeatureValue_DEPRECATED<T>(
  feature: string,
  defaultValue: T,
): Promise<T> {
  return getFeatureValueInternal(feature, defaultValue, true)
}

/**
 * 立即从磁盘缓存中获取功能值。纯读取 —— 磁盘由每次成功负载（初始化 + 周期性刷新）上的 syncRemoteEvalToDisk 填充，而不是由此函数填充。
 *
 * 这是启动关键路径和同步上下文的首选方法。
 * 如果缓存是由先前进程写入的，则值可能过时。
 */
export function getFeatureValue_CACHED_MAY_BE_STALE<T>(
  feature: string,
  defaultValue: T,
): T {
  // 首先检查环境变量覆盖（用于评估工具）
  //从.env文件中读取覆盖值。
  const overrides = getEnvOverrides()
  if (overrides && feature in overrides) {
    return overrides[feature] as T
  }
  //从~/.claude.json文件中读取覆盖值。旧版本是从~/.claude/config.json文件中读取覆盖值。
  const configOverrides = getConfigOverrides()
  if (configOverrides && feature in configOverrides) {
    return configOverrides[feature] as T
  }
  //代码里面写死的配置信息。
  if (!isGrowthBookEnabled()) {
    const localDefault = getLocalGateDefault(feature)
    return localDefault !== undefined ? (localDefault as T) : defaultValue
  }

  // LOCAL_GATE_DEFAULTS 优先于远程值和磁盘缓存。
  // 在 fork/自托管部署中，GrowthBook 服务器可能会对我们有意启用的门控推送 false。
  // 本地默认值代表项目的有意配置，并覆盖除环境/配置覆盖（这些是显式用户意图）之外的所有内容。
  const localDefault = getLocalGateDefault(feature)//代码里面写死的配置信息。
  if (localDefault !== undefined) {
    return localDefault as T
  }

  // 如果有实验数据，则记录实验曝光，否则推迟到初始化后
  if (experimentDataByFeature.has(feature)) {
    logExposureForFeature(feature)
  } else {
    pendingExposures.add(feature)
  }

  // 一旦 processRemoteEvalPayload 运行，内存中的负载就是权威的。
  if (remoteEvalFeatureValues.has(feature)) {
    return remoteEvalFeatureValues.get(feature) as T
  }

  // 回退到磁盘缓存（在进程重启后仍然存在）
  try {
    //从~/.claude.json文件中读取覆盖值。旧版本是从~/.claude/config.json文件中读取覆盖值。
    const cached = getGlobalConfig().cachedGrowthBookFeatures?.[feature]
    if (cached !== undefined) {
      return cached as T
    }
  } catch {
    // 配置尚未初始化 —— 回退到 defaultValue
  }
  return defaultValue
}

/**
 * @deprecated 磁盘缓存现在在每次成功负载加载时同步（初始化 + 20分钟/6小时周期性刷新）。
 * 每个功能的 TTL 从未从服务器获取新数据 —— 它只是将内存状态重新写入磁盘，现在这是多余的。
 * 请直接使用 getFeatureValue_CACHED_MAY_BE_STALE。
 */
export function getFeatureValue_CACHED_WITH_REFRESH<T>(
  feature: string,
  defaultValue: T,
  _refreshIntervalMs: number,
): T {
  return getFeatureValue_CACHED_MAY_BE_STALE(feature, defaultValue)
}

/**
 * 通过 GrowthBook 检查 Statsig 功能门控值，并回退到 Statsig 缓存。
 *
 * **仅限迁移**：此函数用于将现有的 Statsig 门控迁移到 GrowthBook。
 * 对于新功能，请改用 `getFeatureValue_CACHED_MAY_BE_STALE()`。
 *
 * - 首先检查 GrowthBook 磁盘缓存
 * - 在迁移期间回退到 Statsig 的 cachedStatsigGates
 * - 如果缓存最近未更新，值可能过时
 *
 * @deprecated 对于新代码，请使用 getFeatureValue_CACHED_MAY_BE_STALE()。
 * 此函数仅用于支持现有 Statsig 门控的迁移。
 */
export function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
  gate: string,
): boolean {
  // 首先检查环境变量覆盖（用于评估工具）
  const overrides = getEnvOverrides()
  if (overrides && gate in overrides) {
    return Boolean(overrides[gate])
  }
  const configOverrides = getConfigOverrides()
  if (configOverrides && gate in configOverrides) {
    return Boolean(configOverrides[gate])
  }

  if (!isGrowthBookEnabled()) {
    const localDefault = getLocalGateDefault(gate)
    return localDefault !== undefined ? Boolean(localDefault) : false
  }

  // 如果有实验数据，则记录实验曝光，否则推迟到初始化后
  if (experimentDataByFeature.has(gate)) {
    logExposureForFeature(gate)
  } else {
    pendingExposures.add(gate)
  }

  // 立即从磁盘返回缓存值
  // 首先检查 GrowthBook 缓存，然后回退到 Statsig 缓存以进行迁移
  try {
    const config = getGlobalConfig()
    const gbCached = config.cachedGrowthBookFeatures?.[gate]
    if (gbCached !== undefined) {
      return Boolean(gbCached)
    }
    // 迁移期间回退到 Statsig 缓存
    const statsigCached = config.cachedStatsigGates?.[gate]
    if (statsigCached !== undefined) {
      return statsigCached
    }
  } catch {
    // 配置尚未初始化 —— 回退到本地门控默认值
  }
  // 两个缓存都没有值（或配置未初始化）—— 使用本地门控默认值
  const localDefault = getLocalGateDefault(gate)
  return localDefault !== undefined ? Boolean(localDefault) : false
}

/**
 * 检查安全限制门控，如果在重新初始化中则等待。
 *
 * 用于安全关键门控，需要在认证变更后获取新值。
 *
 * 行为：
 * - 如果 GrowthBook 正在重新初始化（例如登录后），则等待其完成
 * - 否则，立即返回缓存值（首先检查 Statsig 缓存，然后检查 GrowthBook）
 *
 * 作为安全相关检查的保障措施，首先检查 Statsig 缓存：
 * 如果 Statsig 缓存指示门控已启用，我们会尊重它。
 */
export async function checkSecurityRestrictionGate(
  gate: string,
): Promise<boolean> {
  // 首先检查环境变量覆盖（用于评估工具）
  const overrides = getEnvOverrides()
  if (overrides && gate in overrides) {
    return Boolean(overrides[gate])
  }
  const configOverrides = getConfigOverrides()
  if (configOverrides && gate in configOverrides) {
    return Boolean(configOverrides[gate])
  }

  if (!isGrowthBookEnabled()) {
    return false
  }

  // 如果重新初始化正在进行中，则等待其完成
  // 这确保我们在认证变更后获取新值
  if (reinitializingPromise) {
    await reinitializingPromise
  }

  // 首先检查 Statsig 缓存 - 它可能具有来自先前登录会话的正确值
  const config = getGlobalConfig()
  const statsigCached = config.cachedStatsigGates?.[gate]
  if (statsigCached !== undefined) {
    return Boolean(statsigCached)
  }

  // 然后检查 GrowthBook 缓存
  const gbCached = config.cachedGrowthBookFeatures?.[gate]
  if (gbCached !== undefined) {
    return Boolean(gbCached)
  }

  // 没有缓存 - 返回 false（对于未缓存的门控不阻塞等待初始化）
  return false
}

/**
 * 检查一个布尔类型的权限门控，具有回退到阻塞的语义。
 *
 * 快速路径：如果磁盘缓存已经返回 `true`，则立即返回。
 * 慢速路径：如果磁盘返回 `false`/缺失，则等待 GrowthBook 初始化并从服务器获取新值（最多约 5 秒）。
 * 磁盘由 init 中的 syncRemoteEvalToDisk 填充，因此当慢速路径返回时，磁盘已经具有新值 —— 此处无需写入。
 *
 * 用于用户调用的功能（例如 /remote-control），这些功能受订阅/组织门控，
 * 其中过时的 `false` 会不公平地阻止访问，但过时的 `true` 是可以接受的（服务器是真正的门卫）。
 */
export async function checkGate_CACHED_OR_BLOCKING(
  gate: string,
): Promise<boolean> {
  // 首先检查环境变量覆盖（用于评估工具）
  const overrides = getEnvOverrides()
  if (overrides && gate in overrides) {
    return Boolean(overrides[gate])
  }
  const configOverrides = getConfigOverrides()
  if (configOverrides && gate in configOverrides) {
    return Boolean(configOverrides[gate])
  }

  if (!isGrowthBookEnabled()) {
    const localDefault = getLocalGateDefault(gate)
    return localDefault !== undefined ? Boolean(localDefault) : false
  }

  // 快速路径：磁盘缓存已经返回 true —— 信任它
  const cached = getGlobalConfig().cachedGrowthBookFeatures?.[gate]
  if (cached === true) {
    // 如果有实验数据则记录实验曝光，否则推迟
    if (experimentDataByFeature.has(gate)) {
      logExposureForFeature(gate)
    } else {
      pendingExposures.add(gate)
    }
    return true
  }

  // 慢速路径：磁盘返回 false/缺失 —— 可能过时，获取新值
  return getFeatureValueInternal(gate, false, true)
}

/**
 * 在认证变更（登录/注销）后刷新 GrowthBook。
 *
 * 注意：这必须销毁并重新创建客户端，因为 GrowthBook 的 apiHostRequestHeaders 在客户端创建后无法更新。
 */
export function refreshGrowthBookAfterAuthChange(): void {
  if (!isGrowthBookEnabled()) {
    return
  }

  try {
    // 完全重置客户端以获取新的认证头
    // 这是必要的，因为 apiHostRequestHeaders 在创建后无法更新
    resetGrowthBook()

    // resetGrowthBook 清除了 remoteEvalFeatureValues。如果下面的重新初始化超时（hadFeatures=false）或在 !hasAuth（注销）时短路，
    // init 回调通知永远不会触发 —— 订阅者仍然与先前账户的记忆状态同步。在此处通知它们，以便它们现在重新读取（回退到磁盘缓存）。
    // 如果重新初始化成功，它们将再次使用新值得到通知；如果没有，至少它们与重置后的状态同步。
    refreshed.emit()

    // 使用新的认证头和属性重新初始化
    // 跟踪此 Promise，以便安全门控检查可以等待它。
    // 在 .finally 之前使用 .catch：initializeGrowthBook 可能因同步辅助函数抛出而拒绝（getGrowthBookClient、getAuthHeaders、resetGrowthBook ——
    // clientWrapper.initialized 本身有自己的 .catch 因此永远不会拒绝），并且 .finally 会用原始拒绝重新解决 —— 下面的同步 try/catch 无法捕获异步拒绝。
    reinitializingPromise = initializeGrowthBook()
      .catch(error => {
        logError(toError(error))
        return null
      })
      .finally(() => {
        reinitializingPromise = null
      })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      throw error
    }
    logError(toError(error))
  }
}

/**
 * 重置 GrowthBook 客户端状态（主要用于测试）
 */
export function resetGrowthBook(): void {
  stopPeriodicGrowthBookRefresh()
  // 在销毁客户端之前移除进程处理程序，以防止累积
  if (currentBeforeExitHandler) {
    process.off('beforeExit', currentBeforeExitHandler)
    currentBeforeExitHandler = null
  }
  if (currentExitHandler) {
    process.off('exit', currentExitHandler)
    currentExitHandler = null
  }
  client?.destroy()
  client = null
  clientCreatedWithAuth = false
  reinitializingPromise = null
  experimentDataByFeature.clear()
  pendingExposures.clear()
  loggedExposures.clear()
  remoteEvalFeatureValues.clear()
  getGrowthBookClient.cache?.clear?.()
  initializeGrowthBook.cache?.clear?.()
  envOverrides = null
  envOverridesParsed = false
}

// 周期性刷新间隔（与 Statsig 的 6 小时间隔匹配）
const GROWTHBOOK_REFRESH_INTERVAL_MS =
  process.env.USER_TYPE !== 'ant'
    ? 6 * 60 * 60 * 1000 // 6 小时
    : 20 * 60 * 1000 // 20 分钟（对于 ants）
let refreshInterval: ReturnType<typeof setInterval> | null = null
let beforeExitListener: (() => void) | null = null

/**
 * 轻量刷新 - 从服务器重新获取功能，而不重新创建客户端。
 * 用于认证头未更改时的周期性刷新。
 *
 * 与 refreshGrowthBookAfterAuthChange() 不同，后者会销毁并重新创建客户端，
 * 此函数保留客户端状态，仅获取新的功能值。
 */
export async function refreshGrowthBookFeatures(): Promise<void> {
  if (!isGrowthBookEnabled()) {
    return
  }

  try {
    const growthBookClient = await initializeGrowthBook()
    if (!growthBookClient) {
      return
    }

    await growthBookClient.refreshFeatures()

    // 防护：如果在此飞行中的刷新期间客户端被替换（例如 refreshGrowthBookAfterAuthChange 运行），则跳过处理过时的负载。
    // 与上面的 init 回调防护类似。
    if (growthBookClient !== client) {
      if (process.env.USER_TYPE === 'ant') {
        logForDebugging(
          'GrowthBook: 跳过已替换客户端的刷新处理',
        )
      }
      return
    }

    // 从刷新的负载中重建 remoteEvalFeatureValues，以便 _BLOCKS_ON_INIT 调用方（例如用于自动更新终止开关的 getMaxVersion）
    // 看到新值，而不是过时的初始化快照。
    const hadFeatures = await processRemoteEvalPayload(growthBookClient)
    // 与 init 路径相同的重新检查：覆盖 processRemoteEvalPayload 内部的 setPayload 让出点（上面的防护仅覆盖 refreshFeatures）。
    if (growthBookClient !== client) return

    if (process.env.USER_TYPE === 'ant') {
      logForDebugging('GrowthBook: 轻量刷新完成')
    }

    // 基于 hadFeatures 进行门控：如果负载为空/格式错误，remoteEvalFeatureValues 未被重建 —— 跳过无操作的磁盘写入和虚假的订阅者搅动
    // （clearCommandMemoizationCaches + getCommands + 4× 模型重新渲染）。
    if (hadFeatures) {
      syncRemoteEvalToDisk()
      refreshed.emit()
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      throw error
    }
    logError(toError(error))
  }
}

/**
 * 设置 GrowthBook 功能的周期性刷新。
 * 使用轻量刷新（refreshGrowthBookFeatures）来重新获取，而不重新创建客户端。
 *
 * 在初始化后为长时间运行的会话调用此函数，以确保功能值保持最新。
 * 与 Statsig 的 6 小时刷新间隔匹配。
 */
export function setupPeriodicGrowthBookRefresh(): void {
  if (!isGrowthBookEnabled()) {
    return
  }

  // 清除任何现有间隔以避免重复
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }

  refreshInterval = setInterval(() => {
    void refreshGrowthBookFeatures()
  }, GROWTHBOOK_REFRESH_INTERVAL_MS)
  // 允许进程自然退出 - 此计时器不应使进程保持活动
  refreshInterval.unref?.()

  // 仅注册一次清理监听器
  if (!beforeExitListener) {
    beforeExitListener = () => {
      stopPeriodicGrowthBookRefresh()
    }
    process.once('beforeExit', beforeExitListener)
  }
}

/**
 * 停止周期性刷新（用于测试或清理）
 */
export function stopPeriodicGrowthBookRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
  if (beforeExitListener) {
    process.removeListener('beforeExit', beforeExitListener)
    beforeExitListener = null
  }
}

// ============================================================================
// 动态配置函数
// 这些是围绕功能函数的语义包装器，用于与 Statsig API 保持对等。
// 在 GrowthBook 中，动态配置就是具有对象值的功能。
// ============================================================================

/**
 * 获取动态配置值 - 阻塞直到 GrowthBook 初始化完成。
 * 对于启动关键路径，请优先使用 getFeatureValue_CACHED_MAY_BE_STALE。
 */
export async function getDynamicConfig_BLOCKS_ON_INIT<T>(
  configName: string,
  defaultValue: T,
): Promise<T> {
  return getFeatureValue_DEPRECATED(configName, defaultValue)
}

/**
 * 立即从磁盘缓存中获取动态配置值。纯读取 —— 参见 getFeatureValue_CACHED_MAY_BE_STALE。
 * 这是启动关键路径和同步上下文的首选方法。
 *
 * 在 GrowthBook 中，动态配置就是具有对象值的功能。
 */
export function getDynamicConfig_CACHED_MAY_BE_STALE<T>(
  configName: string,
  defaultValue: T,
): T {
  return getFeatureValue_CACHED_MAY_BE_STALE(configName, defaultValue)
}