import { describe, expect, test } from 'bun:test'
import {
  encryptProviderSecret,
  parseProviderSecretChallenge,
} from '../lib/provider-secret'

describe('provider secret encryption', () => {
  test('encrypts credentials for the local Worker without retaining plaintext', async () => {
    const workerPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    )
    const publicBytes = new Uint8Array(
      await crypto.subtle.exportKey('raw', workerPair.publicKey),
    )
    const challenge = parseProviderSecretChallenge({
      operationId: 'operation-1',
      algorithm: 'P256-HKDF-SHA256-AESGCM',
      workerPublicKey: Buffer.from(publicBytes).toString('base64url'),
      salt: Buffer.alloc(16, 7).toString('base64url'),
      context: 'provider-secret-v1\u0000provider-1\u0000operation-1',
      expiresAt: Date.now() + 60_000,
    })

    const envelope = await encryptProviderSecret(challenge, 'secret-value')

    expect(envelope.algorithm).toBe(challenge.algorithm)
    expect(JSON.stringify(envelope)).not.toContain('secret-value')
    expect(envelope.iv).not.toBe('')
  })

  test('rejects a challenge containing private material or unknown fields', () => {
    expect(() =>
      parseProviderSecretChallenge({
        operationId: 'operation-1',
        algorithm: 'P256-HKDF-SHA256-AESGCM',
        workerPublicKey: 'public-key',
        salt: 'public-salt',
        context: 'context',
        expiresAt: Date.now() + 60_000,
        privateKey: 'must-not-cross-worker-boundary',
      }),
    ).toThrow('invalid_provider_secret_challenge')
  })
})
