import { createHash, timingSafeEqual } from 'node:crypto'

const WS_AUTH_PROTOCOL_PREFIX = 'rcs.auth.'

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

export function encodeWebSocketAuthProtocol(token: string): string {
  return `${WS_AUTH_PROTOCOL_PREFIX}${Buffer.from(token, 'utf8').toString('base64url')}`
}

export function decodeWebSocketAuthProtocol(
  protocolHeader: string | undefined,
): string | undefined {
  if (!protocolHeader) {
    return undefined
  }

  for (const protocol of protocolHeader.split(',')) {
    const trimmed = protocol.trim()
    if (!trimmed.startsWith(WS_AUTH_PROTOCOL_PREFIX)) {
      continue
    }

    const encoded = trimmed.slice(WS_AUTH_PROTOCOL_PREFIX.length)
    if (!encoded) {
      return undefined
    }

    try {
      const token = Buffer.from(encoded, 'base64url').toString('utf8')
      return token.length > 0 ? token : undefined
    } catch {
      return undefined
    }
  }

  return undefined
}

export function extractBearerToken(
  authorizationHeader: string | undefined,
): string | undefined {
  return authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length)
    : undefined
}

export function extractWebSocketAuthToken(headers: {
  authorization?: string
  protocol?: string
}): string | undefined {
  return (
    extractBearerToken(headers.authorization) ??
    decodeWebSocketAuthProtocol(headers.protocol)
  )
}

export function authTokensEqual(
  providedToken: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!providedToken || !expectedToken) {
    return false
  }
  return timingSafeEqual(sha256(providedToken), sha256(expectedToken))
}
