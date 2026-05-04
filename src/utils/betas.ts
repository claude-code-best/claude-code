import { feature } from 'bun:bundle'
import memoize from 'lodash-es/memoize.js'
import {
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE,
  getFeatureValue_CACHED_MAY_BE_STALE,
} from 'src/services/analytics/growthbook.js'
import { getIsNonInteractiveSession, getSdkBetas } from '../bootstrap/state.js'
import {
  BEDROCK_EXTRA_PARAMS_HEADERS,
  CLAUDE_CODE_20250219_BETA_HEADER,
  CLI_INTERNAL_BETA_HEADER,
  CONTEXT_1M_BETA_HEADER,
  CONTEXT_MANAGEMENT_BETA_HEADER,
  INTERLEAVED_THINKING_BETA_HEADER,
  PROMPT_CACHING_SCOPE_BETA_HEADER,
  REDACT_THINKING_BETA_HEADER,
  STRUCTURED_OUTPUTS_BETA_HEADER,
  TOKEN_EFFICIENT_TOOLS_BETA_HEADER,
  TOOL_SEARCH_BETA_HEADER_1P,
  TOOL_SEARCH_BETA_HEADER_3P,
  WEB_SEARCH_BETA_HEADER,
} from '../constants/betas.js'
import { OAUTH_BETA_HEADER } from '../constants/oauth.js'
import { isClaudeAISubscriber } from './auth.js'
import { has1mContext } from './context.js'
import { isEnvDefinedFalsy, isEnvTruthy } from './envUtils.js'
import { getCanonicalName } from './model/model.js'
import { get3PModelCapabilityOverride } from './model/modelSupportOverrides.js'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from './model/providers.js'
import { getInitialSettings } from './settings/settings.js'

/** SDK 提供的、允许 API 密钥用户使用的测试功能列表。
只有此列表中的测试功能才能通过 SDK 选项传递。 */
const ALLOWED_SDK_BETAS = [CONTEXT_1M_BETA_HEADER]

/** 过滤测试功能，仅包含允许列表中的那些。
分别返回允许的和不允许的测试功能。 */
function partitionBetasByAllowlist(betas: string[]): {
  allowed: string[]
  disallowed: string[]
} {
  const allowed: string[] = []
  const disallowed: string[] = []
  for (const beta of betas) {
    if (ALLOWED_SDK_BETAS.includes(beta)) {
      allowed.push(beta)
    } else {
      disallowed.push(beta)
    }
  }
  return { allowed, disallowed }
}

/** 过滤 SDK 测试功能，仅包含允许的。
对不允许的测试功能和订阅者限制发出警告。
如果没有有效的测试功能剩余或用户是订阅者，则返回 undefined。 */
export function filterAllowedSdkBetas(
  sdkBetas: string[] | undefined,
): string[] | undefined {
  if (!sdkBetas || sdkBetas.length === 0) {
    return undefined
  }

  if (isClaudeAISubscriber()) {
    console.warn(
      '警告：自定义测试功能仅适用于 API 密钥用户。忽略提供的测试功能。',
    )
    return undefined
  }

  const { allowed, disallowed } = partitionBetasByAllowlist(sdkBetas)
  for (const beta of disallowed) {
    console.warn(
      `警告：测试功能头 '${beta}' 不被允许。仅支持以下测试功能：${ALLOWED_SDK_BETAS.join(', ')}`,
    )
  }
  return allowed.length > 0 ? allowed : undefined
}

// 通常，Foundry 支持所有
// 第一方功能；但出于谨慎考虑，我们不会启用任何处于实验阶段的功能。
//判断模型，以及提供模型的平台是否支持交叉思考。
export function modelSupportsISP(model: string): boolean {
  const supported3P = get3PModelCapabilityOverride(
    model,
    'interleaved_thinking',
  )
  if (supported3P !== undefined) {
    return supported3P
  }
  const canonical = getCanonicalName(model)
  const provider = getAPIProvider()
  // Foundry 支持所有模型的交错思考功能。
  if (provider === 'foundry') {
    return true
  }
  if (provider === 'firstParty') {
    return !canonical.includes('claude-3-')
  }
  return (
    canonical.includes('claude-opus-4') || canonical.includes('claude-sonnet-4')
  )
}

function vertexModelSupportsWebSearch(model: string): boolean {
  const canonical = getCanonicalName(model)
  // 仅在 Vertex 上的 Claude 4.0+ 模型支持网络搜索。
  return (
    canonical.includes('claude-opus-4') ||
    canonical.includes('claude-sonnet-4') ||
    canonical.includes('claude-haiku-4')
  )
}

