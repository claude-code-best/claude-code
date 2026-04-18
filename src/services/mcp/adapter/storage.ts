// Host content storage adapter — bridges persistBinaryContent to mcp-client's ContentStorage interface

import type { ContentStorage } from '@claude-code-best/mcp-client'
import { persistBinaryContent } from '../../../utils/mcpOutputStorage.js'
import {
  persistToolResult,
  isPersistError,
} from '../../../utils/toolResultStorage.js'

/**
 * Creates a ContentStorage implementation using the host's binary persistence.
 */
export function createMcpStorage(): ContentStorage {
  return {
    async persistBinaryContent(data: Buffer, ext: string) {
      const result = await persistBinaryContent(
        data,
        ext,
        `mcp-adapter-${Date.now()}`,
      )
      if ('error' in result) {
        throw new Error(result.error)
      }
      return result.filepath
    },
  }
}
