// Host dependency injection — assembles McpClientDependencies from host infrastructure
// This is the single entry point for creating the dependencies object used by createMcpManager()

import type { McpClientDependencies } from '@claude-code-best/mcp-client'
import { createMcpLogger } from './logger.js'
import { createMcpHttpConfig } from './httpConfig.js'
import { createMcpProxyConfig } from './proxy.js'
import { createMcpAnalytics } from './analytics.js'
import { createMcpSubprocessEnv } from './subprocessEnv.js'
import { createMcpStorage } from './storage.js'
import { createMcpImageProcessor } from './imageProcessor.js'
import { createMcpAuth } from './auth.js'
/**
 * Creates the full set of MCP client dependencies using host infrastructure.
 * All adapters are lazy — they only call into host modules when invoked.
 *
 * Note: featureGate is omitted because Bun's feature() requires string-literal
 * arguments at compile time and cannot accept runtime variables. The interface
 * field is optional and the mcp-client package does not use it currently.
 */
export function createMcpDependencies(): McpClientDependencies {
  return {
    logger: createMcpLogger(),
    httpConfig: createMcpHttpConfig(),
    proxy: createMcpProxyConfig(),
    analytics: createMcpAnalytics(),
    subprocessEnv: createMcpSubprocessEnv(),
    storage: createMcpStorage(),
    imageProcessor: createMcpImageProcessor(),
    auth: createMcpAuth(),
  }
}