// 上下文管理功能在 Claude 4+ 模型上受支持。
export function modelSupportsContextManagement(model: string): boolean {
  const canonical = getCanonicalName(model)
  const provider = getAPIProvider()
  if (provider === 'foundry') {
    return true
  }
  if (provider === 'firstParty') {
    return !canonical.includes('claude-3-')
  }
  return (
    canonical.includes('claude-opus-4') ||
    canonical.includes('claude-sonnet-4') ||
    canonical.includes('claude-haiku-4')
  )
}

// @[MODEL LAUNCH]: 如果新模型支持结构化输出，请将其 ID 添加到此列表。
export function modelSupportsStructuredOutputs(model: string): boolean {
  const canonical = getCanonicalName(model)
  const provider = getAPIProvider()
  // 结构化输出仅在第一方和 Foundry 上受支持（Bedrock/Vertex 目前还不支持）。
  if (provider !== 'firstParty' && provider !== 'foundry') {
    return false
  }
  return (
    canonical.includes('claude-sonnet-4-6') ||
    canonical.includes('claude-sonnet-4-5') ||
    canonical.includes('claude-opus-4-1') ||
    canonical.includes('claude-opus-4-5') ||
    canonical.includes('claude-opus-4-6') ||
    canonical.includes('claude-opus-4-7') ||
    canonical.includes('claude-haiku-4-5')
  )
}

// @[MODEL LAUNCH]: 如果新模型支持自动模式（特别是 PI 探针），请添加它 — 请在 #proj-claude-code-safety-research 中询问。
export function modelSupportsAutoMode(model: string): boolean {
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    const m = getCanonicalName(model)
    // 外部：发布时仅限第一方（Bedrock/Vertex/Foun
    // dry 的 PI 探针尚未连接）。在 allowModels 之前
    // 检查，以便 GB 覆盖无法在不支持的提供商上启用自动模式。
    if (process.env.USER_TYPE !== 'ant' && getAPIProvider() !== 'firstParty') {
      return false
    }
    // GrowthBook 覆盖：tengu_auto_mode_config.al
    // lowModels 为列出的模型强制启用自动模式，绕过下面的拒绝列表/允许列表
    // 。确切的模型 ID（例如 "claude-strudel-v6-p"）仅匹配
    // 该模型；规范名称（例如 "claude-strudel"）匹配整个系列。
    const config = getFeatureValue_CACHED_MAY_BE_STALE<{
      allowModels?: string[]
    }>('tengu_auto_mode_config', {})
    const rawLower = model.toLowerCase()
    if (
      config?.allowModels?.some(
        am => am.toLowerCase() === rawLower || am.toLowerCase() === m,
      )
    ) {
      return true
    }
    if (process.env.USER_TYPE === 'ant') {
      // 拒绝列表：阻止已知不支持的 Claude 模型，允许其他所有模型（ant-internal 模型等）。
      if (m.includes('claude-3-')) return false
      // claude-*-4 后面不跟 -[6-9]：阻止裸的 -4、-4-YYYYMMDD、-4@、-4-0 到 -4-5。
      if (/claude-(opus|sonnet|haiku)-4(?!-[6-9])/.test(m)) return false
      return true
    }
    // External allowlist (firstParty already checked above).
    return /^claude-(opus|sonnet)-4-[67]/.test(m)
  }
  return false
}

/** 获取当前 API 提供商的正确工具搜索测试功能头。
- Claude API / Foundry: advanced-tool-use-2025-11-20
- Vertex AI / Bedrock: tool-search-tool-2025-10-19 */
export function getToolSearchBetaHeader(): string {
  const provider = getAPIProvider()
  if (provider === 'vertex' || provider === 'bedrock') {
    return TOOL_SEARCH_BETA_HEADER_3P
  }
  return TOOL_SEARCH_BETA_HEADER_1P
}

/** 检查是否应包含实验性测试功能。
这些测试功能仅在 firstParty 提供商上可用，
代理或其他提供商可能不支持。 */
export function shouldIncludeFirstPartyOnlyBetas(): boolean {
  return (
    (getAPIProvider() === 'firstParty' || getAPIProvider() === 'foundry') &&
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS) &&
    isFirstPartyAnthropicBaseUrl()
  )
}

