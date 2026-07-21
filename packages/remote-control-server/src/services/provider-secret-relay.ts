import { randomUUID } from 'node:crypto'

const RELAY_TTL_MS = 30_000
const RELAY_LIMIT = 32
const ENVELOPE_FIELDS = [
  'algorithm',
  'browser_public_key',
  'iv',
  'ciphertext',
] as const

export type ProviderSecretEnvelope = {
  algorithm: 'P256-HKDF-SHA256-AESGCM'
  browser_public_key: string
  iv: string
  ciphertext: string
}

type RelayContext = {
  environmentId: string
  providerId: string
  operationId: string
}

type RelayEntry = RelayContext & {
  envelope: ProviderSecretEnvelope
  expiresAt: number
}

type RelayDependencies = {
  now: () => number
  randomId: () => string
}

const defaultDependencies: RelayDependencies = {
  now: Date.now,
  randomId: () => `relay_${randomUUID().replaceAll('-', '')}`,
}

function parseEnvelope(value: unknown): ProviderSecretEnvelope {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_provider_secret_envelope')
  }
  const input = value as Record<string, unknown>
  const allowed = new Set<string>(ENVELOPE_FIELDS)
  if (
    Object.keys(input).some(key => !allowed.has(key)) ||
    input['algorithm'] !== 'P256-HKDF-SHA256-AESGCM'
  ) {
    throw new Error('invalid_provider_secret_envelope')
  }
  for (const field of ENVELOPE_FIELDS.slice(1)) {
    const candidate = input[field]
    if (
      typeof candidate !== 'string' ||
      candidate.length < 1 ||
      candidate.length > 24_000 ||
      !/^[A-Za-z0-9_-]+$/.test(candidate)
    ) {
      throw new Error('invalid_provider_secret_envelope')
    }
  }
  return {
    algorithm: 'P256-HKDF-SHA256-AESGCM',
    browser_public_key: input['browser_public_key'] as string,
    iv: input['iv'] as string,
    ciphertext: input['ciphertext'] as string,
  }
}

function matches(entry: RelayContext, context: RelayContext): boolean {
  return (
    entry.environmentId === context.environmentId &&
    entry.providerId === context.providerId &&
    entry.operationId === context.operationId
  )
}

/** Process-local one-time relay. Envelopes are never written to persistence. */
export class ProviderSecretRelay {
  private readonly entries = new Map<string, RelayEntry>()

  constructor(
    private readonly dependencies: RelayDependencies = defaultDependencies,
  ) {}

  put(input: RelayContext & { envelope: unknown }): string {
    this.cleanup()
    if (this.entries.size >= RELAY_LIMIT) {
      const oldest = this.entries.keys().next().value
      if (oldest) this.entries.delete(oldest)
    }
    const relayId = this.dependencies.randomId()
    this.entries.set(relayId, {
      environmentId: input.environmentId,
      providerId: input.providerId,
      operationId: input.operationId,
      envelope: parseEnvelope(input.envelope),
      expiresAt: this.dependencies.now() + RELAY_TTL_MS,
    })
    return relayId
  }

  consume(relayId: string, context: RelayContext): ProviderSecretEnvelope {
    this.cleanup()
    const entry = this.entries.get(relayId)
    if (!entry) throw new Error('provider_secret_relay_not_found')
    if (!matches(entry, context)) {
      throw new Error('provider_secret_relay_mismatch')
    }
    this.entries.delete(relayId)
    return { ...entry.envelope }
  }

  delete(relayId: string): void {
    this.entries.delete(relayId)
  }

  private cleanup(): void {
    const now = this.dependencies.now()
    for (const [relayId, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(relayId)
    }
  }
}

export const providerSecretRelay = new ProviderSecretRelay()
