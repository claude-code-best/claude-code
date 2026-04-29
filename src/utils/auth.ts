import chalk from 'chalk'
import { exec } from 'child_process'
import { execa } from 'execa'
import { mkdir, stat } from 'fs/promises'
import memoize from 'lodash-es/memoize.js'
import { join } from 'path'
import { CLAUDE_AI_PROFILE_SCOPE } from 'src/constants/oauth.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { getModelStrings } from 'src/utils/model/modelStrings.js'
import { getAPIProvider } from 'src/utils/model/providers.js'
import {
  getIsNonInteractiveSession,
  preferThirdPartyAuthentication,
} from '../bootstrap/state.js'
import {
  getMockSubscriptionType,
  shouldUseMockSubscription,
} from '../services/mockRateLimits.js'
import {
  isOAuthTokenExpired,
  refreshOAuthToken,
  shouldUseClaudeAIAuth,
} from '../services/oauth/client.js'
import { getOauthProfileFromOauthToken } from '../services/oauth/getOauthProfile.js'
import type { OAuthTokens, SubscriptionType } from '../services/oauth/types.js'
import {
  getApiKeyFromFileDescriptor,
  getOAuthTokenFromFileDescriptor,
} from './authFileDescriptor.js'
import {
  maybeRemoveApiKeyFromMacOSKeychainThrows,
  normalizeApiKeyForConfig,
} from './authPortable.js'
import {
  checkStsCallerIdentity,
  clearAwsIniCache,
  isValidAwsStsOutput,
} from './aws.js'
import { AwsAuthStatusManager } from './awsAuthStatusManager.js'
import { clearBetasCaches } from './betas.js'
import {
  type AccountInfo,
  checkHasTrustDialogAccepted,
  getGlobalConfig,
  saveGlobalConfig,
} from './config.js'
import { logAntError, logForDebugging } from './debug.js'
import {
  getClaudeConfigHomeDir,
  isBareMode,
  isEnvTruthy,
  isRunningOnHomespace,
} from './envUtils.js'
import { errorMessage } from './errors.js'
import { execSyncWithDefaults_DEPRECATED } from './execFileNoThrow.js'
import * as lockfile from './lockfile.js'
import { logError } from './log.js'
import { memoizeWithTTLAsync } from './memoize.js'
import { getSecureStorage } from './secureStorage/index.js'
import {
  clearLegacyApiKeyPrefetch,
  getLegacyApiKeyPrefetchResult,
} from './secureStorage/keychainPrefetch.js'
import {
  clearKeychainCache,
  getMacOsKeychainStorageServiceName,
  getUsername,
} from './secureStorage/macOsKeychainHelpers.js'
import {
  getSettings_DEPRECATED,
  getSettingsForSource,
} from './settings/settings.js'
import { sleep } from './sleep.js'
import { jsonParse } from './slowOperations.js'
import { clearToolSchemaCache } from './toolSchemaCache.js'

/** API 密钥辅助程序缓存的默认 TTL（毫秒）（5 分钟） */
const DEFAULT_API_KEY_HELPER_TTL = 5 * 60 * 1000

/**
 * CCR 和 Claude Desktop 使用 OAuth 生成 CLI，绝不应回退到用户的 ~/.claude/settings.json API 密钥配置
 * （apiKeyHelper、env.ANTHROPIC_API_KEY、env.ANTHROPIC_AUTH_TOKEN）。这些设置是为用户的终端 CLI 而存在的，而不是托管会话。
 * 如果没有此防护，在终端中使用 API 密钥运行 `claude` 的用户会看到每个 CCD 会话也使用该密钥 —— 如果密钥过期/组织错误则会失败。
 * 
 * 判断是不是需要从setting.json读取api key。 CCR和Desktop不从本地setting.json读取。
 */
function isManagedOAuthContext(): boolean {
  return (
    isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) ||
    process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop'
  )
}

/** 我们是否支持直接的 1P 认证。 */
// 此代码与 getAuthTokenSource 密切相关
export function isAnthropicAuthEnabled(): boolean {
  // --bare：仅 API 密钥，绝不 OAuth。
  if (isBareMode()) return false

  // `claude ssh` 远程：ANTHROPIC_UNIX_SOCKET 通过本地认证注入代理隧道传输 API 调用。
  // 启动器设置 CLAUDE_CODE_OAUTH_TOKEN 作为占位符，前提是本地端是订阅者（以便远程包含 oauth-2025 beta 头部以匹配代理将注入的内容）。
  // 远程的 ~/.claude 设置（apiKeyHelper、settings.env.ANTHROPIC_API_KEY）绝不能翻转此标志 —— 它们会导致与代理的头部不匹配以及来自 API 的虚假“invalid x-api-key”。
  // 参见 src/ssh/sshAuthProxy.ts。
  if (process.env.ANTHROPIC_UNIX_SOCKET) {
    return !!process.env.CLAUDE_CODE_OAUTH_TOKEN
  }

  const settings = getSettings_DEPRECATED() || {}
  const is3P =
    isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY) ||
    (settings as any).modelType === 'openai' ||
    (settings as any).modelType === 'gemini' ||
    !!process.env.OPENAI_BASE_URL ||
    !!process.env.GEMINI_BASE_URL
  const apiKeyHelper = settings.apiKeyHelper
  const hasExternalAuthToken =
    process.env.ANTHROPIC_AUTH_TOKEN ||
    apiKeyHelper ||
    process.env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR

  // 检查 API 密钥是否来自外部源（不由 /login 管理）
  const { source: apiKeySource } = getAnthropicApiKeyWithSource({
    skipRetrievingKeyFromApiKeyHelper: true,
  })
  const hasExternalApiKey =
    apiKeySource === 'ANTHROPIC_API_KEY' || apiKeySource === 'apiKeyHelper'

  // 在以下情况下禁用 Anthropic 认证：
  // 1. 使用第三方服务（Bedrock/Vertex/Foundry）
  // 2. 用户有外部 API 密钥（无论代理配置如何）
  // 3. 用户有外部认证令牌（无论代理配置如何）
  // 如果用户有复杂的代理/网关“客户端凭据”认证场景，这可能会引起问题，
  // 例如他们希望将 X-Api-Key 设置为网关密钥但使用 Anthropic OAuth 进行 Authorization
  // 如果我们收到相关报告，可能应该添加一个环境变量来强制启用 OAuth
  const shouldDisableAuth =
    is3P ||
    (hasExternalAuthToken && !isManagedOAuthContext()) ||
    (hasExternalApiKey && !isManagedOAuthContext())

  return !shouldDisableAuth
}

/** 认证令牌的来源（如果有）。 */
// 此代码与 isAnthropicAuthEnabled 密切相关
export function getAuthTokenSource() {
  // --bare：仅 API 密钥。apiKeyHelper（来自 --settings）是允许的唯一承载令牌形式的源。
  // OAuth 环境变量、FD 令牌和钥匙串都被忽略。
  if (isBareMode()) {
    if (getConfiguredApiKeyHelper()) {
      return { source: 'apiKeyHelper' as const, hasToken: true }
    }
    return { source: 'none' as const, hasToken: false }
  }

  if (process.env.ANTHROPIC_AUTH_TOKEN && !isManagedOAuthContext()) {
    return { source: 'ANTHROPIC_AUTH_TOKEN' as const, hasToken: true }
  }

  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { source: 'CLAUDE_CODE_OAUTH_TOKEN' as const, hasToken: true }
  }

  // 检查来自文件描述符的 OAuth 令牌（或其 CCR 磁盘回退）
  const oauthTokenFromFd = getOAuthTokenFromFileDescriptor()
  if (oauthTokenFromFd) {
    // getOAuthTokenFromFileDescriptor 有一个针对无法继承管道 FD 的 CCR 子进程的磁盘回退。
    // 通过环境变量存在性来区分，以便组织不匹配消息不会告诉用户取消设置一个不存在的变量。
    // 调用点正确回退 —— 新源 !== 'none'（cli/handlers/auth.ts → oauth_token）且不在 isEnvVarToken 集合中（auth.ts:1844 → 通用重新登录消息）。
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR) {
      return {
        source: 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR' as const,
        hasToken: true,
      }
    }
    return {
      source: 'CCR_OAUTH_TOKEN_FILE' as const,
      hasToken: true,
    }
  }

  // 检查是否配置了 apiKeyHelper 而不执行它
  // 这可以防止在信任建立之前任意代码执行的安全问题
  const apiKeyHelper = getConfiguredApiKeyHelper()
  if (apiKeyHelper && !isManagedOAuthContext()) {
    return { source: 'apiKeyHelper' as const, hasToken: true }
  }

  const oauthTokens = getClaudeAIOAuthTokens()
  if (shouldUseClaudeAIAuth(oauthTokens?.scopes) && oauthTokens?.accessToken) {
    return { source: 'claude.ai' as const, hasToken: true }
  }

  return { source: 'none' as const, hasToken: false }
}

