import { Buffer } from 'node:buffer'
import type { WSContext } from 'hono/ws'
import { error as logError } from '../logger'

const textDecoder = new TextDecoder()

export const MAX_WS_MESSAGE_SIZE = 10 * 1024 * 1024

export type DecodedWsMessage =
  | { ok: true; data: string; size: number }
  | { ok: false; reason: string; size?: number }

export function decodeWsPayload(data: unknown): DecodedWsMessage {
  if (typeof data === 'string') {
    return { ok: true, data, size: Buffer.byteLength(data, 'utf8') }
  }
  if (data instanceof ArrayBuffer) {
    if (data.byteLength > MAX_WS_MESSAGE_SIZE) {
      return { ok: false, reason: 'message too large', size: data.byteLength }
    }
    return { ok: true, data: textDecoder.decode(data), size: data.byteLength }
  }
  if (data instanceof Uint8Array) {
    if (data.byteLength > MAX_WS_MESSAGE_SIZE) {
      return { ok: false, reason: 'message too large', size: data.byteLength }
    }
    return { ok: true, data: textDecoder.decode(data), size: data.byteLength }
  }
  if (
    typeof SharedArrayBuffer !== 'undefined' &&
    data instanceof SharedArrayBuffer
  ) {
    const bytes = new Uint8Array(data)
    if (bytes.byteLength > MAX_WS_MESSAGE_SIZE) {
      return { ok: false, reason: 'message too large', size: bytes.byteLength }
    }
    return { ok: true, data: textDecoder.decode(bytes), size: bytes.byteLength }
  }
  return { ok: false, reason: typeof data }
}

export function handleSizedWsPayload(
  ws: WSContext,
  logPrefix: string,
  label: string,
  payload: unknown,
  handleMessage: (data: string) => void,
): boolean {
  const decoded = decodeWsPayload(payload)
  if (!decoded.ok) {
    if (decoded.reason === 'message too large' && decoded.size !== undefined) {
      logError(
        `${logPrefix} Message too large on ${label}: size=${decoded.size} limit=${MAX_WS_MESSAGE_SIZE}`,
      )
      ws.close(1009, 'message too large')
      return false
    }
    logError(
      `${logPrefix} Unsupported message payload on ${label}: ${decoded.reason}`,
    )
    ws.close(1003, 'unsupported message payload')
    return false
  }
  if (decoded.size > MAX_WS_MESSAGE_SIZE) {
    logError(
      `${logPrefix} Message too large on ${label}: size=${decoded.size} limit=${MAX_WS_MESSAGE_SIZE}`,
    )
    ws.close(1009, 'message too large')
    return false
  }
  handleMessage(decoded.data)
  return true
}
