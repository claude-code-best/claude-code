// Host HTTP config adapter — bridges getUserAgent/getSessionId to mcp-client's HttpConfig interface

import type { HttpConfig } from '@claude-code-best/mcp-client'
import { getMCPUserAgent } from '../../../utils/http.js'
import { getSessionId } from '../../../bootstrap/state.js'

/**
 * Creates an HttpConfig implementation using the host's user agent and session ID.
 */
export function createMcpHttpConfig(): HttpConfig {
  return {
    getUserAgent: () => getMCPUserAgent(),
    getSessionId: () => getSessionId(),
  }
}
