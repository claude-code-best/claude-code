import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import type { GoogleAuth } from 'google-auth-library'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getAnthropicApiKey,
  getApiKeyFromApiKeyHelper,
  getClaudeAIOAuthTokens,
  isClaudeAISubscriber,
  refreshAndGetAwsCredentials,
  refreshGcpCredentialsIfNeeded,
} from 'src/utils/auth.js'
import { getUserAgent } from 'src/utils/http.js'
import { getSmallFastModel } from 'src/utils/model/model.js'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from 'src/utils/model/providers.js'
import { getProxyFetchOptions } from 'src/utils/proxy.js'
import {
  getIsNonInteractiveSession,
  getSessionId,
} from '../../bootstrap/state.js'
import { getOauthConfig } from '../../constants/oauth.js'
import { isDebugToStdErr, logForDebugging } from '../../utils/debug.js'
import {
  getAWSRegion,
  getVertexRegionForModel,
  isEnvTruthy,
} from '../../utils/envUtils.js'

/** 
 * 不同客户端类型的环境变量：
 *
 * 直接 API：
 * - ANTHROPIC_API_KEY：直接 API 访问所需
 *
 * AWS Bedrock：
 * - 通过 aws-sdk 默认配置的 AWS 凭证
 * - AWS_REGION 或 AWS_DEFAULT_REGION：为所有模型设置 AWS 区域（默认：us-east-1）
 * - ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION：可选。专门为小型快速模型（Haiku）覆盖 AWS 区域
 *
 * Foundry (Azure)：
 * - ANTHROPIC_FOUNDRY_RESOURCE：您的 Azure 资源名称（例如 'my-resource'）
 *   完整端点：https://{resource}.services.ai.azure.com/anthropic/v1/messages
 * - ANTHROPIC_FOUNDRY_BASE_URL：可选。替代资源 - 直接提供完整的基础 URL
 *   （例如 'https://my-resource.services.ai.azure.com'）
 *
 * 身份验证（以下之一）：
 * - ANTHROPIC_FOUNDRY_API_KEY：您的 Microsoft Foundry API 密钥（如果使用 API 密钥身份验证）
 * - Azure AD 身份验证：如果未提供 API 密钥，则使用 DefaultAzureCredential
 *   它支持多种身份验证方法（环境变量、托管标识、Azure CLI 等）。
 *   参见：https://docs.microsoft.com/en-us/javascript/api/@azure/identity
 *
 * Vertex AI：
 * - 特定于模型的区域变量（最高优先级）：
 *   - VERTEX_REGION_CLAUDE_3_5_HAIKU：Claude 3.5 Haiku 模型的区域
 *   - VERTEX_REGION_CLAUDE_HAIKU_4_5：Claude Haiku 4.5 模型的区域
 *   - VERTEX_REGION_CLAUDE_3_5_SONNET：Claude 3.5 Sonnet 模型的区域
 *   - VERTEX_REGION_CLAUDE_3_7_SONNET：Claude 3.7 Sonnet 模型的区域
 * - CLOUD_ML_REGION：可选。用于所有模型的默认 GCP 区域
 *   如果上述未指定特定模型区域
 * - ANTHROPIC_VERTEX_PROJECT_ID：必需。您的 GCP 项目 ID
 * - 通过 google-auth-library 配置的标准 GCP 凭证
 *
 * 确定区域的优先级：
 * 1. 硬编码的特定于模型的环境变量
 * 2. 全局 CLOUD_ML_REGION 变量
 * 3. 配置中的默认区域
 * 4. 回退区域 (us-east5)
 */ 

function createStderrLogger(): ClientOptions['logger'] {
  return {
    error: (msg, ...args) =>
      console.error('[Anthropic SDK ERROR]', msg, ...args),
    warn: (msg, ...args) => console.error('[Anthropic SDK WARN]', msg, ...args),
    info: (msg, ...args) => console.error('[Anthropic SDK INFO]', msg, ...args),
    debug: (msg, ...args) =>
      console.error('[Anthropic SDK DEBUG]', msg, ...args),
  }
}

