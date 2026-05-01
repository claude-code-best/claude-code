// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
/** 确保此处引入的任何模型代号也已添加到 scripts/excluded-strings.txt 中，以防泄露。使用 process.env.USER_TYPE === 'ant' 包装任何代号字符串字面量，以便 Bun 在死代码消除期间移除这些代号 */
import { getMainLoopModelOverride } from '../../bootstrap/state.js'
import { resolveAntModel, getAntModelOverrideConfig } from './antModels.js'
import {
  getSubscriptionType,
  isClaudeAISubscriber,
  isMaxSubscriber,
  isProSubscriber,
  isTeamPremiumSubscriber,
} from '../auth.js'
import {
  has1mContext,
  is1mContextDisabled,
  modelSupports1M,
} from '../context.js'
import { isEnvTruthy } from '../envUtils.js'
import { getModelStrings, resolveOverriddenModel } from './modelStrings.js'
import { formatModelPricing, getOpus46CostTier } from '../modelCost.js'
import { getSettings_DEPRECATED } from '../settings/settings.js'
import type { PermissionMode } from '../permissions/PermissionMode.js'
import { getAPIProvider } from './providers.js'
import { LIGHTNING_BOLT } from '../../constants/figures.js'
import { isModelAllowed } from './modelAllowlist.js'
import { type ModelAlias, isModelAlias } from './aliases.js'
import { capitalize } from '../stringUtils.js'

export type ModelShortName = string
export type ModelName = string
export type ModelSetting = ModelName | ModelAlias | null

export function getSmallFastModel(): ModelName {
  const provider = getAPIProvider()
  // 供应商特定的小型快速模型
  if (provider === 'openai' && process.env.OPENAI_SMALL_FAST_MODEL) {
    return process.env.OPENAI_SMALL_FAST_MODEL
  }
  if (provider === 'gemini' && process.env.GEMINI_SMALL_FAST_MODEL) {
    return process.env.GEMINI_SMALL_FAST_MODEL
  }
  // Anthropic 特定或备用
  return process.env.ANTHROPIC_SMALL_FAST_MODEL || getDefaultHaikuModel()
}
//是不是Opus模型。
export function isNonCustomOpusModel(model: ModelName): boolean {
  return (
    model === getModelStrings().opus40 ||
    model === getModelStrings().opus41 ||
    model === getModelStrings().opus45 ||
    model === getModelStrings().opus46 ||
    model === getModelStrings().opus47
  )
}

/**
* 用于从 /model（包括通过 /config）、--model 标志、环境变量或已保存的设置中获取模型的辅助函数。
* 如果用户指定了模型别名，则返回该别名。
* 如果用户未进行任何配置，则返回 undefined，此时我们将回退到
* 默认值 (null)。
*
* 此函数的优先级顺序：
* 1. 会话期间的模型覆盖（来自 /model 命令）- 最高优先级
* 2. 启动时的模型覆盖（来自 --model 标志）
* 3. ANTHROPIC_MODEL 环境变量
* 4. 设置（来自用户已保存的设置）
*/
export function getUserSpecifiedModelSetting(): ModelSetting | undefined {
  let specifiedModel: ModelSetting | undefined

  const modelOverride = getMainLoopModelOverride()
  if (modelOverride !== undefined) {
    specifiedModel = modelOverride
  } else {
    const settings = getSettings_DEPRECATED() || {}
    specifiedModel = process.env.ANTHROPIC_MODEL || settings.model || undefined
  }

  // 如果用户指定的模型不在 availableModels 允许列表中，则忽略它。
  if (specifiedModel && !isModelAllowed(specifiedModel)) {
    return undefined
  }

  return specifiedModel
}

