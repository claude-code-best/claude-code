export function toPartialAssistant(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  if (payload.snapshot !== true) return null
  if (typeof payload.message_id !== 'string' || !payload.message_id) return null

  const event = payload.event
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null
  const streamEvent = event as Record<string, unknown>
  if (streamEvent.type !== 'content_block_delta') return null
  if (
    typeof streamEvent.index !== 'number' ||
    !Number.isSafeInteger(streamEvent.index) ||
    streamEvent.index < 0
  ) {
    return null
  }

  const delta = streamEvent.delta
  if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return null
  const streamDelta = delta as Record<string, unknown>
  if (
    streamDelta.type !== 'text_delta' ||
    typeof streamDelta.text !== 'string'
  ) {
    return null
  }

  return {
    message_id: payload.message_id,
    block_index: streamEvent.index,
    content: streamDelta.text,
    parent_tool_use_id:
      typeof payload.parent_tool_use_id === 'string'
        ? payload.parent_tool_use_id
        : null,
    snapshot: true,
  }
}
