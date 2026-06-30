// Low-level conversion of Claude content block shapes into ACP ContentBlock values.
import type { ContentBlock, ToolCallContent } from './types.js'

/**
 * Wraps a string or array of content blocks into a `{ content: ToolCallContent[] }`
 * update object. Used by `toolUpdateFromToolResult` for the default / error paths.
 */
export function toAcpContentUpdate(
  content: unknown,
  isError: boolean,
): { content?: ToolCallContent[] } {
  if (Array.isArray(content) && content.length > 0) {
    return {
      content: content.map((c: Record<string, unknown>) => ({
        type: 'content' as const,
        content: toAcpContentBlock(c, isError),
      })),
    }
  }
  if (typeof content === 'string' && content.length > 0) {
    return {
      content: [
        {
          type: 'content' as const,
          content: {
            type: 'text' as const,
            text: isError ? `\`\`\`\n${content}\n\`\`\`` : content,
          },
        },
      ],
    }
  }
  return {}
}

export function toAcpContentBlock(
  content: Record<string, unknown>,
  isError: boolean,
): ContentBlock {
  const wrapText = (text: string): ContentBlock => ({
    type: 'text',
    text: isError ? `\`\`\`\n${text}\n\`\`\`` : text,
  })

  const type = content.type as string
  switch (type) {
    case 'text': {
      const text = content.text as string
      return { type: 'text', text: isError ? `\`\`\`\n${text}\n\`\`\`` : text }
    }
    case 'image': {
      const source = content.source as Record<string, unknown> | undefined
      if (source?.type === 'base64') {
        return {
          type: 'image',
          data: source.data as string,
          mimeType: source.media_type as string,
        }
      }
      return wrapText(
        source?.type === 'url'
          ? `[image: ${source.url as string}]`
          : '[image: file reference]',
      )
    }
    case 'resource_link': {
      // ACP v1 ResourceLink requires name + uri. Name falls back to uri when
      // absent so the client always has a display label. mimeType is optional.
      const uri = content.uri as string | undefined
      const name =
        (content.name as string | undefined) ?? (uri as string | undefined)
      return {
        type: 'resource_link',
        uri: uri as string,
        name: name as string,
        mimeType: content.mimeType as string | undefined,
      }
    }
    case 'resource': {
      // ACP v1 EmbeddedResource wraps an optional TextResource / BlobResource
      // shape. Forward the standard fields the client knows how to render.
      const r = content.resource as Record<string, unknown> | undefined
      // Construct a TextResource or BlobResource payload depending on what is
      // present. Cast through unknown because not every source shape satisfies
      // the full union contract.
      const resourcePayload = {
        uri: (r?.uri as string | undefined) ?? '',
        mimeType: r?.mimeType as string | null | undefined,
        ...(typeof r?.text === 'string' ? { text: r.text as string } : {}),
        ...(typeof r?.blob === 'string' ? { blob: r.blob as string } : {}),
      }
      return {
        type: 'resource',
        resource: resourcePayload,
      } as unknown as ContentBlock
    }
    case 'tool_reference':
      return wrapText(`Tool: ${content.tool_name as string}`)
    case 'tool_search_tool_search_result': {
      const refs = content.tool_references as
        | Array<{ tool_name: string }>
        | undefined
      return wrapText(
        `Tools found: ${refs?.map(r => r.tool_name).join(', ') || 'none'}`,
      )
    }
    case 'tool_search_tool_result_error':
      return wrapText(
        `Error: ${content.error_code as string}${content.error_message ? ` - ${content.error_message as string}` : ''}`,
      )
    case 'web_search_result':
      return wrapText(`${content.title as string} (${content.url as string})`)
    case 'web_search_tool_result_error':
      return wrapText(`Error: ${content.error_code as string}`)
    case 'web_fetch_result':
      return wrapText(`Fetched: ${content.url as string}`)
    case 'web_fetch_tool_result_error':
      return wrapText(`Error: ${content.error_code as string}`)
    case 'code_execution_result':
    case 'bash_code_execution_result':
      return wrapText(
        `Output: ${(content.stdout as string) || (content.stderr as string) || ''}`,
      )
    case 'code_execution_tool_result_error':
    case 'bash_code_execution_tool_result_error':
      return wrapText(`Error: ${content.error_code as string}`)
    case 'text_editor_code_execution_view_result':
      return wrapText(content.content as string)
    case 'text_editor_code_execution_create_result':
      return wrapText(content.is_file_update ? 'File updated' : 'File created')
    case 'text_editor_code_execution_str_replace_result': {
      const lines = content.lines as string[] | undefined
      return wrapText(lines?.join('\n') || '')
    }
    case 'text_editor_code_execution_tool_result_error':
      return wrapText(
        `Error: ${content.error_code as string}${content.error_message ? ` - ${content.error_message as string}` : ''}`,
      )
    default:
      try {
        return { type: 'text', text: JSON.stringify(content) }
      } catch {
        return { type: 'text', text: '[content]' }
      }
  }
}
