import { feature } from 'bun:bundle'
import type Anthropic from '@anthropic-ai/sdk'
import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk'
import type { QuerySource } from 'src/constants/querySource.js'
import type { SystemAPIErrorMessage } from 'src/types/message.js'
import { isAwsCredentialsProviderError } from 'src/utils/aws.js'
import { logForDebugging } from 'src/utils/debug.js'
import { logError } from 'src/utils/log.js'
import { createSystemAPIErrorMessage } from 'src/utils/messages.js'
import { getAPIProviderForStatsig } from 'src/utils/model/providers.js'
import {
  clearApiKeyHelperCache,
  clearAwsCredentialsCache,
  clearGcpCredentialsCache,
  getClaudeAIOAuthTokens,
  handleOAuth401Error,
  isClaudeAISubscriber,
  isEnterpriseSubscriber,
} from '../../utils/auth.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { errorMessage } from '../../utils/errors.js'
import {
  type CooldownReason,
  handleFastModeOverageRejection,
  handleFastModeRejectedByAPI,
  isFastModeCooldown,
  isFastModeEnabled,
  triggerFastModeCooldown,
} from '../../utils/fastMode.js'
import { isNonCustomOpusModel } from '../../utils/model/model.js'
import { disableKeepAlive } from '../../utils/proxy.js'
import { sleep } from '../../utils/sleep.js'
import type { ThinkingConfig } from '../../utils/thinking.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import {
  checkMockRateLimitError,
  isMockRateLimitError,
} from '../rateLimitMocking.js'
import { REPEATED_529_ERROR_MESSAGE } from './errors.js'
import { extractConnectionErrorDetails } from './errorUtils.js'

const abortError = () => new APIUserAbortError()

const DEFAULT_MAX_RETRIES = 10
const FLOOR_OUTPUT_TOKENS = 3000
const MAX_529_RETRIES = 3
export const BASE_DELAY_MS = 500

// 前台查询来源，用户正在阻塞等待结果 —— 这些来源在 529 错误时会重试。
// 其他所有内容（摘要、标题、建议、分类器）会立即退出：在容量级联期间，
// 每次重试会造成 3-10 倍网关放大，而且用户永远不会看到这些失败。
// 新来源默认为不重试 —— 仅当用户正在等待结果时才在此处添加。
const FOREGROUND_529_RETRY_SOURCES = new Set<QuerySource>([
  'repl_main_thread',
  'repl_main_thread:outputStyle:custom',
  'repl_main_thread:outputStyle:Explanatory',
  'repl_main_thread:outputStyle:Learning',
  'sdk',
  'agent:custom',
  'agent:default',
  'agent:builtin',
  'compact',
  'hook_agent',
  'hook_prompt',
  'verification_agent',
  'side_question',
  // 安全分类器 —— 必须完成以确保自动模式的正确性。
  // yoloClassifier.ts 使用 'auto_mode'（不是 'yolo_classifier' —— 那是仅类型的）。
  // bash_classifier 仅限 ant 内部；通过功能门控使得该字符串在外部构建中被摇树优化掉（excluded-strings.txt）。
  'auto_mode',
  ...(feature('BASH_CLASSIFIER') ? (['bash_classifier'] as const) : []),
])

function shouldRetry529(querySource: QuerySource | undefined): boolean {
  // undefined → 重试（对未标记的调用路径采取保守策略）
  return (
    querySource === undefined || FOREGROUND_529_RETRY_SOURCES.has(querySource)
  )
}

// CLAUDE_CODE_UNATTENDED_RETRY：用于无人值守会话（仅限 ant 内部）。无限期重试 429/529，
// 使用更长的退避时间和定期的保活 yield，以便主机环境不会在等待期间将会话标记为空闲。
// TODO(ANT-344)：通过 SystemAPIErrorMessage yield 的保活是一个临时方案，直到有专用的保活通道。
const PERSISTENT_MAX_BACKOFF_MS = 5 * 60 * 1000
const PERSISTENT_RESET_CAP_MS = 6 * 60 * 60 * 1000
const HEARTBEAT_INTERVAL_MS = 30_000

