import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaImageBlockParam,
  BetaJSONOutputFormat,
  BetaMessage,
  BetaMessageDeltaUsage,
  BetaMessageStreamParams,
  BetaOutputConfig,
  BetaRawMessageStreamEvent,
  BetaRequestDocumentBlock,
  BetaStopReason,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolResultBlockParam,
  BetaToolUnion,
  BetaUsage,
  BetaMessageParam as MessageParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { Stream } from '@anthropic-ai/sdk/streaming.mjs'
import { randomUUID } from 'crypto'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from 'src/utils/model/providers.js'
import {
  getAttributionHeader,
  getCLISyspromptPrefix,
} from '../../constants/system.js'
import {
  getEmptyToolPermissionContext,
  type QueryChainTracking,
  type Tool,
  type ToolPermissionContext,
  type Tools,
  toolMatchesName,
} from '../../Tool.js'
import type { AgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import {
  type ConnectorTextBlock,
  type ConnectorTextDelta,
  isConnectorTextBlock,
} from '../../types/connectorText.js'
import type {
  AssistantMessage,
  Message,
  MessageContent,
  StreamEvent,
  SystemAPIErrorMessage,
  UserMessage,
} from '../../types/message.js'
import {
  type CacheScope,
  logAPIPrefix,
  splitSysPromptPrefix,
  toolToAPISchema,
} from '../../utils/api.js'
import { getOauthAccountInfo } from '../../utils/auth.js'
import {
  getBedrockExtraBodyParamsBetas,
  getMergedBetas,
  getModelBetas,
} from '../../utils/betas.js'
import { getOrCreateUserID } from '../../utils/config.js'
import {
  CAPPED_DEFAULT_MAX_TOKENS,
  getModelMaxOutputTokens,
  getSonnet1mExpTreatmentEnabled,
} from '../../utils/context.js'
import { resolveAppliedEffort } from '../../utils/effort.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { errorMessage } from '../../utils/errors.js'
import { computeFingerprintFromMessages } from '../../utils/fingerprint.js'
import { captureAPIRequest, logError } from '../../utils/log.js'
import {
  createAssistantAPIErrorMessage,
  createUserMessage,
  ensureToolResultPairing,
  normalizeContentFromAPI,
  normalizeMessagesForAPI,
  stripAdvisorBlocks,
  stripCallerFieldFromAssistantMessage,
  stripToolReferenceBlocksFromUserMessage,
} from '../../utils/messages.js'
import {
  getDefaultOpusModel,
  getDefaultSonnetModel,
  getSmallFastModel,
  isNonCustomOpusModel,
} from '../../utils/model/model.js'
import {
  asSystemPrompt,
  type SystemPrompt,
} from '../../utils/systemPromptType.js'
import { tokenCountFromLastAPIResponse } from '../../utils/tokens.js'
import { getDynamicConfig_BLOCKS_ON_INIT } from '../analytics/growthbook.js'
import {
  currentLimits,
  extractQuotaStatusFromError,
  extractQuotaStatusFromHeaders,
} from '../claudeAiLimits.js'
import { getAPIContextManagement } from '../compact/apiMicrocompact.js'
import { bedrockAdapter } from '../providerUsage/adapters/bedrock.js'
import { updateProviderBuckets } from '../providerUsage/store.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('../../utils/permissions/autoModeState.js') as typeof import('../../utils/permissions/autoModeState.js'))
  : null

import { feature } from 'bun:bundle'
import type { ClientOptions } from '@anthropic-ai/sdk'
import {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk/error'
import {
  getAfkModeHeaderLatched,
  getCacheEditingHeaderLatched,
  getFastModeHeaderLatched,
  getLastApiCompletionTimestamp,
  getPromptCache1hAllowlist,
  getPromptCache1hEligible,
  getSessionId,
  setAfkModeHeaderLatched,
  setCacheEditingHeaderLatched,
  setFastModeHeaderLatched,
  setLastMainRequestId,
  setPromptCache1hAllowlist,
  setPromptCache1hEligible,
} from 'src/bootstrap/state.js'
import {
  AFK_MODE_BETA_HEADER,
  CONTEXT_1M_BETA_HEADER,
  CONTEXT_MANAGEMENT_BETA_HEADER,
  EFFORT_BETA_HEADER,
  FAST_MODE_BETA_HEADER,
  PROMPT_CACHING_SCOPE_BETA_HEADER,
  REDACT_THINKING_BETA_HEADER,
  STRUCTURED_OUTPUTS_BETA_HEADER,
  TASK_BUDGETS_BETA_HEADER,
} from 'src/constants/betas.js'
import type { QuerySource } from 'src/constants/querySource.js'
import type { Notification } from 'src/context/notifications.js'
import { addToTotalSessionCost } from 'src/cost-tracker.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import type { AgentId } from 'src/types/ids.js'
import {
  ADVISOR_TOOL_INSTRUCTIONS,
  getExperimentAdvisorModels,
  isAdvisorEnabled,
  isValidAdvisorModel,
  modelSupportsAdvisor,
} from 'src/utils/advisor.js'
import { getAgentContext } from 'src/utils/agentContext.js'
import { isClaudeAISubscriber } from 'src/utils/auth.js'
import {
  getToolSearchBetaHeader,
  modelSupportsStructuredOutputs,
  shouldIncludeFirstPartyOnlyBetas,
  shouldUseGlobalCacheScope,
} from 'src/utils/betas.js'
import { CLAUDE_IN_CHROME_MCP_SERVER_NAME } from 'src/utils/claudeInChrome/common.js'
import { CHROME_TOOL_SEARCH_INSTRUCTIONS } from 'src/utils/claudeInChrome/prompt.js'
import { getMaxThinkingTokensForModel } from 'src/utils/context.js'
import { logForDebugging } from 'src/utils/debug.js'
import { logForDiagnosticsNoPII } from 'src/utils/diagLogs.js'
import { type EffortValue, modelSupportsEffort } from 'src/utils/effort.js'
import {
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
  isFastModeSupportedByModel,
} from 'src/utils/fastMode.js'
import { returnValue } from 'src/utils/generators.js'
import { headlessProfilerCheckpoint } from 'src/utils/headlessProfiler.js'
import { isMcpInstructionsDeltaEnabled } from 'src/utils/mcpInstructionsDelta.js'
import { calculateUSDCost } from 'src/utils/modelCost.js'
import { endQueryProfile, queryCheckpoint } from 'src/utils/queryProfiler.js'
import {
  modelSupportsAdaptiveThinking,
  modelSupportsThinking,
  type ThinkingConfig,
} from 'src/utils/thinking.js'
import {
  extractDiscoveredToolNames,
  isDeferredToolsDeltaEnabled,
  isToolSearchEnabled,
} from 'src/utils/toolSearch.js'
import { API_MAX_MEDIA_PER_REQUEST } from '../../constants/apiLimits.js'
import { ADVISOR_BETA_HEADER } from '../../constants/betas.js'
import {
  formatDeferredToolLine,
  isDeferredTool,
  TOOL_SEARCH_TOOL_NAME,
} from '@claude-code-best/builtin-tools/tools/ToolSearchTool/prompt.js'
import { count } from '../../utils/array.js'
import { insertBlockAfterToolResults } from '../../utils/contentArray.js'
import { validateBoundedIntEnvVar } from '../../utils/envValidation.js'
import { safeParseJSON } from '../../utils/json.js'
import { getInferenceProfileBackingModel } from '../../utils/model/bedrock.js'
import {
  normalizeModelStringForAPI,
  parseUserSpecifiedModel,
} from '../../utils/model/model.js'
import {
  startSessionActivity,
  stopSessionActivity,
} from '../../utils/sessionActivity.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  isBetaTracingEnabled,
  type LLMRequestNewContext,
  startLLMRequestSpan,
} from '../../utils/telemetry/sessionTracing.js'
/* eslint-enable @typescript-eslint/no-require-imports */
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import {
  consumePendingCacheEdits,
  getPinnedCacheEdits,
  markToolsSentToAPIState,
  pinCacheEdits,
} from '../compact/microCompact.js'
import { getInitializationStatus } from '../lsp/manager.js'
import { isToolFromMcpServer } from '../mcp/utils.js'
import { recordLLMObservation } from '../langfuse/index.js'
import type { LangfuseSpan } from '../langfuse/index.js'
import {
  convertMessagesToLangfuse,
  convertOutputToLangfuse,
  convertToolsToLangfuse,
} from '../langfuse/convert.js'
import { withStreamingVCR, withVCR } from '../vcr.js'
import { CLIENT_REQUEST_ID_HEADER, getAnthropicClient } from './client.js'
import {
  API_ERROR_MESSAGE_PREFIX,
  CUSTOM_OFF_SWITCH_MESSAGE,
  getAssistantMessageFromError,
  getErrorMessageIfRefusal,
} from './errors.js'
import {
  EMPTY_USAGE,
  type GlobalCacheStrategy,
  logAPIError,
  logAPIQuery,
  logAPISuccessAndDuration,
  type NonNullableUsage,
} from './logging.js'
import {
  CACHE_TTL_1HOUR_MS,
  checkResponseForCacheBreak,
  recordPromptState,
} from './promptCacheBreakDetection.js'
import {
  CannotRetryError,
  FallbackTriggeredError,
  is529Error,
  type RetryContext,
  withRetry,
} from './withRetry.js'

// 定义表示有效 JSON 值的类型
type JsonValue = string | number | boolean | null | JsonObject | JsonArray
type JsonObject = { [key: string]: JsonValue }
type JsonArray = JsonValue[]

/** 根据 CLAUDE_CODE_EXTRA_BODY 环境变量（如果存在）以及任何 beta 标头（主要用于 Bedrock 请求），组装 API 请求的额外主体参数。

@param betaHeaders - 要包含在请求中的 beta 标头数组。
@returns 表示额外主体参数的 JSON 对象。 */
export function getExtraBodyParams(betaHeaders?: string[]): JsonObject {
  // 首先解析用户的额外主体参数
  const extraBodyStr = process.env.CLAUDE_CODE_EXTRA_BODY
  let result: JsonObject = {}

  if (extraBodyStr) {
    try {
      // 解析为 JSON，可以是 null、布尔值、数字、字符串、数组或对象
      const parsed = safeParseJSON(extraBodyStr)
      // 期望得到一个包含键值对的对象，以便展开到 API 参数中
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // 浅克隆 — safeParseJSON 是 LRU 缓存
        // 的，对于相同的字符串返回相同的对象引用。下面修改 `
        // result` 会污染缓存，导致陈旧值持久存在。
        result = { ...(parsed as JsonObject) }
      } else {
        logForDebugging(
          `CLAUDE_CODE_EXTRA_BODY 环境变量必须是 JSON 对象，但实际为 ${extraBodyStr}`,
          { level: 'error' },
        )
      }
    } catch (error) {
      logForDebugging(
        `解析 CLAUDE_CODE_EXTRA_BODY 时出错：${errorMessage(error)}`,
        { level: 'error' },
      )
    }
  }

  // 处理提供的 beta 标头
  if (betaHeaders && betaHeaders.length > 0) {
    if (result.anthropic_beta && Array.isArray(result.anthropic_beta)) {
      // 添加到现有数组，避免重复
      const existingHeaders = result.anthropic_beta as string[]
      const newHeaders = betaHeaders.filter(
        header => !existingHeaders.includes(header),
      )
      result.anthropic_beta = [...existingHeaders, ...newHeaders]
    } else {
      // 使用 beta 标头创建新数组
      result.anthropic_beta = betaHeaders
    }
  }

  return result
}
//是否关闭了模型提示词缓存。
export function getPromptCachingEnabled(model: string): boolean {
  // 全局禁用优先
  if (isEnvTruthy(process.env.DISABLE_PROMPT_CACHING)) return false

  // 检查是否应为小型/快速模型禁用
  if (isEnvTruthy(process.env.DISABLE_PROMPT_CACHING_HAIKU)) {
    const smallFastModel = getSmallFastModel()
    if (model === smallFastModel) return false
  }

  // 检查是否应为默认 Sonnet 禁用
  if (isEnvTruthy(process.env.DISABLE_PROMPT_CACHING_SONNET)) {
    const defaultSonnet = getDefaultSonnetModel()
    if (model === defaultSonnet) return false
  }

  // 检查是否应为默认 Opus 禁用
  if (isEnvTruthy(process.env.DISABLE_PROMPT_CACHING_OPUS)) {
    const defaultOpus = getDefaultOpusModel()
    if (model === defaultOpus) return false
  }

  return true
}

export function getCacheControl({
  scope,
  querySource,
}: {
  scope?: CacheScope
  querySource?: QuerySource
} = {}): {
  type: 'ephemeral'
  ttl?: '1h'
  scope?: CacheScope
} {
  return {
    type: 'ephemeral',
    ...(should1hCacheTTL(querySource) && { ttl: '1h' }),
    ...(scope === 'global' && { scope }),
  }
}

/** 确定是否应为提示缓存使用 1 小时 TTL。

仅在以下情况下应用：
1. 用户符合条件（在速率限制内的 ant 或订阅者）
2. 查询源匹配 GrowthBook 允许列表中的模式

GrowthBook 配置形状：{ allowlist: string[] }
模式支持尾部 '*' 进行前缀匹配。
示例：
- { allowlist: ["repl_main_thread*", "sdk"] } — 仅主线程 + SDK
- { allowlist: ["repl_main_thread*", "sdk", "agent:*"] } — 还包括子代理
- { allowlist: ["*"] } — 所有来源

允许列表缓存在 STATE 中以保持会话稳定性 — 防止 GrowthBook 的磁盘缓存在请求中途更新时产生混合 TTL。 */
function should1hCacheTTL(querySource?: QuerySource): boolean {
  // 3P Bedrock 用户在选择加入环境变量时获得 1 小时 TTL — 他们管理自己的计费
  // 。无需 GrowthBook 门控，因为 3P 用户没有配置 GrowthBook
  if (
    getAPIProvider() === 'bedrock' &&
    isEnvTruthy(process.env.ENABLE_PROMPT_CACHING_1H_BEDROCK)
  ) {
    return true
  }

  // 在引导状态中锁定资格以保持会话稳定性 — 防止会话中途的超
  // 额翻转更改 cache_control TTL，这会破坏服
  // 务器端提示缓存（每次翻转约 20K 个 token）。
  let userEligible = getPromptCache1hEligible()
  if (userEligible === null) {
    userEligible =
      process.env.USER_TYPE === 'ant' ||
      (isClaudeAISubscriber() && !currentLimits.isUsingOverage)
    setPromptCache1hEligible(userEligible)
  }
  if (!userEligible) return false

  // 在引导状态中缓存允许列表以保持会话稳定性 — 防止 GrowthBook
  // 的磁盘缓存在请求中途更新时产生混合 TTL
  let allowlist = getPromptCache1hAllowlist()
  if (allowlist === null) {
    const config = getFeatureValue_CACHED_MAY_BE_STALE<{
      allowlist?: string[]
    }>('tengu_prompt_cache_1h_config', {})
    allowlist = config.allowlist ?? []
    setPromptCache1hAllowlist(allowlist)
  }

  return (
    querySource !== undefined &&
    allowlist.some(pattern =>
      pattern.endsWith('*')
        ? querySource.startsWith(pattern.slice(0, -1))
        : querySource === pattern,
    )
  )
}

/** 配置 API 请求的 effort 参数。 */
function configureEffortParams(
  effortValue: EffortValue | undefined,
  outputConfig: BetaOutputConfig,
  extraBodyParams: Record<string, unknown>,
  betas: string[],
  model: string,
): void {
  if (!modelSupportsEffort(model) || 'effort' in outputConfig) {
    return
  }

  if (effortValue === undefined) {
    betas.push(EFFORT_BETA_HEADER)
  } else if (typeof effortValue === 'string') {
    // Send string effort level as is
    outputConfig.effort = effortValue as 'high' | 'medium' | 'low' | 'max'
    betas.push(EFFORT_BETA_HEADER)
  } else if (process.env.USER_TYPE === 'ant') {
    // 数字类型的 effort 覆盖 — 仅限 ant（使用 anthropic_internal）
    const existingInternal =
      (extraBodyParams.anthropic_internal as Record<string, unknown>) || {}
    extraBodyParams.anthropic_internal = {
      ...existingInternal,
      effort_override: effortValue,
    }
  }
}