/** 获取用于当前会话的主循环模型。

模型选择优先级顺序：
1. 会话期间的模型覆盖（来自 /model 命令）- 最高优先级
2. 启动时的模型覆盖（来自 --model 标志）
3. ANTHROPIC_MODEL 环境变量
4. 设置（来自用户已保存的设置）
5. 内置默认值

@returns 要使用的已解析模型名称 */
export function getMainLoopModel(): ModelName {
  const model = getUserSpecifiedModelSetting()
  if (model !== undefined && model !== null) {
    return parseUserSpecifiedModel(model)
  }
  return getDefaultMainLoopModel()
}

export function getBestModel(): ModelName {
  return getDefaultOpusModel()
}

// @[MODEL LAUNCH]: 更新默认的 Opus 模型（第三方供应商可能滞后，因此保持默认值不变）。
export function getDefaultOpusModel(): ModelName {
  const provider = getAPIProvider()
  // 对于 OpenAI 供应商，首先检查 OPENAI_DEFAULT_OPUS_MODEL
  if (provider === 'openai' && process.env.OPENAI_DEFAULT_OPUS_MODEL) {
    return process.env.OPENAI_DEFAULT_OPUS_MODEL
  }
  // 对于 Gemini 供应商，检查 GEMINI_DEFAULT_OPUS_MODEL
  if (provider === 'gemini' && process.env.GEMINI_DEFAULT_OPUS_MODEL) {
    return process.env.GEMINI_DEFAULT_OPUS_MODEL
  }
  // Anthropic 特定覆盖（用于第一方和其他第三方供应商）
  if (process.env.ANTHROPIC_DEFAULT_OPUS_MODEL) {
    return process.env.ANTHROPIC_DEFAULT_OPUS_MODEL
  }
  // 截至 2026 年 4 月 17 日，所有第三方提供商（Bedrock、Vertex 和 Foundry）
  // 均已发布与第一方同步的 Opus 4.7 版本（AWS Bedrock、Google Vertex AI 
  // 和 Microsoft Foundry 的公告和模型目录均已确认）。保留此分支作为结构性参考，
  // 以防未来版本发布时第三方提供商的版本出现延迟。
  if (provider !== 'firstParty') {
    return getModelStrings().opus47
  }
  return getModelStrings().opus47
}

// @[MODEL LAUNCH]: 更新默认的 Sonnet 模型（第三方供应商可能滞后，因此保持默认值不变）。
export function getDefaultSonnetModel(): ModelName {
  const provider = getAPIProvider()
  // 对于 OpenAI 供应商，首先检查 OPENAI_DEFAULT_SONNET_MODEL
  if (
    provider === 'openai' &&
    process.env.OPENAI_DEFAULT_SONNET_MODEL
  ) {
    return process.env.OPENAI_DEFAULT_SONNET_MODEL
  }
  // 对于 Gemini 供应商，检查 GEMINI_DEFAULT_SONNET_MODEL
  if (provider === 'gemini' && process.env.GEMINI_DEFAULT_SONNET_MODEL) {
    return process.env.GEMINI_DEFAULT_SONNET_MODEL
  }
  // Anthropic 特定覆盖（用于第一方和其他第三方供应商）
  if (process.env.ANTHROPIC_DEFAULT_SONNET_MODEL) {
    return process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
  }
  // 3P 默认使用 Sonnet 4.5，因为他们可能还没有 4.6 版本。
  if (provider !== 'firstParty') {
    return getModelStrings().sonnet45
  }
  return getModelStrings().sonnet46
}

// @[MODEL LAUNCH]: 更新默认的 Haiku 模型（第三方供应商可能滞后，因此保持默认值不变）。
export function getDefaultHaikuModel(): ModelName {
  const provider = getAPIProvider()
  // 对于 OpenAI 供应商，首先检查 OPENAI_DEFAULT_HAIKU_MODEL
  if (provider === 'openai' && process.env.OPENAI_DEFAULT_HAIKU_MODEL) {
    return process.env.OPENAI_DEFAULT_HAIKU_MODEL
  }
  // 对于 Gemini 供应商，检查 GEMINI_DEFAULT_HAIKU_MODEL
  if (provider === 'gemini' && process.env.GEMINI_DEFAULT_HAIKU_MODEL) {
    return process.env.GEMINI_DEFAULT_HAIKU_MODEL
  }
  // Anthropic 特定覆盖（用于第一方和其他第三方供应商）
  if (process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL) {
    return process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL
  }

  // Haiku 4.5 在所有平台（第一方、Foundry、Bedrock、Vertex）上都可用
  return getModelStrings().haiku45
}