export type ApiKeySource =
  | 'ANTHROPIC_API_KEY'
  | 'apiKeyHelper'
  | '/login managed key'
  | 'none'

export function getAnthropicApiKey(): null | string {
  const { key } = getAnthropicApiKeyWithSource()
  return key
}

export function hasAnthropicApiKeyAuth(): boolean {
  const { key, source } = getAnthropicApiKeyWithSource({
    skipRetrievingKeyFromApiKeyHelper: true,
  })
  return key !== null && source !== 'none'
}

export function getAnthropicApiKeyWithSource(
  opts: { skipRetrievingKeyFromApiKeyHelper?: boolean } = {},
): {
  key: null | string
  source: ApiKeySource
} {
  // --bare：封闭式认证。仅 ANTHROPIC_API_KEY 环境变量或来自 --settings 标志的 apiKeyHelper。
  // 从不接触钥匙串、配置文件或批准列表。3P（Bedrock/Vertex/Foundry）使用提供者凭据，不走此路径。
  if (isBareMode()) {
    if (process.env.ANTHROPIC_API_KEY) {
      return { key: process.env.ANTHROPIC_API_KEY, source: 'ANTHROPIC_API_KEY' }
    }
    if (getConfiguredApiKeyHelper()) {
      return {
        key: opts.skipRetrievingKeyFromApiKeyHelper
          ? null
          : getApiKeyFromApiKeyHelperCached(),
        source: 'apiKeyHelper',
      }
    }
    return { key: null, source: 'none' }
  }

  // 在 homespace 上，不要使用 ANTHROPIC_API_KEY（改用 Console 密钥）
  // https://anthropic.slack.com/archives/C08428WSLKV/p1747331773214779
  const apiKeyEnv = isRunningOnHomespace()
    ? undefined
    : process.env.ANTHROPIC_API_KEY

  // 当用户运行 claude --print 时，始终检查直接环境变量。
  // 这对于 CI 等场景很有用。
  if (preferThirdPartyAuthentication() && apiKeyEnv) {
    return {
      key: apiKeyEnv,
      source: 'ANTHROPIC_API_KEY',
    }
  }

  if (isEnvTruthy(process.env.CI) || process.env.NODE_ENV === 'test') {
    // 首先检查来自文件描述符的 API 密钥
    const apiKeyFromFd = getApiKeyFromFileDescriptor()
    if (apiKeyFromFd) {
      return {
        key: apiKeyFromFd,
        source: 'ANTHROPIC_API_KEY',
      }
    }

    if (
      !apiKeyEnv &&
      !process.env.CLAUDE_CODE_OAUTH_TOKEN &&
      !process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
    ) {
      throw new Error(
        '需要设置 ANTHROPIC_API_KEY 或 CLAUDE_CODE_OAUTH_TOKEN 环境变量',
      )
    }

    if (apiKeyEnv) {
      return {
        key: apiKeyEnv,
        source: 'ANTHROPIC_API_KEY',
      }
    }

    // OAuth 令牌存在，但此函数仅返回 API 密钥
    return {
      key: null,
      source: 'none',
    }
  }
  // 在检查 apiKeyHelper 或 /login 管理的密钥之前检查 ANTHROPIC_API_KEY
  if (
    apiKeyEnv &&
    getGlobalConfig().customApiKeyResponses?.approved?.includes(
      normalizeApiKeyForConfig(apiKeyEnv),
    )
  ) {
    return {
      key: apiKeyEnv,
      source: 'ANTHROPIC_API_KEY',
    }
  }

  // 检查来自文件描述符的 API 密钥
  const apiKeyFromFd = getApiKeyFromFileDescriptor()
  if (apiKeyFromFd) {
    return {
      key: apiKeyFromFd,
      source: 'ANTHROPIC_API_KEY',
    }
  }

  // 检查 apiKeyHelper — 使用同步缓存，绝不阻塞
  const apiKeyHelperCommand = getConfiguredApiKeyHelper()
  if (apiKeyHelperCommand) {
    if (opts.skipRetrievingKeyFromApiKeyHelper) {
      return {
        key: null,
        source: 'apiKeyHelper',
      }
    }
    // 缓存可能是冷的（辅助程序尚未完成）。返回 null 且 source='apiKeyHelper' 而不是回退到钥匙串 —
    // apiKeyHelper 必须胜出。需要真实密钥的调用方必须首先 await getApiKeyFromApiKeyHelper()（client.ts、useApiKeyVerification 会这样做）。
    return {
      key: getApiKeyFromApiKeyHelperCached(),
      source: 'apiKeyHelper',
    }
  }

  const apiKeyFromConfigOrMacOSKeychain = getApiKeyFromConfigOrMacOSKeychain()
  if (apiKeyFromConfigOrMacOSKeychain) {
    return apiKeyFromConfigOrMacOSKeychain
  }

  return {
    key: null,
    source: 'none',
  }
}

/**
 * 从设置中获取配置的 apiKeyHelper。
 * 在 bare 模式下，仅考虑 --settings 标志源 —— 来自 ~/.claude/settings.json 或项目设置的 apiKeyHelper 被忽略。
 */
export function getConfiguredApiKeyHelper(): string | undefined {
  if (isBareMode()) {
    return getSettingsForSource('flagSettings')?.apiKeyHelper
  }
  const mergedSettings = getSettings_DEPRECATED() || {}
  return mergedSettings.apiKeyHelper
}

/**
 * 检查配置的 apiKeyHelper 是否来自项目设置（projectSettings 或 localSettings）
 */
function isApiKeyHelperFromProjectOrLocalSettings(): boolean {
  const apiKeyHelper = getConfiguredApiKeyHelper()
  if (!apiKeyHelper) {
    return false
  }

  const projectSettings = getSettingsForSource('projectSettings')
  const localSettings = getSettingsForSource('localSettings')
  return (
    projectSettings?.apiKeyHelper === apiKeyHelper ||
    localSettings?.apiKeyHelper === apiKeyHelper
  )
}

/**
 * 从设置中获取配置的 awsAuthRefresh
 */
function getConfiguredAwsAuthRefresh(): string | undefined {
  const mergedSettings = getSettings_DEPRECATED() || {}
  return mergedSettings.awsAuthRefresh
}

/**
 * 检查配置的 awsAuthRefresh 是否来自项目设置
 */
export function isAwsAuthRefreshFromProjectSettings(): boolean {
  const awsAuthRefresh = getConfiguredAwsAuthRefresh()
  if (!awsAuthRefresh) {
    return false
  }

  const projectSettings = getSettingsForSource('projectSettings')
  const localSettings = getSettingsForSource('localSettings')
  return (
    projectSettings?.awsAuthRefresh === awsAuthRefresh ||
    localSettings?.awsAuthRefresh === awsAuthRefresh
  )
}

/**
 * 从设置中获取配置的 awsCredentialExport
 */
function getConfiguredAwsCredentialExport(): string | undefined {
  const mergedSettings = getSettings_DEPRECATED() || {}
  return mergedSettings.awsCredentialExport
}

/**
 * 检查配置的 awsCredentialExport 是否来自项目设置
 */
export function isAwsCredentialExportFromProjectSettings(): boolean {
  const awsCredentialExport = getConfiguredAwsCredentialExport()
  if (!awsCredentialExport) {
    return false
  }

  const projectSettings = getSettingsForSource('projectSettings')
  const localSettings = getSettingsForSource('localSettings')
  return (
    projectSettings?.awsCredentialExport === awsCredentialExport ||
    localSettings?.awsCredentialExport === awsCredentialExport
  )
}

/**
 * 计算 API 密钥辅助程序缓存的 TTL（毫秒）
 * 如果设置了 CLAUDE_CODE_API_KEY_HELPER_TTL_MS 环境变量且有效，则使用它，
 * 否则默认为 5 分钟
 */
export function calculateApiKeyHelperTTL(): number {
  const envTtl = process.env.CLAUDE_CODE_API_KEY_HELPER_TTL_MS

  if (envTtl) {
    const parsed = parseInt(envTtl, 10)
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed
    }
    logForDebugging(
      `找到了 CLAUDE_CODE_API_KEY_HELPER_TTL_MS 环境变量，但它不是有效的数字。得到 ${envTtl}`,
      { level: 'error' },
    )
  }

  return DEFAULT_API_KEY_HELPER_TTL
}

