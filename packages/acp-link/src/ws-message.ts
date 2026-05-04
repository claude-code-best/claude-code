export const MAX_CLIENT_WS_PAYLOAD_BYTES = 10 * 1024 * 1024

export class WsPayloadTooLargeError extends Error {
  constructor(byteLength: number) {
    super(`WebSocket message too large: ${byteLength} bytes`)
    this.name = 'WsPayloadTooLargeError'
  }
}

export interface JsonWsMessage {
  type: string
  payload?: unknown
  [key: string]: unknown
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

export function decodeJsonWsMessage(data: unknown): JsonWsMessage {
  const parsed = JSON.parse(decodeWsText(data)) as unknown
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('type' in parsed) ||
    typeof parsed.type !== 'string'
  ) {
    throw new Error('Invalid WebSocket message payload')
  }
  return parsed as JsonWsMessage
}