/** 根据运行时上下文，获取用于运行时的模型。
@param params 用于确定要使用模型的运行时上下文子集。
@returns 要使用的模型 */
export function getRuntimeMainLoopModel(params: {
  permissionMode: PermissionMode
  mainLoopModel: string
  exceeds200kTokens?: boolean
}): ModelName {
  const { permissionMode, mainLoopModel, exceeds200kTokens = false } = params

  // opusplan 在计划模式下使用 Opus，不带 [1m] 后缀。
  if (
    getUserSpecifiedModelSetting() === 'opusplan' &&
    permissionMode === 'plan' &&
    !exceeds200kTokens
  ) {
    return getDefaultOpusModel()
  }

  // 默认使用 sonnetplan
  if (getUserSpecifiedModelSetting() === 'haiku' && permissionMode === 'plan') {
    return getDefaultSonnetModel()
  }

  return mainLoopModel
}

/** 获取默认的主循环模型设置。

这处理内置默认值：
- Max 和 Team Premium 用户使用 Opus
- 所有其他用户（包括 Team Standard、Pro、Enterprise）使用 Sonnet 4.6

@returns 要使用的默认模型设置 */
export function getDefaultMainLoopModelSetting(): ModelName | ModelAlias {
  // Ants 默认使用标志配置中的 defaultModel，如果未配置则使用 Opus 1M
  if (process.env.USER_TYPE === 'ant') {
    return (
      (getAntModelOverrideConfig()?.defaultModel as string) ??
      getDefaultOpusModel() + '[1m]'
    )
  }

  // Max 用户默认使用 Opus
  if (isMaxSubscriber()) {
    return getDefaultOpusModel() + (isOpus1mMergeEnabled() ? '[1m]' : '')
  }

  // Team Premium 默认使用 Opus（与 Max 相同）
  if (isTeamPremiumSubscriber()) {
    return getDefaultOpusModel() + (isOpus1mMergeEnabled() ? '[1m]' : '')
  }

  // PAYG（第一方和第三方）、Enterprise、Team Standard 和 Pro 默认使用
  // Sonnet。注意：PAYG（第三方）可能默认使用较旧的 Sonnet 模型
  return getDefaultSonnetModel()
}

/** 同步操作，用于获取要使用的默认主循环模型（绕过任何用户指定的值）。 */
export function getDefaultMainLoopModel(): ModelName {
  return parseUserSpecifiedModel(getDefaultMainLoopModelSetting())
}

