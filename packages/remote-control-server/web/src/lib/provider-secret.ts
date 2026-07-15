export const PROVIDER_SECRET_ALGORITHM = 'P256-HKDF-SHA256-AESGCM' as const

export type BrowserProviderSecretChallenge = {
  operationId: string
  algorithm: typeof PROVIDER_SECRET_ALGORITHM
  workerPublicKey: string
  salt: string
  context: string
  expiresAt: number
}

export type BrowserProviderSecretEnvelope = {
  algorithm: typeof PROVIDER_SECRET_ALGORITHM
  browser_public_key: string
  iv: string
  ciphertext: string
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function decodeBase64Url(value: string, expectedBytes: number): ArrayBuffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('invalid_provider_secret_challenge')
  }
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw new Error('invalid_provider_secret_challenge')
  }
  if (binary.length !== expectedBytes) {
    throw new Error('invalid_provider_secret_challenge')
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

function encodeBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

export function parseProviderSecretChallenge(
  value: unknown,
): BrowserProviderSecretChallenge {
  const input = record(value)
  const allowed = new Set([
    'operationId',
    'algorithm',
    'workerPublicKey',
    'salt',
    'context',
    'expiresAt',
  ])
  if (
    !input ||
    Object.keys(input).some(key => !allowed.has(key)) ||
    typeof input['operationId'] !== 'string' ||
    input['algorithm'] !== PROVIDER_SECRET_ALGORITHM ||
    typeof input['workerPublicKey'] !== 'string' ||
    typeof input['salt'] !== 'string' ||
    typeof input['context'] !== 'string' ||
    !input['context'].startsWith('provider-secret-v1\u0000') ||
    !Number.isSafeInteger(input['expiresAt'])
  ) {
    throw new Error('invalid_provider_secret_challenge')
  }
  decodeBase64Url(input['workerPublicKey'], 65)
  decodeBase64Url(input['salt'], 16)
  return {
    operationId: input['operationId'],
    algorithm: PROVIDER_SECRET_ALGORITHM,
    workerPublicKey: input['workerPublicKey'],
    salt: input['salt'],
    context: input['context'],
    expiresAt: input['expiresAt'] as number,
  }
}

export async function encryptProviderSecret(
  challenge: BrowserProviderSecretChallenge,
  credential: string,
): Promise<BrowserProviderSecretEnvelope> {
  const cleartext = new TextEncoder().encode(credential.trim())
  if (cleartext.byteLength < 1 || cleartext.byteLength > 16 * 1024) {
    throw new Error('invalid_provider_secret')
  }
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const workerKey = await crypto.subtle.importKey(
    'raw',
    decodeBase64Url(challenge.workerPublicKey, 65),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: workerKey },
    pair.privateKey,
    256,
  )
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, [
    'deriveKey',
  ])
  const info = new TextEncoder().encode(challenge.context)
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: decodeBase64Url(challenge.salt, 16),
      info,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: info },
      key,
      cleartext,
    )
    return {
      algorithm: PROVIDER_SECRET_ALGORITHM,
      browser_public_key: encodeBase64Url(
        await crypto.subtle.exportKey('raw', pair.publicKey),
      ),
      iv: encodeBase64Url(iv),
      ciphertext: encodeBase64Url(ciphertext),
    }
  } finally {
    cleartext.fill(0)
    new Uint8Array(shared).fill(0)
  }
}