export async function getAnthropicClient({
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  apiKey?: string
  maxRetries: number
  model?: string
  fetchOverride?: ClientOptions['fetch']
  source?: string
}): Promise<Anthropic> {
  const containerId = process.env.CLAUDE_CODE_CONTAINER_ID
  const remoteSessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID
  const clientApp = process.env.CLAUDE_AGENT_SDK_CLIENT_APP
  const customHeaders = getCustomHeaders()
  const defaultHeaders: { [key: string]: string } = {
    'x-app': 'cli',
    'User-Agent': getUserAgent(),
    'X-Claude-Code-Session-Id': getSessionId(),
    ...customHeaders,
    ...(containerId ? { 'x-claude-remote-container-id': containerId } : {}),
    ...(remoteSessionId
      ? { 'x-claude-remote-session-id': remoteSessionId }
      : {}),
    // SDK 使用者可以为其应用/库进行标识，以便进行后端分析
    ...(clientApp ? { 'x-client-app': clientApp } : {}),
    // SSH auth proxy nonce — tunneled API requests must carry this header
    ...(process.env.ANTHROPIC_AUTH_NONCE
      ? { 'x-auth-nonce': process.env.ANTHROPIC_AUTH_NONCE }
      : {}),
  }

  // 记录 API 客户端配置以供 HFI 调试
  logForDebugging(
    `[API:request] Creating client, ANTHROPIC_CUSTOM_HEADERS present: ${!!process.env.ANTHROPIC_CUSTOM_HEADERS}, has Authorization header: ${!!customHeaders['Authorization']}`,
  )

  // 如果通过环境变量启用，则添加额外的保护头
  const additionalProtectionEnabled = isEnvTruthy(
    process.env.CLAUDE_CODE_ADDITIONAL_PROTECTION,
  )
  if (additionalProtectionEnabled) {
    defaultHeaders['x-anthropic-additional-protection'] = 'true'
  }

  logForDebugging('[API:auth] OAuth token check starting')
  await checkAndRefreshOAuthTokenIfNeeded() //更新OAth令牌，防止访问模型的时候报401错误。
  logForDebugging('[API:auth] OAuth token check complete')

  if (!isClaudeAISubscriber()) {
    await configureApiKeyHeaders(defaultHeaders, getIsNonInteractiveSession())
  }

  const resolvedFetch = buildFetch(fetchOverride, source)

  const ARGS = {
    defaultHeaders,
    maxRetries,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
    dangerouslyAllowBrowser: true,
    fetchOptions: getProxyFetchOptions({
      forAnthropicAPI: true,
    }) as ClientOptions['fetchOptions'],
    ...(resolvedFetch && {
      fetch: resolvedFetch,
    }),
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)) {
    const { BedrockClient } = await import('./bedrockClient.js')
    // Use region override for small fast model if specified
    const awsRegion =
      model === getSmallFastModel() &&
      process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
        ? process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
        : getAWSRegion()

    const bedrockArgs: Record<string, unknown> = {
      ...ARGS,
      awsRegion,
      ...(isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH) && {
        skipAuth: true,
      }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    }

    // 如果可用，添加 API 密钥身份验证
    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
      bedrockArgs.skipAuth = true
      // 为 Bedrock API 密钥身份验证添加 Bearer 令牌
      bedrockArgs.defaultHeaders = {
        ...(bedrockArgs.defaultHeaders as Record<string, string> | undefined),
        Authorization: `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`,
      }
    } else if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH)) {
      // 刷新身份验证并获取凭证（同时清除缓存）
      const cachedCredentials = await refreshAndGetAwsCredentials()
      if (cachedCredentials) {
        bedrockArgs.awsAccessKey = cachedCredentials.accessKeyId
        bedrockArgs.awsSecretKey = cachedCredentials.secretAccessKey
        bedrockArgs.awsSessionToken = cachedCredentials.sessionToken
      }
    }
    // 我们一直以来都在对返回类型进行错误描述——这种设计不支持批量处理或使用模型。
    return new BedrockClient(bedrockArgs) as unknown as Anthropic
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) {
    const { AnthropicFoundry } = await import('@anthropic-ai/foundry-sdk')
    // 根据配置确定 Azure AD 令牌提供程序
    // SDK 默认读取 ANTHROPIC_FOUNDRY_API_KEY
    let azureADTokenProvider: (() => Promise<string>) | undefined
    if (!process.env.ANTHROPIC_FOUNDRY_API_KEY) {
      if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_FOUNDRY_AUTH)) {
        // 用于测试/代理场景的模拟令牌提供程序（类似于 Vertex 模拟 GoogleAuth）
        azureADTokenProvider = () => Promise.resolve('')
      } else {
        // 使用带有 DefaultAzureCredential 的真实 Azure AD 身份验证
        const {
          DefaultAzureCredential: AzureCredential,
          getBearerTokenProvider,
        } = await import('@azure/identity')
        azureADTokenProvider = getBearerTokenProvider(
          new AzureCredential(),
          'https://cognitiveservices.azure.com/.default',
        )
      }
    }

    const foundryArgs: ConstructorParameters<typeof AnthropicFoundry>[0] = {
      ...ARGS,
      ...(azureADTokenProvider && { azureADTokenProvider }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    }
    // 我们一直在对返回类型撒谎 - 这不支持批处理或模型
    return new AnthropicFoundry(foundryArgs) as unknown as Anthropic
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) {
    // 如果配置了 gcpAuthRefresh 且凭证已过期，则刷新 GCP 凭证
    // 这类似于我们处理 Bedrock 的 AWS 凭证刷新的方式
    if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)) {
      await refreshGcpCredentialsIfNeeded()
    }

    const [{ AnthropicVertex }, { GoogleAuth }] = await Promise.all([
      import('@anthropic-ai/vertex-sdk'),
      import('google-auth-library'),
    ])
    // TODO：缓存 GoogleAuth 实例或 AuthClient 以提高性能
    // 目前我们为每个 getAnthropicClient() 调用创建一个新的 GoogleAuth 实例
    // 这可能导致重复的身份验证流程和元数据服务器检查
    // 然而，缓存需要仔细处理：
    // - 凭证刷新/过期
    // - 环境变量更改（GOOGLE_APPLICATION_CREDENTIALS、项目变量）
    // - 跨请求的身份验证状态管理
    // 有关缓存挑战，请参见：https://github.com/googleapis/google-auth-library-nodejs/issues/390

    // 通过提供 projectId 作为回退来防止元数据服务器超时
    // google-auth-library 按以下顺序检查项目 ID：
    // 1. 环境变量（GCLOUD_PROJECT、GOOGLE_CLOUD_PROJECT 等）
    // 2. 凭证文件（服务帐户 JSON、ADC 文件）
    // 3. gcloud 配置
    // 4. GCE 元数据服务器（在 GCP 外部会导致 12 秒超时）
    //
    // 我们仅在用户未配置其他发现方法时设置 projectId
    // 以避免干扰他们现有的身份验证设置

    // 按照与 google-auth-library 相同的顺序检查项目环境变量
    // 参见：https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/googleauth.ts
    const hasProjectEnvVar =
      process.env['GCLOUD_PROJECT'] ||
      process.env['GOOGLE_CLOUD_PROJECT'] ||
      process.env['gcloud_project'] ||
      process.env['google_cloud_project']

    // 检查凭证文件路径（服务帐户或 ADC）
    // 注意：为安全起见，我们同时检查标准和小写变体，
    // 尽管我们应该验证 google-auth-library 实际检查的内容
    const hasKeyFile =
      process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
      process.env['google_application_credentials']

    const googleAuth = isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)
      ? ({
          // 用于测试/代理场景的模拟 GoogleAuth
          getClient: () => ({
            getRequestHeaders: () => ({}),
          }),
        } as unknown as GoogleAuth)
      : new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          // 仅将 ANTHROPIC_VERTEX_PROJECT_ID 作为最后手段的回退
          // 这在以下情况下防止 12 秒的元数据服务器超时：
          // - 未设置项目环境变量 且
          // - 未指定凭证密钥文件 且
          // - ADC 文件存在但缺少 project_id 字段
          //
          // 风险：如果身份验证项目 != API 目标项目，可能导致计费/审计问题
          // 缓解措施：用户可以设置 GOOGLE_CLOUD_PROJECT 来覆盖
          ...(hasProjectEnvVar || hasKeyFile
            ? {}
            : {
                projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
              }),
        })

    const vertexArgs: ConstructorParameters<typeof AnthropicVertex>[0] = {
      ...ARGS,
      region: getVertexRegionForModel(model),
      googleAuth: googleAuth as any,
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    }
    // 我们一直在对返回类型撒谎 - 这不支持批处理或模型
    return new AnthropicVertex(vertexArgs) as unknown as Anthropic
  }

  // 根据可用令牌确定身份验证方法
  const clientConfig: ConstructorParameters<typeof Anthropic>[0] = {
    apiKey: isClaudeAISubscriber() ? null : apiKey || getAnthropicApiKey(),
    authToken: isClaudeAISubscriber()
      ? getClaudeAIOAuthTokens()?.accessToken
      : undefined,
    // 使用暂存 OAuth 时，从 OAuth 配置设置 baseURL
    ...(process.env.USER_TYPE === 'ant' &&
    isEnvTruthy(process.env.USE_STAGING_OAUTH)
      ? { baseURL: getOauthConfig().BASE_API_URL }
      : {}),
    ...ARGS,
    ...(isDebugToStdErr() && { logger: createStderrLogger() }),
  }

  return new Anthropic(clientConfig)
}