function isPersistentRetryEnabled(): boolean {
  return feature('UNATTENDED_RETRY')
    ? isEnvTruthy(process.env.CLAUDE_CODE_UNATTENDED_RETRY)
    : false
}

function isTransientCapacityError(error: unknown): boolean {
  return (
    is529Error(error) || (error instanceof APIError && error.status === 429)
  )
}

/**
 * 是否为「陈旧连接」类错误：对端已断开或本端在向已关闭的套接字写入。
 * `ECONNRESET`（连接被重置）、`EPIPE`（管道破裂）常见于空闲超时、代理/LB 掐断长连接后重试可恢复。
 *
 * @returns 仅当入参已是 `APIConnectionError` 且底层码为上述之一时为 `true`；
 *          无错误或非此类错误为 `false`（不代表「没有异常」，只代表「不是陈旧连接这一类」）。
 */
function isStaleConnectionError(error: unknown): boolean {
  if (!(error instanceof APIConnectionError)) {
    return false
  }
  const details = extractConnectionErrorDetails(error)
  return details?.code === 'ECONNRESET' || details?.code === 'EPIPE'
}

export interface RetryContext {
  maxTokensOverride?: number
  model: string
  thinkingConfig: ThinkingConfig
  fastMode?: boolean
}

interface RetryOptions {
  maxRetries?: number
  model: string
  fallbackModel?: string
  thinkingConfig: ThinkingConfig
  fastMode?: boolean
  signal?: AbortSignal
  querySource?: QuerySource
  /**
   * 预置连续的 529 错误计数。当此重试循环是非流式回退（在流式 529 之后）时使用
   * —— 流式 529 应计入 MAX_529_RETRIES，以便无论哪种请求模式遇到过载，回退前的总 529 次数保持一致。
   */
  initialConsecutive529Errors?: number
}

export class CannotRetryError extends Error {
  constructor(
    public readonly originalError: unknown,
    public readonly retryContext: RetryContext,
  ) {
    const message = errorMessage(originalError)
    super(message)
    this.name = 'RetryError'

    // 如果可用，保留原始堆栈跟踪
    if (originalError instanceof Error && originalError.stack) {
      this.stack = originalError.stack
    }
  }
}

export class FallbackTriggeredError extends Error {
  constructor(
    public readonly originalModel: string,
    public readonly fallbackModel: string,
  ) {
    super(`触发模型回退: ${originalModel} -> ${fallbackModel}`)
    this.name = 'FallbackTriggeredError'
  }
}

