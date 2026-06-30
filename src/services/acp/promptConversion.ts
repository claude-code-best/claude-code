import type { ContentBlock } from '@agentclientprotocol/sdk'

export function promptToQueryInput(
  prompt: Array<ContentBlock> | undefined,
): string {
  if (!prompt || prompt.length === 0) return ''

  const parts: string[] = []
  for (const block of prompt) {
    const b = block as Record<string, unknown>
    if (b.type === 'text') {
      parts.push(String(b.text ?? ''))
    } else if (b.type === 'resource_link') {
      const name = typeof b.name === 'string' ? b.name : undefined
      const uri = typeof b.uri === 'string' ? b.uri : undefined
      // Keep resource links as metadata, not markdown links, so models do not
      // infer user-visible click targets or silently rewrite URI semantics.
      parts.push(formatResourceLink(name, uri))
    } else if (b.type === 'resource') {
      const resource = b.resource as Record<string, unknown> | undefined
      if (resource && typeof resource.text === 'string') {
        parts.push(resource.text)
      } else if (resource && typeof resource.blob === 'string') {
        // BlobResource (e.g. PDF/binary): query input is string-only, so emit a
        // readable placeholder instead of silently dropping the content. Ideally
        // this would be decoded and passed as a binary content block once the
        // query layer supports multimodal input.
        const mt =
          typeof resource.mimeType === 'string'
            ? resource.mimeType
            : 'application/octet-stream'
        const uri =
          typeof resource.uri === 'string' ? resource.uri : '(unknown uri)'
        parts.push(
          `Embedded resource: ${uri} (${mt}, base64 blob, ${resource.blob.length} chars)`,
        )
      }
    }
  }

  return parts.filter(part => part.length > 0).join('\n')
}

function formatResourceLink(
  name: string | undefined,
  uri: string | undefined,
): string {
  const details: string[] = []
  if (name && name.length > 0) details.push(`name=${name}`)
  if (uri && uri.length > 0) details.push(`uri=${uri}`)
  return details.length > 0
    ? `Resource link: ${details.join(', ')}`
    : 'Resource link'
}
