/**
 * CoStrict 自定义 fetch 模块
 * 动态注入 Authorization header 并处理 token 刷新
 */

import { randomUUID } from 'node:crypto'
import {
  loadCoStrictCredentials,
  saveCoStrictCredentials,
} from './credentials.js'
import {
  isCoStrictTokenValid,
  refreshCoStrictToken,
  extractExpiryFromJWT,
} from './token.js'

import { createRequire } from 'module'

function getVersion(): string {
  try {
    if (typeof MACRO !== 'undefined' && MACRO.VERSION) return MACRO.VERSION
  } catch {
    /* ignore */
  }
  try {
    const require = createRequire(import.meta.url)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../../package.json') as { version: string }
    return pkg.version
  } catch {
    return '1.0.0'
  }
}

const VERSION = getVersion()

/**
 * 创建自定义 fetch 函数，用于 CoStrict API 请求
 *
 * 功能:
 * 1. 动态读取凭证
 * 2. 预防性 Token 刷新（请求前检查）
 * 3. 注入 Authorization 和 CoStrict 特有 headers
 * 4. 反应性 401 错误恢复（自动重试一次）
 */
export function createCoStrictFetch() {
  const costrictFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    // ========== 步骤 1: 动态读取凭证 ==========
    let creds = await loadCoStrictCredentials()

    if (!creds) {
      throw new Error(
        'CoStrict credentials not found. Please run /costrict-login first.',
      )
    }

    // ========== 步骤 2: 预防性 Token 刷新 ==========
    if (creds.refresh_token && !isCoStrictTokenValid(creds)) {
      try {
        const refreshed = await refreshCoStrictToken({
          baseUrl: creds.base_url,
          refreshToken: creds.refresh_token,
          state: creds.state,
        })
        const updatedCreds = {
          ...creds,
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expiry_date: extractExpiryFromJWT(refreshed.access_token),
          updated_at: new Date().toISOString(),
          expired_at: new Date(
            extractExpiryFromJWT(refreshed.access_token),
          ).toISOString(),
        }
        await saveCoStrictCredentials(updatedCreds)
        creds = updatedCreds
      } catch {
        // 刷新失败，继续使用旧 token 尝试
      }
    }

    // ========== 步骤 3: 构建 headers ==========
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${creds.access_token}`)
    headers.set('HTTP-Referer', 'https://github.com/zgsm-ai/costrict-cli')
    headers.set('X-Title', 'CoStrict-CLI')
    headers.set('X-Costrict-Version', `costrict-cli-${VERSION}`)
    headers.set('X-Request-ID', randomUUID())
    headers.set('zgsm-client-id', creds.machine_id)
    headers.set('zgsm-client-ide', 'cli')

    // ========== 步骤 4: 发起请求 ==========
    const response = await fetch(input, { ...init, headers })

    // ========== 步骤 5: 反应性 401 恢复 ==========
    if (response.status === 401 && creds.refresh_token) {
      try {
        const refreshed = await refreshCoStrictToken({
          baseUrl: creds.base_url,
          refreshToken: creds.refresh_token,
          state: creds.state,
        })
        const updatedCreds = {
          ...creds,
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expiry_date: extractExpiryFromJWT(refreshed.access_token),
          updated_at: new Date().toISOString(),
          expired_at: new Date(
            extractExpiryFromJWT(refreshed.access_token),
          ).toISOString(),
        }
        await saveCoStrictCredentials(updatedCreds)
        headers.set('Authorization', `Bearer ${refreshed.access_token}`)
        headers.set('X-Request-ID', randomUUID())
        return fetch(input, { ...init, headers })
      } catch {
        // 重试失败，返回原始 401 响应
      }
    }

    return response
  }
  // Bun 原生支持 fetch.preconnect（共享连接池预热）
  // Node.js 没有 preconnect API，降级为 net.createConnection 做 TCP 预热
  if (typeof fetch.preconnect === 'function') {
    costrictFetch.preconnect = fetch.preconnect.bind(fetch)
  } else {
    costrictFetch.preconnect = (url: string | URL) => {
      try {
        const { hostname, port } = new URL(typeof url === 'string' ? url : url.toString())
        const { createConnection } = require('node:net') as typeof import('node:net')
        const sock = createConnection(Number(port) || 443, hostname, () => sock.destroy())
        sock.setTimeout(3000, () => sock.destroy())
        sock.on('error', () => sock.destroy())
      } catch {
        // 预连接失败不影响正常流程
      }
    }
  }
  return costrictFetch
}