export async function* withRetry<T>(
  getClient: () => Promise<Anthropic>,
  operation: (
    client: Anthropic,
    attempt: number,
    context: RetryContext,
  ) => Promise<T>,
  options: RetryOptions,
): AsyncGenerator<SystemAPIErrorMessage, T> {
  const maxRetries = getMaxRetries(options)
  const retryContext: RetryContext = {
    model: options.model,
    thinkingConfig: options.thinkingConfig,
    ...(isFastModeEnabled() && { fastMode: options.fastMode }),
  }
  let client: Anthropic | null = null
  let consecutive529Errors = options.initialConsecutive529Errors ?? 0
  let lastError: unknown
  let persistentAttempt = 0
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (options.signal?.aborted) {
      throw new APIUserAbortError()
    }

    // 在此次尝试前捕获快速模式是否激活
    // （回退可能在中途改变状态）
    const wasFastModeActive = isFastModeEnabled()
      ? retryContext.fastMode && !isFastModeCooldown()
      : false

    try {
      // 检查模拟速率限制（由 /mock-limits 命令用于 Ant 员工）
      if (process.env.USER_TYPE === 'ant') {
        const mockError = checkMockRateLimitError(
          retryContext.model,
          wasFastModeActive,
        )
        if (mockError) {
          throw mockError
        }
      }

      // 在首次尝试或认证错误后获取新的客户端实例
      // - 第一方 API 认证失败的 401
      // - 403 "OAuth token has been revoked"（另一个进程刷新了令牌）
      // - Bedrock 特定的认证错误（403 或 CredentialsProviderError）
      // - Vertex 特定的认证错误（凭证刷新失败，401）
      // - ECONNRESET/EPIPE：过时的保活套接字；禁用连接池并重连
      const isStaleConnection = isStaleConnectionError(lastError)
      if (
        isStaleConnection &&
        getFeatureValue_CACHED_MAY_BE_STALE(
          'tengu_disable_keepalive_on_econnreset',
          false,
        )
      ) {
        logForDebugging('过时连接（ECONNRESET/EPIPE）—— 为重试禁用保活')
        disableKeepAlive()
      }

      if (
        client === null ||
        (lastError instanceof APIError && lastError.status === 401) ||
        isOAuthTokenRevokedError(lastError) ||
        isBedrockAuthError(lastError) ||
        isVertexAuthError(lastError) ||
        isStaleConnection
      ) {
        // 在 401“令牌已过期”或 403“令牌已撤销”时，强制刷新令牌
        if (
          (lastError instanceof APIError && lastError.status === 401) ||
          isOAuthTokenRevokedError(lastError)
        ) {
          const failedAccessToken = getClaudeAIOAuthTokens()?.accessToken
          if (failedAccessToken) {
            await handleOAuth401Error(failedAccessToken)
          }
        }
        client = await getClient()
      }

      return await operation(client, attempt, retryContext)
    } catch (error) {
      lastError = error
      logForDebugging(
        `API 错误（尝试 ${attempt}/${maxRetries + 1}）: ${error instanceof APIError ? `${error.status} ${error.message}` : errorMessage(error)}`,
        { level: 'error' },
      )

      // 快速模式回退：在 429/529 时，要么等待并重试（短延迟），
      // 要么回退到标准速度（长延迟）以避免缓存抖动。
      // 在持久模式下跳过：下面的短重试路径会在快速模式仍激活的情况下循环，因此其 `continue` 永远不会达到尝试上限，且 for 循环终止。
      // 持久会话无论如何都希望使用分块的保活路径，而不是快速模式缓存保护。
      if (
        wasFastModeActive &&
        !isPersistentRetryEnabled() &&
        error instanceof APIError &&
        (error.status === 429 || is529Error(error))
      ) {
        // 如果 429 特别因为额外使用（超额）不可用，则永久禁用快速模式并显示特定消息。
        const overageReason = error.headers?.get(
          'anthropic-ratelimit-unified-overage-disabled-reason',
        )
        if (overageReason !== null && overageReason !== undefined) {
          handleFastModeOverageRejection(overageReason)
          retryContext.fastMode = false
          continue
        }

        const retryAfterMs = getRetryAfterMs(error)
        if (retryAfterMs !== null && retryAfterMs < SHORT_RETRY_THRESHOLD_MS) {
          // 短重试延迟：等待并在快速模式仍激活时重试，以保留提示缓存（重试时使用相同的模型名称）。
          await sleep(retryAfterMs, options.signal, { abortError })
          continue
        }
        // 长或未知的重试延迟：进入冷却（切换到标准速度模型），并设置最低下限以避免来回切换。
        const cooldownMs = Math.max(
          retryAfterMs ?? DEFAULT_FAST_MODE_FALLBACK_HOLD_MS,
          MIN_COOLDOWN_MS,
        )
        const cooldownReason: CooldownReason = is529Error(error)
          ? 'overloaded'
          : 'rate_limit'
        triggerFastModeCooldown(Date.now() + cooldownMs, cooldownReason)
        if (isFastModeEnabled()) {
          retryContext.fastMode = false
        }
        continue
      }

      // 快速模式回退：如果 API 拒绝快速模式参数
      // （例如，组织未启用快速模式），则永久禁用快速模式并以标准速度重试。
      if (wasFastModeActive && isFastModeNotEnabledError(error)) {
        handleFastModeRejectedByAPI()
        retryContext.fastMode = false
        continue
      }

      // 非前台来源在 529 时立即退出 —— 在容量级联期间无重试放大。用户永远不会看到这些失败。
      if (is529Error(error) && !shouldRetry529(options.querySource)) {
        logEvent('tengu_api_529_background_dropped', {
          query_source:
            options.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        throw new CannotRetryError(error, retryContext)
      }

      // 跟踪连续的 529 错误
      if (
        is529Error(error) &&
        // 如果未设置 FALLBACK_FOR_ALL_PRIMARY_MODELS，仅在主模型是非自定义 Opus 模型时回退。
        // TODO：重新考虑 isNonCustomOpusModel 检查是否仍应存在，或者 isNonCustomOpusModel 是否是 Claude Code 硬编码在 Opus 上的过时产物。
        (process.env.FALLBACK_FOR_ALL_PRIMARY_MODELS ||
          (!isClaudeAISubscriber() && isNonCustomOpusModel(options.model)))
      ) {
        consecutive529Errors++
        if (consecutive529Errors >= MAX_529_RETRIES) {
          // 检查是否指定了回退模型
          if (options.fallbackModel) {
            logEvent('tengu_api_opus_fallback_triggered', {
              original_model:
                options.model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              fallback_model:
                options.fallbackModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              provider: getAPIProviderForStatsig(),
            })

            // 抛出特殊错误以指示已触发回退
            throw new FallbackTriggeredError(
              options.model,
              options.fallbackModel,
            )
          }

          if (
            process.env.USER_TYPE === 'external' &&
            !process.env.IS_SANDBOX &&
            !isPersistentRetryEnabled()
          ) {
            logEvent('tengu_api_custom_529_overloaded_error', {})
            throw new CannotRetryError(
              new Error(REPEATED_529_ERROR_MESSAGE),
              retryContext,
            )
          }
        }
      }

      // 仅当错误指示我们应该重试时才重试
      const persistent =
        isPersistentRetryEnabled() && isTransientCapacityError(error)
      if (attempt > maxRetries && !persistent) {
        throw new CannotRetryError(error, retryContext)
      }

      // AWS/GCP 错误不总是 APIError，但可以重试
      const handledCloudAuthError =
        handleAwsCredentialError(error) || handleGcpCredentialError(error)
      if (
        !handledCloudAuthError &&
        (!(error instanceof APIError) || !shouldRetry(error))
      ) {
        throw new CannotRetryError(error, retryContext)
      }

      // 通过为下一次尝试调整 max_tokens 来处理最大令牌上下文溢出错误
      // 注意：使用扩展上下文窗口 beta 后，不应再出现此 400 错误。
      // API 现在返回 'model_context_window_exceeded' 停止原因。为向后兼容保留。
      if (error instanceof APIError) {
        const overflowData = parseMaxTokensContextOverflowError(error)
        if (overflowData) {
          const { inputTokens, contextLimit } = overflowData

          const safetyBuffer = 1000
          const availableContext = Math.max(
            0,
            contextLimit - inputTokens - safetyBuffer,
          )
          if (availableContext < FLOOR_OUTPUT_TOKENS) {
            logError(
              new Error(
                `availableContext ${availableContext} 小于 FLOOR_OUTPUT_TOKENS ${FLOOR_OUTPUT_TOKENS}`,
              ),
            )
            throw error
          }
          // 确保我们有足够的令牌用于思考 + 至少 1 个输出令牌
          const minRequired =
            (retryContext.thinkingConfig.type === 'enabled'
              ? retryContext.thinkingConfig.budgetTokens
              : 0) + 1
          const adjustedMaxTokens = Math.max(
            FLOOR_OUTPUT_TOKENS,
            availableContext,
            minRequired,
          )
          retryContext.maxTokensOverride = adjustedMaxTokens

          logEvent('tengu_max_tokens_context_overflow_adjustment', {
            inputTokens,
            contextLimit,
            adjustedMaxTokens,
            attempt,
          })

          continue
        }
      }

      // 对于其他错误，继续正常的重试逻辑
      // 如果可用，获取 retry-after 头部
      const retryAfter = getRetryAfter(error)
      let delayMs: number
      if (persistent && error instanceof APIError && error.status === 429) {
        persistentAttempt++
        // 基于窗口的限制（例如 5 小时的 Max/Pro）包含重置时间戳。
        // 等待直到重置，而不是每 5 分钟无用地轮询。
        const resetDelay = getRateLimitResetDelayMs(error)
        delayMs =
          resetDelay ??
          Math.min(
            getRetryDelay(
              persistentAttempt,
              retryAfter,
              PERSISTENT_MAX_BACKOFF_MS,
            ),
            PERSISTENT_RESET_CAP_MS,
          )
      } else if (persistent) {
        persistentAttempt++
        // Retry-After 是服务器指令，绕过 getRetryDelay 内的 maxDelayMs
        // （遵守它是正确的）。在此处限制为 6 小时重置上限，以便病理性的头部不会无界等待。
        delayMs = Math.min(
          getRetryDelay(
            persistentAttempt,
            retryAfter,
            PERSISTENT_MAX_BACKOFF_MS,
          ),
          PERSISTENT_RESET_CAP_MS,
        )
      } else {
        delayMs = getRetryDelay(attempt, retryAfter)
      }

      // 在持久模式下，for 循环的 `attempt` 被限制在 maxRetries+1；
      // 使用 persistentAttempt 进行遥测/yield，以便显示真实计数。
      const reportedAttempt = persistent ? persistentAttempt : attempt
      logEvent('tengu_api_retry', {
        attempt: reportedAttempt,
        delayMs: delayMs,
        error: (error as APIError)
          .message as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        status: (error as APIError).status,
        provider: getAPIProviderForStatsig(),
      })

      if (persistent) {
        if (delayMs > 60_000) {
          logEvent('tengu_api_persistent_retry_wait', {
            status: (error as APIError).status,
            delayMs,
            attempt: reportedAttempt,
            provider: getAPIProviderForStatsig(),
          })
        }
        // 将长睡眠分块，以便主机看到定期的标准输出活动，不会将会话标记为空闲。
        // 每次 yield 通过 QueryEngine 在标准输出上显示为 {type:'system', subtype:'api_retry'}。
        let remaining = delayMs
        while (remaining > 0) {
          if (options.signal?.aborted) throw new APIUserAbortError()
          if (error instanceof APIError) {
            yield createSystemAPIErrorMessage(
              error,
              remaining,
              reportedAttempt,
              maxRetries,
            )
          }
          const chunk = Math.min(remaining, HEARTBEAT_INTERVAL_MS)
          await sleep(chunk, options.signal, { abortError })
          remaining -= chunk
        }
        // 限制以使 for 循环永不终止。退避使用单独的 persistentAttempt 计数器，该计数器持续增长到 5 分钟上限。
        if (attempt >= maxRetries) attempt = maxRetries
      } else {
        if (error instanceof APIError) {
          yield createSystemAPIErrorMessage(error, delayMs, attempt, maxRetries)
        }
        await sleep(delayMs, options.signal, { abortError })
      }
    }
  }

  throw new CannotRetryError(lastError, retryContext)
}

function getRetryAfter(error: unknown): string | null {
  return (
    ((error as { headers?: { 'retry-after'?: string } }).headers?.[
      'retry-after'
    ] ||
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      ((error as APIError).headers as Headers)?.get?.('retry-after')) ??
    null
  )
}

export function getRetryDelay(
  attempt: number,
  retryAfterHeader?: string | null,
  maxDelayMs = 32000,
): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10)
    if (!isNaN(seconds)) {
      return seconds * 1000
    }
  }

  const baseDelay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), maxDelayMs)
  const jitter = Math.random() * 0.25 * baseDelay
  return baseDelay + jitter
}

