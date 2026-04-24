import type {
  ResponseFunctionToolCallOutputItem,
  ResponseInputImage,
  ResponseInputItem,
  ResponseInputText,
} from 'openai/resources/responses/responses.mjs'
import type { Message } from '../../../types/message.js'
import {
  normalizeCodexCallId,
  resolveCodexCallId,
} from './callIds.js'

type ContentBlock = {
  type: string
  text?: string
  source?: {
    type?: string
    data?: string
    media_type?: string
    url?: string
  }
}

type ToolUseLikeBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

type ToolResultLikeBlock = {
  type: 'tool_result'
  tool_use_id: string
  content?: string | ReadonlyArray<ContentBlock>
}

export type CodexImageConversionOptions = {
  resolveBase64ImageUrl?: (
    data: string,
    mediaType?: string,
  ) => Promise<string | null>
}

type CodexCallIdState = {
  byOriginalId: Map<string, string>
  sequence: number
}

function createInputText(text: string): ResponseInputText {
  return {
    type: 'input_text',
    text,
  }
}

function createInputImage(imageUrl: string): ResponseInputImage {
  return {
    type: 'input_image',
    image_url: imageUrl,
    detail: 'high',
  }
}

function getUnsupportedBlockText(type: string): string | null {
  switch (type) {
    case 'image':
      return '[Image omitted: codex gateway currently requires remote image URLs. Configure CODEX_IMGBB_API_KEY to auto-convert local images.]'
    case 'document':
      return '[Document omitted: codex gateway does not support document replay.]'
    default:
      return null
  }
}

function getImageUrl(block: ContentBlock): string | null {
  const source = block.source
  if (!source) {
    return null
  }

  if (source.type === 'url' && typeof source.url === 'string' && source.url.length > 0) {
    return source.url
  }

  return null
}

async function resolveImageUrl(
  block: ContentBlock,
  options: CodexImageConversionOptions,
): Promise<string | null> {
  const directUrl = getImageUrl(block)
  if (directUrl) {
    return directUrl
  }

  if (block.source?.type !== 'base64') {
    return null
  }

  if (options.resolveBase64ImageUrl && typeof block.source.data === 'string') {
    const uploadedUrl = await options.resolveBase64ImageUrl(
      block.source.data,
      block.source.media_type,
    )
    if (uploadedUrl) {
      return uploadedUrl
    }
  }
  return null
}

async function convertBlocksToInputContent(
  content: ReadonlyArray<ContentBlock>,
  options: CodexImageConversionOptions,
): Promise<Array<ResponseInputText | ResponseInputImage>> {
  const output: Array<ResponseInputText | ResponseInputImage> = []

  for (const block of content) {
    if (block.type === 'text' && block.text) {
      output.push(createInputText(block.text))
      continue
    }

    if (block.type === 'image') {
      const imageUrl = await resolveImageUrl(block, options)
      if (imageUrl) {
        output.push(createInputImage(imageUrl))
        continue
      }
    }

    const fallback = getUnsupportedBlockText(block.type)
    if (fallback) {
      output.push(createInputText(fallback))
    }
  }

  return output
}

async function convertToolResultOutput(
  content: string | ReadonlyArray<ContentBlock> | undefined,
  options: CodexImageConversionOptions,
): Promise<ResponseFunctionToolCallOutputItem['output']> {
  if (!content) {
    return ''
  }

  if (typeof content === 'string') {
    return content
  }

  const output = await convertBlocksToInputContent(content, options)

  if (output.length === 0) {
    return ''
  }

  if (output.length === 1 && output[0].type === 'input_text') {
    return output[0].text
  }

  return output
}

function pushUserMessage(
  items: ResponseInputItem[],
  textParts: string[],
  imageUrls: string[] = [],
): void {
  const text = textParts.join('\n').trim()
  if (text.length === 0 && imageUrls.length === 0) {
    return
  }

  items.push({
    type: 'message',
    role: 'user',
    content: [
      ...(text.length > 0 ? [createInputText(text)] : []),
      ...imageUrls.map(createInputImage),
    ],
  } as unknown as ResponseInputItem)
}

function pushAssistantMessage(
  items: ResponseInputItem[],
  textParts: string[],
): void {
  const text = textParts.join('\n').trim()
  if (text.length === 0) {
    return
  }

  items.push({
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'output_text',
        text,
        annotations: [],
      },
    ],
  } as unknown as ResponseInputItem)
}