// @[模型发布]：在下方为新增模型添加规范名称映射。
/** 纯字符串匹配，用于从第一方模型名称中剥离日期/提供商后缀。输入必须已是第一方格式的 ID（例如 'claude-3-7-sonnet-20250219'、'us.anthropic.claude-opus-4-6-v1:0'）。不触及设置，因此在模块顶层是安全的（参见 modelCost.ts 中的 MODEL_COSTS）。 */
export function firstPartyNameToCanonical(name: ModelName): ModelShortName {
  name = name.toLowerCase()
  // Special cases for Claude 4+ models to differentiate versions
  // Order matters: check more specific versions first (4-5 before 4)
  if (name.includes('claude-opus-4-7')) {
    return 'claude-opus-4-7'
  }
  if (name.includes('claude-opus-4-6')) {
    return 'claude-opus-4-6'
  }
  if (name.includes('claude-opus-4-5')) {
    return 'claude-opus-4-5'
  }
  if (name.includes('claude-opus-4-1')) {
    return 'claude-opus-4-1'
  }
  if (name.includes('claude-opus-4')) {
    return 'claude-opus-4'
  }
  if (name.includes('claude-sonnet-4-6')) {
    return 'claude-sonnet-4-6'
  }
  if (name.includes('claude-sonnet-4-5')) {
    return 'claude-sonnet-4-5'
  }
  if (name.includes('claude-sonnet-4')) {
    return 'claude-sonnet-4'
  }
  if (name.includes('claude-haiku-4-5')) {
    return 'claude-haiku-4-5'
  }
  // Claude 3.x 模型使用不同的命名方案（claude-3-{family}）。
  if (name.includes('claude-3-7-sonnet')) {
    return 'claude-3-7-sonnet'
  }
  if (name.includes('claude-3-5-sonnet')) {
    return 'claude-3-5-sonnet'
  }
  if (name.includes('claude-3-5-haiku')) {
    return 'claude-3-5-haiku'
  }
  if (name.includes('claude-3-opus')) {
    return 'claude-3-opus'
  }
  if (name.includes('claude-3-sonnet')) {
    return 'claude-3-sonnet'
  }
  if (name.includes('claude-3-haiku')) {
    return 'claude-3-haiku'
  }
  const match = name.match(/(claude-(\d+-\d+-)?\w+)/)
  if (match && match[1]) {
    return match[1]
  }
  // 如果没有模式匹配，则回退到原始名称。
  return name
}

/** 将完整的模型字符串映射到一个较短的规范版本，该版本在第一方和第三方提供商之间是统一的。
例如，'claude-3-5-haiku-20241022' 和 'us.anthropic.claude-3-5-haiku-20241022-v1:0'
都将被映射到 'claude-3-5-haiku'。
@param fullModelName 完整的模型名称（例如，'claude-3-5-haiku-20241022'）
@returns 如果找到，则返回短名称（例如，'claude-3-5-haiku'），否则返回原始名称。 */
export function getCanonicalName(fullModelName: ModelName): ModelShortName {
  // 将覆盖的模型 ID（例如 Bedrock ARN）解析回规范名称。resolved 始终
  // 是第一方格式的 ID，因此 firstPartyNameToCanonical 可以处理它。
  return firstPartyNameToCanonical(resolveOverriddenModel(fullModelName))
}

// @[模型发布]：更新向用户显示的默认模型描述字符串。
export function getClaudeAiUserDefaultModelDescription(
  fastMode = false,
): string {
  if (isMaxSubscriber() || isTeamPremiumSubscriber()) {
    if (isOpus1mMergeEnabled()) {
      return `Opus 4.7 with 1M context · Most capable for complex work${fastMode ? getOpusPricingSuffix(true) : ''}`
    }
    return `Opus 4.7 · Most capable for complex work${fastMode ? getOpusPricingSuffix(true) : ''}`
  }
  return 'Sonnet 4.6 · 最适合日常任务'
}

export function renderDefaultModelSetting(
  setting: ModelName | ModelAlias,
): string {
  if (setting === 'opusplan') {
    return 'Opus 4.7 in plan mode, else Sonnet 4.6'
  }
  return renderModelName(parseUserSpecifiedModel(setting))
}

export function getOpusPricingSuffix(fastMode: boolean): string {
  if (getAPIProvider() !== 'firstParty') return ''
  const pricing = formatModelPricing(getOpus46CostTier(fastMode))
  const fastModeIndicator = fastMode ? ` (${LIGHTNING_BOLT})` : ''
  return ` ·${fastModeIndicator} ${pricing}`
}

export function isOpus1mMergeEnabled(): boolean {
  if (
    is1mContextDisabled() ||
    isProSubscriber() ||
    getAPIProvider() !== 'firstParty'
  ) {
    return false
  }
  // 当订阅者的订阅类型未知时，采取保守策略（fail closed）。VS Co
  // de 配置加载子进程可能拥有具有有效作用域的 OAuth 令牌，但没有 s
  // ubscriptionType 字段（陈旧或部分刷新）。如果没有此防护，
  // isProSubscriber() 会对此类用户返回 false，合
  // 并操作会将 opus[1m] 泄漏到模型下拉列表中——随后 API
  // 会以误导性的“达到速率限制”错误拒绝它。
  if (isClaudeAISubscriber() && getSubscriptionType() === null) {
    return false
  }
  return true
}

