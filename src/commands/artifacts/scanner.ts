import { basename } from 'path'
import type { Message } from 'src/types/message.js'

export type ArtifactInfo = {
  toolUseId: string
  filePath: string
  basename: string
  hash?: string
  url?: string
  expiresAt?: string
  rawContent: string
  isError: boolean
}

const URL_REGEX = /https?:\/\/[^\s)"',]+\.html\b/
const ID_REGEX = /\bid:\s*([A-Za-z0-9_-]+)/
const EXPIRES_REGEX = /\bexpires:\s*([0-9T:.Z+-]+)/

type ArtifactToolResult = {
  content: unknown
  is_error?: boolean
}

export function extractArtifacts(messages: Message[]): ArtifactInfo[] {
  const results: ArtifactInfo[] = []
  let artifactUseCount = 0
  let indexedResults: Map<string, ArtifactToolResult> | null = null

  for (const message of messages) {
    if (message.type !== 'assistant') continue
    const content = message.message?.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue
      if (!('type' in block)) continue
      const b = block as unknown as Record<string, unknown>
      if (b.type !== 'tool_use') continue
      if (b.name !== 'artifact') continue

      const toolUseId = b.id as string
      const input = b.input as { file_path?: string } | undefined
      const filePath = input?.file_path ?? '<unknown>'

      artifactUseCount++
      if (artifactUseCount === 2) {
        // One direct lookup is already linear and avoids allocating an index
        // for the common single-artifact case. Starting with the second use,
        // index tool results once instead of rescanning the transcript for
        // every artifact (which becomes quadratic in artifact-heavy sessions).
        indexedResults = indexToolResults(messages)
      }

      const resultBlock = indexedResults
        ? (indexedResults.get(toolUseId) ?? null)
        : findToolResult(messages, toolUseId)

      if (!resultBlock) continue

      const rawContent =
        typeof resultBlock.content === 'string'
          ? resultBlock.content
          : Array.isArray(resultBlock.content)
            ? resultBlock.content
                .map(c =>
                  typeof c === 'string'
                    ? c
                    : 'text' in c
                      ? (c as { text: string }).text
                      : '',
                )
                .join('')
            : ''

      const isError = resultBlock.is_error === true
      const urlMatch = rawContent.match(URL_REGEX)
      const idMatch = rawContent.match(ID_REGEX)
      const expiresMatch = rawContent.match(EXPIRES_REGEX)

      results.push({
        toolUseId,
        filePath,
        basename: basename(filePath),
        hash: idMatch?.[1],
        url: urlMatch?.[0],
        expiresAt: expiresMatch?.[1],
        rawContent,
        isError,
      })
    }
  }

  // newest first
  return results.reverse()
}

function findToolResult(
  messages: Message[],
  toolUseId: string,
): ArtifactToolResult | null {
  for (const message of messages) {
    if (message.type !== 'user') continue
    const content = message.message?.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue
      if (!('type' in block)) continue
      const b = block as unknown as Record<string, unknown>
      if (b.type !== 'tool_result') continue
      if (b.tool_use_id !== toolUseId) continue
      return { content: b.content, is_error: b.is_error as boolean | undefined }
    }
  }
  return null
}

function indexToolResults(
  messages: Message[],
): Map<string, ArtifactToolResult> {
  const results = new Map<string, ArtifactToolResult>()

  for (const message of messages) {
    if (message.type !== 'user') continue
    const content = message.message?.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue
      if (!('type' in block)) continue
      const b = block as unknown as Record<string, unknown>
      if (b.type !== 'tool_result') continue
      const toolUseId = b.tool_use_id as string
      if (results.has(toolUseId)) continue

      // Match findToolResult's first-result-wins behavior for duplicate IDs.
      results.set(toolUseId, {
        content: b.content,
        is_error: b.is_error as boolean | undefined,
      })
    }
  }

  return results
}
