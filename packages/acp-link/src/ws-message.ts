export const MAX_CLIENT_WS_PAYLOAD_BYTES = 10 * 1024 * 1024

export class WsPayloadTooLargeError extends Error {
  constructor(byteLength: number) {
    super(`WebSocket message too large: ${byteLength} bytes`)
    this.name = 'WsPayloadTooLargeError'
  }
}

/**
 * Legacy proprietary envelope shape: `{ type, payload? }`.
 * Retained for backwards compatibility with older clients (e.g. the RCS Web UI)
 * that have not migrated to JSON-RPC 2.0 yet.
 */
export interface JsonWsMessage {
  type: string
  payload?: unknown
  [key: string]: unknown
}

/**
 * JSON-RPC 2.0 envelope as defined by the specification.
 * See transports.mdx: custom transports MUST preserve the JSON-RPC message
 * format and lifecycle requirements defined by ACP.
 */
export interface JsonRpc2Request {
  jsonrpc: '2.0'
  id: string | number | null
  method: string
  params?: unknown
}

export interface JsonRpc2Notification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export interface JsonRpc2Response {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export type JsonRpc2Message =
  | JsonRpc2Request
  | JsonRpc2Notification
  | JsonRpc2Response

/**
 * Messages that carry a `method` field — i.e. requests and notifications that
 * the proxy can route. Responses (no method) are excluded because clients are
 * not expected to send them to the agent.
 */
export type JsonRpc2ClientMessage = JsonRpc2Request | JsonRpc2Notification

export function isJsonRpc2Message(
  value: unknown,
): value is JsonRpc2ClientMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    typeof (value as { method?: unknown }).method === 'string'
  )
}

function assertPayloadSize(byteLength: number): void {
  if (byteLength > MAX_CLIENT_WS_PAYLOAD_BYTES) {
    throw new WsPayloadTooLargeError(byteLength)
  }
}

function decodeWsText(data: unknown): string {
  if (typeof data === 'string') {
    assertPayloadSize(Buffer.byteLength(data, 'utf8'))
    return data
  }

  if (data instanceof ArrayBuffer) {
    assertPayloadSize(data.byteLength)
    return new TextDecoder().decode(new Uint8Array(data))
  }

  if (ArrayBuffer.isView(data)) {
    assertPayloadSize(data.byteLength)
    return new TextDecoder().decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    )
  }

  if (Array.isArray(data) && data.every(Buffer.isBuffer)) {
    const byteLength = data.reduce(
      (total, chunk) => total + chunk.byteLength,
      0,
    )
    assertPayloadSize(byteLength)
    return Buffer.concat(data, byteLength).toString('utf8')
  }

  throw new Error('Unsupported WebSocket message payload')
}

/**
 * Decode a WebSocket text frame into either a JSON-RPC 2.0 message or the
 * legacy proprietary `{type, payload}` envelope.
 *
 * Accepts:
 * - JSON-RPC 2.0 requests/notifications/responses (`{ jsonrpc: '2.0', method, ... }`)
 * - Legacy proprietary messages (`{ type: string, payload?: unknown }`)
 *
 * Rejects anything else with `Invalid WebSocket message payload`.
 */
export function decodeJsonWsMessage(data: unknown): JsonWsMessage {
  const parsed = JSON.parse(decodeWsText(data)) as unknown
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid WebSocket message payload')
  }
  // JSON-RPC 2.0 envelope — preserve all original fields so the router can
  // correlate request ids and forward notifications unchanged.
  if (isJsonRpc2Message(parsed)) {
    return parsed as unknown as JsonWsMessage
  }
  // Legacy proprietary envelope `{ type, payload? }`.
  if (!('type' in parsed) || typeof parsed.type !== 'string') {
    throw new Error('Invalid WebSocket message payload')
  }
  return parsed as JsonWsMessage
}