export function renderModelSetting(setting: ModelName | ModelAlias): string {
  if (setting === 'opusplan') {
    return 'Opus Plan'
  }
  if (isModelAlias(setting)) {
    return capitalize(setting)
  }
  return renderModelName(setting)
}

// @[模型发布]：为新增模型添加显示名称处理（基础版本 + [1m] 变体，如果适用）。
/** 为已知的公共模型返回人类可读的显示名称，如果模型未被识别为公共模型，则返回 null。 */
export function getPublicModelDisplayName(model: ModelName): string | null {
  switch (model) {
    case getModelStrings().opus47:
      return 'Opus 4.7'
    case getModelStrings().opus47 + '[1m]':
      return 'Opus 4.7 (1M context)'
    case getModelStrings().opus46:
      return 'Opus 4.6'
    case getModelStrings().opus46 + '[1m]':
      return 'Opus 4.6（100 万上下文）'
    case getModelStrings().opus45:
      return 'Opus 4.5'
    case getModelStrings().opus41:
      return 'Opus 4.1'
    case getModelStrings().opus40:
      return 'Opus 4'
    case getModelStrings().sonnet46 + '[1m]':
      return 'Sonnet 4.6（100 万上下文）'
    case getModelStrings().sonnet46:
      return 'Sonnet 4.6'
    case getModelStrings().sonnet45 + '[1m]':
      return 'Sonnet 4.5（100 万上下文）'
    case getModelStrings().sonnet45:
      return 'Sonnet 4.5'
    case getModelStrings().sonnet40:
      return 'Sonnet 4'
    case getModelStrings().sonnet40 + '[1m]':
      return 'Sonnet 4（100 万上下文）'
    case getModelStrings().sonnet37:
      return 'Sonnet 3.7'
    case getModelStrings().sonnet35:
      return 'Sonnet 3.5'
    case getModelStrings().haiku45:
      return 'Haiku 4.5'
    case getModelStrings().haiku35:
      return 'Haiku 3.5'
    default:
      return null
  }
}

function maskModelCodename(baseName: string): string {
  // 仅屏蔽第一个由短横线分隔的部分（代号），保留其余部分，例如 capybara-v2-f
  // ast → cap*****-v2-fast
  const [codename = '', ...rest] = baseName.split('-')
  const masked =
    codename.slice(0, 3) + '*'.repeat(Math.max(0, codename.length - 3))
  return [masked, ...rest].join('-')
}

export function renderModelName(model: ModelName): string {
  const publicName = getPublicModelDisplayName(model)
  if (publicName) {
    return publicName
  }
  if (process.env.USER_TYPE === 'ant') {
    const resolved = parseUserSpecifiedModel(model)
    const antModel = resolveAntModel(model)
    if (antModel) {
      const baseName = antModel.model.replace(/\[1m\]$/i, '')
      const masked = maskModelCodename(baseName)
      const suffix = has1mContext(resolved) ? '[1m]' : ''
      return masked + suffix
    }
    if (resolved !== model) {
      return `${model} (${resolved})`
    }
    return resolved
  }
  return model
}

/** 返回一个用于公共显示的安全作者名称（例如，在 git commit trailers 中）。
对于公开已知的模型，返回 "Claude {ModelName}"，对于未知/内部模型，返回 "Claude ({model})"，以便保留确切的模型名称。

@param model 完整的模型名称
@returns 对于公共模型，返回 "Claude {ModelName}"；对于非公共模型，返回 "Claude ({model})" */
export function getPublicModelName(model: ModelName): string {
  const publicName = getPublicModelDisplayName(model)
  if (publicName) {
    return `Claude ${publicName}`
  }
  return `Claude (${model})`
}

