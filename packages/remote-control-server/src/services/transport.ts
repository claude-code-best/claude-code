import { randomUUID } from 'node:crypto'
import { getEventBus } from '../transport/event-bus'
import type { SessionEvent } from '../transport/event-bus'
import { getPersistence } from '../persistence/runtime'

export interface EventIdentity {
  sourceEventId?: string
  producer: 'web' | 'v1-ingress' | 'v2-worker' | 'system'
}

export interface SessionEventPublishResult {
  event: SessionEvent
  duplicate: boolean
}

/**
 * Extract plain text from various message payload formats.
 * Handles:
 *   { content: "text" }
 *   { message: { role: "user", content: "text" } }
 *   { message: { content: [{type:"text",text:"..."}] } }
 */
function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return typeof payload === 'string' ? payload : ''
  }

  const p = payload as Record<string, unknown>

  // Direct content field
  if (typeof p.content === 'string' && p.content) return p.content

  // message.content (child process format)
  const msg = p.message
  if (msg && typeof msg === 'object') {
    const mc = (msg as Record<string, unknown>).content
    if (typeof mc === 'string') return mc
    if (Array.isArray(mc)) {
      return mc
        .filter(
          (b: unknown) =>
            typeof b === 'object' &&
            b !== null &&
            (b as Record<string, unknown>).type === 'text',
        )
        .map(
          (b: Record<string, unknown>) =>
            (b as Record<string, unknown>).text || '',
        )
        .join('')
    }
  }

  return ''
}

/**
 * Normalize event payload into a flat structure with guaranteed `content` string.
 * Preserves original payload in `raw` field and keeps tool-specific fields.
 */
export function normalizePayload(
  type: string,
  payload: unknown,
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return { content: typeof payload === 'string' ? payload : '', raw: payload }
  }

  const p = payload as Record<string, unknown>
  const content = extractContent(payload)

  const normalized: Record<string, unknown> = {
    content,
    raw: payload,
  }

  if (typeof p.uuid === 'string' && p.uuid) normalized.uuid = p.uuid
  if (typeof p.isSynthetic === 'boolean') normalized.isSynthetic = p.isSynthetic
  if (typeof p.status === 'string') normalized.status = p.status
  if (typeof p.subtype === 'string') normalized.subtype = p.subtype

  // Preserve tool fields
  if (p.tool_name) normalized.tool_name = p.tool_name
  if (p.name) normalized.tool_name = p.name
  if (p.tool_input) normalized.tool_input = p.tool_input
  if (p.input) normalized.tool_input = p.input

  // Preserve permission fields
  if (p.request_id) normalized.request_id = p.request_id
  if (p.request) normalized.request = p.request
  if (p.approved !== undefined) normalized.approved = p.approved
  if (p.updated_input) normalized.updated_input = p.updated_input

  // Preserve message field for backward compat
  if (p.message) normalized.message = p.message

  if (type === 'task_state') {
    if (typeof p.task_list_id === 'string')
      normalized.task_list_id = p.task_list_id
    if (typeof p.taskListId === 'string') normalized.taskListId = p.taskListId
    if (Array.isArray(p.tasks)) normalized.tasks = p.tasks
  }

  return normalized
}

/** Commit an event durably before publishing it to a session's bus. */
export function publishSessionEvent(
  sessionId: string,
  type: string,
  payload: unknown,
  direction: 'inbound' | 'outbound',
  identity?: EventIdentity,
): SessionEventPublishResult {
  const normalized =
    identity?.producer === 'system' &&
    (type === 'session_status' || type === 'automation_state')
      ? payload
      : normalizePayload(type, payload)
  const sourceEventId =
    typeof identity?.sourceEventId === 'string' &&
    identity.sourceEventId.length > 0
      ? identity.sourceEventId
      : null
  const dedupeScope =
    sourceEventId && identity
      ? `${identity.producer}:${direction}:${type}`
      : null

  const committed = getPersistence().commitEvent({
    id: randomUUID(),
    sessionId,
    type,
    payload: normalized,
    direction,
    sourceEventId,
    dedupeScope,
    createdAt: Date.now(),
  })

  const event: SessionEvent = committed.duplicate
    ? {
        id: committed.event.id,
        sessionId: committed.event.sessionId,
        type: committed.event.type,
        payload: committed.event.payload,
        direction: committed.event.direction,
        seqNum: committed.event.seqNum,
        createdAt: committed.event.createdAt,
      }
    : getEventBus(sessionId).publishCommitted(committed.event)

  return { event, duplicate: committed.duplicate }
}