// 异步 API 密钥辅助程序，带有用于非阻塞读取的同步缓存。
// 在 clearApiKeyHelperCache() 上增加纪元 —— 孤立的执行检查它们捕获的纪元，然后再接触模块状态，以便设置更改或 401 重试进行中不会破坏更新的缓存/进行中的请求。
let _apiKeyHelperCache: { value: string; timestamp: number } | null = null
let _apiKeyHelperInflight: {
  promise: Promise<string | null>
  // 仅在冷启动时设置（用户正在等待）；对于 SWR 后台刷新为 null。
  startedAt: number | null
} | null = null
let _apiKeyHelperEpoch = 0

export function getApiKeyHelperElapsedMs(): number {
  const startedAt = _apiKeyHelperInflight?.startedAt
  return startedAt ? Date.now() - startedAt : 0
}

export async function getApiKeyFromApiKeyHelper(
  isNonInteractiveSession: boolean,
): Promise<string | null> {
  if (!getConfiguredApiKeyHelper()) return null
  const ttl = calculateApiKeyHelperTTL()
  if (_apiKeyHelperCache) {
    if (Date.now() - _apiKeyHelperCache.timestamp < ttl) {
      return _apiKeyHelperCache.value
    }
    // 过期 —— 现在返回过期的值，在后台刷新。
    // `??=` 被 eslint no-nullish-assign-object-call 禁止（bun bug）。
    if (!_apiKeyHelperInflight) {
      _apiKeyHelperInflight = {
        promise: _runAndCache(
          isNonInteractiveSession,
          false,
          _apiKeyHelperEpoch,
        ),
        startedAt: null,
      }
    }
    return _apiKeyHelperCache.value
  }
  // 冷缓存 —— 去重并发调用
  if (_apiKeyHelperInflight) return _apiKeyHelperInflight.promise
  _apiKeyHelperInflight = {
    promise: _runAndCache(isNonInteractiveSession, true, _apiKeyHelperEpoch),
    startedAt: Date.now(),
  }
  return _apiKeyHelperInflight.promise
}

async function _runAndCache(
  isNonInteractiveSession: boolean,
  isCold: boolean,
  epoch: number,
): Promise<string | null> {
  try {
    const value = await _executeApiKeyHelper(isNonInteractiveSession)
    if (epoch !== _apiKeyHelperEpoch) return value
    if (value !== null) {
      _apiKeyHelperCache = { value, timestamp: Date.now() }
    }
    return value
  } catch (e) {
    if (epoch !== _apiKeyHelperEpoch) return ' '
    const detail = e instanceof Error ? e.message : String(e)
    console.error(chalk.red(`apiKeyHelper 失败: ${detail}`))
    logForDebugging(`从 apiKeyHelper 获取 API 密钥时出错: ${detail}`, {
      level: 'error',
    })
    // SWR 路径：瞬时故障不应替换工作中的密钥为 ' ' 哨兵 —— 继续提供过期值并更新时间戳，以免每次调用都重试。
    if (!isCold && _apiKeyHelperCache && _apiKeyHelperCache.value !== ' ') {
      _apiKeyHelperCache = { ..._apiKeyHelperCache, timestamp: Date.now() }
      return _apiKeyHelperCache.value
    }
    // 冷缓存或先前的错误 —— 缓存 ' ' 以便调用方不回退到 OAuth
    _apiKeyHelperCache = { value: ' ', timestamp: Date.now() }
    return ' '
  } finally {
    if (epoch === _apiKeyHelperEpoch) {
      _apiKeyHelperInflight = null
    }
  }
}

async function _executeApiKeyHelper(
  isNonInteractiveSession: boolean,
): Promise<string | null> {
  const apiKeyHelper = getConfiguredApiKeyHelper()
  if (!apiKeyHelper) {
    return null
  }

  if (isApiKeyHelperFromProjectOrLocalSettings()) {
    const hasTrust = checkHasTrustDialogAccepted()
    if (!hasTrust && !isNonInteractiveSession) {
      const error = new Error(
        `安全：在工作区信任确认之前执行了 apiKeyHelper。如果您看到此消息，请在 ${MACRO.FEEDBACK_CHANNEL} 中发帖。`,
      )
      logAntError('在信任检查之前调用了 apiKeyHelper', error)
      logEvent('tengu_apiKeyHelper_missing_trust11', {})
      return null
    }
  }

  const result = await execa(apiKeyHelper, {
    shell: true,
    timeout: 10 * 60 * 1000,
    reject: false,
  })
  if (result.failed) {
    // reject:false — execa 在退出码≠0/超时时解析，stderr 在 result 上
    const why = result.timedOut ? '超时' : `退出码 ${result.exitCode}`
    const stderr = result.stderr?.trim()
    throw new Error(stderr ? `${why}: ${stderr}` : why)
  }
  const stdout = result.stdout?.trim()
  if (!stdout) {
    throw new Error('未返回值')
  }
  return stdout
}

/**
 * 同步缓存读取器 —— 返回最后一次获取的 apiKeyHelper 值而不执行。
 * 返回过期值以匹配异步读取器的 SWR 语义。
 * 仅在异步获取尚未完成时返回 null。
 */
export function getApiKeyFromApiKeyHelperCached(): string | null {
  return _apiKeyHelperCache?.value ?? null
}

export function clearApiKeyHelperCache(): void {
  _apiKeyHelperEpoch++
  _apiKeyHelperCache = null
  _apiKeyHelperInflight = null
}

export function prefetchApiKeyFromApiKeyHelperIfSafe(
  isNonInteractiveSession: boolean,
): void {
  // 如果信任尚未接受则跳过 —— 内部的 _executeApiKeyHelper 检查也会捕获，但会触发误报的分析事件。
  if (
    isApiKeyHelperFromProjectOrLocalSettings() &&
    !checkHasTrustDialogAccepted()
  ) {
    return
  }
  void getApiKeyFromApiKeyHelper(isNonInteractiveSession)
}

/** 默认 STS 凭证为一小时。我们手动管理失效，因此不太担心准确性。 */
const DEFAULT_AWS_STS_TTL = 60 * 60 * 1000

/**
 * 运行 awsAuthRefresh 以执行交互式认证（例如 aws sso login）
 * 实时流式输出以便用户可见
 */
async function runAwsAuthRefresh(): Promise<boolean> {
  const awsAuthRefresh = getConfiguredAwsAuthRefresh()

  if (!awsAuthRefresh) {
    return false // 未配置，视为成功
  }

  // 安全：检查 awsAuthRefresh 是否来自项目设置
  if (isAwsAuthRefreshFromProjectSettings()) {
    // 检查是否已为此项目建立信任
    const hasTrust = checkHasTrustDialogAccepted()
    if (!hasTrust && !getIsNonInteractiveSession()) {
      const error = new Error(
        `安全：在工作区信任确认之前执行了 awsAuthRefresh。如果您看到此消息，请在 ${MACRO.FEEDBACK_CHANNEL} 中发帖。`,
      )
      logAntError('在信任检查之前调用了 awsAuthRefresh', error)
      logEvent('tengu_awsAuthRefresh_missing_trust', {})
      return false
    }
  }

  try {
    logForDebugging('正在获取 AWS 调用方身份以进行 AWS 认证刷新命令')
    await checkStsCallerIdentity()
    logForDebugging(
      '已获取 AWS 调用方身份，跳过 AWS 认证刷新命令',
    )
    return false
  } catch {
    // 仅在调用方身份调用失败时才实际执行刷新
    return refreshAwsAuth(awsAuthRefresh)
  }
}

// AWS 认证刷新命令的超时时间（3 分钟）。
// 足够长以容纳基于浏览器的 SSO 流程，足够短以防止无限期挂起。
const AWS_AUTH_REFRESH_TIMEOUT_MS = 3 * 60 * 1000

export function refreshAwsAuth(awsAuthRefresh: string): Promise<boolean> {
  logForDebugging('正在运行 AWS 认证刷新命令')
  // 开始跟踪认证状态
  const authStatusManager = AwsAuthStatusManager.getInstance()
  authStatusManager.startAuthentication()

  return new Promise(resolve => {
    const refreshProc = exec(awsAuthRefresh, {
      timeout: AWS_AUTH_REFRESH_TIMEOUT_MS,
    })
    refreshProc.stdout!.on('data', data => {
      const output = data.toString().trim()
      if (output) {
        // 将输出添加到状态管理器以用于 UI 显示
        authStatusManager.addOutput(output)
        // 同时也记录调试信息
        logForDebugging(output, { level: 'debug' })
      }
    })

    refreshProc.stderr!.on('data', data => {
      const error = data.toString().trim()
      if (error) {
        authStatusManager.setError(error)
        logForDebugging(error, { level: 'error' })
      }
    })

    refreshProc.on('close', (code, signal) => {
      if (code === 0) {
        logForDebugging('AWS 认证刷新成功完成')
        authStatusManager.endAuthentication(true)
        void resolve(true)
      } else {
        const timedOut = signal === 'SIGTERM'
        const message = timedOut
          ? chalk.red(
              'AWS 认证刷新在 3 分钟后超时。请在单独的终端中手动运行您的认证命令。',
            )
          : chalk.red(
              '运行 awsAuthRefresh（在设置或 ~/.claude.json 中）时出错：',
            )
        console.error(message)
        authStatusManager.endAuthentication(false)
        void resolve(false)
      }
    })
  })
}