/** 返回用于本次会话的完整模型名称，可能在解析模型别名之后。

此函数特意不支持版本号，以与模型切换器保持一致。

支持在任何模型别名上使用 [1m] 后缀（例如，haiku[1m], sonnet[1m]），以启用 100 万上下文窗口，而无需每个变体都存在于 MODEL_ALIASES 中。

@param modelInput 用户提供的模型别名或名称。 */
export function parseUserSpecifiedModel(
  modelInput: ModelName | ModelAlias,
): ModelName {
  const modelInputTrimmed = modelInput.trim()
  const normalizedModel = modelInputTrimmed.toLowerCase()

  const has1mTag = has1mContext(normalizedModel)
  const modelString = has1mTag
    ? normalizedModel.replace(/\[1m]$/i, '').trim()
    : normalizedModel

  if (isModelAlias(modelString)) {
    switch (modelString) {
      case 'opusplan':
        return getDefaultSonnetModel() + (has1mTag ? '[1m]' : '') // 默认使用 Sonnet，计划模式下使用 Opus
      case 'sonnet':
        return getDefaultSonnetModel() + (has1mTag ? '[1m]' : '')
      case 'haiku':
        return getDefaultHaikuModel() + (has1mTag ? '[1m]' : '')
      case 'opus':
        return getDefaultOpusModel() + (has1mTag ? '[1m]' : '')
      case 'best':
        return getBestModel()
      default:
    }
  }

  // Opus 4/4.1 are no longer available on the first-party API (same as
  // Claude.ai) — silently remap to the current Opus default. The 'opus'
  // alias resolves to the current default Opus (4.7), so the only users
  // on these explicit strings pinned them in settings/env/--model/SDK
  // before 4.5 launched. 3P providers may not yet have 4.6/4.7 capacity,
  // so pass through unchanged.
  if (
    getAPIProvider() === 'firstParty' &&
    isLegacyOpusFirstParty(modelString) &&
    isLegacyModelRemapEnabled()
  ) {
    return getDefaultOpusModel() + (has1mTag ? '[1m]' : '')
  }

  if (process.env.USER_TYPE === 'ant') {
    const has1mAntTag = has1mContext(normalizedModel)
    const baseAntModel = normalizedModel.replace(/\[1m]$/i, '').trim()

    const antModel = resolveAntModel(baseAntModel)
    if (antModel) {
      const suffix = has1mAntTag ? '[1m]' : ''
      return antModel.model + suffix
    }

    // 如果无法加载配置，则回退到别名字符串。API 调
    // 用将因此字符串而失败，但我们应该能通过反馈得知，
    // 并可以告知用户重启/等待标志缓存刷新以获取最新值。
  }

  // 保留自定义模型名称的原始大小写（例如，Azure Foundry 部署
  // ID）。仅当存在时剥离 [1m] 后缀，保持基础模型的大小写。
  if (has1mTag) {
    return modelInputTrimmed.replace(/\[1m\]$/i, '').trim() + '[1m]'
  }
  return modelInputTrimmed
}

/** 根据当前模型解析技能的 `model:` 前置元数据，并在目标系列支持时携带 `[1m]` 后缀。

技能作者编写 `model: opus` 意味着“使用 opus 级别的推理能力”——而不是“降级到 200K”。如果用户处于 230K token 的 opus[1m] 会话中，并调用一个带有 `model: opus` 的技能，传递裸别名会将有效上下文窗口从 100 万降至 20 万，这会在 23% 的明显使用率时触发自动压缩，并显示“达到上下文限制”，即使没有任何内容溢出。

我们只在目标实际支持时携带 [1m]（sonnet/opus）。一个带有 `model: haiku` 的技能在 100 万会话中仍然会降级——haiku 没有 100 万变体，因此随后的自动压缩是正确的。已经指定了 [1m] 的技能保持不变。 */
export function resolveSkillModelOverride(
  skillModel: string,
  currentModel: string,
): string {
  if (has1mContext(skillModel) || !has1mContext(currentModel)) {
    return skillModel
  }
  // modelSupports1M 匹配规范 ID（'claude-opus-4-6', 'claude-sonne
  // t-4'）；一个裸的 'opus' 别名会因 getCanonicalName 未匹配而回退。先进行解析。
  if (modelSupports1M(parseUserSpecifiedModel(skillModel))) {
    return skillModel + '[1m]'
  }
  return skillModel
}