async function configureApiKeyHeaders(
  headers: Record<string, string>,
  isNonInteractiveSession: boolean,
): Promise<void> {
  const token =
    process.env.ANTHROPIC_AUTH_TOKEN ||
    (await getApiKeyFromApiKeyHelper(isNonInteractiveSession))
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
}

function getCustomHeaders(): Record<string, string> {
  const customHeaders: Record<string, string> = {}
  const customHeadersEnv = process.env.ANTHROPIC_CUSTOM_HEADERS

  if (!customHeadersEnv) return customHeaders

  // 按换行符分割以支持多个头
  const headerStrings = customHeadersEnv.split(/\n|\r\n/)

  for (const headerString of headerStrings) {
    if (!headerString.trim()) continue

    // 解析格式为 "名称: 值" 的头（curl 风格）。在第一个 `:` 处分割
    // 然后修剪 — 避免对格式错误的长头行进行正则回溯。
    const colonIdx = headerString.indexOf(':')
    if (colonIdx === -1) continue
    const name = headerString.slice(0, colonIdx).trim()
    const value = headerString.slice(colonIdx + 1).trim()
    if (name) {
      customHeaders[name] = value
    }
  }

  return customHeaders
}

export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'

function buildFetch(
  fetchOverride: ClientOptions['fetch'],
  source: string | undefined,
): ClientOptions['fetch'] {
  // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
  const inner = fetchOverride ?? globalThis.fetch
  // 仅发送到第一方 API — Bedrock/Vertex/Foundry 不记录它
  // 并且未知头可能被严格代理拒绝（inc-4029 类）。
  const injectClientRequestId =
    getAPIProvider() === 'firstParty' && isFirstPartyAnthropicBaseUrl()
  return (input, init) => {
    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
    const headers = new Headers(init?.headers)
    // 生成客户端请求 ID，以便超时（不返回服务器请求 ID）
    // 仍然可以被 API 团队与服务器日志关联。
    // 希望自己跟踪 ID 的调用者可以预先设置该头。
    if (injectClientRequestId && !headers.has(CLIENT_REQUEST_ID_HEADER)) {
      headers.set(CLIENT_REQUEST_ID_HEADER, randomUUID())
    }
    try {
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      const url = input instanceof Request ? input.url : String(input)
      const id = headers.get(CLIENT_REQUEST_ID_HEADER)
      logForDebugging(
        `[API REQUEST] ${new URL(url).pathname}${id ? ` ${CLIENT_REQUEST_ID_HEADER}=${id}` : ''} source=${source ?? 'unknown'}`,
      )
    } catch {
      // 绝不让日志记录使 fetch 崩溃
    }
    return inner(input, { ...init, headers })
  }
}
