import type { SessionEvent } from '../types'
import type {
  AssistantMessageEntry,
  SessionEventState,
  ThreadEntry,
  ToolCallEntry,
  UserMessageImage,
} from './types'

type UnknownRecord = Record<string, unknown>

interface ToolUse {
  id: string
  title: string
  input?: UnknownRecord
}

interface ToolResult {
  id: string
  output: unknown
  isError: boolean
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readRecord(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined
}

function cloneRecord(value: unknown): UnknownRecord | undefined {
  const record = readRecord(value)
  return record ? { ...record } : undefined
}

function getPayload(event: SessionEvent): UnknownRecord {
  return isRecord(event.payload) ? event.payload : {}
}

function getRaw(payload: UnknownRecord): UnknownRecord | undefined {
  return readRecord(payload.raw)
}

function getMessageBlocks(payload: UnknownRecord): UnknownRecord[] {
  const message = readRecord(payload.message)
  if (!message || !Array.isArray(message.content)) return []
  return message.content.filter(isRecord)
}

function extractEventText(payload: UnknownRecord): string {
  if (typeof payload.content === 'string') return payload.content

  const message = readRecord(payload.message)
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.content)) return ''

  return message.content
    .filter(isRecord)
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => String(block.text))
    .join('')
}

function extractImages(payload: UnknownRecord): UserMessageImage[] | undefined {
  if (!Array.isArray(payload.images)) return undefined

  const images = payload.images.flatMap(image => {
    if (!isRecord(image)) return []
    const mimeType = readString(image.mimeType)
    const data = readString(image.data)
    return mimeType && data ? [{ mimeType, data }] : []
  })

  return images.length > 0 ? images : undefined
}

function getEventIdentity(event: SessionEvent): string | undefined {
  const eventId = readString(event.id)
  if (eventId) return eventId
  return Number.isSafeInteger(event.seqNum) && event.seqNum >= 0
    ? `seq:${event.seqNum}`
    : undefined
}

function getPayloadUuid(payload: UnknownRecord): string | undefined {
  return readString(payload.uuid) ?? readString(getRaw(payload)?.uuid)
}

function getMessageKey(
  event: SessionEvent,
  payload: UnknownRecord,
): string | undefined {
  const uuid = getPayloadUuid(payload)
  if (!uuid) return undefined
  if (event.type === 'user') return `user:${uuid}`
  return `${event.direction}:${event.type}:${uuid}`
}

function getEntryIdentity(
  event: SessionEvent,
  payload: UnknownRecord,
  exactIdentity: string | undefined,
): string | undefined {
  return getPayloadUuid(payload) ?? readString(event.id) ?? exactIdentity
}

function appendUser(
  entries: ThreadEntry[],
  event: SessionEvent,
  payload: UnknownRecord,
  exactIdentity: string | undefined,
): ThreadEntry[] {
  const content = extractEventText(payload)
  const images = extractImages(payload)
  const id = getEntryIdentity(event, payload, exactIdentity)
  if ((!content && !images) || !id) return entries

  return [
    ...entries,
    {
      type: 'user_message',
      id,
      content,
      ...(images ? { images } : {}),
    },
  ]
}

function appendAssistant(
  entries: ThreadEntry[],
  text: string,
  id: string | undefined,
): ThreadEntry[] {
  if (!text || !id) return entries

  const lastEntry = entries[entries.length - 1]
  if (lastEntry?.type !== 'assistant_message') {
    const entry: AssistantMessageEntry = {
      type: 'assistant_message',
      id,
      chunks: [{ type: 'message', text }],
    }
    return [...entries, entry]
  }

  const lastChunk = lastEntry.chunks[lastEntry.chunks.length - 1]
  const chunks =
    lastChunk?.type === 'message'
      ? [
          ...lastEntry.chunks.slice(0, -1),
          { type: 'message' as const, text: lastChunk.text + text },
        ]
      : [...lastEntry.chunks, { type: 'message' as const, text }]

  return [...entries.slice(0, -1), { ...lastEntry, chunks }]
}

function firstDefined(...values: unknown[]): unknown {
  return values.find(value => value !== undefined)
}

function resolveToolId(
  payload: UnknownRecord,
  block: UnknownRecord | undefined,
  kind: 'use' | 'result',
): string | undefined {
  const raw = getRaw(payload)
  const blockId =
    kind === 'use' ? readString(block?.id) : readString(block?.tool_use_id)

  return (
    readString(payload.tool_call_id) ??
    readString(raw?.tool_call_id) ??
    readString(payload.tool_use_id) ??
    readString(raw?.tool_use_id) ??
    blockId
  )
}

function directToolUse(
  event: SessionEvent,
  payload: UnknownRecord,
): ToolUse | undefined {
  if (event.type !== 'tool_use') return undefined

  const raw = getRaw(payload)
  const id = resolveToolId(payload, undefined, 'use') ?? readString(event.id)
  if (!id) return undefined

  return {
    id,
    title:
      readString(payload.tool_name) ??
      readString(raw?.tool_name) ??
      readString(raw?.name) ??
      'tool',
    input:
      cloneRecord(payload.tool_input) ??
      cloneRecord(payload.input) ??
      cloneRecord(raw?.tool_input) ??
      cloneRecord(raw?.input),
  }
}

function embeddedToolUses(payload: UnknownRecord): ToolUse[] {
  const raw = getRaw(payload)
  return getMessageBlocks(payload).flatMap(block => {
    if (block.type !== 'tool_use') return []
    const id = resolveToolId(payload, block, 'use')
    if (!id) return []

    return [
      {
        id,
        title:
          readString(block.name) ??
          readString(payload.tool_name) ??
          readString(raw?.tool_name) ??
          'tool',
        input:
          cloneRecord(block.input) ??
          cloneRecord(payload.tool_input) ??
          cloneRecord(raw?.tool_input),
      },
    ]
  })
}