/**
 * 运行 awsCredentialExport 以获取凭证并设置环境变量
 * 期望输出包含 AWS 凭证的 JSON
 */
async function getAwsCredsFromCredentialExport(): Promise<{
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
} | null> {
  const awsCredentialExport = getConfiguredAwsCredentialExport()

  if (!awsCredentialExport) {
    return null
  }

  // 安全：检查 awsCredentialExport 是否来自项目设置
  if (isAwsCredentialExportFromProjectSettings()) {
    // 检查是否已为此项目建立信任
    const hasTrust = checkHasTrustDialogAccepted()
    if (!hasTrust && !getIsNonInteractiveSession()) {
      const error = new Error(
        `安全：在工作区信任确认之前执行了 awsCredentialExport。如果您看到此消息，请在 ${MACRO.FEEDBACK_CHANNEL} 中发帖。`,
      )
      logAntError('在信任检查之前调用了 awsCredentialExport', error)
      logEvent('tengu_awsCredentialExport_missing_trust', {})
      return null
    }
  }

  try {
    logForDebugging(
      '正在获取 AWS 调用方身份以进行凭证导出命令',
    )
    await checkStsCallerIdentity()
    logForDebugging(
      '已获取 AWS 调用方身份，跳过 AWS 凭证导出命令',
    )
    return null
  } catch {
    // 仅在调用方身份调用失败时才实际执行导出
    try {
      logForDebugging('正在运行 AWS 凭证导出命令')
      const result = await execa(awsCredentialExport, {
        shell: true,
        reject: false,
      })
      if (result.exitCode !== 0 || !result.stdout) {
        throw new Error('awsCredentialExport 未返回有效值')
      }

      // 解析来自 aws sts 命令的 JSON 输出
      const awsOutput = jsonParse(result.stdout.trim())

      if (!isValidAwsStsOutput(awsOutput)) {
        throw new Error(
          'awsCredentialExport 未返回有效的 AWS STS 输出结构',
        )
      }

      logForDebugging('已从 awsCredentialExport 检索到 AWS 凭证')
      return {
        accessKeyId: awsOutput.Credentials.AccessKeyId,
        secretAccessKey: awsOutput.Credentials.SecretAccessKey,
        sessionToken: awsOutput.Credentials.SessionToken,
      }
    } catch (e) {
      const message = chalk.red(
        '从 awsCredentialExport（在设置或 ~/.claude.json 中）获取 AWS 凭证时出错：',
      )
      if (e instanceof Error) {
        console.error(message, e.message)
      } else {
        console.error(message, e)
      }
      return null
    }
  }
}

/**
 * 刷新 AWS 认证并获取凭证，同时清除缓存
 * 这结合了 runAwsAuthRefresh、getAwsCredsFromCredentialExport 和 clearAwsIniCache
 * 以确保始终使用新鲜凭证
 */
export const refreshAndGetAwsCredentials = memoizeWithTTLAsync(
  async (): Promise<{
    accessKeyId: string
    secretAccessKey: string
    sessionToken: string
  } | null> => {
    // 首先运行认证刷新（如果需要）
    const refreshed = await runAwsAuthRefresh()

    // 从导出获取凭证
    const credentials = await getAwsCredsFromCredentialExport()

    // 清除 AWS INI 缓存以确保使用新鲜凭证
    if (refreshed || credentials) {
      await clearAwsIniCache()
    }

    return credentials
  },
  DEFAULT_AWS_STS_TTL,
)

export function clearAwsCredentialsCache(): void {
  refreshAndGetAwsCredentials.cache.clear()
}

/**
 * 从设置中获取配置的 gcpAuthRefresh
 */
function getConfiguredGcpAuthRefresh(): string | undefined {
  const mergedSettings = getSettings_DEPRECATED() || {}
  return mergedSettings.gcpAuthRefresh
}

/**
 * 检查配置的 gcpAuthRefresh 是否来自项目设置
 */
export function isGcpAuthRefreshFromProjectSettings(): boolean {
  const gcpAuthRefresh = getConfiguredGcpAuthRefresh()
  if (!gcpAuthRefresh) {
    return false
  }

  const projectSettings = getSettingsForSource('projectSettings')
  const localSettings = getSettingsForSource('localSettings')
  return (
    projectSettings?.gcpAuthRefresh === gcpAuthRefresh ||
    localSettings?.gcpAuthRefresh === gcpAuthRefresh
  )
}

/** GCP 凭证探测的短超时。如果没有本地凭证源（没有 ADC 文件，没有环境变量），google-auth-library 会回退到 GCE 元数据服务器，在 GCP 外部会挂起约 12 秒。 */
const GCP_CREDENTIALS_CHECK_TIMEOUT_MS = 5_000

/**
 * 通过尝试获取访问令牌来检查 GCP 凭证当前是否有效。
 * 这使用与 Vertex SDK 相同的认证链。
 */
export async function checkGcpCredentialsValid(): Promise<boolean> {
  try {
    // 动态导入以避免不必要地加载 google-auth-library
    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    const probe = (async () => {
      const client = await auth.getClient()
      await client.getAccessToken()
    })()
    const timeout = sleep(GCP_CREDENTIALS_CHECK_TIMEOUT_MS).then(() => {
      throw new GcpCredentialsTimeoutError('GCP 凭证检查超时')
    })
    await Promise.race([probe, timeout])
    return true
  } catch {
    return false
  }
}

/** 默认 GCP 凭证 TTL - 1 小时以匹配典型的 ADC 令牌生命周期 */
const DEFAULT_GCP_CREDENTIAL_TTL = 60 * 60 * 1000

/**
 * 运行 gcpAuthRefresh 以执行交互式认证（例如 gcloud auth application-default login）
 * 实时流式输出以便用户可见
 */
async function runGcpAuthRefresh(): Promise<boolean> {
  const gcpAuthRefresh = getConfiguredGcpAuthRefresh()

  if (!gcpAuthRefresh) {
    return false // 未配置，视为成功
  }

  // 安全：检查 gcpAuthRefresh 是否来自项目设置
  if (isGcpAuthRefreshFromProjectSettings()) {
    // 检查是否已为此项目建立信任
    // 传递 true 以指示这是一个需要信任的危险功能
    const hasTrust = checkHasTrustDialogAccepted()
    if (!hasTrust && !getIsNonInteractiveSession()) {
      const error = new Error(
        `安全：在工作区信任确认之前执行了 gcpAuthRefresh。如果您看到此消息，请在 ${MACRO.FEEDBACK_CHANNEL} 中发帖。`,
      )
      logAntError('在信任检查之前调用了 gcpAuthRefresh', error)
      logEvent('tengu_gcpAuthRefresh_missing_trust', {})
      return false
    }
  }

  try {
    logForDebugging('正在检查 GCP 凭证有效性以进行认证刷新')
    const isValid = await checkGcpCredentialsValid()
    if (isValid) {
      logForDebugging(
        'GCP 凭证有效，跳过认证刷新命令',
      )
      return false
    }
  } catch {
    // 凭证检查失败，继续刷新
  }

  return refreshGcpAuth(gcpAuthRefresh)
}

// GCP 认证刷新命令的超时时间（3 分钟）。
// 足够长以容纳基于浏览器的认证流程，足够短以防止无限期挂起。
const GCP_AUTH_REFRESH_TIMEOUT_MS = 3 * 60 * 1000

export function refreshGcpAuth(gcpAuthRefresh: string): Promise<boolean> {
  logForDebugging('正在运行 GCP 认证刷新命令')
  // 开始跟踪认证状态。尽管名称如此，AwsAuthStatusManager 是与云提供商无关的
  // — print.ts 将其更新作为通用的 SDK 'auth_status' 消息发出。
  const authStatusManager = AwsAuthStatusManager.getInstance()
  authStatusManager.startAuthentication()

  return new Promise(resolve => {
    const refreshProc = exec(gcpAuthRefresh, {
      timeout: GCP_AUTH_REFRESH_TIMEOUT_MS,
    })
    refreshProc.stdout!.on('data', data => {
      const output = data.toString().trim()
      if (output) {
        // 将输出添加到状态管理器以用于 UI 显示
        authStatusManager.addOutput(output)
        // 同时也记录调试信息
        logForDebugging(output, { level: 'debug' })
      }
    })

    refreshProc.stderr!.on('data', data => {
      const error = data.toString().trim()
      if (error) {
        authStatusManager.setError(error)
        logForDebugging(error, { level: 'error' })
      }
    })

    refreshProc.on('close', (code, signal) => {
      if (code === 0) {
        logForDebugging('GCP 认证刷新成功完成')
        authStatusManager.endAuthentication(true)
        void resolve(true)
      } else {
        const timedOut = signal === 'SIGTERM'
        const message = timedOut
          ? chalk.red(
              'GCP 认证刷新在 3 分钟后超时。请在单独的终端中手动运行您的认证命令。',
            )
          : chalk.red(
              '运行 gcpAuthRefresh（在设置或 ~/.claude.json 中）时出错：',
            )
        console.error(message)
        authStatusManager.endAuthentication(false)
        void resolve(false)
      }
    })
  })
}