export function parseMaxTokensContextOverflowError(error: APIError):
  | {
      inputTokens: number
      maxTokens: number
      contextLimit: number
    }
  | undefined {
  if (error.status !== 400 || !error.message) {
    return undefined
  }

  if (
    !error.message.includes(
      'input length and `max_tokens` exceed context limit',
    )
  ) {
    return undefined
  }

  // 示例格式："input length and `max_tokens` exceed context limit: 188059 + 20000 > 200000"
  const regex =
    /input length and `max_tokens` exceed context limit: (\d+) \+ (\d+) > (\d+)/
  const match = error.message.match(regex)

  if (!match || match.length !== 4) {
    return undefined
  }

  if (!match[1] || !match[2] || !match[3]) {
    logError(
      new Error('无法从 max_tokens 超出上下文限制的错误消息中解析 max_tokens'),
    )
    return undefined
  }
  const inputTokens = parseInt(match[1], 10)
  const maxTokens = parseInt(match[2], 10)
  const contextLimit = parseInt(match[3], 10)

  if (isNaN(inputTokens) || isNaN(maxTokens) || isNaN(contextLimit)) {
    return undefined
  }

  return { inputTokens, maxTokens, contextLimit }
}

// TODO：一旦 API 添加了专用头部（例如 x-fast-mode-rejected），则替换为响应头部检查。
// 字符串匹配错误消息是脆弱的，如果 API 措辞更改则会失效。
function isFastModeNotEnabledError(error: unknown): boolean {
  if (!(error instanceof APIError)) {
    return false
  }
  return (
    error.status === 400 &&
    (error.message?.includes('Fast mode is not enabled') ?? false)
  )
}

