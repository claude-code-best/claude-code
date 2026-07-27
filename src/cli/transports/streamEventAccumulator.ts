import type { SDKPartialAssistantMessage } from 'src/entrypoints/sdk/controlTypes.js'

export type StreamEventPayload = {
  type: 'stream_event'
  uuid: string
  session_id: string
  parent_tool_use_id: string | null
  message_id?: string
  snapshot?: true
  event: Record<string, unknown>
}

type CoalescedStreamEvent = StreamEventPayload & {
  message_id: string
  snapshot: true
  event: {
    type: 'content_block_delta'
    index: number
    delta: { type: 'text_delta'; text: string }
  }
}

export type StreamAccumulatorState = {
  byMessage: Map<string, string[][]>
  scopeToMessage: Map<string, string>
}

export function createStreamAccumulator(): StreamAccumulatorState {
  return { byMessage: new Map(), scopeToMessage: new Map() }
}

function scopeKey(message: {
  session_id: string
  parent_tool_use_id?: string | null
}): string {
  return `${message.session_id}:${message.parent_tool_use_id ?? ''}`
}

export function accumulateStreamEvents(
  buffer: SDKPartialAssistantMessage[],
  state: StreamAccumulatorState,
): StreamEventPayload[] {
  const output: StreamEventPayload[] = []
  const touched = new Map<string[], CoalescedStreamEvent>()

  for (const message of buffer) {
    const event = message.event as unknown as Record<string, unknown>
    switch (event.type) {
      case 'message_start': {
        const apiMessage = event.message as { id: string }
        const previousId = state.scopeToMessage.get(scopeKey(message))
        if (previousId) state.byMessage.delete(previousId)
        state.scopeToMessage.set(scopeKey(message), apiMessage.id)
        state.byMessage.set(apiMessage.id, [])
        output.push(message as unknown as StreamEventPayload)
        break
      }
      case 'content_block_delta': {
        const delta = event.delta as Record<string, unknown>
        if (delta.type !== 'text_delta') {
          output.push(message as unknown as StreamEventPayload)
          break
        }

        const messageId = state.scopeToMessage.get(scopeKey(message))
        const blocks = messageId ? state.byMessage.get(messageId) : undefined
        if (!messageId || !blocks) {
          output.push(message as unknown as StreamEventPayload)
          break
        }

        const blockIndex = event.index as number
        const chunks = (blocks[blockIndex] ??= [])
        chunks.push(delta.text as string)
        const existing = touched.get(chunks)
        if (existing) {
          existing.event.delta.text = chunks.join('')
          break
        }

        const snapshot: CoalescedStreamEvent = {
          type: 'stream_event',
          uuid: message.uuid,
          session_id: message.session_id,
          parent_tool_use_id: message.parent_tool_use_id,
          message_id: messageId,
          snapshot: true,
          event: {
            type: 'content_block_delta',
            index: blockIndex,
            delta: { type: 'text_delta', text: chunks.join('') },
          },
        }
        touched.set(chunks, snapshot)
        output.push(snapshot)
        break
      }
      default:
        output.push(message as unknown as StreamEventPayload)
    }
  }

  return output
}

export function clearStreamAccumulatorForMessage(
  state: StreamAccumulatorState,
  assistant: {
    session_id: string
    parent_tool_use_id: string | null
    message: { id: string }
  },
): void {
  state.byMessage.delete(assistant.message.id)
  const scope = scopeKey(assistant)
  if (state.scopeToMessage.get(scope) === assistant.message.id) {
    state.scopeToMessage.delete(scope)
  }
}