/**
 * 如果需要，刷新 GCP 认证。
 * 此函数检查凭证是否有效，如果无效则运行刷新命令。
 * 使用 TTL 进行记忆化以避免过多的刷新尝试。
 */
export const refreshGcpCredentialsIfNeeded = memoizeWithTTLAsync(
  async (): Promise<boolean> => {
    // 如果需要则运行认证刷新
    const refreshed = await runGcpAuthRefresh()
    return refreshed
  },
  DEFAULT_GCP_CREDENTIAL_TTL,
)

export function clearGcpCredentialsCache(): void {
  refreshGcpCredentialsIfNeeded.cache.clear()
}

/**
 * 仅当工作区信任已经建立时才预取 GCP 凭证。
 * 这允许我们为受信任的工作区提前启动可能较慢的 GCP 命令，
 * 同时为不受信任的工作区保持安全性。
 *
 * 返回 void 以防止误用 - 实际刷新请使用 refreshGcpCredentialsIfNeeded()。
 */
export function prefetchGcpCredentialsIfSafe(): void {
  // 检查是否配置了 gcpAuthRefresh
  const gcpAuthRefresh = getConfiguredGcpAuthRefresh()

  if (!gcpAuthRefresh) {
    return
  }

  // 检查 gcpAuthRefresh 是否来自项目设置
  if (isGcpAuthRefreshFromProjectSettings()) {
    // 仅在信任已经建立时预取
    const hasTrust = checkHasTrustDialogAccepted()
    if (!hasTrust && !getIsNonInteractiveSession()) {
      // 不预取 - 等待信任建立
      return
    }
  }

  // 安全预取 - 要么不是来自项目设置，要么信任已建立
  void refreshGcpCredentialsIfNeeded()
}

/**
 * 仅当工作区信任已经建立时才预取 AWS 凭证。
 * 这允许我们为受信任的工作区提前启动可能较慢的 AWS 命令，
 * 同时为不受信任的工作区保持安全性。
 *
 * 返回 void 以防止误用 - 实际检索凭证请使用 refreshAndGetAwsCredentials()。
 */
export function prefetchAwsCredentialsAndBedRockInfoIfSafe(): void {
  // 检查是否配置了任一 AWS 命令
  const awsAuthRefresh = getConfiguredAwsAuthRefresh()
  const awsCredentialExport = getConfiguredAwsCredentialExport()

  if (!awsAuthRefresh && !awsCredentialExport) {
    return
  }

  // 检查任一命令是否来自项目设置
  if (
    isAwsAuthRefreshFromProjectSettings() ||
    isAwsCredentialExportFromProjectSettings()
  ) {
    // 仅在信任已经建立时预取
    const hasTrust = checkHasTrustDialogAccepted()
    if (!hasTrust && !getIsNonInteractiveSession()) {
      // 不预取 - 等待信任建立
      return
    }
  }

  // 安全预取 - 要么不是来自项目设置，要么信任已建立
  void refreshAndGetAwsCredentials()
  getModelStrings()
}

/** @private 使用 {@link getAnthropicApiKey} 或 {@link getAnthropicApiKeyWithSource} */
export const getApiKeyFromConfigOrMacOSKeychain = memoize(
  (): { key: string; source: ApiKeySource } | null => {
    if (isBareMode()) return null
    // TODO：迁移到 SecureStorage
    if (process.platform === 'darwin') {
      // keychainPrefetch.ts 在 main.tsx 顶层与模块导入并行触发此读取。
      // 如果它已完成，则使用它而不是在此处生成同步 `security` 子进程（约 33ms）。
      const prefetch = getLegacyApiKeyPrefetchResult()
      if (prefetch) {
        if (prefetch.stdout) {
          return { key: prefetch.stdout, source: '/login managed key' }
        }
        // 预取完成但没有密钥 —— 回退到配置，而不是钥匙串。
      } else {
        const storageServiceName = getMacOsKeychainStorageServiceName()
        try {
          const result = execSyncWithDefaults_DEPRECATED(
            `security find-generic-password -a $USER -w -s "${storageServiceName}"`,
          )
          if (result) {
            return { key: result, source: '/login managed key' }
          }
        } catch (e) {
          logError(e)
        }
      }
    }

    const config = getGlobalConfig()
    if (!config.primaryApiKey) {
      return null
    }

    return { key: config.primaryApiKey, source: '/login managed key' }
  },
)

function isValidApiKey(apiKey: string): boolean {
  // 仅允许字母数字字符、短划线和下划线
  return /^[a-zA-Z0-9-_]+$/.test(apiKey)
}

