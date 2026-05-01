/**
 * HTTP 实用常量与辅助函数
 */

import axios from 'axios'
import { OAUTH_BETA_HEADER } from '../constants/oauth.js'
import {
  getAnthropicApiKey,
  getClaudeAIOAuthTokens,
  handleOAuth401Error,
  isClaudeAISubscriber,
} from './auth.js'
import { getClaudeCodeUserAgent } from './userAgent.js'
import { getWorkload } from './workloadContext.js'

// 警告：我们在用户代理中依赖 `claude-cli` 进行日志过滤。
// 在没有确保日志也同步更新的情况下，请不要修改此项！
export function getUserAgent(): string {
  const agentSdkVersion = process.env.CLAUDE_AGENT_SDK_VERSION
    ? `, agent-sdk/${process.env.CLAUDE_AGENT_SDK_VERSION}`
    : ''
  // SDK 使用者可以通过 CLAUDE_AGENT_SDK_CLIENT_APP 标识其应用/库
  // 例如 "my-app/1.0.0" 或 "my-library/2.1"
  const clientApp = process.env.CLAUDE_AGENT_SDK_CLIENT_APP
    ? `, client-app/${process.env.CLAUDE_AGENT_SDK_CLIENT_APP}`
    : ''
  // 用于定时任务发起请求的回合/进程范围的工作负载标签。仅限第一方可观测性 ——
  // 代理会剥离 HTTP 头；QoS 路由改用计费头（billing-header）属性块中的 cc_workload（参见 constants/system.ts）。
  // getAnthropicClient (client.ts:98) 在 withRetry 内部每次请求都会调用本函数，
  // 因此读取到的值与 getAttributionHeader 中的 setWorkload() 值相同。
  const workload = getWorkload()
  const workloadSuffix = workload ? `, workload/${workload}` : ''
  return `claude-cli/${MACRO.VERSION} (${process.env.USER_TYPE}, ${process.env.CLAUDE_CODE_ENTRYPOINT ?? 'cli'}${agentSdkVersion}${clientApp}${workloadSuffix})`
}

export function getMCPUserAgent(): string {
  const parts: string[] = []
  if (process.env.CLAUDE_CODE_ENTRYPOINT) {
    parts.push(process.env.CLAUDE_CODE_ENTRYPOINT)
  }
  if (process.env.CLAUDE_AGENT_SDK_VERSION) {
    parts.push(`agent-sdk/${process.env.CLAUDE_AGENT_SDK_VERSION}`)
  }
  if (process.env.CLAUDE_AGENT_SDK_CLIENT_APP) {
    parts.push(`client-app/${process.env.CLAUDE_AGENT_SDK_CLIENT_APP}`)
  }
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  return `claude-code/${MACRO.VERSION}${suffix}`
}

// 用于向任意站点发起 WebFetch 请求的 User-Agent。`Claude-User` 是 Anthropic
// 为用户发起的抓取请求公开定义的代理标识（站点运维人员在 robots.txt 中匹配此标识）；
// claude-code 后缀可以让站点区分本地 CLI 流量与 claude.ai 服务端抓取。
export function getWebFetchUserAgent(): string {
  return `Claude-User (${getClaudeCodeUserAgent()}; +https://support.anthropic.com/)`
}

export type AuthHeaders = {
  headers: Record<string, string>
  error?: string
}

/**
 * 获取 API 请求的认证头
 * 为 Max/Pro 用户返回 OAuth 头，为普通用户返回 API 密钥头
 */
export function getAuthHeaders(): AuthHeaders {
  if (isClaudeAISubscriber()) {
    const oauthTokens = getClaudeAIOAuthTokens()
    if (!oauthTokens?.accessToken) {
      return {
        headers: {},
        error: '没有可用的 OAuth 令牌',
      }
    }
    return {
      headers: {
        Authorization: `Bearer ${oauthTokens.accessToken}`,
        'anthropic-beta': OAUTH_BETA_HEADER,
      },
    }
  }
  // TODO：如果 API 密钥被设置为 LLM 网关密钥，此处会失败
  // 是否应该尝试查询 keychain / 凭据以获取有效的 Anthropic 密钥？
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    return {
      headers: {},
      error: '没有可用的 API 密钥',
    }
  }
  return {
    headers: {
      'x-api-key': apiKey,
    },
  }
}

/**
 * 包装函数，用于处理 OAuth 401 错误：强制刷新令牌并重试一次。
 * 解决时钟漂移导致本地过期检查与服务器不一致的场景。
 *
 * 重试时会再次调用请求闭包，因此闭包应重新读取认证信息（例如通过 getAuthHeaders()）来获取刷新后的令牌。
 *
 * 注意：bridgeApi.ts 有自己的 DI 注入版本 —— handleOAuth401Error 会传递导入 config.ts（约 1300 个模块），
 * 这会破坏 SDK bundle。
 *
 * @param opts.also403Revoked - 同时处理 403 且响应体包含 "OAuth token has been revoked" 的情况（某些端点以此而非 401 表示吊销）。
 */
export async function withOAuth401Retry<T>(
  request: () => Promise<T>,
  opts?: { also403Revoked?: boolean },
): Promise<T> {
  try {
    return await request()
  } catch (err) {
    if (!axios.isAxiosError(err)) throw err
    const status = err.response?.status
    const isAuthError =
      status === 401 ||
      (opts?.also403Revoked &&
        status === 403 &&
        typeof err.response?.data === 'string' &&
        err.response.data.includes('OAuth token has been revoked'))
    if (!isAuthError) throw err
    const failedAccessToken = getClaudeAIOAuthTokens()?.accessToken
    if (!failedAccessToken) throw err
    await handleOAuth401Error(failedAccessToken)
    return await request()
  }
}