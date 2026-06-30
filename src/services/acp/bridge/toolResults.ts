// Tool result → ToolCallContent conversion.
import type { ToolCallContent } from './types.js'
import type { EditToolResponse } from './types.js'
import { toAcpContentUpdate, toAcpContentBlock } from './contentBlocks.js'
import { toAbsolutePath } from './paths.js'
import { markdownEscape } from '../utils.js'

export function toolUpdateFromToolResult(
  toolResult: Record<string, unknown>,
  toolUse: { name: string; id: string } | undefined,
  _supportsTerminalOutput: boolean = false,
): {
  content?: ToolCallContent[]
  title?: string
  _meta?: Record<string, unknown>
} {
  if (!toolUse) return {}

  const isError = toolResult.is_error === true
  const resultContent = toolResult.content as
    | string
    | Array<Record<string, unknown>>
    | undefined

  // For error results, return error content
  if (isError && resultContent) {
    return toAcpContentUpdate(resultContent, true)
  }

  switch (toolUse.name) {
    case 'Read': {
      if (typeof resultContent === 'string' && resultContent.length > 0) {
        return {
          content: [
            {
              type: 'content' as const,
              content: {
                type: 'text' as const,
                text: markdownEscape(resultContent),
              },
            },
          ],
        }
      }
      if (Array.isArray(resultContent) && resultContent.length > 0) {
        return {
          content: resultContent.map((c: Record<string, unknown>) => ({
            type: 'content' as const,
            content:
              c.type === 'text'
                ? {
                    type: 'text' as const,
                    text: markdownEscape(c.text as string),
                  }
                : toAcpContentBlock(c, false),
          })),
        }
      }
      return {}
    }

    case 'Bash': {
      let output = ''
      // Standard ACP terminal lifecycle (terminal/create → embed real terminalId
      // → terminal/release) is not wired through BashTool yet. Previously this
      // branch embedded a fake terminalId (= toolUse.id, never registered via
      // terminal/create) and injected non-standard _meta keys (terminal_info /
      // terminal_output / terminal_exit) that compliant clients cannot
      // interpret. We now fall back to inline text content for the output; see
      // audit doc §5.2/§4.4. The _supportsTerminalOutput flag is retained on
      // the signature for forward compatibility once terminal/create is plumbed
      // through.
      void _supportsTerminalOutput

      // Handle bash_code_execution_result format
      if (
        resultContent &&
        typeof resultContent === 'object' &&
        !Array.isArray(resultContent) &&
        (resultContent as Record<string, unknown>).type ===
          'bash_code_execution_result'
      ) {
        const bashResult = resultContent as Record<string, unknown>
        output = [bashResult.stdout, bashResult.stderr]
          .filter(Boolean)
          .join('\n')
      } else if (typeof resultContent === 'string') {
        output = resultContent
      } else if (Array.isArray(resultContent) && resultContent.length > 0) {
        output = resultContent
          .map((c: Record<string, unknown>) =>
            c.type === 'text' ? (c.text as string) : '',
          )
          .join('\n')
      }

      if (output.trim()) {
        return {
          content: [
            {
              type: 'content' as const,
              content: {
                type: 'text' as const,
                text: `\`\`\`console\n${output.trimEnd()}\n\`\`\``,
              },
            },
          ],
        }
      }
      return {}
    }

    case 'Edit':
    case 'Write': {
      return {}
    }

    case 'ExitPlanMode': {
      return { title: 'Exited Plan Mode' }
    }

    default: {
      return toAcpContentUpdate(resultContent ?? '', isError)
    }
  }
}

/**
 * Builds diff ToolUpdate content from the structured Edit toolResponse.
 * Parses structuredPatch hunks (lines prefixed with -, +, space) into
 * oldText/newText diff pairs.
 *
 * The optional `cwd` is used to normalise the emitted path against the
 * session cwd so that Diff.path / ToolCallLocation.path are absolute as
 * required by the ACP v1 spec (audit §5.5).
 */
export function toolUpdateFromEditToolResponse(
  toolResponse: unknown,
  cwd?: string,
): {
  content?: ToolCallContent[]
  locations?: { path: string; line?: number }[]
} {
  if (!toolResponse || typeof toolResponse !== 'object') return {}
  const response = toolResponse as EditToolResponse
  if (!response.filePath || !Array.isArray(response.structuredPatch)) return {}

  const absPath = toAbsolutePath(response.filePath, cwd) ?? response.filePath

  const content: ToolCallContent[] = []
  const locations: { path: string; line?: number }[] = []

  for (const { lines, newStart } of response.structuredPatch) {
    const oldText: string[] = []
    const newText: string[] = []
    for (const line of lines) {
      if (line.startsWith('-')) {
        oldText.push(line.slice(1))
      } else if (line.startsWith('+')) {
        newText.push(line.slice(1))
      } else {
        oldText.push(line.slice(1))
        newText.push(line.slice(1))
      }
    }
    if (oldText.length > 0 || newText.length > 0) {
      locations.push({ path: absPath, line: newStart })
      content.push({
        type: 'diff',
        path: absPath,
        oldText: oldText.join('\n') || null,
        newText: newText.join('\n'),
      })
    }
  }

  const result: {
    content?: ToolCallContent[]
    locations?: { path: string; line?: number }[]
  } = {}
  if (content.length > 0) result.content = content
  if (locations.length > 0) result.locations = locations
  return result
}
