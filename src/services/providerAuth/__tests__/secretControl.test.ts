import { describe, expect, test } from 'bun:test'
import {
  ProviderSecretControlService,
  type ProviderSecretChallenge,
} from '../secretControl.js'

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  return Buffer.from(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  ).toString('base64url')
}

function fromBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function encrypt(challenge: ProviderSecretChallenge, credential: string) {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const workerKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(fromBase64Url(challenge.workerPublicKey)),
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
      salt: toArrayBuffer(fromBase64Url(challenge.salt)),
      info,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: info },
    key,
    new TextEncoder().encode(credential),
  )
  return {
    algorithm: challenge.algorithm,
    browser_public_key: base64Url(
      await crypto.subtle.exportKey('raw', pair.publicKey),
    ),
    iv: base64Url(iv),
    ciphertext: base64Url(ciphertext),
  }
}

describe('ProviderSecretControlService', () => {
  test('decrypts a credential once and never exposes it in the challenge', async () => {
    const installed: Array<{ providerId: string; credential: string }> = []
    const service = new ProviderSecretControlService({
      install: async (providerId, credential) => {
        installed.push({ providerId, credential })
      },
      now: () => 1_000,
    })
    const challenge = await service.begin({
      operationId: 'operation-1',
      providerId: 'provider-1',
    })

    expect(JSON.stringify(challenge)).not.toContain('secret-value')
    const envelope = await encrypt(challenge, 'secret-value')
    await expect(
      service.submit({
        operationId: 'operation-1',
        providerId: 'provider-1',
        envelope,
      }),
    ).resolves.toEqual({ configured: true })
    expect(installed).toEqual([
      { providerId: 'provider-1', credential: 'secret-value' },
    ])
    await expect(
      service.submit({
        operationId: 'operation-1',
        providerId: 'provider-1',
        envelope,
      }),
    ).rejects.toThrow('provider_secret_operation_not_found')
  })

  test('binds ciphertext to the provider and rejects extra fields', async () => {
    const service = new ProviderSecretControlService({
      install: async () => {},
      now: () => 1_000,
    })
    const challenge = await service.begin({
      operationId: 'operation-2',
      providerId: 'provider-2',
    })
    const envelope = await encrypt(challenge, 'secret-value')

    await expect(
      service.submit({
        operationId: 'operation-2',
        providerId: 'other-provider',
        envelope,
      }),
    ).rejects.toThrow('provider_secret_operation_mismatch')
    await expect(
      service.submit({
        operationId: 'operation-2',
        providerId: 'provider-2',
        envelope: { ...envelope, command: 'echo secret-value' },
      }),
    ).rejects.toThrow('invalid_provider_secret_envelope')
  })
})