function isToolError(
  payload: UnknownRecord,
  block: UnknownRecord | undefined,
): boolean {
  const raw = getRaw(payload)
  const status =
    readString(block?.status) ??
    readString(payload.status) ??
    readString(raw?.status)
  const explicitError =
    readBoolean(block?.is_error) ??
    readBoolean(payload.is_error) ??
    readBoolean(raw?.is_error)

  return explicitError ?? (status === 'failed' || status === 'error')
}

function directToolResult(
  event: SessionEvent,
  payload: UnknownRecord,
): ToolResult | undefined {
  if (event.type !== 'tool_result') return undefined

  const raw = getRaw(payload)
  const id = resolveToolId(payload, undefined, 'result')
  if (!id) return undefined

  return {
    id,
    output: firstDefined(
      payload.output,
      raw?.output,
      payload.content,
      raw?.content,
      '',
    ),
    isError: isToolError(payload, undefined),
  }
}

function embeddedToolResults(payload: UnknownRecord): ToolResult[] {
  const raw = getRaw(payload)
  return getMessageBlocks(payload).flatMap(block => {
    if (block.type !== 'tool_result') return []
    const id = resolveToolId(payload, block, 'result')
    if (!id) return []

    return [
      {
        id,
        output: firstDefined(
          block.output,
          block.content,
          payload.output,
          raw?.output,
          payload.content,
          '',
        ),
        isError: isToolError(payload, block),
      },
    ]
  })
}

function appendToolUse(entries: ThreadEntry[], tool: ToolUse): ThreadEntry[] {
  const entry: ToolCallEntry = {
    type: 'tool_call',
    toolCall: {
      id: tool.id,
      title: tool.title,
      status: 'running',
      ...(tool.input ? { rawInput: tool.input } : {}),
    },
  }
  return [...entries, entry]
}

function applyToolResult(
  entries: ThreadEntry[],
  result: ToolResult,
): ThreadEntry[] {
  let index = -1
  for (let entryIndex = entries.length - 1; entryIndex >= 0; entryIndex--) {
    const candidate = entries[entryIndex]
    if (
      candidate?.type === 'tool_call' &&
      candidate.toolCall.id === result.id
    ) {
      index = entryIndex
      break
    }
  }
  if (index < 0) return entries

  const entry = entries[index]
  if (!entry || entry.type !== 'tool_call') return entries

  const updated: ToolCallEntry = {
    type: 'tool_call',
    toolCall: {
      ...entry.toolCall,
      status: result.isError ? 'error' : 'complete',
      rawOutput: { output: result.output },
    },
  }

  return entries.map((existing, entryIndex) =>
    entryIndex === index ? updated : existing,
  )
}

function applyTools(
  entries: ThreadEntry[],
  seenMessageKeys: Set<string>,
  event: SessionEvent,
  payload: UnknownRecord,
): ThreadEntry[] {
  let nextEntries = entries
  const directUse = directToolUse(event, payload)
  const uses = directUse
    ? [directUse, ...embeddedToolUses(payload)]
    : embeddedToolUses(payload)

  for (const tool of uses) {
    const key = `tool_use:${tool.id}`
    if (seenMessageKeys.has(key)) continue
    seenMessageKeys.add(key)
    nextEntries = appendToolUse(nextEntries, tool)
  }

  const directResult = directToolResult(event, payload)
  const results = directResult
    ? [directResult, ...embeddedToolResults(payload)]
    : embeddedToolResults(payload)

  for (const result of results) {
    const key = `tool_result:${result.id}`
    if (seenMessageKeys.has(key)) continue
    seenMessageKeys.add(key)
    nextEntries = applyToolResult(nextEntries, result)
  }

  return nextEntries
}

function updateHighWater(
  state: SessionEventState,
  event: SessionEvent,
): number {
  return Number.isSafeInteger(event.seqNum)
    ? Math.max(state.highWaterSeq, event.seqNum)
    : state.highWaterSeq
}

export function createSessionEventState(): SessionEventState {
  return {
    entries: [],
    seenEventIds: new Set(),
    seenMessageKeys: new Set(),
    highWaterSeq: 0,
  }
}

export function reduceSessionEvent(
  state: SessionEventState,
  event: SessionEvent,
): SessionEventState {
  const highWaterSeq = updateHighWater(state, event)
  const exactIdentity = getEventIdentity(event)
  if (exactIdentity && state.seenEventIds.has(exactIdentity)) {
    return highWaterSeq === state.highWaterSeq
      ? state
      : { ...state, highWaterSeq }
  }

  const seenEventIds = new Set(state.seenEventIds)
  if (exactIdentity) seenEventIds.add(exactIdentity)

  const payload = getPayload(event)
  const messageKey = getMessageKey(event, payload)
  if (messageKey && state.seenMessageKeys.has(messageKey)) {
    return {
      ...state,
      seenEventIds,
      highWaterSeq,
    }
  }

  const seenMessageKeys = new Set(state.seenMessageKeys)
  if (messageKey) seenMessageKeys.add(messageKey)

  let entries = state.entries
  if (event.type === 'user') {
    entries = appendUser(entries, event, payload, exactIdentity)
  } else if (event.type === 'assistant') {
    entries = appendAssistant(
      entries,
      extractEventText(payload),
      getEntryIdentity(event, payload, exactIdentity),
    )
  }

  if (event.type !== 'partial_assistant') {
    entries = applyTools(entries, seenMessageKeys, event, payload)
  }

  return {
    entries,
    seenEventIds,
    seenMessageKeys,
    highWaterSeq,
  }
}