export async function saveApiKey(apiKey: string): Promise<void> {
  if (!isValidApiKey(apiKey)) {
    throw new Error(
      '无效的 API 密钥格式。API 密钥只能包含字母数字字符、短划线和下划线。',
    )
  }

  // 存储为主 API 密钥
  await maybeRemoveApiKeyFromMacOSKeychain()
  let savedToKeychain = false
  if (process.platform === 'darwin') {
    try {
      // TODO：迁移到 SecureStorage
      const storageServiceName = getMacOsKeychainStorageServiceName()
      const username = getUsername()

      // 转换为十六进制以避免任何转义问题
      const hexValue = Buffer.from(apiKey, 'utf-8').toString('hex')

      // 使用 security 的交互模式（-i）配合 -X（十六进制）选项
      // 这确保凭据永远不会出现在进程命令行参数中
      // 进程监视器只看到 "security -i"，而不是密码
      const command = `add-generic-password -U -a "${username}" -s "${storageServiceName}" -X "${hexValue}"\n`

      await execa('security', ['-i'], {
        input: command,
        reject: false,
      })

      logEvent('tengu_api_key_saved_to_keychain', {})
      savedToKeychain = true
    } catch (e) {
      logError(e)
      logEvent('tengu_api_key_keychain_error', {
        error: errorMessage(
          e,
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      logEvent('tengu_api_key_saved_to_config', {})
    }
  } else {
    logEvent('tengu_api_key_saved_to_config', {})
  }

  const normalizedKey = normalizeApiKeyForConfig(apiKey)

  // 保存包含所有更新的配置
  saveGlobalConfig(current => {
    const approved = current.customApiKeyResponses?.approved ?? []
    return {
      ...current,
      // 仅在钥匙串保存失败或不在 darwin 上时保存到配置
      primaryApiKey: savedToKeychain ? current.primaryApiKey : apiKey,
      customApiKeyResponses: {
        ...current.customApiKeyResponses,
        approved: approved.includes(normalizedKey)
          ? approved
          : [...approved, normalizedKey],
        rejected: current.customApiKeyResponses?.rejected ?? [],
      },
    }
  })

  // 清除备忘录缓存
  getApiKeyFromConfigOrMacOSKeychain.cache.clear?.()
  clearLegacyApiKeyPrefetch()
}

export function isCustomApiKeyApproved(apiKey: string): boolean {
  const config = getGlobalConfig()
  const normalizedKey = normalizeApiKeyForConfig(apiKey)
  return (
    config.customApiKeyResponses?.approved?.includes(normalizedKey) ?? false
  )
}

export async function removeApiKey(): Promise<void> {
  await maybeRemoveApiKeyFromMacOSKeychain()

  // 同时从配置中移除，用于在我们支持钥匙串之前设置密钥的旧客户端
  saveGlobalConfig(current => ({
    ...current,
    primaryApiKey: undefined,
  }))

  // 清除备忘录缓存
  getApiKeyFromConfigOrMacOSKeychain.cache.clear?.()
  clearLegacyApiKeyPrefetch()
}

async function maybeRemoveApiKeyFromMacOSKeychain(): Promise<void> {
  try {
    await maybeRemoveApiKeyFromMacOSKeychainThrows()
  } catch (e) {
    logError(e)
  }
}

// 在安全存储中存储 OAuth 令牌的函数
export function saveOAuthTokensIfNeeded(tokens: OAuthTokens): {
  success: boolean
  warning?: string
} {
  if (!shouldUseClaudeAIAuth(tokens.scopes)) {
    logEvent('tengu_oauth_tokens_not_claude_ai', {})
    return { success: true }
  }

  // 跳过保存仅推理令牌（它们来自环境变量）
  if (!tokens.refreshToken || !tokens.expiresAt) {
    logEvent('tengu_oauth_tokens_inference_only', {})
    return { success: true }
  }

  const secureStorage = getSecureStorage()
  const storageBackend =
    secureStorage.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS

  try {
    const storageData = secureStorage.read() || {}
    const existingOauth = storageData.claudeAiOauth

    storageData.claudeAiOauth = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      // 在 refreshOAuthToken 中获取配置文件会吞掉错误并在瞬时故障（网络、5xx、速率限制）时返回 null。
      // 不要用 null 覆盖有效的存储订阅类型 —— 回退到现有值。
      subscriptionType:
        tokens.subscriptionType ?? existingOauth?.subscriptionType ?? null,
      rateLimitTier:
        tokens.rateLimitTier ?? existingOauth?.rateLimitTier ?? null,
    }

    const updateStatus = secureStorage.update(storageData)

    if (updateStatus.success) {
      logEvent('tengu_oauth_tokens_saved', { storageBackend })
    } else {
      logEvent('tengu_oauth_tokens_save_failed', { storageBackend })
    }

    getClaudeAIOAuthTokens.cache?.clear?.()
    clearBetasCaches()
    clearToolSchemaCache()
    return updateStatus
  } catch (error) {
    logError(error)
    logEvent('tengu_oauth_tokens_save_exception', {
      storageBackend,
      error: errorMessage(
        error,
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return { success: false, warning: '保存 OAuth 令牌失败' }
  }
}

export const getClaudeAIOAuthTokens = memoize((): OAuthTokens | null => {
  // --bare：仅 API 密钥。没有 OAuth 环境令牌、钥匙串或凭证文件。
  if (isBareMode()) return null

  // 检查环境变量中强制设置的 OAuth 令牌
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    // 返回一个仅推理令牌（刷新和过期时间未知）
    return {
      accessToken: process.env.CLAUDE_CODE_OAUTH_TOKEN,
      refreshToken: null,
      expiresAt: null,
      scopes: ['user:inference'],
      subscriptionType: null,
      rateLimitTier: null,
    }
  }

  // 检查来自文件描述符的 OAuth 令牌
  const oauthTokenFromFd = getOAuthTokenFromFileDescriptor()
  if (oauthTokenFromFd) {
    // 返回一个仅推理令牌（刷新和过期时间未知）
    return {
      accessToken: oauthTokenFromFd,
      refreshToken: null,
      expiresAt: null,
      scopes: ['user:inference'],
      subscriptionType: null,
      rateLimitTier: null,
    }
  }

  try {
    const secureStorage = getSecureStorage()
    const storageData = secureStorage.read()
    const oauthData = storageData?.claudeAiOauth

    if (!oauthData?.accessToken) {
      return null
    }

    return oauthData
  } catch (error) {
    logError(error)
    return null
  }
})

/**
 * 清除所有 OAuth 令牌缓存。在 401 错误时调用此函数，以确保下一次令牌读取来自安全存储，而不是过时的内存缓存。
 * 这处理了本地过期检查与服务器不一致的情况（例如，由于令牌颁发后的时钟校正）。
 */
export function clearOAuthTokenCache(): void {
  getClaudeAIOAuthTokens.cache?.clear?.()
  clearKeychainCache()
}

let lastCredentialsMtimeMs = 0

// 跨进程过时：另一个 CC 实例可能将新令牌写入磁盘（刷新或 /login），但此进程的备忘录缓存永远存在。
// 如果没有这个，终端 1 的 /login 修复了终端 1；终端 2 的 /login 然后撤销了终端 1 的服务端，而终端 1 的备忘录永不重新读取 —— 无限的 /login 回归（CC-1096, GH#24317）。
async function invalidateOAuthCacheIfDiskChanged(): Promise<void> {
  try {
    const { mtimeMs } = await stat(
      join(getClaudeConfigHomeDir(), '.credentials.json'),
    )
    if (mtimeMs !== lastCredentialsMtimeMs) {
      lastCredentialsMtimeMs = mtimeMs
      clearOAuthTokenCache()
    }
  } catch {
    // ENOENT — macOS 钥匙串路径（迁移时文件被删除）。仅清除备忘录，以便它委托给钥匙串缓存的 30 秒 TTL，而不是在其之上永久缓存。
    // `security find-generic-password` 约 15ms；受钥匙串缓存限制，每 30 秒一次。
    getClaudeAIOAuthTokens.cache?.clear?.()
  }
}

// 进行中去重：当 N 个 claude.ai 代理连接器同时使用相同的令牌遇到 401 时（在启动时很常见 — #20930），
// 只有一个应清除缓存并重新读取钥匙串。没有这个，每个调用的 clearOAuthTokenCache() 会销毁 macOsKeychainStorage 中的 readInFlight 并触发新的派生 —
// 同步派生堆积到 800ms+ 的阻塞渲染帧。
const pending401Handlers = new Map<string, Promise<boolean>>()

/**
 * 处理来自 API 的 401“OAuth 令牌已过期”错误。
 *
 * 此函数在服务器表示令牌已过期时强制刷新令牌，
 * 即使我们的本地过期检查不同意（这可能由于令牌颁发时的时钟问题而发生）。
 *
 * 安全性：我们将失败的令牌与钥匙串中的令牌进行比较。如果另一个标签页已经刷新（钥匙串中的不同令牌），我们将使用它而不是再次刷新。
 * 具有相同 failedAccessToken 的并发调用被去重为单次钥匙串读取。
 *
 * @param failedAccessToken - 被 401 拒绝的访问令牌
 * @returns 如果我们现在有有效令牌则返回 true，否则返回 false
 */
export function handleOAuth401Error(
  failedAccessToken: string,
): Promise<boolean> {
  const pending = pending401Handlers.get(failedAccessToken)
  if (pending) return pending

  const promise = handleOAuth401ErrorImpl(failedAccessToken).finally(() => {
    pending401Handlers.delete(failedAccessToken)
  })
  pending401Handlers.set(failedAccessToken, promise)
  return promise
}

async function handleOAuth401ErrorImpl(
  failedAccessToken: string,
): Promise<boolean> {
  // 清除缓存并从钥匙串重新读取（异步 — 同步读取每次调用阻塞约 100ms）
  clearOAuthTokenCache()
  const currentTokens = await getClaudeAIOAuthTokensAsync()

  if (!currentTokens?.refreshToken) {
    return false
  }

  // 如果钥匙串中有不同的令牌，另一个标签页已经刷新了 —— 使用它
  if (currentTokens.accessToken !== failedAccessToken) {
    logEvent('tengu_oauth_401_recovered_from_keychain', {})
    return true
  }

  // 相同的令牌失败了 —— 强制刷新，绕过本地过期检查
  return checkAndRefreshOAuthTokenIfNeeded(0, true)
}

/**
 * 异步读取 OAuth 令牌，避免阻塞钥匙串读取。
 * 对于环境变量/文件描述符令牌（不访问钥匙串）委托给同步记忆化版本，仅对存储读取使用异步。
 */
export async function getClaudeAIOAuthTokensAsync(): Promise<OAuthTokens | null> {
  if (isBareMode()) return null

  // 环境变量和 FD 令牌是同步的，不访问钥匙串
  if (
    process.env.CLAUDE_CODE_OAUTH_TOKEN ||
    getOAuthTokenFromFileDescriptor()
  ) {
    return getClaudeAIOAuthTokens()
  }

  try {
    const secureStorage = getSecureStorage()
    const storageData = await secureStorage.readAsync()
    const oauthData = storageData?.claudeAiOauth
    if (!oauthData?.accessToken) {
      return null
    }
    return oauthData
  } catch (error) {
    logError(error)
    return null
  }
}

// 用于去重并发调用的进行中 Promise
let pendingRefreshCheck: Promise<boolean> | null = null

export function checkAndRefreshOAuthTokenIfNeeded(
  retryCount = 0,
  force = false,
): Promise<boolean> {
  // 去重并发非重试、非强制调用
  if (retryCount === 0 && !force) {
    if (pendingRefreshCheck) {
      return pendingRefreshCheck
    }

    const promise = checkAndRefreshOAuthTokenIfNeededImpl(retryCount, force)
    pendingRefreshCheck = promise.finally(() => {
      pendingRefreshCheck = null
    })
    return pendingRefreshCheck
  }

  return checkAndRefreshOAuthTokenIfNeededImpl(retryCount, force)
}

async function checkAndRefreshOAuthTokenIfNeededImpl(
  retryCount: number,
  force: boolean,
): Promise<boolean> {
  const MAX_RETRIES = 5

  await invalidateOAuthCacheIfDiskChanged()

  // 首先使用缓存值检查令牌是否过期
  // 如果 force=true，则跳过此检查（服务器已经告诉我们令牌有问题）
  const tokens = getClaudeAIOAuthTokens()
  if (!force) {
    if (!tokens?.refreshToken || !isOAuthTokenExpired(tokens.expiresAt)) {
      return false
    }
  }

  if (!tokens?.refreshToken) {
    return false
  }

  if (!shouldUseClaudeAIAuth(tokens.scopes)) {
    return false
  }

  // 异步重新读取令牌以检查它们是否仍然过期
  // 另一个进程可能已经刷新了它们
  getClaudeAIOAuthTokens.cache?.clear?.()
  clearKeychainCache()
  const freshTokens = await getClaudeAIOAuthTokensAsync()
  if (
    !freshTokens?.refreshToken ||
    !isOAuthTokenExpired(freshTokens.expiresAt)
  ) {
    return false
  }

  // 令牌仍然过期，尝试获取锁并刷新
  const claudeDir = getClaudeConfigHomeDir()
  await mkdir(claudeDir, { recursive: true })

  let release
  try {
    logEvent('tengu_oauth_token_refresh_lock_acquiring', {})
    release = await lockfile.lock(claudeDir)
    logEvent('tengu_oauth_token_refresh_lock_acquired', {})
  } catch (err) {
    if ((err as { code?: string }).code === 'ELOCKED') {
      // 另一个进程持有锁，如果我们尚未超过最大重试次数，则重试
      if (retryCount < MAX_RETRIES) {
        logEvent('tengu_oauth_token_refresh_lock_retry', {
          retryCount: retryCount + 1,
        })
        // 重试前等待一会儿
        await sleep(1000 + Math.random() * 1000)
        return checkAndRefreshOAuthTokenIfNeededImpl(retryCount + 1, force)
      }
      logEvent('tengu_oauth_token_refresh_lock_retry_limit_reached', {
        maxRetries: MAX_RETRIES,
      })
      return false
    }
    logError(err)
    logEvent('tengu_oauth_token_refresh_lock_error', {
      error: errorMessage(
        err,
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    return false
  }
  try {
    // 获取锁后再检查一次
    getClaudeAIOAuthTokens.cache?.clear?.()
    clearKeychainCache()
    const lockedTokens = await getClaudeAIOAuthTokensAsync()
    if (
      !lockedTokens?.refreshToken ||
      !isOAuthTokenExpired(lockedTokens.expiresAt)
    ) {
      logEvent('tengu_oauth_token_refresh_race_resolved', {})
      return false
    }

    logEvent('tengu_oauth_token_refresh_starting', {})
    const refreshedTokens = await refreshOAuthToken(lockedTokens.refreshToken, {
      // 对于 Claude.ai 订阅者，省略 scopes 以便应用默认的 CLAUDE_AI_OAUTH_SCOPES
      // 这允许在无需重新登录的情况下通过刷新进行范围扩展（例如添加 user:file_upload）
      scopes: shouldUseClaudeAIAuth(lockedTokens.scopes)
        ? undefined
        : lockedTokens.scopes,
    })
    saveOAuthTokensIfNeeded(refreshedTokens)

    // 刷新令牌后清除缓存
    getClaudeAIOAuthTokens.cache?.clear?.()
    clearKeychainCache()
    return true
  } catch (error) {
    logError(error)

    getClaudeAIOAuthTokens.cache?.clear?.()
    clearKeychainCache()
    const currentTokens = await getClaudeAIOAuthTokensAsync()
    if (currentTokens && !isOAuthTokenExpired(currentTokens.expiresAt)) {
      logEvent('tengu_oauth_token_refresh_race_recovered', {})
      return true
    }

    return false
  } finally {
    logEvent('tengu_oauth_token_refresh_lock_releasing', {})
    await release()
    logEvent('tengu_oauth_token_refresh_lock_released', {})
  }
}

export function isClaudeAISubscriber(): boolean {
  if (!isAnthropicAuthEnabled()) {
    return false
  }

  return shouldUseClaudeAIAuth(getClaudeAIOAuthTokens()?.scopes)
}

/**
 * 检查当前 OAuth 令牌是否具有 user:profile 范围。
 *
 * 真正的 /login 令牌始终包含此范围。环境变量和文件描述符令牌（服务密钥）将范围硬编码为仅 ['user:inference']。
 * 使用此函数来门控对配置文件作用域端点的调用，以便服务密钥会话不会对 /api/oauth/profile、bootstrap 等产生 403 风暴。
 */
export function hasProfileScope(): boolean {
  return (
    getClaudeAIOAuthTokens()?.scopes?.includes(CLAUDE_AI_PROFILE_SCOPE) ?? false
  )
}

export function is1PApiCustomer(): boolean {
  // 1P API 客户是那些不是：
  // 1. Claude.ai 订阅者（Max、Pro、Enterprise、Team）
  // 2. Vertex AI 用户
  // 3. AWS Bedrock 用户
  // 4. Foundry 用户

  // 排除 Vertex、Bedrock 和 Foundry 客户
  if (
    isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
  ) {
    return false
  }

  // 排除 Claude.ai 订阅者
  if (isClaudeAISubscriber()) {
    return false
  }

  // 其他所有人都是 API 客户（OAuth API 客户、直接 API 密钥用户等）
  return true
}

/**
 * 当 Anthropic 认证启用时，获取 OAuth 账户信息。
 * 当使用外部 API 密钥或第三方服务时，返回 undefined。
 */
export function getOauthAccountInfo(): AccountInfo | undefined {
  return isAnthropicAuthEnabled() ? getGlobalConfig().oauthAccount : undefined
}

/**
 * 检查是否允许该组织进行超额/额外使用配置。
 * 此逻辑尽可能贴近 apps/claude-ai 中的 `useIsOverageProvisioningAllowed` 钩子。
 */
export function isOverageProvisioningAllowed(): boolean {
  const accountInfo = getOauthAccountInfo()
  const billingType = accountInfo?.billingType

  // 必须是具有支持订阅类型的 Claude 订阅者
  if (!isClaudeAISubscriber() || !billingType) {
    return false
  }

  // 仅允许 Stripe 和移动计费类型购买额外使用量
  if (
    billingType !== 'stripe_subscription' &&
    billingType !== 'stripe_subscription_contracted' &&
    billingType !== 'apple_subscription' &&
    billingType !== 'google_play_subscription'
  ) {
    return false
  }

  return true
}

// 返回用户是否有权访问 Opus，无论他们是订阅者还是按需付费用户。
export function hasOpusAccess(): boolean {
  const subscriptionType = getSubscriptionType()

  return (
    subscriptionType === 'max' ||
    subscriptionType === 'enterprise' ||
    subscriptionType === 'team' ||
    subscriptionType === 'pro' ||
    // subscriptionType === null 涵盖 API 用户以及订阅者未填充订阅类型的情况。
    // 对于这些订阅者，当有疑问时，我们不应限制他们对 Opus 的访问。
    subscriptionType === null
  )
}

export function getSubscriptionType(): SubscriptionType | null {
  // 首先检查模拟订阅类型（仅限 Ant 内部测试）
  if (shouldUseMockSubscription()) {
    return getMockSubscriptionType()
  }

  if (!isAnthropicAuthEnabled()) {
    return null
  }
  const oauthTokens = getClaudeAIOAuthTokens()
  if (!oauthTokens) {
    return null
  }

  return oauthTokens.subscriptionType ?? null
}

export function isMaxSubscriber(): boolean {
  return getSubscriptionType() === 'max'
}

export function isTeamSubscriber(): boolean {
  return getSubscriptionType() === 'team'
}

export function isTeamPremiumSubscriber(): boolean {
  return (
    getSubscriptionType() === 'team' &&
    getRateLimitTier() === 'default_claude_max_5x'
  )
}

export function isEnterpriseSubscriber(): boolean {
  return getSubscriptionType() === 'enterprise'
}

export function isProSubscriber(): boolean {
  return getSubscriptionType() === 'pro'
}

export function getRateLimitTier(): string | null {
  if (!isAnthropicAuthEnabled()) {
    return null
  }
  const oauthTokens = getClaudeAIOAuthTokens()
  if (!oauthTokens) {
    return null
  }

  return oauthTokens.rateLimitTier ?? null
}

export function getSubscriptionName(): string {
  const subscriptionType = getSubscriptionType()

  switch (subscriptionType) {
    case 'enterprise':
      return 'Claude Enterprise'
    case 'team':
      return 'Claude Team'
    case 'max':
      return 'Claude Max'
    case 'pro':
      return 'Claude Pro'
    default:
      return 'Claude API'
  }
}

/** 检查是否使用第三方服务（Bedrock 或 Vertex 或 Foundry） */
export function isUsing3PServices(): boolean {
  return !!(
    isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
  )
}

/**
 * 从设置中获取配置的 otelHeadersHelper
 */
function getConfiguredOtelHeadersHelper(): string | undefined {
  const mergedSettings = getSettings_DEPRECATED() || {}
  return mergedSettings.otelHeadersHelper
}

/**
 * 检查配置的 otelHeadersHelper 是否来自项目设置（projectSettings 或 localSettings）
 */
export function isOtelHeadersHelperFromProjectOrLocalSettings(): boolean {
  const otelHeadersHelper = getConfiguredOtelHeadersHelper()
  if (!otelHeadersHelper) {
    return false
  }

  const projectSettings = getSettingsForSource('projectSettings')
  const localSettings = getSettingsForSource('localSettings')
  return (
    projectSettings?.otelHeadersHelper === otelHeadersHelper ||
    localSettings?.otelHeadersHelper === otelHeadersHelper
  )
}

// 用于防抖 otelHeadersHelper 调用的缓存
let cachedOtelHeaders: Record<string, string> | null = null
let cachedOtelHeadersTimestamp = 0
const DEFAULT_OTEL_HEADERS_DEBOUNCE_MS = 29 * 60 * 1000 // 29 分钟

export function getOtelHeadersFromHelper(): Record<string, string> {
  const otelHeadersHelper = getConfiguredOtelHeadersHelper()

  if (!otelHeadersHelper) {
    return {}
  }

  // 如果缓存仍然有效，返回缓存的头部（防抖）
  const debounceMs = parseInt(
    process.env.CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS ||
      DEFAULT_OTEL_HEADERS_DEBOUNCE_MS.toString(),
    10,
  )
  if (
    cachedOtelHeaders &&
    Date.now() - cachedOtelHeadersTimestamp < debounceMs
  ) {
    return cachedOtelHeaders
  }

  if (isOtelHeadersHelperFromProjectOrLocalSettings()) {
    // 检查是否已为此项目建立信任
    const hasTrust = checkHasTrustDialogAccepted()
    if (!hasTrust) {
      return {}
    }
  }

  try {
    const result = execSyncWithDefaults_DEPRECATED(otelHeadersHelper, {
      timeout: 30000, // 30 秒 - 允许认证服务的延迟
    })
      ?.toString()
      .trim()
    if (!result) {
      throw new Error('otelHeadersHelper 未返回有效值')
    }

    const headers = jsonParse(result)
    if (
      typeof headers !== 'object' ||
      headers === null ||
      Array.isArray(headers)
    ) {
      throw new Error(
        'otelHeadersHelper 必须返回一个带有字符串键值对的 JSON 对象',
      )
    }

    // 验证所有值都是字符串
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== 'string') {
        throw new Error(
          `otelHeadersHelper 为键 "${key}" 返回了非字符串值: ${typeof value}`,
        )
      }
    }

    // 缓存结果
    cachedOtelHeaders = headers as Record<string, string>
    cachedOtelHeadersTimestamp = Date.now()

    return cachedOtelHeaders
  } catch (error) {
    logError(
      new Error(
        `从 otelHeadersHelper（在设置中）获取 OpenTelemetry 头部时出错: ${errorMessage(error)}`,
      ),
    )
    throw error
  }
}

function isConsumerPlan(plan: SubscriptionType): plan is 'max' | 'pro' {
  return plan === 'max' || plan === 'pro'
}

export function isConsumerSubscriber(): boolean {
  const subscriptionType = getSubscriptionType()
  return (
    isClaudeAISubscriber() &&
    subscriptionType !== null &&
    isConsumerPlan(subscriptionType)
  )
}

export type UserAccountInfo = {
  subscription?: string
  tokenSource?: string
  apiKeySource?: ApiKeySource
  organization?: string
  email?: string
}

export function getAccountInformation() {
  const apiProvider = getAPIProvider()
  // 仅为第一方 Anthropic API 提供账户信息
  if (apiProvider !== 'firstParty') {
    return undefined
  }
  const { source: authTokenSource } = getAuthTokenSource()
  const accountInfo: UserAccountInfo = {}
  if (
    authTokenSource === 'CLAUDE_CODE_OAUTH_TOKEN' ||
    authTokenSource === 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR'
  ) {
    accountInfo.tokenSource = authTokenSource
  } else if (isClaudeAISubscriber()) {
    accountInfo.subscription = getSubscriptionName()
  } else {
    accountInfo.tokenSource = authTokenSource
  }
  const { key: apiKey, source: apiKeySource } = getAnthropicApiKeyWithSource()
  if (apiKey) {
    accountInfo.apiKeySource = apiKeySource
  }

  // 如果我们依赖外部 API 密钥或认证令牌，则不知道组织
  if (
    authTokenSource === 'claude.ai' ||
    apiKeySource === '/login managed key'
  ) {
    // 从 OAuth 账户信息获取组织名称
    const orgName = getOauthAccountInfo()?.organizationName
    if (orgName) {
      accountInfo.organization = orgName
    }
  }
  const email = getOauthAccountInfo()?.emailAddress
  if (
    (authTokenSource === 'claude.ai' ||
      apiKeySource === '/login managed key') &&
    email
  ) {
    accountInfo.email = email
  }
  return accountInfo
}

/**
 * 组织验证结果 —— 要么成功，要么是描述性错误。
 */
export type OrgValidationResult =
  | { valid: true }
  | { valid: false; message: string }

/**
 * 验证活动 OAuth 令牌是否属于托管设置中 `forceLoginOrgUUID` 所需的组织。
 * 返回结果对象而不是抛出异常，以便调用方可以选择如何呈现错误。
 *
 * 失败时关闭：如果设置了 `forceLoginOrgUUID` 且无法确定令牌的组织（网络错误、缺少配置文件数据），验证失败。
 */
export async function validateForceLoginOrg(): Promise<OrgValidationResult> {
  // `claude ssh` 远程：真实认证存在于本地机器并由代理注入。
  // 占位符令牌无法针对配置文件端点进行验证。本地端在建立会话之前已经运行了此检查。
  if (process.env.ANTHROPIC_UNIX_SOCKET) {
    return { valid: true }
  }

  if (!isAnthropicAuthEnabled()) {
    return { valid: true }
  }

  const requiredOrgUuid =
    getSettingsForSource('policySettings')?.forceLoginOrgUUID
  if (!requiredOrgUuid) {
    return { valid: true }
  }

  // 确保访问令牌在访问配置文件端点之前是新鲜的。
  // 对于环境变量令牌（refreshToken 为 null）无操作。
  await checkAndRefreshOAuthTokenIfNeeded()

  const tokens = getClaudeAIOAuthTokens()
  if (!tokens) {
    return { valid: true }
  }

  // 始终从配置文件端点获取权威的组织 UUID。
  // 即使来自钥匙串的令牌也需要验证服务端：~/.claude.json 中缓存的 org UUID 是用户可写的，不能信任。
  const { source } = getAuthTokenSource()
  const isEnvVarToken =
    source === 'CLAUDE_CODE_OAUTH_TOKEN' ||
    source === 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR'

  const profile = await getOauthProfileFromOauthToken(tokens.accessToken)
  if (!profile) {
    // 失败时关闭 —— 我们无法验证组织
    return {
      valid: false,
      message:
        `无法验证当前认证令牌的组织。\n` +
        `此机器需要组织 ${requiredOrgUuid}，但无法获取配置文件。\n` +
        `这可能是网络错误，或者令牌缺少验证所需的 user:profile 范围\n` +
        `（来自 'claude setup-token' 的令牌不包含此范围）。\n` +
        `请重试，或通过 'claude auth login' 获取全范围令牌。`,
    }
  }

  const tokenOrgUuid = profile.organization.uuid
  if (tokenOrgUuid === requiredOrgUuid) {
    return { valid: true }
  }

  if (isEnvVarToken) {
    const envVarName =
      source === 'CLAUDE_CODE_OAUTH_TOKEN'
        ? 'CLAUDE_CODE_OAUTH_TOKEN'
        : 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR'
    return {
      valid: false,
      message:
        `环境变量 ${envVarName} 提供的令牌属于\n` +
        `与此机器托管设置要求的组织不同的组织。\n\n` +
        `所需组织: ${requiredOrgUuid}\n` +
        `令牌所属组织:   ${tokenOrgUuid}\n\n` +
        `请移除环境变量或为正确的组织获取令牌。`,
    }
  }

  return {
    valid: false,
    message:
      `您的认证令牌属于组织 ${tokenOrgUuid}，\n` +
      `但此机器需要组织 ${requiredOrgUuid}。\n\n` +
      `请使用正确的组织登录: claude auth login`,
  }
}

class GcpCredentialsTimeoutError extends Error {}