export function is529Error(error: unknown): boolean {
  if (!(error instanceof APIError)) {
    return false
  }

  // 检查 529 状态码或消息中的 overloaded 错误
  return (
    error.status === 529 ||
    // 参见下文：SDK 有时在流式传输期间未能正确传递 529 状态码
    (error.message?.includes('"type":"overloaded_error"') ?? false)
  )
}

function isOAuthTokenRevokedError(error: unknown): boolean {
  return (
    error instanceof APIError &&
    error.status === 403 &&
    (error.message?.includes('OAuth token has been revoked') ?? false)
  )
}

function isBedrockAuthError(error: unknown): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)) {
    // 如果 .aws 包含过去的过期值，AWS 库会在没有 API 调用的情况下拒绝
    // 否则，接收到过期令牌的 API 调用会给出通用的 403
    // "The security token included in the request is invalid"
    if (
      isAwsCredentialsProviderError(error) ||
      (error instanceof APIError && error.status === 403)
    ) {
      return true
    }
  }
  return false
}

/**
 * 如果合适，清除 AWS 认证缓存。
 * @returns 如果采取了行动则返回 true。
 */
function handleAwsCredentialError(error: unknown): boolean {
  if (isBedrockAuthError(error)) {
    clearAwsCredentialsCache()
    return true
  }
  return false
}