function stringifyToolInput(input: unknown): string {
  if (typeof input === 'string') {
    return input
  }

  try {
    return JSON.stringify(input ?? {})
  } catch {
    return '{}'
  }
}

function createCodexCallIdState(): CodexCallIdState {
  return {
    byOriginalId: new Map(),
    sequence: 0,
  }
}

function resolveAssistantCallId(
  block: ToolUseLikeBlock,
  state: CodexCallIdState,
): string {
  const originalId = typeof block.id === 'string' ? block.id : ''
  const seed = `${block.name}:${stringifyToolInput(block.input)}:${state.sequence}`
  const callId = resolveCodexCallId(originalId, seed)

  if (originalId.length > 0) {
    state.byOriginalId.set(originalId, callId)
  }
  state.sequence += 1

  return callId
}

function resolveToolResultCallId(
  toolUseId: unknown,
  state: CodexCallIdState,
): string | null {
  if (typeof toolUseId !== 'string') {
    return null
  }

  return state.byOriginalId.get(toolUseId) ?? normalizeCodexCallId(toolUseId)
}

async function convertUserContentToInputItems(
  items: ResponseInputItem[],
  content: ReadonlyArray<string | ContentBlock>,
  options: CodexImageConversionOptions,
  callIdState: CodexCallIdState,
): Promise<void> {
  const textParts: string[] = []
  const imageUrls: string[] = []

  for (const block of content) {
    if (typeof block === 'string') {
      textParts.push(block)
      continue
    }

    if (block.type === 'tool_result') {
      pushUserMessage(items, textParts, imageUrls)
      textParts.length = 0
      imageUrls.length = 0

      const toolResultBlock = block as ToolResultLikeBlock
      const callId = resolveToolResultCallId(
        toolResultBlock.tool_use_id,
        callIdState,
      )
      if (!callId) {
        continue
      }

      items.push({
        type: 'function_call_output',
        call_id: callId,
        output: await convertToolResultOutput(toolResultBlock.content, options),
      })
      continue
    }

    if (block.type === 'text' && block.text) {
      textParts.push(block.text)
      continue
    }

    if (block.type === 'image') {
      const imageUrl = await resolveImageUrl(block, options)
      if (imageUrl) {
        imageUrls.push(imageUrl)
        continue
      }
    }

    const fallback = getUnsupportedBlockText(block.type)
    if (fallback) {
      textParts.push(fallback)
    }
  }

  pushUserMessage(items, textParts, imageUrls)
}

function convertAssistantContentToInputItems(
  items: ResponseInputItem[],
  content: ReadonlyArray<string | ContentBlock>,
  callIdState: CodexCallIdState,
): void {
  const textParts: string[] = []

  for (const block of content) {
    if (typeof block === 'string') {
      textParts.push(block)
      continue
    }

    if (block.type === 'tool_use') {
      pushAssistantMessage(items, textParts)
      textParts.length = 0

      const toolUseBlock = block as unknown as ToolUseLikeBlock
      items.push({
        type: 'function_call',
        call_id: resolveAssistantCallId(toolUseBlock, callIdState),
        name: toolUseBlock.name,
        arguments: stringifyToolInput(toolUseBlock.input),
      })
      continue
    }

    if (block.type === 'text' && block.text) {
      textParts.push(block.text)
    }
  }

  pushAssistantMessage(items, textParts)
}

export async function anthropicMessagesToCodexInput(
  messages: Message[],
  options: CodexImageConversionOptions = {},
): Promise<ResponseInputItem[]> {
  const items: ResponseInputItem[] = []
  const callIdState = createCodexCallIdState()

  for (const message of messages) {
    if (message.type !== 'user' && message.type !== 'assistant') {
      continue
    }

    const apiMessage = message.message
    if (!apiMessage?.content) {
      continue
    }

    if (typeof apiMessage.content === 'string') {
      if (message.type === 'user') {
        pushUserMessage(items, [apiMessage.content])
      } else {
        pushAssistantMessage(items, [apiMessage.content])
      }
      continue
    }

    if (message.type === 'user') {
      await convertUserContentToInputItems(
        items,
        apiMessage.content as ReadonlyArray<string | ContentBlock>,
        options,
        callIdState,
      )
    } else {
      convertAssistantContentToInputItems(
        items,
        apiMessage.content as ReadonlyArray<string | ContentBlock>,
        callIdState,
      )
    }
  }

  return items
}
