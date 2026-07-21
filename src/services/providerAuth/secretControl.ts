const SECRET_ALGORITHM = 'P256-HKDF-SHA256-AESGCM' as const
const SECRET_TTL_MS = 5 * 60 * 1000
const MAX_SECRET_BYTES = 16 * 1024

export type ProviderSecretChallenge = {
  operationId: string
  algorithm: typeof SECRET_ALGORITHM
  workerPublicKey: string
  salt: string
  context: string
  expiresAt: number
}

export type ProviderSecretEnvelope = {
  algorithm: typeof SECRET_ALGORITHM
  browser_public_key: string
  iv: string
  ciphertext: string
}

type SecretOperation = {
  providerId: string
  challenge: ProviderSecretChallenge
  privateKey: CryptoKey
}

export type ProviderSecretControlDependencies = {
  install: (providerId: string, credential: string) => Promise<void>
  now: () => number
}

function encodeBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  return Buffer.from(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  ).toString('base64url')
}

function decodeBase64Url(value: string, maximumBytes: number): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('invalid_provider_secret_envelope')
  }
  const bytes = new Uint8Array(Buffer.from(value, 'base64url'))
  if (bytes.byteLength < 1 || bytes.byteLength > maximumBytes) {
    throw new Error('invalid_provider_secret_envelope')
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function parseEnvelope(value: unknown): ProviderSecretEnvelope {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_provider_secret_envelope')
  }
  const input = value as Record<string, unknown>
  const allowed = new Set([
    'algorithm',
    'browser_public_key',
    'iv',
    'ciphertext',
  ])
  if (
    Object.keys(input).some(key => !allowed.has(key)) ||
    input['algorithm'] !== SECRET_ALGORITHM ||
    typeof input['browser_public_key'] !== 'string' ||
    typeof input['iv'] !== 'string' ||
    typeof input['ciphertext'] !== 'string'
  ) {
    throw new Error('invalid_provider_secret_envelope')
  }
  return {
    algorithm: SECRET_ALGORITHM,
    browser_public_key: input['browser_public_key'],
    iv: input['iv'],
    ciphertext: input['ciphertext'],
  }
}

function context(providerId: string, operationId: string): string {
  return `provider-secret-v1\u0000${providerId}\u0000${operationId}`
}

export class ProviderSecretControlService {
  private readonly operations = new Map<string, SecretOperation>()

  constructor(
    private readonly dependencies: ProviderSecretControlDependencies,
    private readonly operationLimit = 32,
  ) {
    if (!Number.isInteger(operationLimit) || operationLimit < 1) {
      throw new RangeError('operationLimit must be positive')
    }
  }

  async begin(input: {
    operationId: string
    providerId: string
  }): Promise<ProviderSecretChallenge> {
    this.cleanupExpired()
    const existing = this.operations.get(input.operationId)
    if (existing) {
      if (existing.providerId !== input.providerId) {
        throw new Error('provider_secret_operation_mismatch')
      }
      return { ...existing.challenge }
    }
    if (this.operations.size >= this.operationLimit) {
      const oldest = this.operations.keys().next().value
      if (oldest) this.operations.delete(oldest)
    }
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    )
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const challenge: ProviderSecretChallenge = {
      operationId: input.operationId,
      algorithm: SECRET_ALGORITHM,
      workerPublicKey: encodeBase64Url(
        await crypto.subtle.exportKey('raw', pair.publicKey),
      ),
      salt: encodeBase64Url(salt),
      context: context(input.providerId, input.operationId),
      expiresAt: this.dependencies.now() + SECRET_TTL_MS,
    }
    this.operations.set(input.operationId, {
      providerId: input.providerId,
      challenge,
      privateKey: pair.privateKey,
    })
    return { ...challenge }
  }

  async submit(input: {
    operationId: string
    providerId: string
    envelope: unknown
  }): Promise<{ configured: true }> {
    this.cleanupExpired()
    const operation = this.operations.get(input.operationId)
    if (!operation) throw new Error('provider_secret_operation_not_found')
    if (operation.providerId !== input.providerId) {
      throw new Error('provider_secret_operation_mismatch')
    }
    const envelope = parseEnvelope(input.envelope)
    const browserPublicKey = decodeBase64Url(envelope.browser_public_key, 65)
    const iv = decodeBase64Url(envelope.iv, 12)
    if (iv.byteLength !== 12 || browserPublicKey.byteLength !== 65) {
      throw new Error('invalid_provider_secret_envelope')
    }
    const ciphertext = decodeBase64Url(
      envelope.ciphertext,
      MAX_SECRET_BYTES + 16,
    )
    this.operations.delete(input.operationId)

    let cleartext: Uint8Array | undefined
    try {
      const publicKey = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(browserPublicKey),
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
      )
      const shared = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: publicKey },
        operation.privateKey,
        256,
      )
      const material = await crypto.subtle.importKey(
        'raw',
        shared,
        'HKDF',
        false,
        ['deriveKey'],
      )
      const info = new TextEncoder().encode(operation.challenge.context)
      const key = await crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: toArrayBuffer(decodeBase64Url(operation.challenge.salt, 16)),
          info,
        },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      )
      cleartext = new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: toArrayBuffer(iv),
            additionalData: info,
          },
          key,
          toArrayBuffer(ciphertext),
        ),
      )
      if (cleartext.byteLength < 1 || cleartext.byteLength > MAX_SECRET_BYTES) {
        throw new Error('invalid_provider_secret')
      }
      const credential = new TextDecoder('utf-8', { fatal: true })
        .decode(cleartext)
        .trim()
      if (!credential) throw new Error('invalid_provider_secret')
      await this.dependencies.install(input.providerId, credential)
      return { configured: true }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'invalid_provider_secret'
      ) {
        throw error
      }
      throw new Error('provider_secret_decryption_failed')
    } finally {
      browserPublicKey.fill(0)
      iv.fill(0)
      ciphertext.fill(0)
      cleartext?.fill(0)
    }
  }

  private cleanupExpired(): void {
    const now = this.dependencies.now()
    for (const [operationId, operation] of this.operations) {
      if (operation.challenge.expiresAt <= now) {
        this.operations.delete(operationId)
      }
    }
  }
}
