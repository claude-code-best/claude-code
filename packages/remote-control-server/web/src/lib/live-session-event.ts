import type { EventPayload, SessionEvent } from '../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toTransientSessionEvent(
  value: unknown,
  sessionId: string,
): SessionEvent | null {
  if (!isRecord(value)) return null
  if (typeof value.event_id !== 'string' || !value.event_id) return null
  if (typeof value.type !== 'string' || !value.type) return null
  if (!isRecord(value.payload)) return null

  const parsedCreatedAt =
    typeof value.created_at === 'string' ? Date.parse(value.created_at) : NaN
  return {
    id: value.event_id,
    sessionId,
    type: value.type,
    payload: value.payload as EventPayload,
    direction: 'inbound',
    seqNum: -1,
    createdAt: Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : Date.now(),
  }
}