// google-auth-library 抛出普通的 Error（没有像 AWS 的 CredentialsProviderError 那样的类型名称）。
// 匹配常见的 SDK 级凭证失败消息。
function isGoogleAuthLibraryCredentialError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message
  return (
    msg.includes('Could not load the default credentials') ||
    msg.includes('Could not refresh access token') ||
    msg.includes('invalid_grant')
  )
}

function isVertexAuthError(error: unknown): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) {
    // SDK 级：google-auth-library 在 HTTP 调用之前于 prepareOptions() 中失败
    if (isGoogleAuthLibraryCredentialError(error)) {
      return true
    }
    // 服务端：Vertex 对过期/无效令牌返回 401
    if (error instanceof APIError && error.status === 401) {
      return true
    }
  }
  return false
}

/**
 * 如果合适，清除 GCP 认证缓存。
 * @returns 如果采取了行动则返回 true。
 */
function handleGcpCredentialError(error: unknown): boolean {
  if (isVertexAuthError(error)) {
    clearGcpCredentialsCache()
    return true
  }
  return false
}

function shouldRetry(error: APIError): boolean {
  // 永不重试模拟错误 —— 它们来自用于测试的 /mock-limits 命令
  if (isMockRateLimitError(error)) {
    return false
  }

  // 持久模式：429/529 始终可重试，绕过订阅者门控和 x-should-retry 头部。
  if (isPersistentRetryEnabled() && isTransientCapacityError(error)) {
    return true
  }

  // CCR 模式：认证通过基础设施提供的 JWT 进行，因此 401/403 是瞬时波动（认证服务故障、网络问题）而不是错误的凭据。
  // 绕过 x-should-retry:false —— 服务器假设我们会重试相同的错误密钥，但我们的密钥没问题。
  if (
    isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
    (error.status === 401 || error.status === 403)
  ) {
    return true
  }

  // 首先通过检查消息内容来检查过载错误
  // SDK 有时在流式传输期间未能正确传递 529 状态码，
  // 因此我们需要直接检查错误消息
  if (error.message?.includes('"type":"overloaded_error"')) {
    return true
  }

  // 检查我们可以处理的最大令牌上下文溢出错误
  if (parseMaxTokensContextOverflowError(error)) {
    return true
  }

  // 注意这不是标准头部。
  const shouldRetryHeader = error.headers?.get('x-should-retry')

  // 如果服务器明确指示是否重试，则遵守。
  // 对于 Max 和 Pro 用户，should-retry 为 true，但在几个小时后，所以我们不应重试。
  // 企业用户可以重试，因为他们通常使用 PAYG 而不是速率限制。
  if (
    shouldRetryHeader === 'true' &&
    (!isClaudeAISubscriber() || isEnterpriseSubscriber())
  ) {
    return true
  }

  // Ants 可以忽略 x-should-retry: false 仅针对 5xx 服务端错误。
  // 对于其他状态码（401、403、400、429 等），遵守头部。
  if (shouldRetryHeader === 'false') {
    const is5xxError = error.status !== undefined && error.status >= 500
    if (!(process.env.USER_TYPE === 'ant' && is5xxError)) {
      return false
    }
  }

  if (error instanceof APIConnectionError) {
    return true
  }

  if (!error.status) return false

  // 重试请求超时。
  if (error.status === 408) return true

  // 重试锁超时。
  if (error.status === 409) return true

  // 重试速率限制，但不适用于 ClaudeAI 订阅用户
  // 企业用户可以重试，因为他们通常使用 PAYG 而不是速率限制
  if (error.status === 429) {
    return !isClaudeAISubscriber() || isEnterpriseSubscriber()
  }

  // 在 401 时清除 API 密钥缓存并允许重试。
  // OAuth 令牌处理在主重试循环中通过 handleOAuth401Error 完成。
  if (error.status === 401) {
    clearApiKeyHelperCache()
    return true
  }

  // 重试 403“令牌已撤销”（与 401 相同的刷新逻辑，参见上文）
  if (isOAuthTokenRevokedError(error)) {
    return true
  }

  // 重试内部错误。
  if (error.status && error.status >= 500) return true

  return false
}