// output_config.task_budget — 面向模型的 API 端 token 预算感知。Sta
// inless SDK 类型尚不包含 BetaOutputConfig 上的 task_budget，因此我们在本
// 地定义线缆形状并进行类型转换。API 在接收时进行验证；请参阅单体仓库中的 api/api/schemas/
// messages/request/output_config.py:12-39。Beta：task-bud
// gets-2026-03-13（EAP，截至 2026 年 3 月仅限 claude-strudel-eap）。
type TaskBudgetParam = {
  type: 'tokens'
  total: number
  remaining?: number
}

export function configureTaskBudgetParams(
  taskBudget: Options['taskBudget'],
  outputConfig: BetaOutputConfig & { task_budget?: TaskBudgetParam },
  betas: string[],
): void {
  if (
    !taskBudget ||
    'task_budget' in outputConfig ||
    !shouldIncludeFirstPartyOnlyBetas()
  ) {
    return
  }
  outputConfig.task_budget = {
    type: 'tokens',
    total: taskBudget.total,
    ...(taskBudget.remaining !== undefined && {
      remaining: taskBudget.remaining,
    }),
  }
  if (!betas.includes(TASK_BUDGETS_BETA_HEADER)) {
    betas.push(TASK_BUDGETS_BETA_HEADER)
  }
}

export function getAPIMetadata() {
  // https://docs.google.com/document/d/1dURO9ycXXQCBS0V4Vhl4poDBRgkelFc5t2BNPoEgH5Q/edit?tab=t.0#heading=h.5g7nec5b09w5
  let extra: JsonObject = {}
  const extraStr = process.env.CLAUDE_CODE_EXTRA_METADATA
  if (extraStr) {
    const parsed = safeParseJSON(extraStr, false)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      extra = parsed as JsonObject
    } else {
      logForDebugging(
        `CLAUDE_CODE_EXTRA_METADATA 环境变量必须是 JSON 对象，但实际为 ${extraStr}`,
        { level: 'error' },
      )
    }
  }

  return {
    user_id: jsonStringify({
      ...extra,
      device_id: getOrCreateUserID(),
      // 仅在主动使用 OAuth 身份验证时包含 OAuth 账户 UUID
      account_uuid: getOauthAccountInfo()?.accountUuid ?? '',
      session_id: getSessionId(),
    }),
  }
}

export async function verifyApiKey(
  apiKey: string,
  isNonInteractiveSession: boolean,
): Promise<boolean> {
  // 如果在打印模式下运行（isNonInteractiveSession），则跳过 API 验证
  if (isNonInteractiveSession) {
    return true
  }

  try {
    // 警告：如果你将其更改为使用非 Haiku 模型，除非使用 getCLISyspromptPrefix，否则此请求将在 1P 中失败。
    const model = getSmallFastModel()
    const betas = getModelBetas(model)
    return await returnValue(
      withRetry(
        () =>
          getAnthropicClient({
            apiKey,
            maxRetries: 3,
            model,
            source: 'verify_api_key',
          }),
        async anthropic => {
          const messages: MessageParam[] = [{ role: 'user', content: 'test' }]
          await anthropic.beta.messages.create({
            model,
            max_tokens: 1,
            messages,
            temperature: 1,
            ...(betas.length > 0 && { betas: betas.filter(Boolean) }),
            metadata: getAPIMetadata(),
            ...getExtraBodyParams(),
          })
          return true
        },
        { maxRetries: 2, model, thinkingConfig: { type: 'disabled' } }, // API 密钥验证使用更少的重试次数
      ),
    )
  } catch (errorFromRetry) {
    let error = errorFromRetry
    if (errorFromRetry instanceof CannotRetryError) {
      error = errorFromRetry.originalError
    }
    logError(error)
    // 检查身份验证错误
    if (
      error instanceof Error &&
      error.message.includes(
        '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
      )
    ) {
      return false
    }
    throw error
  }
}
//UserMessage转为模型SDK，MessageParam对象。
export function userMessageToMessageParam(
  message: UserMessage,
  addCache = false,
  enablePromptCaching: boolean,
  querySource?: QuerySource,
): MessageParam {
  if (addCache) {
    if (typeof message.message!.content === 'string') {
      return {
        role: 'user',
        content: [
          {
            type: 'text',
            text: message.message!.content,
            ...(enablePromptCaching && {
              cache_control: getCacheControl({ querySource }),
            }),
          },
        ],
      }
    } else {
      return {
        role: 'user',
        content: message.message!.content!.map((_, i) => ({
          ..._,
          ...(i === message.message!.content!.length - 1
            ? enablePromptCaching
              ? { cache_control: getCacheControl({ querySource }) }
              : {}
            : {}),
        })),
      }
    }
  }
  // 克隆数组内容以防止就地修改（例如，insertCacheEditsBlock
  // 的 splice）污染原始消息。如果不克隆，多次调用 addCacheBrea
  // kpoints 将共享同一个数组，并且每次都会拼接重复的 cache_edits。
  return {
    role: 'user',
    content: (Array.isArray(message.message!.content)
      ? [...message.message!.content]
      : message.message!
          .content) as import('@anthropic-ai/sdk/resources/beta/messages/messages.js').BetaContentBlockParam[],
  }
}

export function assistantMessageToMessageParam(
  message: AssistantMessage,
  addCache = false,
  enablePromptCaching: boolean,
  querySource?: QuerySource,
): MessageParam {
  if (addCache) {
    if (typeof message.message!.content === 'string') {
      return {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: message.message!.content,
            ...(enablePromptCaching && {
              cache_control: getCacheControl({ querySource }),
            }),
          },
        ],
      }
    } else {
      return {
        role: 'assistant',
        content: message.message!.content!.map((_, i) => {
          const contentBlock = stripGeminiProviderMetadata(_)
          return {
            ...contentBlock,
            ...(i === message.message!.content!.length - 1 &&
            contentBlock.type !== 'thinking' &&
            contentBlock.type !== 'redacted_thinking' &&
            (feature('CONNECTOR_TEXT')
              ? !isConnectorTextBlock(contentBlock)
              : true)
              ? enablePromptCaching
                ? { cache_control: getCacheControl({ querySource }) }
                : {}
              : {}),
          }
        }),
      }
    }
  }
  return {
    role: 'assistant',
    content:
      typeof message.message!.content === 'string'
        ? message.message!.content
        : (message.message!.content!.map(
            stripGeminiProviderMetadata,
          ) as BetaContentBlockParam[]),
  }
}

function stripGeminiProviderMetadata<T extends BetaContentBlockParam | string>(
  contentBlock: T,
): T {
  if (
    typeof contentBlock === 'string' ||
    !('_geminiThoughtSignature' in (contentBlock as object))
  ) {
    return contentBlock
  }

  const obj = contentBlock as unknown as Record<string, unknown>
  const { _geminiThoughtSignature: _unusedGeminiThoughtSignature, ...rest } =
    obj
  return rest as unknown as T
}

export type Options = {
  getToolPermissionContext: () => Promise<ToolPermissionContext>
  model: string
  toolChoice?: BetaToolChoiceTool | BetaToolChoiceAuto | undefined //约束本次模型是否必须调用工具。auto表示模型自动决定是否调用工具。tool表示模型必须调用工具。none表示模型不能调用工具。
  isNonInteractiveSession: boolean
  extraToolSchemas?: BetaToolUnion[]
  maxOutputTokensOverride?: number
  fallbackModel?: string
  onStreamingFallback?: () => void
  querySource: QuerySource
  agents: AgentDefinition[]
  allowedAgentTypes?: string[]
  hasAppendSystemPrompt: boolean
  fetchOverride?: ClientOptions['fetch']
  enablePromptCaching?: boolean
  skipCacheWrite?: boolean
  temperatureOverride?: number
  effortValue?: EffortValue
  mcpTools: Tools
  hasPendingMcpServers?: boolean
  queryTracking?: QueryChainTracking
  agentId?: AgentId // 仅对子代理设置
  outputFormat?: BetaJSONOutputFormat
  fastMode?: boolean
  advisorModel?: string
  addNotification?: (notif: Notification) => void
  // API 端任务预算（output_config.task_budget
  // ）。与 tokenBudget.ts +500k 自动继续功能不同 — 此值
  // 发送给 API，以便模型可以自我调节节奏。`remaining` 由调
  // 用者计算（query.ts 在代理循环中递减）。
  taskBudget?: { total: number; remaining?: number }
  /** 用于可观测性的 Langfuse 根跟踪跨度。如果为 null/undefined，则为空操作。 */
  langfuseTrace?: LangfuseSpan | null
}

export async function queryModelWithoutStreaming({
  messages,
  systemPrompt,
  thinkingConfig,
  tools,
  signal,
  options,
}: {
  messages: Message[]
  systemPrompt: SystemPrompt
  thinkingConfig: ThinkingConfig
  tools: Tools
  signal: AbortSignal
  options: Options
}): Promise<AssistantMessage> {
  // 存储助手消息，但继续消费生成器以确保 logAPISuccessA
  // ndDuration 被调用（在所有 yield 之后发生）
  let assistantMessage: AssistantMessage | undefined
  for await (const message of withStreamingVCR(messages, async function* () {
    yield* queryModel(
      messages,
      systemPrompt,
      thinkingConfig,
      tools,
      signal,
      options,
    )
  })) {
    if (message.type === 'assistant') {
      assistantMessage = message as AssistantMessage
    }
  }
  if (!assistantMessage) {
    // 如果信号被中止，则抛出 APIUserAbortError 而
    // 不是通用错误。这允许调用者优雅地处理中止场景
    if (signal.aborted) {
      throw new APIUserAbortError()
    }
    throw new Error('未找到助手消息')
  }
  return assistantMessage
}

export async function* queryModelWithStreaming({
  messages,
  systemPrompt,
  thinkingConfig,
  tools,
  signal,
  options,
}: {
  messages: Message[]
  systemPrompt: SystemPrompt
  thinkingConfig: ThinkingConfig
  tools: Tools
  signal: AbortSignal
  options: Options
}): AsyncGenerator<
  StreamEvent | AssistantMessage | SystemAPIErrorMessage,
  void
> {
  return yield* withStreamingVCR(messages, async function* () {
    yield* queryModel(
      messages,
      systemPrompt,
      thinkingConfig,
      tools,
      signal,
      options,
    )
  })
}

/** 确定是否应延迟 LSP 工具（工具显示为 defer_loading: true），因为 LSP 初始化尚未完成。 */
function shouldDeferLspTool(tool: Tool): boolean {
  if (!('isLsp' in tool) || !tool.isLsp) {
    return false
  }
  const status = getInitializationStatus()
  // 当状态为待定或未开始时延迟
  return status.status === 'pending' || status.status === 'not-started'
}

/** 非流式回退请求的每次尝试超时时间（毫秒）。
设置 API_TIMEOUT_MS 时读取该值，以便慢速后端和流式路径共享相同的上限。

远程会话默认为 120 秒，以保持在 CCR 的容器空闲终止时间（约 5 分钟）之下，因此挂起的回退到卡住的后端会显示清晰的 APIConnectionTimeoutError，而不是在 SIGKILL 之后停滞。

否则默认为 300 秒 — 足够长以应对慢速后端，同时不会接近 API 的 10 分钟非流式边界。 */
function getNonstreamingFallbackTimeoutMs(): number {
  const override = parseInt(process.env.API_TIMEOUT_MS || '', 10)
  if (override) return override
  return isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ? 120_000 : 300_000
}

