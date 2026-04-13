// Host logger adapter — bridges logMCPDebug/logMCPError to mcp-client's Logger interface

import type { Logger } from '@claude-code-best/mcp-client'
import { logMCPDebug, logMCPError } from '../../../utils/log.js'

/**
 * Creates a Logger implementation that delegates to the host's MCP logging system.
 */
export function createMcpLogger(): Logger {
  return {
    debug(message: string, ...args: unknown[]) {
      // Extract server name from bracketed prefix if present: [serverName] message
      const match = message.match(/^\[([^\]]+)\]\s*(.*)/)
      if (match) {
        logMCPDebug(match[1], match[2])
      }
      // Silently ignore messages without server name prefix
    },
    info(message: string, ...args: unknown[]) {
      const match = message.match(/^\[([^\]]+)\]\s*(.*)/)
      if (match) {
        logMCPDebug(match[1], match[2])
      }
    },
    warn(message: string, ...args: unknown[]) {
      const match = message.match(/^\[([^\]]+)\]\s*(.*)/)
      if (match) {
        logMCPError(match[1], message)
      }
    },
    error(message: string, ...args: unknown[]) {
      const match = message.match(/^\[([^\]]+)\]\s*(.*)/)
      if (match) {
        logMCPError(match[1], args[0] ?? message)
      }
    },
  }
}
