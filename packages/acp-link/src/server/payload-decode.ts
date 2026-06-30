import { decodeJsonWsMessage } from '../ws-message.js'
import type {
  ContentBlock,
  PermissionResponsePayload,
  ProxyMessage,
} from './types.js'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function optionalStringField(
  payload: Record<string, unknown>,
  key: string,
  source: string,
): string | undefined {
  if (!Object.hasOwn(payload, key)) return undefined
  const value = payload[key]
  if (typeof value === 'string') return value
  throw new Error(`Invalid ${source}: expected a string`)
}

export function payloadRecord(
  value: unknown,
  type: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${type} payload`)
  }
  return value
}

export function optionalPayloadRecord(
  value: unknown,
  type: string,
): Record<string, unknown> {
  if (value === undefined) return {}
  return payloadRecord(value, type)
}

export function optionalRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

export function decodeContentBlocks(value: unknown): ContentBlock[] {
  if (
    !Array.isArray(value) ||
    !value.every(block => isRecord(block) && typeof block.type === 'string')
  ) {
    throw new Error('Invalid prompt payload')
  }
  return value as ContentBlock[]
}

export function decodePermissionResponsePayload(
  value: unknown,
): PermissionResponsePayload {
  const payload = payloadRecord(value, 'permission_response')
  if (typeof payload.requestId !== 'string' || !isRecord(payload.outcome)) {
    throw new Error('Invalid permission_response payload')
  }
  if (payload.outcome.outcome === 'cancelled') {
    return { requestId: payload.requestId, outcome: { outcome: 'cancelled' } }
  }
  if (
    payload.outcome.outcome === 'selected' &&
    typeof payload.outcome.optionId === 'string'
  ) {
    return {
      requestId: payload.requestId,
      outcome: { outcome: 'selected', optionId: payload.outcome.optionId },
    }
  }
  throw new Error('Invalid permission_response payload')
}

export function decodeClientMessage(
  message: Record<string, unknown>,
): ProxyMessage {
  if (typeof message.type !== 'string') {
    throw new Error('Invalid WebSocket message payload')
  }

  switch (message.type) {
    case 'connect':
    case 'disconnect':
    case 'cancel':
    case 'ping':
      return { type: message.type }
    case 'new_session': {
      const payload = optionalPayloadRecord(message.payload, 'new_session')
      return {
        type: 'new_session',
        payload: {
          cwd: optionalStringField(payload, 'cwd', 'new_session.cwd'),
          permissionMode: optionalStringField(
            payload,
            'permissionMode',
            'new_session.permissionMode',
          ),
        },
      }
    }
    case 'prompt': {
      const payload = payloadRecord(message.payload, 'prompt')
      return {
        type: 'prompt',
        payload: { content: decodeContentBlocks(payload.content) },
      }
    }
    case 'permission_response':
      return {
        type: 'permission_response',
        payload: decodePermissionResponsePayload(message.payload),
      }
    case 'set_session_model': {
      const payload = payloadRecord(message.payload, 'set_session_model')
      if (typeof payload.modelId !== 'string') {
        throw new Error('Invalid set_session_model payload')
      }
      return {
        type: 'set_session_model',
        payload: { modelId: payload.modelId },
      }
    }
    case 'list_sessions': {
      const payload = optionalRecord(message.payload)
      return {
        type: 'list_sessions',
        payload: {
          cwd: optionalString(payload.cwd),
          cursor: optionalString(payload.cursor),
        },
      }
    }
    case 'load_session':
    case 'resume_session': {
      const payload = payloadRecord(message.payload, message.type)
      if (typeof payload.sessionId !== 'string') {
        throw new Error(`Invalid ${message.type} payload`)
      }
      return {
        type: message.type,
        payload: {
          sessionId: payload.sessionId,
          cwd: optionalString(payload.cwd),
        },
      }
    }
    default:
      throw new Error(`Unknown message type: ${message.type}`)
  }
}

export function decodeClientWsMessage(data: unknown): ProxyMessage {
  return decodeClientMessage(decodeJsonWsMessage(data))
}