/** API 请求的默认最大重试次数。未设置环境变量时使用文件内 `DEFAULT_MAX_RETRIES`；
 * 设置 `CLAUDE_CODE_MAX_RETRIES` 时用其十进制整数值。 */
export function getDefaultMaxRetries(): number {
  if (process.env.CLAUDE_CODE_MAX_RETRIES) {
    return parseInt(process.env.CLAUDE_CODE_MAX_RETRIES, 10)
  }
  return DEFAULT_MAX_RETRIES
}
function getMaxRetries(options: RetryOptions): number {
  return options.maxRetries ?? getDefaultMaxRetries()
}

const DEFAULT_FAST_MODE_FALLBACK_HOLD_MS = 30 * 60 * 1000 // 30 分钟
const SHORT_RETRY_THRESHOLD_MS = 20 * 1000 // 20 秒
const MIN_COOLDOWN_MS = 10 * 60 * 1000 // 10 分钟

function getRetryAfterMs(error: APIError): number | null {
  const retryAfter = getRetryAfter(error)
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10)
    if (!isNaN(seconds)) {
      return seconds * 1000
    }
  }
  return null
}

function getRateLimitResetDelayMs(error: APIError): number | null {
  const resetHeader = error.headers?.get?.('anthropic-ratelimit-unified-reset')
  if (!resetHeader) return null
  const resetUnixSec = Number(resetHeader)
  if (!Number.isFinite(resetUnixSec)) return null
  const delayMs = resetUnixSec * 1000 - Date.now()
  if (delayMs <= 0) return null
  return Math.min(delayMs, PERSISTENT_RESET_CAP_MS)
}