const LEGACY_OPUS_FIRSTPARTY = [
  'claude-opus-4-20250514',
  'claude-opus-4-1-20250805',
  'claude-opus-4-0',
  'claude-opus-4-1',
]

function isLegacyOpusFirstParty(model: string): boolean {
  return LEGACY_OPUS_FIRSTPARTY.includes(model)
}

/** 针对旧版 Opus 4.0/4.1 → 当前 Opus 重新映射的退出选项。 */
export function isLegacyModelRemapEnabled(): boolean {
  return !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP)
}

export function modelDisplayString(model: ModelSetting): string {
  if (model === null) {
    if (process.env.USER_TYPE === 'ant') {
      return `Ants 的默认值 (${renderDefaultModelSetting(getDefaultMainLoopModelSetting())})`
    } else if (isClaudeAISubscriber()) {
      return `Default (${getClaudeAiUserDefaultModelDescription()})`
    }
    return `Default (${getDefaultMainLoopModel()})`
  }
  const resolvedModel = parseUserSpecifiedModel(model)
  return model === resolvedModel ? resolvedModel : `${model} (${resolvedModel})`
}

// @[模型发布]: 在下方为新模型添加营销名称映射。
export function getMarketingNameForModel(modelId: string): string | undefined {
  if (getAPIProvider() === 'foundry') {
    // 部署 ID 由用户在 Foundry 中自定义，因此可能与实际模型无关
    return undefined
  }

  const has1m = modelId.toLowerCase().includes('[1m]')
  const canonical = getCanonicalName(modelId)

  if (canonical.includes('claude-opus-4-7')) {
    return has1m ? 'Opus 4.7 (with 1M context)' : 'Opus 4.7'
  }
  if (canonical.includes('claude-opus-4-6')) {
    return has1m ? 'Opus 4.6 (支持 100 万上下文)' : 'Opus 4.6'
  }
  if (canonical.includes('claude-opus-4-5')) {
    return 'Opus 4.5'
  }
  if (canonical.includes('claude-opus-4-1')) {
    return 'Opus 4.1'
  }
  if (canonical.includes('claude-opus-4')) {
    return 'Opus 4'
  }
  if (canonical.includes('claude-sonnet-4-6')) {
    return has1m ? 'Sonnet 4.6 (支持 100 万上下文)' : 'Sonnet 4.6'
  }
  if (canonical.includes('claude-sonnet-4-5')) {
    return has1m ? 'Sonnet 4.5 (支持 100 万上下文)' : 'Sonnet 4.5'
  }
  if (canonical.includes('claude-sonnet-4')) {
    return has1m ? 'Sonnet 4 (支持 100 万上下文)' : 'Sonnet 4'
  }
  if (canonical.includes('claude-3-7-sonnet')) {
    return 'Claude 3.7 Sonnet'
  }
  if (canonical.includes('claude-3-5-sonnet')) {
    return 'Claude 3.5 Sonnet'
  }
  if (canonical.includes('claude-haiku-4-5')) {
    return 'Haiku 4.5'
  }
  if (canonical.includes('claude-3-5-haiku')) {
    return 'Claude 3.5 Haiku'
  }

  return undefined
}

export function normalizeModelStringForAPI(model: string): string {
  return model.replace(/\[(1|2)m\]/gi, '') //把字符串里类似 [1m] 或 [2m] 的标记删除掉
}