/** 全局范围的提示缓存仅限第一方。Foundry 被排除在外，因为
GrowthBook 从未将 Foundry 用户纳入推出实验的分组 — 该
处理数据仅限第一方。 */
export function shouldUseGlobalCacheScope(): boolean {
  return (
    getAPIProvider() === 'firstParty' &&
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)
  )
}

export const getAllModelBetas = memoize((model: string): string[] => {
  const betaHeaders = []
  const isHaiku = getCanonicalName(model).includes('haiku')
  const provider = getAPIProvider()
  const includeFirstPartyOnlyBetas = shouldIncludeFirstPartyOnlyBetas()

  if (!isHaiku) {
    betaHeaders.push(CLAUDE_CODE_20250219_BETA_HEADER)
    if (
      process.env.USER_TYPE === 'ant' &&
      process.env.CLAUDE_CODE_ENTRYPOINT === 'cli'
    ) {
      if (CLI_INTERNAL_BETA_HEADER) {
        betaHeaders.push(CLI_INTERNAL_BETA_HEADER)
      }
    }
  }
  if (isClaudeAISubscriber()) {
    betaHeaders.push(OAUTH_BETA_HEADER)
  }
  if (has1mContext(model)) {
    betaHeaders.push(CONTEXT_1M_BETA_HEADER)
  }
  if (
    //交叉思考。Claude 4.0+ 模型支持交叉思考。（think内容和text内容交替出现在一次响应中，普通模型是think完毕才text）
    !isEnvTruthy(process.env.DISABLE_INTERLEAVED_THINKING) &&
    modelSupportsISP(model)
  ) {
    betaHeaders.push(INTERLEAVED_THINKING_BETA_HEADER)
  }

  // 跳过 API 端的 Haiku 思考摘要器 — 摘要仅用于 ctrl+o
  // 显示，而交互式用户很少打开。API 返回 redacted_thinking
  // 块；AssistantRedactedThinkingMessage 已经将它
  // 们渲染为存根。SDK / print模式保留摘要，因为调用方可能会迭代思考内容。用
  // 户可以通过 settings.json 中的 showThinkingSummaries
  //  选择重新启用。
  if (
    includeFirstPartyOnlyBetas &&
    modelSupportsISP(model) && //是否支持交叉思考。
    !getIsNonInteractiveSession() && //是否是非交互式会话
    getInitialSettings().showThinkingSummaries !== true //是否显示思考摘要
  ) {
    betaHeaders.push(REDACT_THINKING_BETA_HEADER)
  }

  // 开启了工具清除或think保存的上下文管理测试版功能。
  // 对于所有用户，默认情况下已启用工具清除功能（在 ant 上的上游设置中开启）；
  // 当模型支持上下文管理时，think保存功能才会激活。
  const toolClearingOptIn =
    isEnvTruthy(process.env.USE_API_CONTEXT_MANAGEMENT) ||
    modelSupportsContextManagement(model)

  const thinkingPreservationEnabled = modelSupportsContextManagement(model)

  if (
    shouldIncludeFirstPartyOnlyBetas() &&
    (toolClearingOptIn || thinkingPreservationEnabled)
  ) {
    betaHeaders.push(CONTEXT_MANAGEMENT_BETA_HEADER)
  }
  // 如果实验已启用，则添加严格工具使用测试功能。以 includ
  // eFirstPartyOnlyBetas 为门控：CLAUDE_CODE_DISABLE_
  // EXPERIMENTAL_BETAS 已经在 api.ts 的阻塞点从工具体中剥离了 sc
  // hema.strict，但这个头逃过了那个紧急停止开关。看起来像第一方但转发到 Vert
  // ex 的代理网关会以 400 拒绝此头。github.com/deshaw
  // /anthropic-issues/issues/5
  const strictToolsEnabled =
    checkStatsigFeatureGate_CACHED_MAY_BE_STALE('tengu_tool_pear')
  // 第三方默认值：false。API 拒绝 strict 和 token-efficient-tool
  // s 一起使用（tool_use.py:139），因此它们是互斥的 — strict 优先。
  const tokenEfficientToolsEnabled =
    !strictToolsEnabled &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_json_tools', false)
  if (
    includeFirstPartyOnlyBetas &&
    modelSupportsStructuredOutputs(model) &&
    strictToolsEnabled
  ) {
    betaHeaders.push(STRUCTURED_OUTPUTS_BETA_HEADER)
  }
  // JSON tool_use 格式（FC v3）— 与 ANTML 相比输出 token 减少约 4.
  // 5%。发送在 anthropics/anthropic#337072 中添加的 v2 头（2026-03
  // -28），以将 CC A/B 队列与约 920 万/周的现有 v1 发送者隔离。在恢复的 JsonTo
  // olUseOutputParser 充分测试期间，仅限 Ant 使用。
  if (
    process.env.USER_TYPE === 'ant' &&
    includeFirstPartyOnlyBetas &&
    tokenEfficientToolsEnabled
  ) {
    betaHeaders.push(TOKEN_EFFICIENT_TOOLS_BETA_HEADER)
  }

  // 仅为 Vertex Claude 4.0+ 模型添加网络搜索测试功能。
  if (provider === 'vertex' && vertexModelSupportsWebSearch(model)) {
    betaHeaders.push(WEB_SEARCH_BETA_HEADER)
  }
  // Foundry 仅提供已支持网络搜索的模型。
  if (provider === 'foundry') {
    betaHeaders.push(WEB_SEARCH_BETA_HEADER)
  }

  // 始终为第一方发送测试功能头。没有 scope 字段时，该头是无操作的。
  if (includeFirstPartyOnlyBetas) {
    betaHeaders.push(PROMPT_CACHING_SCOPE_BETA_HEADER)
  }

  // 如果设置了 ANTHROPIC_BETAS，则按逗号分割并添加到 beta
  // Headers 中。这是用户的明确选择加入，因此无论模型如何都应遵守。
  if (process.env.ANTHROPIC_BETAS) {
    //用户手动增加的实验项目
    betaHeaders.push(
      ...process.env.ANTHROPIC_BETAS.split(',')
        .map(_ => _.trim())
        .filter(Boolean),
    )
  }
  return betaHeaders
})

