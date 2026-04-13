// Host proxy config adapter — bridges proxy/MTLS to mcp-client's ProxyConfig interface

import type { ProxyConfig } from '@claude-code-best/mcp-client'
import {
  getProxyFetchOptions,
  getWebSocketProxyAgent,
  getWebSocketProxyUrl,
} from '../../../utils/proxy.js'
import { getWebSocketTLSOptions } from '../../../utils/mtls.js'

/**
 * Creates a ProxyConfig implementation using the host's proxy and TLS settings.
 */
export function createMcpProxyConfig(): ProxyConfig {
  return {
    getFetchOptions() {
      return getProxyFetchOptions() as Record<string, unknown>
    },
    getWebSocketAgent(url: string) {
      return getWebSocketProxyAgent(url)
    },
    getWebSocketUrl(url: string) {
      return getWebSocketProxyUrl(url)
    },
    getTLSOptions() {
      const opts = getWebSocketTLSOptions()
      return opts as Record<string, unknown> | undefined
    },
  }
}