/** 非流式 API 请求的辅助生成器。
封装了常见模式：创建 withRetry 生成器，迭代以生成系统消息，并返回最终的 BetaMessage。 */
export async function* executeNonStreamingRequest(
  clientOptions: {
    model: string
    fetchOverride?: Options['fetchOverride']
    source: string
  },
  retryOptions: {
    model: string
    fallbackModel?: string
    thinkingConfig: ThinkingConfig
    fastMode?: boolean
    signal: AbortSignal
    initialConsecutive529Errors?: number
    querySource?: QuerySource
  },
  paramsFromContext: (context: RetryContext) => BetaMessageStreamParams,
  onAttempt: (attempt: number, start: number, maxOutputTokens: number) => void,
  captureRequest: (params: BetaMessageStreamParams) => void,
  /** 此回退正在恢复的失败流式尝试的请求 ID。在 tengu_nonstreaming_fallback_error 中发出，用于漏斗关联。 */
  originatingRequestId?: string | null,
): AsyncGenerator<SystemAPIErrorMessage, BetaMessage> {
  const fallbackTimeoutMs = getNonstreamingFallbackTimeoutMs()
  const generator = withRetry(
    () =>
      getAnthropicClient({
        maxRetries: 0,
        model: clientOptions.model,
        fetchOverride: clientOptions.fetchOverride,
        source: clientOptions.source,
      }),
    async (anthropic, attempt, context) => {
      const start = Date.now()
      const retryParams = paramsFromContext(context)
      captureRequest(retryParams)
      onAttempt(attempt, start, retryParams.max_tokens)

      const adjustedParams = adjustParamsForNonStreaming(
        retryParams,
        MAX_NON_STREAMING_TOKENS,
      )

      try {
        return await anthropic.beta.messages.create(
          {
            ...adjustedParams,
            model: normalizeModelStringForAPI(adjustedParams.model),
          },
          {
            signal: retryOptions.signal,
            timeout: fallbackTimeoutMs,
          },
        )
      } catch (err) {
        // 用户中止不是错误 — 立即重新抛出，不记录日志
        if (err instanceof APIUserAbortError) throw err

        // 仪表化：记录非流式请求出错（包括超时）的时间
        // 。让我们区分“回退在容器终止后挂起”（无
        // 事件）与“回退达到有界超时”（此事件）。
        logForDiagnosticsNoPII('error', 'cli_nonstreaming_fallback_error')
        logEvent('tengu_nonstreaming_fallback_error', {
          model:
            clientOptions.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          error:
            err instanceof Error
              ? (err.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
              : ('unknown' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS),
          attempt,
          timeout_ms: fallbackTimeoutMs,
          request_id: (originatingRequestId ??
            'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        throw err
      }
    },
    {
      model: retryOptions.model,
      fallbackModel: retryOptions.fallbackModel,
      thinkingConfig: retryOptions.thinkingConfig,
      ...(isFastModeEnabled() && { fastMode: retryOptions.fastMode }),
      signal: retryOptions.signal,
      initialConsecutive529Errors: retryOptions.initialConsecutive529Errors,
      querySource: retryOptions.querySource,
    },
  )

  let e
  do {
    e = await generator.next()
    if (!e.done && e.value.type === 'system') {
      yield e.value
    }
  } while (!e.done)

  return e.value as BetaMessage
}

/** 从对话中最近的助手消息中提取请求 ID。用于在分析中链接连续的 API 请求，以便我们可以连接它们进行缓存命中率分析和增量 token 跟踪。

从消息数组（而非全局状态）中派生此值可确保每个查询链（主线程、子代理、队友）独立跟踪其自己的请求链，并且回滚/撤消会自然地更新该值。 */
function getPreviousRequestIdFromMessages(
  messages: Message[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!
    if (msg.type === 'assistant' && msg.requestId) {
      return msg.requestId as string
    }
  }
  return undefined
}

function isMedia(
  block: BetaContentBlockParam,
): block is BetaImageBlockParam | BetaRequestDocumentBlock {
  return block.type === 'image' || block.type === 'document'
}

function isToolResult(
  block: BetaContentBlockParam,
): block is BetaToolResultBlockParam {
  return block.type === 'tool_result'
}

/** 确保消息最多包含 `limit` 个媒体项（图像 + 文档）。
首先剥离最旧的媒体以保留最新的媒体。 */
export function stripExcessMediaItems(
  messages: (UserMessage | AssistantMessage)[],
  limit: number,
): (UserMessage | AssistantMessage)[] {
  let toRemove = 0
  for (const msg of messages) {
    if (!Array.isArray(msg.message!.content)) continue
    for (const block of msg.message!.content) {
      if (isMedia(block)) toRemove++
      if (isToolResult(block) && Array.isArray(block.content)) {
        for (const nested of block.content) {
          if (isMedia(nested as BetaContentBlockParam)) toRemove++
        }
      }
    }
  }
  toRemove -= limit
  if (toRemove <= 0) return messages

  return messages.map(msg => {
    if (toRemove <= 0) return msg
    const content = msg.message!.content
    if (!Array.isArray(content)) return msg

    const before = toRemove
    const stripped = content
      .map(block => {
        if (
          toRemove <= 0 ||
          !isToolResult(block) ||
          !Array.isArray(block.content)
        )
          return block
        const filtered = block.content.filter(n => {
          if (toRemove > 0 && isMedia(n as BetaContentBlockParam)) {
            toRemove--
            return false
          }
          return true
        })
        return filtered.length === block.content.length
          ? block
          : { ...block, content: filtered }
      })
      .filter(block => {
        if (toRemove > 0 && isMedia(block)) {
          toRemove--
          return false
        }
        return true
      })

    return before === toRemove
      ? msg
      : {
          ...msg,
          message: { ...msg.message, content: stripped },
        }
  }) as (UserMessage | AssistantMessage)[]
}

async function* queryModel(
  messages: Message[],
  systemPrompt: SystemPrompt,
  thinkingConfig: ThinkingConfig,
  tools: Tools,
  signal: AbortSignal,
  options: Options,
): AsyncGenerator<
  StreamEvent | AssistantMessage | SystemAPIErrorMessage,
  void
> {
  // 先检查廉价条件 — 关闭开关等待会阻塞 GrowthBook 初始化（
  // 约 10 毫秒）。对于非 Opus 模型（haiku、sonnet）
  // ，这完全跳过了等待。订阅者根本不会进入此路径。
  if (
    !isClaudeAISubscriber() &&
    isNonCustomOpusModel(options.model) &&
    (
      await getDynamicConfig_BLOCKS_ON_INIT<{ activated: boolean }>(
        'tengu-off-switch',
        {
          activated: false,
        },
      )
    ).activated
  ) {
    logEvent('tengu_off_switch_query', {})
    yield getAssistantMessageFromError(
      new Error(CUSTOM_OFF_SWITCH_MESSAGE),
      options.model,
    )
    return
  }

  // 从此查询链中的最后一条助手消息派生上一个请求 ID。
  // 这是按消息数组作用域的（主线程、子代理、队友各有自己的）
  // ，因此并发代理不会相互干扰对方的请求链跟踪。同
  // 时自然处理回滚/撤消，因为已删除的消息不会在数组中。
  const previousRequestId = getPreviousRequestIdFromMessages(messages)

  const resolvedModel =
    getAPIProvider() === 'bedrock' &&
    options.model.includes('application-inference-profile')
      ? ((await getInferenceProfileBackingModel(options.model)) ??
        options.model)
      : options.model

  queryCheckpoint('query_tool_schema_build_start')
  const isAgenticQuery =
    options.querySource.startsWith('repl_main_thread') ||
    options.querySource.startsWith('agent:') ||
    options.querySource === 'sdk' ||
    options.querySource === 'hook_agent' ||
    options.querySource === 'verification_agent'
  const betas = getMergedBetas(options.model, { isAgenticQuery })

  // 当 advisor 启用时，始终发送 advisor beta 标头，以便
  // 非代理查询（compact、side_question、extract_memo
  // ries 等）可以解析对话历史中已有的 advisor server_tool_use 块。
  if (isAdvisorEnabled()) {
    betas.push(ADVISOR_BETA_HEADER)
  }

  let advisorModel: string | undefined
  if (isAgenticQuery && isAdvisorEnabled()) {
    let advisorOption = options.advisorModel

    const advisorExperiment = getExperimentAdvisorModels()
    if (advisorExperiment !== undefined) {
      if (
        normalizeModelStringForAPI(advisorExperiment.baseModel) ===
        normalizeModelStringForAPI(options.model)
      ) {
        // 如果基础模型匹配，则覆盖 advisor
        // 模型。只有当用户无法自行配置时，我们
        // 才应使用实验模型。
        advisorOption = advisorExperiment.advisorModel
      }
    }

    if (advisorOption) {
      const normalizedAdvisorModel = normalizeModelStringForAPI(
        parseUserSpecifiedModel(advisorOption),
      )
      if (!modelSupportsAdvisor(options.model)) {
        logForDebugging(
          `[AdvisorTool] 跳过 advisor - 基础模型 ${options.model} 不支持 advisor`,
        )
      } else if (!isValidAdvisorModel(normalizedAdvisorModel)) {
        logForDebugging(
          `[AdvisorTool] 跳过 advisor - ${normalizedAdvisorModel} 不是有效的 advisor 模型`,
        )
      } else {
        advisorModel = normalizedAdvisorModel
        logForDebugging(
          `[AdvisorTool] 使用 ${advisorModel} 作为 advisor 模型启用了服务器端工具`,
        )
      }
    }
  }

  // 检查工具搜索是否已启用（检查模式、模型支持以及自动模式的阈值）。这是异
  // 步的，因为它可能需要为 TstAuto 模式计算 MCP 工具描述大小
  let useToolSearch = await isToolSearchEnabled(
    options.model,
    tools,
    options.getToolPermissionContext,
    options.agents,
    'query',
  )

  // 预计算一次 — isDeferredTool 每次调用执行 2 次 GrowthBook 查找
  const deferredToolNames = new Set<string>()
  if (useToolSearch) {
    for (const t of tools) {
      if (isDeferredTool(t)) deferredToolNames.add(t.name)
    }
  }

  // 即使工具搜索模式已启用，如果没有延迟工具且没有 MCP
  // 服务器仍在连接中，则跳过。当服务器处于待定状态时，保持
  // ToolSearch 可用，以便模型在工具连接后发现它们。
  if (
    useToolSearch &&
    deferredToolNames.size === 0 &&
    !options.hasPendingMcpServers
  ) {
    logForDebugging('工具搜索已禁用：没有可搜索的延迟工具')
    useToolSearch = false
  }

  // 如果此模型未启用工具搜索，则过滤掉 ToolSearchTool。
  // ToolSearchTool 返回 tool_reference 块，不支持的模型无法处理
  let filteredTools: Tools

  if (useToolSearch) {
    // 动态工具加载：仅包含已通过消息历史中的
    // tool_reference 块发现的延迟工具。这消除了预
    // 先声明所有延迟工具的需要，并移除了工具数量的限制。
    const discoveredToolNames = extractDiscoveredToolNames(messages)

    filteredTools = tools.filter(tool => {
      // 始终包含非延迟工具
      if (!deferredToolNames.has(tool.name)) return true
      // 始终包含 ToolSearchTool（以便它可以发现更多工具）
      if (toolMatchesName(tool, TOOL_SEARCH_TOOL_NAME)) return true
      // 仅包含已发现的延迟工具
      return discoveredToolNames.has(tool.name)
    })
  } else {
    filteredTools = tools.filter(
      t => !toolMatchesName(t, TOOL_SEARCH_TOOL_NAME),
    )
  }

  // 如果启用，添加工具搜索 beta 标头 — 接受 defer_loading 所必需的。标头因提供商而异：1P/
  // Foundry 使用 advanced-tool-use，Vertex/Bedrock 使用 tool-search-tool。对于
  // Bedrock，此标头必须放在 extraBodyParams 中，而不是 betas 数组中
  const toolSearchHeader = useToolSearch ? getToolSearchBetaHeader() : null
  if (toolSearchHeader && getAPIProvider() !== 'bedrock') {
    if (!betas.includes(toolSearchHeader)) {
      betas.push(toolSearchHeader)
    }
  }

  // 确定此模型是否启用了缓存的微紧凑。在此处（在异步上下文中
  // ）计算一次，并由 paramsFromContext 捕获。beta
  // 标头也在此处捕获，以避免顶层导入仅限 ant 的 CACHE_ED
  // ITING_BETA_HEADER 常量。
  let cachedMCEnabled = false
  let cacheEditingBetaHeader = ''
  if (feature('CACHED_MICROCOMPACT')) {
    const {
      isCachedMicrocompactEnabled,
      isModelSupportedForCacheEditing,
      getCachedMCConfig,
    } = await import('../compact/cachedMicrocompact.js')
    const betas = await import('src/constants/betas.js')
    cacheEditingBetaHeader = betas.CACHE_EDITING_BETA_HEADER
    const featureEnabled = isCachedMicrocompactEnabled()
    const modelSupported = isModelSupportedForCacheEditing(options.model)
    // cachedMC 需要一个非空的 beta 标头；此分支中的 CACHE_EDITING_BETA
    // _HEADER 常量为 ''（上游尚未发布实际值）。没有它，请求体中的 cache_refere
    // nce 和 cache_edits 会导致 API 400 错误：“tool_result.c
    // ache_reference: 不允许额外输入。
    const headerAvailable = !!cacheEditingBetaHeader
    cachedMCEnabled = featureEnabled && modelSupported && headerAvailable
    const config = getCachedMCConfig()
    logForDebugging(
      `Cached MC 门控：enabled=${featureEnabled} modelSupported=${modelSupported} headerAvailable=${headerAvailable} model=${options.model} supportedModels=${jsonStringify((config as Record<string, unknown>).supportedModels)}`,
    )
  }

  const useGlobalCacheFeature = shouldUseGlobalCacheScope()
  const willDefer = (t: Tool) =>
    useToolSearch && (deferredToolNames.has(t.name) || shouldDeferLspTool(t))
  // MCP 工具是每个用户的 → 动态工具部分 → 无法全局缓存。
  // 仅当 MCP 工具实际渲染（而非 defer_loading）时才进行门控。
  const needsToolBasedCacheMarker = // 开启useToolSearch时，只要有一个 isDeferredTool 为 false 的 MCP工具，filteredTools.some就是true。
    useGlobalCacheFeature && //正常的mcp工具，都是 isDeferredTool 为 true。
    filteredTools.some(t => t.isMcp === true && !willDefer(t))

  // 确保在启用全局缓存时存在 prompt_caching_scope beta 标头。
  if (
    useGlobalCacheFeature &&
    !betas.includes(PROMPT_CACHING_SCOPE_BETA_HEADER)
  ) {
    betas.push(PROMPT_CACHING_SCOPE_BETA_HEADER)
  }

  // 确定用于日志记录的全局缓存策略
  const globalCacheStrategy: GlobalCacheStrategy = useGlobalCacheFeature
    ? needsToolBasedCacheMarker
      ? 'none'
      : 'system_prompt'
    : 'none'

  // 构建工具模式，在启用工具搜索时为 MCP 工具添加 defer_loading。注意
  // ：我们将完整的 `tools` 列表（而非 filteredTools）传递给 to
  // olToAPISchema，以便 ToolSearchTool 的提示可以列出所有可用
  // 的 MCP 工具。过滤仅影响实际发送给 API 的工具，而不影响模型在工具描述中看到的内容。
  const toolSchemas = await Promise.all(
    filteredTools.map(tool =>
      toolToAPISchema(tool, {
        getToolPermissionContext: options.getToolPermissionContext,
        tools,
        agents: options.agents,
        allowedAgentTypes: options.allowedAgentTypes,
        model: options.model,
        deferLoading: willDefer(tool),
      }),
    ),
  )

  if (useToolSearch) {
    const includedDeferredTools = count(filteredTools, t =>
      deferredToolNames.has(t.name),
    )
    logForDebugging(
      `动态工具加载：包含 ${includedDeferredTools}/${deferredToolNames.size} 个延迟工具`,
    )
  }

  queryCheckpoint('query_tool_schema_build_end')

  // 在构建系统提示之前规范化消息（指纹识别所需）
  // 。仪表化：在规范化之前跟踪消息计数
  logEvent('tengu_api_before_normalize', {
    preNormalizedMessageCount: messages.length,
  })

  queryCheckpoint('query_message_normalization_start')
  let messagesForAPI = normalizeMessagesForAPI(messages, filteredTools)
  queryCheckpoint('query_message_normalization_end')

  // 特定于模型的后处理：如果所选模型不支持工具搜索
  // ，则剥离工具搜索特定字段。
  //
  // 为什么除了 normalizeMessagesForAPI
  // 之外还需要这个？ - normalizeMessagesForAPI 使用 i
  // sToolSearchEnabledNoModelCheck()，因为它从约
  // 20 个地方（分析、反馈、共享等）调用，其中许多没有模型上下文。将模型添加到其签名
  // 将是一个大型重构。 - 此后处理使用模型感知的 isToolSearch
  // Enabled() 检查 - 这处理了对话中的模型切换（例如，Sonnet →
  // Haiku），其中来自先前模型的陈旧工具搜索字段会导致 400 错误
  //
  // 注意：对于助手消息，normalizeMessagesForAPI 已经规范化了工具输入，
  // 因此 stripCallerFieldFromAssistantMessage 只需要移除
  // 'caller' 字段（无需重新规范化输入）。
  if (!useToolSearch) {
    messagesForAPI = messagesForAPI.map(msg => {
      switch (msg.type) {
        case 'user':
          // 从 tool_result 内容中剥离 tool_reference 块
          return stripToolReferenceBlocksFromUserMessage(msg)
        case 'assistant':
          // 从 tool_use 块中剥离 'caller' 字段
          return stripCallerFieldFromAssistantMessage(msg)
        default:
          return msg
      }
    })
  }

  // 修复在恢复远程/传送会话时可能发生的 tool_use/tool_resul
  // t 配对不匹配。为孤立的 tool_use 插入合成的错误 tool_res
  // ult，并剥离引用不存在的 tool_use 的孤立 tool_result。
  messagesForAPI = ensureToolResultPairing(messagesForAPI) //补充tool_use/tool_resul

  // 剥离 advisor 块 — 没有 beta 头时 API 会拒绝它们。
  if (!betas.includes(ADVISOR_BETA_HEADER)) {
    messagesForAPI = stripAdvisorBlocks(messagesForAPI)
  }

  // 在发起 API 调用之前，剥离多余的媒体项。
  // API 会拒绝包含超过 100 个媒体项的请求，但返回令人困惑的
  // 错误信息。与其报错（在 Cowork/CCD 中很难从中恢
  // 复），我们静默地丢弃最旧的媒体项以保持在限制之内。
  messagesForAPI = stripExcessMediaItems(
    messagesForAPI,
    API_MAX_MEDIA_PER_REQUEST, //媒体数量低于100
  )

  // 兼容 OpenAI 的提供者：在共享预处理（消息规范化
  // 、工具过滤、媒体剥离）之后，但在 Anthropic 特
  // 定逻辑（beta、思考、缓存）之前，委托给 OpenAI 适配层。
  if (getAPIProvider() === 'openai') {
    const { queryModelOpenAI } = await import('./openai/index.js')
    // OpenAI emulates Anthropic's dynamic tool loading client-side. It needs
    // the full tool pool so ToolSearchTool can search deferred MCP tools that
    // were intentionally filtered out of the initial API tool list above.
    yield* queryModelOpenAI(
      messagesForAPI,
      systemPrompt,
      tools,
      signal,
      options,
    )
    return
  }

  if (getAPIProvider() === 'gemini') {
    const { queryModelGemini } = await import('./gemini/index.js')
    yield* queryModelGemini(
      messagesForAPI,
      systemPrompt,
      filteredTools,
      signal,
      options,
      thinkingConfig,
    )
    return
  }

  if (getAPIProvider() === 'grok') {
    const { queryModelGrok } = await import('./grok/index.js')
    yield* queryModelGrok(
      messagesForAPI,
      systemPrompt,
      filteredTools,
      signal,
      options,
    )
    return
  }

  // 仪表化：在规范化之后跟踪消息数量
  logEvent('tengu_api_after_normalize', {
    postNormalizedMessageCount: messagesForAPI.length,
  })

  // 从第一条用户消息计算指纹以进行归因。必
  // 须在注入合成消息（例如延迟工具名称）之前运行
  // ，以便指纹反映实际的用户输入。
  const fingerprint = computeFingerprintFromMessages(messagesForAPI)

  // 当启用 delta 附件时，延迟工具通过持久化的 deferred_tools_delta 附件来宣告，
  // 而不是通过这个临时的前置内容（后者在池发生变化时会破坏缓存）。
  if (useToolSearch && !isDeferredToolsDeltaEnabled()) {
    //建议开启附件功能，不要放在这里。
    const deferredToolList = tools
      .filter(t => deferredToolNames.has(t.name))
      .map(formatDeferredToolLine)
      .sort()
      .join('\n')
    if (deferredToolList) {
      messagesForAPI = [
        createUserMessage({
          content: `<available-deferred-tools>\n${deferredToolList}\n</available-deferred-tools>`,
          isMeta: true,
        }),
        ...messagesForAPI,
      ]
    }
  }

  // Chrome 工具搜索指令：当启用 delta 附件时，这些指令作为客
  // 户端块携带在 mcp_instructions_delta (attachments.ts) 中，而不是在这里。
  // 这个每次请求的系统提示追加会在 Chrome 延迟连接时破坏提示缓存。
  const hasChromeTools = filteredTools.some(t =>
    isToolFromMcpServer(t.name, CLAUDE_IN_CHROME_MCP_SERVER_NAME),
  )
  const injectChromeHere =
    useToolSearch && hasChromeTools && !isMcpInstructionsDeltaEnabled()

  // filter(Boolean) 通过将每个元素转换为布尔值来工作——空字符串变为 false 并被过滤掉。
  systemPrompt = asSystemPrompt(
    [
      getAttributionHeader(fingerprint),
      getCLISyspromptPrefix({
        isNonInteractive: options.isNonInteractiveSession,
        hasAppendSystemPrompt: options.hasAppendSystemPrompt,
      }),
      ...systemPrompt,
      ...(advisorModel ? [ADVISOR_TOOL_INSTRUCTIONS] : []),
      ...(injectChromeHere ? [CHROME_TOOL_SEARCH_INSTRUCTIONS] : []),
    ].filter(Boolean),
  )

  // 为便于 API 识别，前置系统提示块
  logAPIPrefix(systemPrompt)

  const enablePromptCaching =
    options.enablePromptCaching ?? getPromptCachingEnabled(options.model)
  //把systemprompt分成N份，根据不同情况标记缓存类别，并告知服务器。
  const system = buildSystemPromptBlocks(systemPrompt, enablePromptCaching, {
    skipGlobalCacheForSystemPrompt: needsToolBasedCacheMarker,
    querySource: options.querySource,
  })
  const useBetas = betas.length > 0

  // 为详细追踪构建最小上下文（当启用 beta 追踪时）。注意：实际的
  //  new_context 消息提取在 sessionTracing.ts 中完成，使用基于哈希的跟踪，针
  // 对来自 messagesForAPI 数组的每个 querySource（代理）
  const extraToolSchemas = [...(options.extraToolSchemas ?? [])]
  if (advisorModel) {
    // 根据 API 契约，服务器工具必须位于 tools 数组中。
    // 在 toolSchemas（携带 cache_control 标记）之后追加，这样切换
    // /advisor 只会搅动小的后缀，而不会影响缓存的前缀。
    extraToolSchemas.push({
      type: 'advisor_20260301',
      name: 'advisor',
      model: advisorModel,
    } as unknown as BetaToolUnion)
  }
  const allTools = [...toolSchemas, ...extraToolSchemas] //传入服务工具。

  const isFastMode =
    isFastModeEnabled() &&
    isFastModeAvailable() &&
    !isFastModeCooldown() &&
    isFastModeSupportedByModel(options.model) &&
    !!options.fastMode

  // Auto beta 头的粘性锁存。每个头一旦首次发送，就会在会话的剩余时间
  // 内持续发送，这样会话中的切换不会改变服务器端缓存键并破坏约 50-7
  // 0K 个 token。锁存在 /clear 和 /compact 时通过 c
  // learBetaHeaderLatches() 清除。每次调用的门控（isA
  // genticQuery, querySource===repl_main
  // _thread）保持每次调用级别，因此非代理查询保持自己稳定的头集合。

  //控制是否开启自动模式。一旦开启，后续请求都会发送这个头。
  let afkHeaderLatched = getAfkModeHeaderLatched() === true
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    if (
      !afkHeaderLatched &&
      isAgenticQuery &&
      shouldIncludeFirstPartyOnlyBetas() &&
      (autoModeStateModule?.isAutoModeActive() ?? false) //这里对应Shift+Tab
    ) {
      afkHeaderLatched = true
      setAfkModeHeaderLatched(true)
    }
  }

  //控制是否开启快速模式。一旦开启，后续请求都会发送这个头。
  let fastModeHeaderLatched = getFastModeHeaderLatched() === true
  if (!fastModeHeaderLatched && isFastMode) {
    fastModeHeaderLatched = true
    setFastModeHeaderLatched(true)
  }

  //控制是否开启缓存编辑模式。一旦开启，后续请求都会发送这个头。
  let cacheEditingHeaderLatched = getCacheEditingHeaderLatched() === true
  if (feature('CACHED_MICROCOMPACT')) {
    //与query.ts中的deps.microcompact相同判断条件。
    if (
      !cacheEditingHeaderLatched &&
      cachedMCEnabled &&
      getAPIProvider() === 'firstParty' &&
      options.querySource === 'repl_main_thread'
    ) {
      cacheEditingHeaderLatched = true
      setCacheEditingHeaderLatched(true)
    }
  }
  //请求参数中的努力值。
  const effort = resolveAppliedEffort(options.model, options.effortValue)

  if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
    // 从哈希中排除 defer_loading 工具——API
    // 会从提示中剥离它们，因此它们永远不会影响实际的缓存键。包含
    // 它们会在发现工具或 MCP 服务器重新连接时造成错误的“工
    // 具模式已更改”中断。
    const toolsForCacheDetection = allTools.filter(
      t => !('defer_loading' in t && t.defer_loading),
    )
    // 捕获所有可能影响服务器端缓存键的内容。传递锁
    // 存后的头值（而非实时状态），以便中断检测反映
    // 我们实际发送的内容，而不是用户切换的内容。
    recordPromptState({
      system,
      toolSchemas: toolsForCacheDetection,
      querySource: options.querySource,
      model: options.model,
      agentId: options.agentId,
      fastMode: fastModeHeaderLatched,
      globalCacheStrategy,
      betas,
      autoModeActive: afkHeaderLatched,
      isUsingOverage: currentLimits.isUsingOverage ?? false,
      cachedMCEnabled: cacheEditingHeaderLatched,
      effortValue: effort,
      extraBodyParams: getExtraBodyParams(),
    })
  }
  //配合 endLLMRequestSpan用于 链路追踪 。
  const newContext: LLMRequestNewContext | undefined = isBetaTracingEnabled()
    ? {
        systemPrompt: systemPrompt.join('\n\n'),
        querySource: options.querySource,
        tools: jsonStringify(allTools),
      }
    : undefined

  // 捕获 span，以便稍后将其传递给
  // endLLMRequestSpan。这确保当多个请求并行运行时，响应与正确的请求匹配。观测/链路追踪
  const llmSpan = startLLMRequestSpan(
    options.model,
    newContext,
    messagesForAPI,
    isFastMode,
  )

  const startIncludingRetries = Date.now()
  let start = Date.now()
  let attemptNumber = 0
  const attemptStartTimes: number[] = []
  let stream: Stream<BetaRawMessageStreamEvent> | undefined
  let streamRequestId: string | null | undefined
  let clientRequestId: string | undefined
  // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins -- Response is available in Node 18+ and is used by the SDK
  let streamResponse: Response | undefined

  // 释放所有流资源以防止原生内存泄漏。Response
  // 对象持有位于 V8 堆之外的原生 TLS/套接字缓冲区（在
  // Node.js/npm 路径上观察到；参见 GH #329
  // 20），因此无论生成器如何退出，我们都必须显式取消并释放它。
  function releaseStreamResources(): void {
    cleanupStream(stream)
    stream = undefined
    if (streamResponse) {
      streamResponse.body?.cancel().catch(() => {})
      streamResponse = undefined
    }
  }

  // 在 paramsFromContext 定义之前，仅消费一次待
  // 处理的缓存编辑。paramsFromContext 会被多次调用（日
  // 志记录、重试），因此在其中消费会导致第一次调用从后续调用中窃取编辑。
  const consumedCacheEdits = cachedMCEnabled ? consumePendingCacheEdits() : null //本轮打算通过缓存编辑删掉哪些 tool_use_id。
  const consumedPinnedEdits = cachedMCEnabled ? getPinnedCacheEdits() : [] //历史的缓存编辑记录。每轮都要告诉模型。

  // 捕获上次 API 请求中发送的 beta，包括动
  // 态添加的那些，以便我们可以记录并发送到遥测。
  let lastRequestBetas: string[] | undefined

  /**
   * 1.添加各种betas：sonnet 1M，结构化beta头，快速模式，自动模式，编辑缓存。
   * 2.bedrock平台使用extraBodyParams
   * 3.构建outputConfig并，合并extraBodyParams.output_config，effort，task_budget，options.outputFormat
   * 4.最大outputTokens。
   * 5.是否开启think，think的等级是多少。
   * 6.构建contextManagement，think，tool_use，tool_result的删除策略。
   * 7.是否开启prompt缓存功能
   * 8.是不是快速模式。
   * 9.是不是自动模式。
   * 10.是否编辑缓存。
   * 11.温度传递多少值。
   * 12.message列表的处理：缓存标记cache_control，工具结果编辑标记cache_edits，给所有工具结果打上cache_reference。
   * @param retryContext
   * @returns
   */
  const paramsFromContext = (retryContext: RetryContext) => {
    const betasParams = [...betas]

    // 为 Sonnet 1M 实验动态追加 1M beta。
    if (
      !betasParams.includes(CONTEXT_1M_BETA_HEADER) &&
      getSonnet1mExpTreatmentEnabled(retryContext.model)
    ) {
      betasParams.push(CONTEXT_1M_BETA_HEADER)
    }

    // 对于 Bedrock，包括基于模型的 beta 和动态添加的工具搜索头
    const bedrockBetas =
      getAPIProvider() === 'bedrock'
        ? [
            ...getBedrockExtraBodyParamsBetas(retryContext.model),
            ...(toolSearchHeader ? [toolSearchHeader] : []),
          ]
        : []
    const extraBodyParams = getExtraBodyParams(bedrockBetas)

    const outputConfig: BetaOutputConfig = {
      ...((extraBodyParams.output_config as BetaOutputConfig) ?? {}),
    }

    configureEffortParams(
      //增加模型努力值参数。到outputConfig
      effort,
      outputConfig,
      extraBodyParams,
      betasParams,
      options.model,
    )

    configureTaskBudgetParams(
      //增加模型任务Token预算参数。到outputConfig
      options.taskBudget,
      outputConfig as BetaOutputConfig & { task_budget?: TaskBudgetParam },
      betasParams,
    )

    // 将 outputFormat 合并到 extraBodyParams.output_config 中，与 effort
    // 一起。需要 structured-outputs beta 头（根据 SDK，参见 messages.mjs 中的 parse()）
    if (options.outputFormat && !('format' in outputConfig)) {
      //合并到outputConfig
      outputConfig.format = options.outputFormat as BetaJSONOutputFormat
      // 如果尚未存在且提供者支持，则添加 beta 头
      if (
        modelSupportsStructuredOutputs(options.model) &&
        !betasParams.includes(STRUCTURED_OUTPUTS_BETA_HEADER)
      ) {
        betasParams.push(STRUCTURED_OUTPUTS_BETA_HEADER)
      }
    }

    // 重试上下文优先，因为它会尝试在超出上下文窗口限制时进行纠正
    const maxOutputTokens =
      retryContext?.maxTokensOverride ||
      options.maxOutputTokensOverride ||
      getMaxOutputTokensForModel(options.model)

    const hasThinking =
      thinkingConfig.type !== 'disabled' &&
      !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_THINKING)
    let thinking: BetaMessageStreamParams['thinking'] | undefined

    // 重要：未经通知模型发布 DRI 和研究，请勿
    // 更改下面的自适应与预算思考选择。这是一个敏感
    // 设置，会极大地影响模型质量和基准测试。
    if (hasThinking && modelSupportsThinking(options.model)) {
      if (
        !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING) &&
        modelSupportsAdaptiveThinking(options.model)
      ) {
        // 对于支持自适应思考的模型，始终使用无预
        // 算的自适应思考。
        thinking = {
          type: 'adaptive',
        } satisfies BetaMessageStreamParams['thinking']
      } else {
        // 对于不支持自适应思考的模型，除非明确指定
        // ，否则使用默认的思考预算。
        let thinkingBudget = getMaxThinkingTokensForModel(options.model)
        if (
          thinkingConfig.type === 'enabled' &&
          thinkingConfig.budgetTokens !== undefined
        ) {
          thinkingBudget = thinkingConfig.budgetTokens
        }
        thinkingBudget = Math.min(maxOutputTokens - 1, thinkingBudget)
        thinking = {
          budget_tokens: thinkingBudget,
          type: 'enabled',
        } satisfies BetaMessageStreamParams['thinking']
      }
    }

    // 如果启用，获取 API 上下文管理策略
    const contextManagement = getAPIContextManagement({
      hasThinking,
      isRedactThinkingActive: betasParams.includes(REDACT_THINKING_BETA_HEADER),
      clearAllThinking: false,
    })

    const enablePromptCaching =
      options.enablePromptCaching ?? getPromptCachingEnabled(retryContext.model)

    // 快速模式：头是锁存会话稳定的（缓存安全），但 `
    // speed='fast'` 保持动态，因此冷却仍然会抑
    // 制实际的快速模式请求，而无需更改缓存键。
    let speed: BetaMessageStreamParams['speed']
    const isFastModeForRetry =
      isFastModeEnabled() &&
      isFastModeAvailable() &&
      !isFastModeCooldown() &&
      isFastModeSupportedByModel(options.model) &&
      !!retryContext.fastMode
    if (isFastModeForRetry) {
      speed = 'fast'
    }
    if (fastModeHeaderLatched && !betasParams.includes(FAST_MODE_BETA_HEADER)) {
      betasParams.push(FAST_MODE_BETA_HEADER)
    }

    // AFK 模式 beta：一旦自动模式首次激活即锁存。仍然由每次调用的
    // isAgenticQuery 门控，因此分类器/压缩不会获得它。
    if (feature('TRANSCRIPT_CLASSIFIER')) {
      //自动模式。
      if (
        afkHeaderLatched &&
        shouldIncludeFirstPartyOnlyBetas() &&
        isAgenticQuery &&
        !betasParams.includes(AFK_MODE_BETA_HEADER)
      ) {
        betasParams.push(AFK_MODE_BETA_HEADER)
      }
    }

    // 缓存编辑 beta：头是锁存会话稳定的；useCache
    // dMC（控制 cache_edits 主体行为）保持活跃
    // ，因此当功能禁用时编辑停止，但头不会翻转。
    const useCachedMC =
      cachedMCEnabled &&
      getAPIProvider() === 'firstParty' &&
      options.querySource === 'repl_main_thread'
    if (
      cacheEditingHeaderLatched &&
      cacheEditingBetaHeader &&
      getAPIProvider() === 'firstParty' &&
      options.querySource === 'repl_main_thread' &&
      !betasParams.includes(cacheEditingBetaHeader)
    ) {
      betasParams.push(cacheEditingBetaHeader)
      logForDebugging('为缓存的微压缩启用缓存编辑 beta 头')
    }

    // 仅在禁用思考时发送 temperature——API 要求
    // 在启用思考时 temperature 为 1，这已经是默认值。
    const temperature = !hasThinking
      ? (options.temperatureOverride ?? 1)
      : undefined

    // 在发送之前过滤掉任何空字符串的 beta 头。像 CACHE_
    // EDITING_BETA_HEADER 或 AFK_MODE_BETA_
    // HEADER 这样的常量在其功能门关闭时可能为 ''；beta 数组中的
    // 空字符串会产生无效的 anthropic-beta 头（400 错误）。
    const filteredBetas = betasParams.filter(Boolean)
    lastRequestBetas = filteredBetas

    return {
      model: normalizeModelStringForAPI(options.model),
      messages: addCacheBreakpoints(
        messagesForAPI,
        enablePromptCaching,
        options.querySource,
        useCachedMC,
        consumedCacheEdits as any,
        consumedPinnedEdits as any,
        options.skipCacheWrite,
      ),
      system,
      tools: allTools,
      tool_choice: options.toolChoice, //约束模型，是否必须调用工具，以及调用哪个工具。
      ...(useBetas && { betas: filteredBetas }),
      metadata: getAPIMetadata(), //模型追踪信息。支持在环境变量中自己添加Json对象。
      max_tokens: maxOutputTokens,
      thinking,
      ...(temperature !== undefined && { temperature }),
      ...(contextManagement &&
        useBetas &&
        betasParams.includes(CONTEXT_MANAGEMENT_BETA_HEADER) && {
          context_management: contextManagement,
        }),
      ...extraBodyParams,
      ...(Object.keys(outputConfig).length > 0 && {
        output_config: outputConfig,
      }),
      ...(speed !== undefined && { speed }),
    }
  }

  // 同步计算日志标量值，以便 fire-and-forget 的 .
  // then() 闭包仅捕获原始类型，而不是捕获 paramsFromContext 的完整闭包作用域
  // （messagesForAPI、system、allTools、betas —— 整个请求构建上下文），
  // 否则这些上下文会一直被保留直到 Promise 解析。
  // 同时捕获思考参数以用于 Langfuse 可观测性。
  // 传递整个 thinking 配置对象，以便所有字段（type、budget_tokens 以及未来的任何新增字段）都能透传，无需逐个挑选。
  let langfuseThinking: BetaMessageStreamParams['thinking'] | undefined
  {
    //提前执行日志，避免大量内存被锁在后续的循环里。
    const queryParams = paramsFromContext({
      model: options.model,
      thinkingConfig,
    })
    const logMessagesLength = queryParams.messages.length
    const logBetas = useBetas ? (queryParams.betas ?? []) : []
    const logEffortValue = queryParams.output_config?.effort
    if (queryParams.thinking && queryParams.thinking.type !== 'disabled') {
      langfuseThinking = queryParams.thinking
    }
    void options.getToolPermissionContext().then(permissionContext => {
      logAPIQuery({
        model: options.model,
        messagesLength: logMessagesLength,
        temperature: options.temperatureOverride ?? 1,
        betas: logBetas,
        permissionMode: permissionContext.mode,
        querySource: options.querySource,
        queryTracking: options.queryTracking,
        thinkingConfig,
        effortValue: logEffortValue,
        fastMode: isFastMode,
        previousRequestId,
      })
    })
  }

  const newMessages: AssistantMessage[] = []
  let ttftMs = 0
  let partialMessage: BetaMessage | undefined
  const contentBlocks: (BetaContentBlock | ConnectorTextBlock)[] = []
  // Accumulate streaming deltas in arrays to avoid O(n²) string concatenation.
  // Joined and assigned to contentBlock fields at content_block_stop.
  const streamingDeltas = new Map<number, string[]>()
  let usage: NonNullableUsage = EMPTY_USAGE
  let costUSD = 0
  let stopReason: BetaStopReason | null = null
  let didFallBackToNonStreaming = false
  let fallbackMessage: AssistantMessage | undefined
  let maxOutputTokens = 0
  let responseHeaders: globalThis.Headers | undefined
  let research: unknown
  let isFastModeRequest = isFastMode // 保持独立状态，因为如果回退，它可能会改变
  let isAdvisorInProgress = false

  try {
    queryCheckpoint('query_client_creation_start')
    const generator = withRetry(
      () =>
        getAnthropicClient({
          maxRetries: 0, // 禁用自动重试，转而采用手动实现
          model: options.model,
          fetchOverride: options.fetchOverride,
          source: options.querySource,
        }),
      async (anthropic, attempt, context) => {
        attemptNumber = attempt
        isFastModeRequest = context.fastMode ?? false
        start = Date.now()
        attemptStartTimes.push(start)
        // 客户端已由 withRetry 的 getClient() 调用创建。
        // 每次尝试触发一次；在重试时，客户端通常被缓存（withRetry 仅在认
        // 证错误后再次调用 getClient()），因此 client_cre
        // ation_start 的增量在第一次尝试时有意义。
        queryCheckpoint('query_client_creation_end')

        const params = paramsFromContext(context)
        captureAPIRequest(params, options.querySource) // 为错误报告捕获

        maxOutputTokens = params.max_tokens

        // 在 fetch 被调度之前立即触发。下面的 .withResponse()
        // 会等待直到响应头到达，因此这必须在 await 之前
        // ，否则“网络 TTFB”阶段的测量是错误的。
        queryCheckpoint('query_api_request_sent')
        if (!options.agentId) {
          headlessProfilerCheckpoint('api_request_sent')
        }

        // 生成并跟踪客户端请求 ID，以便超时（不返回服务器请
        // 求 ID）仍然可以与服务器日志关联。仅限第一方—
        // —第三方提供者不记录它（inc-4029 类）。
        clientRequestId =
          getAPIProvider() === 'firstParty' && isFirstPartyAnthropicBaseUrl()
            ? randomUUID()
            : undefined

        // 使用原始流而不是 BetaMessageStream 以避免 O(n²) 的部分 JSON 解析
        // 。BetaMessageStream 在每个 input_json_delta 上调用 partialParse()，
        // 我们不需要这个，因为我们自己处理工具输入累积
        const result = await anthropic.beta.messages
          .create(
            { ...params, stream: true },
            {
              signal,
              ...(clientRequestId && {
                headers: { [CLIENT_REQUEST_ID_HEADER]: clientRequestId },
              }),
            },
          )
          .withResponse()
        queryCheckpoint('query_response_headers_received')
        streamRequestId = result.request_id
        streamResponse = result.response
        return result.data
      },
      {
        model: options.model,
        fallbackModel: options.fallbackModel,
        thinkingConfig,
        ...(isFastModeEnabled() ? { fastMode: isFastMode } : false),
        signal,
        querySource: options.querySource,
      },
    )

    let e
    do {
      //手动读取模型的响应，直到模型响应结束。
      e = await generator.next()

      // yield API 错误消息（流具有 'controller' 属性，错误消息没有）
      if (!('controller' in e.value)) {
        yield e.value
      }
    } while (!e.done)
    //将模型响应转换为流。
    stream = e.value as Stream<BetaRawMessageStreamEvent>

    // 重置状态
    newMessages.length = 0
    ttftMs = 0
    partialMessage = undefined
    contentBlocks.length = 0
    usage = EMPTY_USAGE
    stopReason = null
    isAdvisorInProgress = false

    // 流空闲超时看门狗：如果在 STREAM_IDLE_TIME
    // OUT_MS 内没有收到任何数据块，则中止流。与下面的停顿检测
    // （仅在 *下一个* 数据块到达时触发）不同，这使用 setT
    // imeout 主动杀死挂起的流。如果没有这个，静默断开的连接
    // 可能会无限期地挂起会话，因为 SDK 的请求超时仅覆盖初始的
    // fetch()，而不覆盖流式主体。
    const streamWatchdogEnabled = isEnvTruthy(
      process.env.CLAUDE_ENABLE_STREAM_WATCHDOG,
    )
    const STREAM_IDLE_TIMEOUT_MS =
      parseInt(process.env.CLAUDE_STREAM_IDLE_TIMEOUT_MS || '', 10) || 90_000
    const STREAM_IDLE_WARNING_MS = STREAM_IDLE_TIMEOUT_MS / 2
    let streamIdleAborted = false
    // 看门狗触发时的 performance.now() 快照，用于测量中止传播延迟
    let streamWatchdogFiredAt: number | null = null
    let streamIdleWarningTimer: ReturnType<typeof setTimeout> | null = null
    let streamIdleTimer: ReturnType<typeof setTimeout> | null = null
    function clearStreamIdleTimers(): void {
      if (streamIdleWarningTimer !== null) {
        clearTimeout(streamIdleWarningTimer)
        streamIdleWarningTimer = null
      }
      if (streamIdleTimer !== null) {
        clearTimeout(streamIdleTimer)
        streamIdleTimer = null
      }
    }
    function resetStreamIdleTimer(): void {
      clearStreamIdleTimers()
      if (!streamWatchdogEnabled) {
        return
      }
      streamIdleWarningTimer = setTimeout(
        warnMs => {
          logForDebugging(`流空闲警告：${warnMs / 1000}s 内未收到数据块`, {
            level: 'warn',
          })
          logForDiagnosticsNoPII('warn', 'cli_streaming_idle_warning')
        },
        STREAM_IDLE_WARNING_MS,
        STREAM_IDLE_WARNING_MS,
      )
      streamIdleTimer = setTimeout(() => {
        streamIdleAborted = true
        streamWatchdogFiredAt = performance.now()
        logForDebugging(
          `流空闲超时：${STREAM_IDLE_TIMEOUT_MS / 1000}s 内未收到数据块，正在中止流`,
          { level: 'error' },
        )
        logForDiagnosticsNoPII('error', 'cli_streaming_idle_timeout')
        logEvent('tengu_streaming_idle_timeout', {
          model:
            options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          request_id: (streamRequestId ??
            'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          timeout_ms: STREAM_IDLE_TIMEOUT_MS,
        })
        releaseStreamResources()
      }, STREAM_IDLE_TIMEOUT_MS)
    }
    resetStreamIdleTimer()

    startSessionActivity('api_call')
    try {
      // 流入并累积状态
      let isFirstChunk = true
      let lastEventTime: number | null = null // 在第一个数据块之后设置，以避免将 TTFB 测量为停顿
      const STALL_THRESHOLD_MS = 30_000 // 30 秒
      let totalStallTime = 0
      let stallCount = 0

      for await (const part of stream) {
        resetStreamIdleTimer()
        const now = Date.now()

        // 检测并记录流停顿（仅在第一个事件之后，以避免计入 TTFB）
        if (lastEventTime !== null) {
          const timeSinceLastEvent = now - lastEventTime
          if (timeSinceLastEvent > STALL_THRESHOLD_MS) {
            stallCount++
            totalStallTime += timeSinceLastEvent
            logForDebugging(
              `检测到流停顿：事件之间间隔 ${(timeSinceLastEvent / 1000).toFixed(1)}s（停顿 #${stallCount}）`,
              { level: 'warn' },
            )
            logEvent('tengu_streaming_stall', {
              stall_duration_ms: timeSinceLastEvent,
              stall_count: stallCount,
              total_stall_time_ms: totalStallTime,
              event_type:
                part.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              model:
                options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              request_id: (streamRequestId ??
                'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            })
          }
        }
        lastEventTime = now

        if (isFirstChunk) {
          logForDebugging('流已启动 - 收到第一个数据块')
          queryCheckpoint('query_first_chunk_received')
          if (!options.agentId) {
            headlessProfilerCheckpoint('first_chunk')
          }
          endQueryProfile()
          isFirstChunk = false
        }

        switch (part.type) {
          case 'message_start': {
            partialMessage = part.message
            ttftMs = Date.now() - start
            usage = updateUsage(usage, part.message?.usage)
            // 如果可用，从 message_start 捕获 resear
            // ch（仅限内部）。始终用最新值覆盖。
            if (
              process.env.USER_TYPE === 'ant' &&
              'research' in (part.message as unknown as Record<string, unknown>)
            ) {
              research = (part.message as unknown as Record<string, unknown>)
                .research
            }
            break
          }
          case 'content_block_start':
            switch (part.content_block.type) {
              case 'tool_use':
                contentBlocks[part.index] = {
                  ...part.content_block,
                  input: '',
                }
                break
              case 'server_tool_use':
                contentBlocks[part.index] = {
                  ...part.content_block,
                  input: '' as unknown as { [key: string]: unknown },
                }
                if ((part.content_block.name as string) === 'advisor') {
                  isAdvisorInProgress = true
                  logForDebugging(`[AdvisorTool] Advisor 工具已调用`)
                  logEvent('tengu_advisor_tool_call', {
                    model:
                      options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                    advisor_model: (advisorModel ??
                      'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                  })
                }
                break
              case 'text':
                contentBlocks[part.index] = {
                  ...part.content_block,
                  // 尴尬的是，SDK 有时会将文本作为 content_b
                  // lock_start 消息的一部分返回，然后在 cont
                  // ent_block_delta 消息中再次返回相同的文本。
                  // 我们在这里忽略它，因为似乎没有办法检测 content
                  // _block_delta 消息何时重复了文本。
                  text: '',
                }
                break
              case 'thinking':
                contentBlocks[part.index] = {
                  ...part.content_block,
                  // 同样尴尬
                  thinking: '',
                  // 初始化签名以确保即使 signature_delta 从未到达，该字段也存在
                  signature: '',
                }
                break
              default:
                // 更尴尬的是，SDK 在工作时会改变文本块
                // 的内容。我们希望块是不可变的，这样我们可
                // 以自己累积状态。
                contentBlocks[part.index] = { ...part.content_block }
                if (
                  (part.content_block.type as string) === 'advisor_tool_result'
                ) {
                  isAdvisorInProgress = false
                  logForDebugging(`[AdvisorTool] Advisor 工具结果已收到`)
                }
                break
            }
            // Initialize delta accumulator for this content block
            streamingDeltas.set(part.index, [])
            break
          case 'content_block_delta': {
            const contentBlock = contentBlocks[part.index]
            const delta = part.delta as typeof part.delta | ConnectorTextDelta
            if (!contentBlock) {
              logEvent('tengu_streaming_error', {
                error_type:
                  'content_block_not_found_delta' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                part_type:
                  part.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                part_index: part.index,
              })
              throw new RangeError('未找到内容块')
            }
            if (
              feature('CONNECTOR_TEXT') &&
              delta.type === 'connector_text_delta'
            ) {
              if (contentBlock.type !== 'connector_text') {
                logEvent('tengu_streaming_error', {
                  error_type:
                    'content_block_type_mismatch_connector_text' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                  expected_type:
                    'connector_text' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                  actual_type:
                    contentBlock.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                })
                throw new Error('内容块不是 connector_text 块')
              }
              streamingDeltas
                .get(part.index)
                ?.push(delta.connector_text as string)
            } else {
              switch (delta.type) {
                case 'citations_delta':
                  // TODO: 处理引用
                  break
                case 'input_json_delta':
                  if (
                    contentBlock.type !== 'tool_use' &&
                    contentBlock.type !== 'server_tool_use'
                  ) {
                    logEvent('tengu_streaming_error', {
                      error_type:
                        'content_block_type_mismatch_input_json' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                      expected_type:
                        'tool_use' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                      actual_type:
                        contentBlock.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                    })
                    throw new Error('内容块不是 input_json 块')
                  }
                  if (typeof contentBlock.input !== 'string') {
                    logEvent('tengu_streaming_error', {
                      error_type:
                        'content_block_input_not_string' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                      input_type:
                        typeof contentBlock.input as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                    })
                    throw new Error('内容块输入不是字符串')
                  }
                  streamingDeltas
                    .get(part.index)
                    ?.push(delta.partial_json as string)
                  break
                case 'text_delta':
                  if (contentBlock.type !== 'text') {
                    logEvent('tengu_streaming_error', {
                      error_type:
                        'content_block_type_mismatch_text' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                      expected_type:
                        'text' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                      actual_type:
                        contentBlock.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                    })
                    throw new Error('内容块不是文本块')
                  }
                  streamingDeltas.get(part.index)?.push(delta.text!)
                  break
                case 'signature_delta':
                  if (
                    feature('CONNECTOR_TEXT') &&
                    contentBlock.type === 'connector_text'
                  ) {
                    contentBlock.signature = delta.signature
                    break
                  }
                  if (contentBlock.type !== 'thinking') {
                    logEvent('tengu_streaming_error', {
                      error_type:
                        'content_block_type_mismatch_thinking_signature' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                      expected_type:
                        'thinking' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                      actual_type:
                        contentBlock.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                    })
                    throw new Error('内容块不是思考块')
                  }
                  contentBlock.signature = delta.signature
                  break
                case 'thinking_delta':
                  if (contentBlock.type !== 'thinking') {
                    logEvent('tengu_streaming_error', {
                      error_type:
                        'content_block_type_mismatch_thinking_delta' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                      expected_type:
                        'thinking' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                      actual_type:
                        contentBlock.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                    })
                    throw new Error('内容块不是思考块')
                  }
                  streamingDeltas.get(part.index)?.push(delta.thinking!)
                  break
              }
            }
            // 如果可用，从 content_block_delta 捕获 resea
            // rch（仅限内部）。始终用最新值覆盖。
            if (process.env.USER_TYPE === 'ant' && 'research' in part) {
              research = (part as { research: unknown }).research
            }
            break
          }
          case 'content_block_stop': {
            const contentBlock = contentBlocks[part.index]
            if (!contentBlock) {
              logEvent('tengu_streaming_error', {
                error_type:
                  'content_block_not_found_stop' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                part_type:
                  part.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                part_index: part.index,
              })
              throw new RangeError('未找到内容块')
            }
            if (!partialMessage) {
              logEvent('tengu_streaming_error', {
                error_type:
                  'partial_message_not_found' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                part_type:
                  part.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              })
              throw new Error('Message not found')
            }
            // Join accumulated streaming deltas into the contentBlock fields
            // to avoid O(n²) string concatenation during streaming.
            const deltas = streamingDeltas.get(part.index)
            if (deltas && deltas.length > 0) {
              const joined = deltas.join('')
              switch (contentBlock.type) {
                case 'text':
                  ;(contentBlock as { text: string }).text = joined
                  break
                case 'thinking':
                  ;(contentBlock as { thinking: string }).thinking = joined
                  break
                case 'tool_use':
                case 'server_tool_use':
                  contentBlock.input = joined
                  break
                default:
                  if ((contentBlock.type as string) === 'connector_text') {
                    ;(
                      contentBlock as { connector_text: string }
                    ).connector_text = joined
                  }
                  break
              }
              streamingDeltas.delete(part.index)
            }
            const m: AssistantMessage = {
              message: {
                ...partialMessage,
                usage: partialMessage.usage ?? { ...EMPTY_USAGE },
                content: normalizeContentFromAPI(
                  [contentBlock] as BetaContentBlock[],
                  tools,
                  options.agentId,
                ) as MessageContent,
              },
              requestId: streamRequestId ?? undefined,
              type: 'assistant',
              uuid: randomUUID(),
              timestamp: new Date().toISOString(),
              ...(process.env.USER_TYPE === 'ant' &&
                research !== undefined && { research }),
              ...(advisorModel && { advisorModel }),
            }
            newMessages.push(m)
            yield m
            break
          }
          case 'message_delta': {
            usage = updateUsage(usage, part.usage)
            // 如果可用，从 message_delta 捕获 research（仅限
            // 内部）。始终用最新值覆盖。同时写回已经 yield 的消息，因
            // 为 message_delta 在 content_block
            // _stop 之后到达。
            if (
              process.env.USER_TYPE === 'ant' &&
              'research' in (part as unknown as Record<string, unknown>)
            ) {
              research = (part as unknown as Record<string, unknown>).research
              for (const msg of newMessages) {
                msg.research = research
              }
            }

            // 将最终的 usage 和 stop_reason 写回最后 yield 的消息。消息在
            // content_block_stop 时从 partialMessage 创建，
            // 而 partialMessage 在 message_start 时设置，当时尚未生成任何 t
            // oken（output_tokens: 0, stop_reason: nul
            // l）。message_delta 在 content_block_stop 之后到达，带
            // 有真实值。
            //
            // 重要：使用直接属性修改，而不是对象替换。转录写入队
            // 列持有对 message.message 的引用，
            // 并延迟序列化它（100ms 刷新间隔）。对象
            // 替换（{ ...lastMsg.message,
            // usage }）会断开队列中的引用；直接修改确
            // 保转录捕获最终值。
            stopReason = part.delta.stop_reason

            const lastMsg = newMessages.at(-1)
            if (lastMsg) {
              lastMsg.message.usage = usage
              lastMsg.message.stop_reason = stopReason
            }

            // Update cost
            const costUSDForPart = calculateUSDCost(
              resolvedModel,
              usage as unknown as BetaUsage,
            )
            costUSD += addToTotalSessionCost(
              costUSDForPart,
              usage as unknown as BetaUsage,
              options.model,
            )

            const refusalMessage = getErrorMessageIfRefusal(
              part.delta.stop_reason,
              options.model,
            )
            if (refusalMessage) {
              yield refusalMessage
            }

            if (stopReason === 'max_tokens') {
              logEvent('tengu_max_tokens_reached', {
                max_tokens: maxOutputTokens,
              })
              yield createAssistantAPIErrorMessage({
                content: `${API_ERROR_MESSAGE_PREFIX}: Claude 的响应超过了 ${maxOutputTokens} 输出 token 的最大值。要配置此行为，请设置 CLAUDE_CODE_MAX_OUTPUT_TOKENS 环境变量。`,
                apiError: 'max_output_tokens',
                error: 'max_output_tokens',
              })
            }

            if (stopReason === 'model_context_window_exceeded') {
              logEvent('tengu_context_window_exceeded', {
                max_tokens: maxOutputTokens,
                output_tokens: usage.output_tokens,
              })
              // 重用 max_output_tokens 恢复路径—
              // —从模型的角度来看，两者都意味着“响应被截断，从你
              // 离开的地方继续。”
              yield createAssistantAPIErrorMessage({
                content: `${API_ERROR_MESSAGE_PREFIX}: 模型已达到其上下文窗口限制。`,
                apiError: 'max_output_tokens',
                error: 'max_output_tokens',
              })
            }
            break
          }
          case 'message_stop':
            break
        }

        yield {
          type: 'stream_event',
          event: part,
          ...(part.type === 'message_start' ? { ttftMs } : undefined),
        }
      }
      // 流循环已退出，清除空闲超时看门狗
      clearStreamIdleTimers()

      // 如果流被空闲超时看门狗中止，则回退到非
      // 流式重试，而不是将其视为已完成的流。
      if (streamIdleAborted) {
        // 仪表化：证明 for-await 在看门狗触发后退出（而非永远挂
        // 起）。exit_delay_ms 测量中止传播延迟：0-10ms
        // = 中止生效；>>1000ms = 其他事件唤醒了循环。
        const exitDelayMs =
          streamWatchdogFiredAt !== null
            ? Math.round(performance.now() - streamWatchdogFiredAt)
            : -1
        logForDiagnosticsNoPII(
          'info',
          'cli_stream_loop_exited_after_watchdog_clean',
        )
        logEvent('tengu_stream_loop_exited_after_watchdog', {
          request_id: (streamRequestId ??
            'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          exit_delay_ms: exitDelayMs,
          exit_path:
            'clean' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          model:
            options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        // 防止双重触发：此 throw 会落入下方的 catch 块，其 exit_pa
        // th='error' 探针会检查 streamWatchdogFiredAt。
        streamWatchdogFiredAt = null
        throw new Error('流空闲超时 - 未收到任何数据块')
      }

      // 检测流是否在未生成任何助手消息的情况下完成。这涵盖了两种代理故障模式：1.
      // 完全没有事件（!partialMess
      // age）：代理返回 200 但包含非 SSE 响应体 2. 部分事件（part
      // ialMessage 已设置但未完成任何内容块且未收到 stop_reaso
      // n）：代理返回了 message_start 但流在 content_bl
      // ock_stop 和带有 stop_reason 的 message
      // _delta 之前结束。BetaMessageStream 在 _endRe
      // quest() 中有第一个检查，但原始 Stream 没有——缺少它，生成器会
      // 静默地不返回任何助手消息，导致在 -p
      // 模式下出现“执行错误”。注意：我们必须检查 stopReason 以避免误
      // 报。例如，对于结构化输出（--json-schema），模型在回合 1 调用
      // StructuredOutput 工具，然后在回合 2 以 end_tu
      // rn 响应且没有内容块。这是合法的空响应，而非不完整的流。
      if (!partialMessage || (newMessages.length === 0 && !stopReason)) {
        logForDebugging(
          !partialMessage
            ? '流已完成但未收到 message_start 事件 - 触发非流式回退'
            : '流已完成且收到 message_start 但未完成任何内容块 - 触发非流式回退',
          { level: 'error' },
        )
        logEvent('tengu_stream_no_events', {
          model:
            options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          request_id: (streamRequestId ??
            'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        throw new Error('流结束但未收到任何事件')
      }

      // 如果流式传输期间发生任何停顿，记录摘要
      if (stallCount > 0) {
        logForDebugging(
          `流式传输完成，共 ${stallCount} 次停顿，总停顿时间：${(totalStallTime / 1000).toFixed(1)}s`,
          { level: 'warn' },
        )
        logEvent('tengu_streaming_stall_summary', {
          stall_count: stallCount,
          total_stall_time_ms: totalStallTime,
          model:
            options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          request_id: (streamRequestId ??
            'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
      }

      // 根据响应令牌检查缓存是否实际失效
      if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
        void checkResponseForCacheBreak(
          options.querySource,
          usage.cache_read_input_tokens,
          usage.cache_creation_input_tokens,
          messages,
          options.agentId,
          streamRequestId,
        )
      }

      // 如果可用，处理回退百分比头部和配额状态。streamResponse 在
      // withRetry 回调中创建流时设置。TypeScript 的控制流分析无法追踪 stre
      // amResponse 已在回调中设置。eslint-disable-next-line eslint-p
      // lugin-n/no-unsupported-features/node-builtins
      const resp = streamResponse as unknown as Response | undefined
      if (resp) {
        extractQuotaStatusFromHeaders(resp.headers)
        // 通过同一客户端路径（Bedrock）流转的非 Anthropic
        // 提供商暴露其自己的节流头部——让它们的适配器用其桶覆盖存储。A
        // nthropic 的适配器在 extractQuotaStatu
        // sFromHeaders 内部运行。
        if (getAPIProvider() === 'bedrock') {
          updateProviderBuckets(
            'bedrock',
            bedrockAdapter.parseHeaders(resp.headers),
          )
        }
        // 存储头部以用于网关检测
        responseHeaders = resp.headers
      }
    } catch (streamingError) {
      // 在错误路径上也清除空闲超时看门狗
      clearStreamIdleTimers()

      // 仪表化：如果看门狗已触发且 for-await 抛
      // 出异常（而非正常退出），记录循环确实已退出以及退出
      // 时间相对于看门狗触发时间。区分真正的挂起和错误退出。
      if (streamIdleAborted && streamWatchdogFiredAt !== null) {
        const exitDelayMs = Math.round(
          performance.now() - streamWatchdogFiredAt,
        )
        logForDiagnosticsNoPII(
          'info',
          'cli_stream_loop_exited_after_watchdog_error',
        )
        logEvent('tengu_stream_loop_exited_after_watchdog', {
          request_id: (streamRequestId ??
            'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          exit_delay_ms: exitDelayMs,
          exit_path:
            'error' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          error_name:
            streamingError instanceof Error
              ? (streamingError.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
              : ('unknown' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS),
          model:
            options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
      }

      if (streamingError instanceof APIUserAbortError) {
        // 检查中止信号是否由用户触发（ESC 键）。如
        // 果信号已中止，则为用户发起的中止；否则
        // ，很可能是来自 SDK 的超时。
        if (signal.aborted) {
          // 这是真正的用户中止（ESC 键被按下）
          logForDebugging(`用户中止流式传输：${errorMessage(streamingError)}`)
          if (isAdvisorInProgress) {
            logEvent('tengu_advisor_tool_interrupted', {
              model:
                options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              advisor_model: (advisorModel ??
                'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            })
          }
          throw streamingError
        } else {
          // SDK 抛出了 APIUserAbortError，但
          // 我们的信号并未中止。这意味着是 SDK 内部超时。
          logForDebugging(
            `流式传输超时（SDK 中止）：${streamingError.message}`,
            { level: 'error' },
          )
          // 为超时抛出更具体的错误
          throw new APIConnectionTimeoutError({ message: '请求超时' })
        }
      }

      // 当标志启用时，跳过非流式回退，让错误传播到 wi
      // thRetry。流中回退在流式工具执行激活时会导致
      // 工具重复执行：部分流启动一个工具，然后非流式重试
      // 产生相同的 tool_use 并再次运行它。参见
      // inc-4258。
      const disableFallback =
        isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK) ||
        getFeatureValue_CACHED_MAY_BE_STALE(
          'tengu_disable_streaming_to_non_streaming_fallback',
          false,
        )

      if (disableFallback) {
        logForDebugging(
          `流式传输错误（非流式回退已禁用）：${errorMessage(streamingError)}`,
          { level: 'error' },
        )
        logEvent('tengu_streaming_fallback_to_non_streaming', {
          model:
            options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          error:
            streamingError instanceof Error
              ? (streamingError.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
              : (String(
                  streamingError,
                ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS),
          attemptNumber,
          maxOutputTokens,
          thinkingType:
            thinkingConfig.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          ...(thinkingConfig.type === 'enabled' && {
            thinkingBudgetTokens: thinkingConfig.budgetTokens,
          }),
          fallback_disabled: true,
          request_id: (streamRequestId ??
            'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          fallback_cause: (streamIdleAborted
            ? 'watchdog'
            : 'other') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        throw streamingError
      }

      logForDebugging(
        `流式传输错误，回退到非流式模式：${errorMessage(streamingError)}`,
        { level: 'error' },
      )
      didFallBackToNonStreaming = true
      if (options.onStreamingFallback) {
        options.onStreamingFallback()
      }

      logEvent('tengu_streaming_fallback_to_non_streaming', {
        model:
          options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        error:
          streamingError instanceof Error
            ? (streamingError.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
            : (String(
                streamingError,
              ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS),
        attemptNumber,
        maxOutputTokens,
        thinkingType:
          thinkingConfig.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...(thinkingConfig.type === 'enabled' && {
          thinkingBudgetTokens: thinkingConfig.budgetTokens,
        }),
        fallback_disabled: false,
        request_id: (streamRequestId ??
          'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        fallback_cause: (streamIdleAborted
          ? 'watchdog'
          : 'other') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      // 回退到带重试的非流式模式。如果流式传输失
      // 败本身是 529，则将其计入连续 529 预算，这样无论
      // 过载是在流式还是非流式模式下发生，模型回退前的总 529
      // 次数相同。这是对 https://github.com/ant
      // hropics/claude-code/issues/1513 的推测性修复
      // 。仪表化：证明 executeNonStreamingReque
      // st 已进入（相对于回退事件触发但调用本身在调度时挂起）。
      logForDiagnosticsNoPII('info', 'cli_nonstreaming_fallback_started')
      logEvent('tengu_nonstreaming_fallback_started', {
        request_id: (streamRequestId ??
          'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        model:
          options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        fallback_cause: (streamIdleAborted
          ? 'watchdog'
          : 'other') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      const result = yield* executeNonStreamingRequest(
        { model: options.model, source: options.querySource },
        {
          model: options.model,
          fallbackModel: options.fallbackModel,
          thinkingConfig,
          ...(isFastModeEnabled() && { fastMode: isFastMode }),
          signal,
          initialConsecutive529Errors: is529Error(streamingError) ? 1 : 0,
          querySource: options.querySource,
        },
        paramsFromContext,
        (attempt, _startTime, tokens) => {
          attemptNumber = attempt
          maxOutputTokens = tokens
        },
        params => captureAPIRequest(params, options.querySource),
        streamRequestId,
      )

      const m: AssistantMessage = {
        message: {
          ...result,
          content: normalizeContentFromAPI(
            result.content,
            tools,
            options.agentId,
          ) as MessageContent,
        },
        requestId: streamRequestId ?? undefined,
        type: 'assistant',
        uuid: randomUUID(),
        timestamp: new Date().toISOString(),
        ...(process.env.USER_TYPE === 'ant' &&
          research !== undefined && {
            research,
          }),
        ...(advisorModel && {
          advisorModel,
        }),
      }
      newMessages.push(m)
      fallbackMessage = m
      yield m
    } finally {
      clearStreamIdleTimers()
    }
  } catch (errorFromRetry) {
    // FallbackTriggeredError 必须传播到
    // query.ts，由它执行实际的模型切换。在此处吞掉它
    // 会将回退变成空操作——用户只会看到“模型回退触发：X -
    // > Y”作为错误消息，而不会在回退模型上实际重试。
    if (errorFromRetry instanceof FallbackTriggeredError) {
      throw errorFromRetry
    }

    // 检查这是否是在流创建期间应触发非流式回退的 404 错误。
    // 这处理了那些对流式端点返回 404 但非流式工作正常的网关。
    // 在 v2.1.8 之前，BetaMessageStream 在
    // 迭代期间抛出 404（由内部 catch 捕获并回退），但现
    // 在使用原始流，404 在创建期间抛出（在此处捕获）。
    const is404StreamCreationError =
      !didFallBackToNonStreaming &&
      errorFromRetry instanceof CannotRetryError &&
      errorFromRetry.originalError instanceof APIError &&
      errorFromRetry.originalError.status === 404

    if (is404StreamCreationError) {
      // 404 在 streamRequestId 分配之前于 .withRespo
      // nse() 处抛出，且 CannotRetryError 意味着所有重试均
      // 失败——因此改为从错误头部获取失败请求的 ID。
      const failedRequestId =
        (errorFromRetry.originalError as APIError).requestID ?? 'unknown'
      logForDebugging('流式端点返回 404，回退到非流式模式', { level: 'warn' })
      didFallBackToNonStreaming = true
      if (options.onStreamingFallback) {
        options.onStreamingFallback()
      }

      logEvent('tengu_streaming_fallback_to_non_streaming', {
        model:
          options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        error:
          '404_stream_creation' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        attemptNumber,
        maxOutputTokens,
        thinkingType:
          thinkingConfig.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...(thinkingConfig.type === 'enabled' && {
          thinkingBudgetTokens: thinkingConfig.budgetTokens,
        }),
        request_id:
          failedRequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        fallback_cause:
          '404_stream_creation' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      try {
        // 回退到非流式模式
        const result = yield* executeNonStreamingRequest(
          { model: options.model, source: options.querySource },
          {
            model: options.model,
            fallbackModel: options.fallbackModel,
            thinkingConfig,
            ...(isFastModeEnabled() && { fastMode: isFastMode }),
            signal,
          },
          paramsFromContext,
          (attempt, _startTime, tokens) => {
            attemptNumber = attempt
            maxOutputTokens = tokens
          },
          params => captureAPIRequest(params, options.querySource),
          failedRequestId,
        )

        const m: AssistantMessage = {
          message: {
            ...result,
            content: normalizeContentFromAPI(
              result.content,
              tools,
              options.agentId,
            ) as MessageContent,
          },
          requestId: streamRequestId ?? undefined,
          type: 'assistant',
          uuid: randomUUID(),
          timestamp: new Date().toISOString(),
          ...(process.env.USER_TYPE === 'ant' &&
            research !== undefined && { research }),
          ...(advisorModel && { advisorModel }),
        }
        newMessages.push(m)
        fallbackMessage = m
        yield m

        // 继续执行下方的成功日志记录
      } catch (fallbackError) {
        // 将模型回退信号传播到 query.ts（参见上方注释）。
        if (fallbackError instanceof FallbackTriggeredError) {
          throw fallbackError
        }

        // 回退也失败，作为普通错误处理
        logForDebugging(`非流式回退也失败：${errorMessage(fallbackError)}`, {
          level: 'error',
        })

        let error = fallbackError
        let errorModel = options.model
        if (fallbackError instanceof CannotRetryError) {
          error = fallbackError.originalError
          errorModel = fallbackError.retryContext.model
        }

        if (error instanceof APIError) {
          extractQuotaStatusFromError(error)
        }

        const requestId =
          streamRequestId ||
          (error instanceof APIError ? error.requestID : undefined) ||
          (error instanceof APIError
            ? (error.error as { request_id?: string })?.request_id
            : undefined)

        logAPIError({
          error,
          model: errorModel,
          messageCount: messagesForAPI.length,
          messageTokens: tokenCountFromLastAPIResponse(messagesForAPI),
          durationMs: Date.now() - start,
          durationMsIncludingRetries: Date.now() - startIncludingRetries,
          attempt: attemptNumber,
          requestId,
          clientRequestId,
          didFallBackToNonStreaming,
          queryTracking: options.queryTracking,
          querySource: options.querySource,
          llmSpan,
          fastMode: isFastModeRequest,
          previousRequestId,
        })

        if (error instanceof APIUserAbortError) {
          releaseStreamResources()
          return
        }

        yield getAssistantMessageFromError(error, errorModel, {
          messages,
          messagesForAPI,
        })
        releaseStreamResources()
        return
      }
    } else {
      // 针对非 404 错误的原始错误处理
      logForDebugging(`API 请求错误：${errorMessage(errorFromRetry)}`, {
        level: 'error',
      })

      let error = errorFromRetry
      let errorModel = options.model
      if (errorFromRetry instanceof CannotRetryError) {
        error = errorFromRetry.originalError
        errorModel = errorFromRetry.retryContext.model
      }

      // 如果错误是速率限制错误，则从错误头部提取配额状态
      if (error instanceof APIError) {
        extractQuotaStatusFromError(error)
      }

      // 从流、错误头部或错误体中提取 requestId
      const requestId =
        streamRequestId ||
        (error instanceof APIError ? error.requestID : undefined) ||
        (error instanceof APIError
          ? (error.error as { request_id?: string })?.request_id
          : undefined)

      logAPIError({
        error,
        model: errorModel,
        messageCount: messagesForAPI.length,
        messageTokens: tokenCountFromLastAPIResponse(messagesForAPI),
        durationMs: Date.now() - start,
        durationMsIncludingRetries: Date.now() - startIncludingRetries,
        attempt: attemptNumber,
        requestId,
        clientRequestId,
        didFallBackToNonStreaming,
        queryTracking: options.queryTracking,
        querySource: options.querySource,
        llmSpan,
        fastMode: isFastModeRequest,
        previousRequestId,
      })

      // 对于用户中止，不生成助手错误消息。中断
      // 消息在 query.ts 中处理。
      if (error instanceof APIUserAbortError) {
        releaseStreamResources()
        return
      }

      yield getAssistantMessageFromError(error, errorModel, {
        messages,
        messagesForAPI,
      })
      releaseStreamResources()
      return
    }
  } finally {
    stopSessionActivity('api_call')
    // 必须位于 finally 块中：如果生成器通过 .return() 提
    // 前终止（例如消费者跳出 for-await-of 循环，或 query.
    // ts 遇到中止），try/finally 之后的代码永远不会执行。没
    // 有这个，Response 对象的原生 TLS/套接字缓冲区会泄漏，直到
    // 生成器本身被垃圾回收（参见 GH #32920）。
    releaseStreamResources()

    // 非流式回退成本：流式路径在任何 yield 之前在 message_del
    // ta 处理程序中跟踪成本。回退会推送到 newMessages 然后 yiel
    // d，因此跟踪必须在此处进行，以在 yield 处的 .return() 中幸存。
    if (fallbackMessage) {
      const fallbackUsage = fallbackMessage.message
        .usage as BetaMessageDeltaUsage
      usage = updateUsage(EMPTY_USAGE, fallbackUsage)
      stopReason = fallbackMessage.message.stop_reason as BetaStopReason
      const fallbackCost = calculateUSDCost(
        resolvedModel,
        fallbackUsage as unknown as BetaUsage,
      )
      costUSD += addToTotalSessionCost(
        fallbackCost,
        fallbackUsage as unknown as BetaUsage,
        options.model,
      )
    }
  }

  // 将所有已注册工具标记为已发送到 API，以便它们有资格被删除
  if (feature('CACHED_MICROCOMPACT') && cachedMCEnabled) {
    markToolsSentToAPIState()
  }

  // 跟踪主对话链的最后一个 requestId，以便关闭
  // 时可以发送缓存逐出提示给推理引擎。排除后台会话（C
  // trl+B），它们共享 repl_main_thre
  // ad querySource 但在代理上下文中运行——
  // 它们是独立的对话链，其缓存不应在前台会话清除时被逐出。
  if (
    streamRequestId &&
    !getAgentContext() &&
    (options.querySource.startsWith('repl_main_thread') ||
      options.querySource === 'sdk')
  ) {
    setLastMainRequestId(streamRequestId)
  }

  // 预计算标量值，以便 fire-and-forget 的 .then() 闭包不会在
  // getToolPermissionContext() 解析之前固定完整的 messag
  // esForAPI 数组（整个对话直到上下文窗口限制）。
  const logMessageCount = messagesForAPI.length
  const logMessageTokens = tokenCountFromLastAPIResponse(messagesForAPI)

  // 在 Langfuse 中记录 LLM 观察（如果未配置则为空操作）
  recordLLMObservation(options.langfuseTrace ?? null, {
    model: resolvedModel,
    provider: getAPIProvider(),
    input: convertMessagesToLangfuse(messagesForAPI, systemPrompt),
    output: convertOutputToLangfuse(newMessages),
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
    },
    startTime: new Date(startIncludingRetries),
    endTime: new Date(),
    completionStartTime: ttftMs > 0 ? new Date(start + ttftMs) : undefined,
    tools: convertToolsToLangfuse(toolSchemas as unknown[]),
    thinking: langfuseThinking,
  })

  void options.getToolPermissionContext().then(permissionContext => {
    logAPISuccessAndDuration({
      model:
        (newMessages[0]?.message.model as string | undefined) ??
        partialMessage?.model ??
        options.model,
      preNormalizedModel: options.model,
      usage,
      start,
      startIncludingRetries,
      attempt: attemptNumber,
      messageCount: logMessageCount,
      messageTokens: logMessageTokens,
      requestId: streamRequestId ?? null,
      stopReason,
      ttftMs,
      didFallBackToNonStreaming,
      querySource: options.querySource,
      headers: responseHeaders,
      costUSD,
      queryTracking: options.queryTracking,
      permissionMode: permissionContext.mode,
      // 传递 newMessages 用于 beta 追踪——仅在启用 beta 追踪
      // 时在 logging.ts 中进行提取
      newMessages,
      llmSpan,
      globalCacheStrategy,
      requestSetupMs: start - startIncludingRetries,
      attemptStartTimes,
      fastMode: isFastModeRequest,
      previousRequestId,
      betas: lastRequestBetas,
    })
  })

  // 防御性：也在正常完成时释放（如果 finally 已运行则为空操作）。
  releaseStreamResources()
}

/** 清理流资源以防止内存泄漏。
@internal 导出用于测试 */
export function cleanupStream(
  stream: Stream<BetaRawMessageStreamEvent> | undefined,
): void {
  if (!stream) {
    return
  }
  try {
    // 如果尚未中止，则通过其控制器中止流
    if (!stream.controller.signal.aborted) {
      stream.controller.abort()
    }
  } catch {
    // 忽略 - 流可能已关闭
  }
}

/** 使用来自流式 API 事件的新值更新使用统计信息。
注意：Anthropic 的流式 API 提供累积使用总量，而非增量差异。
每个事件包含到流中该点为止的完整使用情况。

与输入相关的令牌（input_tokens, cache_creation_input_tokens, cache_read_input_tokens）
通常在 message_start 中设置并保持不变。message_delta 事件可能为这些字段发送
显式的 0 值，这不应覆盖 message_start 中的值。
我们仅在这些字段具有非空、非零值时更新它们。 */
export function updateUsage(
  usage: Readonly<NonNullableUsage>,
  partUsage: BetaMessageDeltaUsage | undefined,
): NonNullableUsage {
  if (!partUsage) {
    return { ...usage }
  }
  return {
    input_tokens:
      partUsage.input_tokens !== null && partUsage.input_tokens > 0
        ? partUsage.input_tokens
        : usage.input_tokens,
    cache_creation_input_tokens:
      partUsage.cache_creation_input_tokens !== null &&
      partUsage.cache_creation_input_tokens > 0
        ? partUsage.cache_creation_input_tokens
        : usage.cache_creation_input_tokens,
    cache_read_input_tokens:
      partUsage.cache_read_input_tokens !== null &&
      partUsage.cache_read_input_tokens > 0
        ? partUsage.cache_read_input_tokens
        : usage.cache_read_input_tokens,
    output_tokens: partUsage.output_tokens ?? usage.output_tokens,
    server_tool_use: {
      web_search_requests:
        partUsage.server_tool_use?.web_search_requests ??
        usage.server_tool_use.web_search_requests,
      web_fetch_requests:
        partUsage.server_tool_use?.web_fetch_requests ??
        usage.server_tool_use.web_fetch_requests,
    },
    service_tier: usage.service_tier,
    cache_creation: {
      // SDK 类型 BetaMessageDeltaUsage 缺少 cache_creation，但它是真实存在的！
      ephemeral_1h_input_tokens:
        (partUsage as BetaUsage).cache_creation?.ephemeral_1h_input_tokens ??
        usage.cache_creation.ephemeral_1h_input_tokens,
      ephemeral_5m_input_tokens:
        (partUsage as BetaUsage).cache_creation?.ephemeral_5m_input_tokens ??
        usage.cache_creation.ephemeral_5m_input_tokens,
    },
    // cache_deleted_input_tokens：当缓存编辑删
    // 除 KV 缓存内容时由 API 返回，但不在 SDK 类型中。将其保留在
    // NonNullableUsage 之外，以便通过死代码消除从外部构建中移
    // 除该字符串。使用与其他令牌字段相同的 > 0 保护，以防止 messa
    // ge_delta 用 0 覆盖真实值。
    ...(feature('CACHED_MICROCOMPACT')
      ? {
          cache_deleted_input_tokens:
            (partUsage as unknown as { cache_deleted_input_tokens?: number })
              .cache_deleted_input_tokens != null &&
            (partUsage as unknown as { cache_deleted_input_tokens: number })
              .cache_deleted_input_tokens > 0
              ? (partUsage as unknown as { cache_deleted_input_tokens: number })
                  .cache_deleted_input_tokens
              : ((usage as unknown as { cache_deleted_input_tokens?: number })
                  .cache_deleted_input_tokens ?? 0),
        }
      : {}),
    inference_geo: usage.inference_geo,
    iterations: partUsage.iterations ?? usage.iterations,
    speed: (partUsage as BetaUsage).speed ?? usage.speed,
  }
}

/** 将一条消息的使用情况累加到一个总使用量对象中。
用于跟踪跨多个助手回合的累积使用情况。 */
export function accumulateUsage(
  totalUsage: Readonly<NonNullableUsage>,
  messageUsage: Readonly<NonNullableUsage>,
): NonNullableUsage {
  return {
    input_tokens: totalUsage.input_tokens + messageUsage.input_tokens,
    cache_creation_input_tokens:
      totalUsage.cache_creation_input_tokens +
      messageUsage.cache_creation_input_tokens,
    cache_read_input_tokens:
      totalUsage.cache_read_input_tokens + messageUsage.cache_read_input_tokens,
    output_tokens: totalUsage.output_tokens + messageUsage.output_tokens,
    server_tool_use: {
      web_search_requests:
        totalUsage.server_tool_use.web_search_requests +
        messageUsage.server_tool_use.web_search_requests,
      web_fetch_requests:
        totalUsage.server_tool_use.web_fetch_requests +
        messageUsage.server_tool_use.web_fetch_requests,
    },
    service_tier: messageUsage.service_tier, // 使用最新的服务层级
    cache_creation: {
      ephemeral_1h_input_tokens:
        totalUsage.cache_creation.ephemeral_1h_input_tokens +
        messageUsage.cache_creation.ephemeral_1h_input_tokens,
      ephemeral_5m_input_tokens:
        totalUsage.cache_creation.ephemeral_5m_input_tokens +
        messageUsage.cache_creation.ephemeral_5m_input_tokens,
    },
    // 参见 updateUsage 中的注释——该字段不在 NonNullableUsa
    // ge 上，以将字符串排除在外部构建之外。
    ...(feature('CACHED_MICROCOMPACT')
      ? {
          cache_deleted_input_tokens:
            ((totalUsage as unknown as { cache_deleted_input_tokens?: number })
              .cache_deleted_input_tokens ?? 0) +
            ((
              messageUsage as unknown as { cache_deleted_input_tokens?: number }
            ).cache_deleted_input_tokens ?? 0),
        }
      : {}),
    inference_geo: messageUsage.inference_geo, // 使用最新的
    iterations: messageUsage.iterations, // 使用最新的
    speed: messageUsage.speed, // 使用最新的
  }
}

function isToolResultBlock(
  block: unknown,
): block is { type: 'tool_result'; tool_use_id: string } {
  return (
    block !== null &&
    typeof block === 'object' &&
    'type' in block &&
    (block as { type: string }).type === 'tool_result' &&
    'tool_use_id' in block
  )
}

type CachedMCEditsBlock = {
  type: 'cache_edits'
  edits: { type: 'delete'; cache_reference: string }[]
}

type CachedMCPinnedEdits = {
  userMessageIndex: number
  block: CachedMCEditsBlock
}

// 导出用于测试 cache_reference 放置约束
/**
 * 1.告诉模型，本次缓存哪些内容。通常缓存到length-1的位置（全部内容），如果不缓存本次发送的消息，就设置到length-2的位置。
 * 2.如果开启了microcompact，则会根据messageIndex来配置cache_edits。messageIndex只关心缓存编辑消息挂载的地方，它具体要编辑哪条tool_result，由内部的cache_reference指定。
 * 3.为位于缓存前缀内的 tool_result 块添加 cache_reference（就是记录tool_use_id，cache_edits会使用该id），必须 cache_edits 插入之后执行，因为这会修改内容数组。
 * @param messages 用户消息和助手消息。
 * @param enablePromptCaching 是否开启缓存。
 * @param querySource 查询来源。
 * @param useCachedMC 是否使用缓存。
 * @param newCacheEdits 新的缓存编辑。
 * @param pinnedEdits 固定的缓存编辑。
 * @param skipCacheWrite 是否跳过缓存写入。
 * @returns 模型SDK，MessageParam对象。
 */
export function addCacheBreakpoints(
  messages: (UserMessage | AssistantMessage)[],
  enablePromptCaching: boolean,
  querySource?: QuerySource,
  useCachedMC = false,
  newCacheEdits?: CachedMCEditsBlock | null,
  pinnedEdits?: CachedMCPinnedEdits[],
  skipCacheWrite = false,
): MessageParam[] {
  logEvent('tengu_api_cache_breakpoints', {
    totalMessageCount: messages.length,
    cachingEnabled: enablePromptCaching,
    skipCacheWrite,
  })

  // 每个请求恰好一个消息级别的 cache_control 标记。
  // Mycro 的逐轮淘汰机制（page_manager/index.rs: Index::insert）会释放不在 cache_store_int_token_boundaries 中任何缓存前缀位置的本地注意力 KV 页。
  // 使用两个标记时，倒数第二个位置受到保护，
  // 其本地内容会额外存活一轮，尽管永远不会从那里恢复 —— 使用单个标记时它们会立即被释放。
  // 对于即发即弃的 fork（skipCacheWrite），我们将标记移至倒数第二条消息：
  // 这是最后一个共享前缀点，因此写入对 mycro 来说是无操作合并（条目已存在），
  // 并且 fork 不会在 KVCC 中留下自己的尾部。密集页面被引用计数，无论如何都会通过新的哈希值继续存在。
  const markerIndex = skipCacheWrite ? messages.length - 2 : messages.length - 1
  const result = messages.map((msg, index) => {
    const addCache = index === markerIndex
    if (msg.type === 'user') {
      return userMessageToMessageParam(
        msg,
        addCache,
        enablePromptCaching,
        querySource,
      )
    }
    return assistantMessageToMessageParam(
      msg,
      addCache,
      enablePromptCaching,
      querySource,
    )
  })

  if (!useCachedMC) {
    return result
  }

  // 跟踪所有正在删除的 cache_references，以防止跨块重复。
  const seenDeleteRefs = new Set<string>()

  // 辅助函数，用于对 cache_edits 块去重，排除已看到的删除
  const deduplicateEdits = (block: CachedMCEditsBlock): CachedMCEditsBlock => {
    const uniqueEdits = block.edits.filter(edit => {
      if (seenDeleteRefs.has(edit.cache_reference)) {
        return false
      }
      seenDeleteRefs.add(edit.cache_reference)
      return true
    })
    return { ...block, edits: uniqueEdits }
  }

  // 将所有先前固定的 cache_edits 重新插入到其原始位置
  for (const pinned of pinnedEdits ?? []) {
    const msg = result[pinned.userMessageIndex]
    if (msg && msg.role === 'user') {
      if (!Array.isArray(msg.content)) {
        msg.content = [{ type: 'text', text: msg.content as string }]
      }
      const dedupedBlock = deduplicateEdits(pinned.block)
      if (dedupedBlock.edits.length > 0) {
        insertBlockAfterToolResults(msg.content, dedupedBlock)
      }
    }
  }

  // 将新的 cache_edits 插入到最后一条用户消息中并固定它们
  if (newCacheEdits && result.length > 0) {
    const dedupedNewEdits = deduplicateEdits(newCacheEdits)
    if (dedupedNewEdits.edits.length > 0) {
      for (let i = result.length - 1; i >= 0; i--) {
        const msg = result[i]
        if (msg && msg.role === 'user') {
          if (!Array.isArray(msg.content)) {
            msg.content = [{ type: 'text', text: msg.content as string }]
          }
          insertBlockAfterToolResults(msg.content, dedupedNewEdits)
          // 固定，以便此块在未来的调用中重新发送到相同位置
          pinCacheEdits(i, newCacheEdits as any)

          logForDebugging(
            `已添加包含 ${dedupedNewEdits.edits.length} 次删除操作的 cache_edits 块到 message[${i}]：${dedupedNewEdits.edits.map(e => e.cache_reference).join(', ')}`,
          )
          break
        }
      }
    }
  }

  // 为位于缓存前缀内的 tool_result 块添加 cache_reference。
  // 必须在 cache_edits 插入之后执行，因为这会修改内容数组。注意：此
  // 代码仅在 useCachedMC=true 时运行（约第 3202 行提前返回）。
  if (enablePromptCaching) {
    // 查找包含 cache_control 标记的最后一条消息
    let lastCCMsg = -1
    for (let i = 0; i < result.length; i++) {
      const msg = result[i]!
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block && typeof block === 'object' && 'cache_control' in block) {
            lastCCMsg = i
          }
        }
      }
    }

    // 为严格位于最后一个 cache_control 标记之前的 tool_resu
    // lt 块添加 cache_reference。API 要求 cache_ref
    // erence 出现在最后一个 cache_control 的“之前或之上”——我们
    // 使用严格的“之前”以避免 cache_edits 拼接导致块索引偏移的边缘情况。
    //
    // 创建新对象而非原地修改，以避免污染被不
    // 支持缓存编辑功能的模型的二次查询所复用的块。
    if (lastCCMsg >= 0) {
      for (let i = 0; i < lastCCMsg; i++) {
        const msg = result[i]!
        if (msg.role !== 'user' || !Array.isArray(msg.content)) {
          continue
        }
        let cloned = false
        for (let j = 0; j < msg.content.length; j++) {
          const block = msg.content[j]
          if (block && isToolResultBlock(block)) {
            if (!cloned) {
              msg.content = [...msg.content]
              cloned = true
            }
            msg.content[j] = Object.assign({}, block, {
              cache_reference: block.tool_use_id,
            })
          }
        }
      }
    }
  }

  return result
}

export function buildSystemPromptBlocks(
  systemPrompt: SystemPrompt,
  enablePromptCaching: boolean,
  options?: {
    skipGlobalCacheForSystemPrompt?: boolean
    querySource?: QuerySource
  },
): TextBlockParam[] {
  // 重要提示：请勿再添加任何用于缓存的块，否则将收到 400 错误
  return splitSysPromptPrefix(systemPrompt, {
    skipGlobalCacheForSystemPrompt: options?.skipGlobalCacheForSystemPrompt,
  }).map(block => {
    return {
      type: 'text' as const,
      text: block.text,
      ...(enablePromptCaching &&
        block.cacheScope !== null && {
          cache_control: getCacheControl({
            scope: block.cacheScope,
            querySource: options?.querySource,
          }),
        }),
    }
  })
}

type HaikuOptions = Omit<Options, 'model' | 'getToolPermissionContext'>

/**
 * 调用大模型进行查询。
 * @param systemPrompt 系统提示词。
 * @param userPrompt 用户提示词。
 * @param outputFormat 输出格式。
 * @param signal 中止信号。
 * @param options 选项。
 * @returns 大模型返回的结果。
 */
export async function queryHaiku({
  systemPrompt = asSystemPrompt([]),
  userPrompt,
  outputFormat,
  signal,
  options,
}: {
  systemPrompt: SystemPrompt
  userPrompt: string
  outputFormat?: BetaJSONOutputFormat
  signal: AbortSignal
  options: HaikuOptions
}): Promise<AssistantMessage> {
  const result = await withVCR(
    [
      createUserMessage({
        content: systemPrompt.map(text => ({ type: 'text', text })),
      }),
      createUserMessage({
        content: userPrompt,
      }),
    ],
    async () => {
      const messages = [
        createUserMessage({
          content: userPrompt,
        }),
      ]

      const result = await queryModelWithoutStreaming({
        messages,
        systemPrompt,
        thinkingConfig: { type: 'disabled' },
        tools: [],
        signal,
        options: {
          ...options,
          model: getSmallFastModel(),
          enablePromptCaching: options.enablePromptCaching ?? false,
          outputFormat,
          async getToolPermissionContext() {
            return getEmptyToolPermissionContext()
          },
        },
      })
      return [result]
    },
  )
  // 我们不使用 Haiku 的流式传输，因此这是安全的
  return result[0]! as AssistantMessage
}

type QueryWithModelOptions = Omit<Options, 'getToolPermissionContext'>

/** 通过 Claude Code 基础设施查询特定模型。
这会经过完整的查询管道，包括适当的身份验证、
测试版和请求头——与直接 API 调用不同。 */
export async function queryWithModel({
  systemPrompt = asSystemPrompt([]),
  userPrompt,
  outputFormat,
  signal,
  options,
}: {
  systemPrompt: SystemPrompt
  userPrompt: string
  outputFormat?: BetaJSONOutputFormat
  signal: AbortSignal
  options: QueryWithModelOptions
}): Promise<AssistantMessage> {
  const result = await withVCR(
    [
      createUserMessage({
        content: systemPrompt.map(text => ({ type: 'text', text })),
      }),
      createUserMessage({
        content: userPrompt,
      }),
    ],
    async () => {
      const messages = [
        createUserMessage({
          content: userPrompt,
        }),
      ]

      const result = await queryModelWithoutStreaming({
        messages,
        systemPrompt,
        thinkingConfig: { type: 'disabled' },
        tools: [],
        signal,
        options: {
          ...options,
          enablePromptCaching: options.enablePromptCaching ?? false,
          outputFormat,
          async getToolPermissionContext() {
            return getEmptyToolPermissionContext()
          },
        },
      })
      return [result]
    },
  )
  return result[0]! as AssistantMessage
}

// 根据文档，非流式请求最长 10 分钟：
// https://platform.claude.com/docs/en/api/errors#long-requests
// SDK 的 21333 token 上限来自 10 分钟 × 128k toke
// ns/小时，但我们通过设置客户端超时来绕过它，因此可以设置更高的上限。
export const MAX_NON_STREAMING_TOKENS = 64_000

/** 当非流式回退的 max_tokens 被限制时，调整思考预算。
确保满足 API 约束：max_tokens > thinking.budget_tokens

@param params - 将发送到 API 的参数
@param maxTokensCap - 允许的最大 token 数（MAX_NON_STREAMING_TOKENS）
@returns 调整后的参数，必要时会限制思考预算 */
export function adjustParamsForNonStreaming<
  T extends {
    max_tokens: number
    thinking?: BetaMessageStreamParams['thinking']
  },
>(params: T, maxTokensCap: number): T {
  const cappedMaxTokens = Math.min(params.max_tokens, maxTokensCap)

  // 如果思考预算会超过上限 max_tokens，则调整思考预算以维持约
  // 束：max_tokens > thinking.budget_tokens
  const adjustedParams = { ...params }
  if (
    adjustedParams.thinking?.type === 'enabled' &&
    adjustedParams.thinking.budget_tokens
  ) {
    adjustedParams.thinking = {
      ...adjustedParams.thinking,
      budget_tokens: Math.min(
        adjustedParams.thinking.budget_tokens,
        cappedMaxTokens - 1, // 必须至少比 max_tokens 小 1
      ),
    }
  }

  return {
    ...adjustedParams,
    max_tokens: cappedMaxTokens,
  }
}

function isMaxTokensCapEnabled(): boolean {
  // 3P 默认值：false（在 Bedrock/Vertex 上不验证）
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_otk_slot_v1', false)
}

export function getMaxOutputTokensForModel(model: string): number {
  const maxOutputTokens = getModelMaxOutputTokens(model)

  // 槽位预留上限：将所有模型的默认值降至 8k。BQ p99 输出 = 4,911 个 t
  // oken；32k/64k 的默认值会过度预留 8-16 倍的槽位容量。达到上限的请
  // 求会在 64k 处获得一次干净的自动重试（query.ts 中的 max_o
  // utput_tokens_escalate）。Math.min 使本地默认值较低的模
  // 型（例如 claude-3-opus 的 4k）保持其本地值。此操作在环境变量覆盖
  // 之前执行，因此 CLAUDE_CODE_MAX_OUTPUT_TOKENS 仍然优先。
  const defaultTokens = isMaxTokensCapEnabled()
    ? Math.min(maxOutputTokens.default, CAPPED_DEFAULT_MAX_TOKENS)
    : maxOutputTokens.default

  const result = validateBoundedIntEnvVar(
    'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
    process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS,
    defaultTokens,
    maxOutputTokens.upperLimit,
  )
  return result.effective
}