export const getModelBetas = memoize((model: string): string[] => {
  const modelBetas = getAllModelBetas(model)
  if (getAPIProvider() === 'bedrock') {
    return modelBetas.filter(b => !BEDROCK_EXTRA_PARAMS_HEADERS.has(b))
  }
  return modelBetas
})

export const getBedrockExtraBodyParamsBetas = memoize(
  (model: string): string[] => {
    const modelBetas = getAllModelBetas(model)
    return modelBetas.filter(b => BEDROCK_EXTRA_PARAMS_HEADERS.has(b))
  },
)

/** 将 SDK 提供的测试功能与自动检测的模型测试功能合并。
SDK 测试功能从全局状态读取（通过 main.tsx 中的 setSdkBetas 设置）。
这些测试功能已由 filterAllowedSdkBetas 预过滤，该函数处理
订阅者检查和允许列表验证并发出警告。

@param options.isAgenticQuery - 为 true 时，确保存在
  智能体查询所需的测试功能头。对于非 Haiku 模型，这些已由
  getAllModelBetas() 包含；对于 Haiku 模型，它们被排除，因为
  非智能体调用（压缩、分类器、token 估算）不需要它们。 */
export function getMergedBetas(
  model: string,
  options?: { isAgenticQuery?: boolean },
): string[] {
  const baseBetas = [...getModelBetas(model)]

  // 智能体查询始终需要 claude-code 和 cli-internal 测试功能头。
  // 对于非 Haiku 模型，这些已在 baseBetas 中；对于 Haiku 模型，它
  // 们被 getAllModelBetas() 排除，因为非智能体的 Haiku 调用不需要它们。
  if (options?.isAgenticQuery) {
    if (!baseBetas.includes(CLAUDE_CODE_20250219_BETA_HEADER)) {
      baseBetas.push(CLAUDE_CODE_20250219_BETA_HEADER)
    }
    if (
      process.env.USER_TYPE === 'ant' &&
      process.env.CLAUDE_CODE_ENTRYPOINT === 'cli' &&
      CLI_INTERNAL_BETA_HEADER &&
      !baseBetas.includes(CLI_INTERNAL_BETA_HEADER)
    ) {
      baseBetas.push(CLI_INTERNAL_BETA_HEADER)
    }
  }

  const sdkBetas = getSdkBetas()

  if (!sdkBetas || sdkBetas.length === 0) {
    return baseBetas
  }

  // 合并 SDK 测试功能，避免重复（已由 filterAllowedSdkBetas 过滤）。
  return [...baseBetas, ...sdkBetas.filter(b => !baseBetas.includes(b))]
}

export function clearBetasCaches(): void {
  getAllModelBetas.cache?.clear?.()
  getModelBetas.cache?.clear?.()
  getBedrockExtraBodyParamsBetas.cache?.clear?.()
}
