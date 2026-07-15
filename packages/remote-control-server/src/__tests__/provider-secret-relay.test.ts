import { describe, expect, test } from 'bun:test'
import { ProviderSecretRelay } from '../services/provider-secret-relay'

const envelope = {
  algorithm: 'P256-HKDF-SHA256-AESGCM',
  browser_public_key: 'browser-public-key',
  iv: 'encrypted-iv',
  ciphertext: 'encrypted-credential',
} as const

describe('ProviderSecretRelay', () => {
  test('keeps an encrypted envelope in memory and consumes it once', () => {
    const relay = new ProviderSecretRelay({
      now: () => 1_000,
      randomId: () => 'relay_test',
    })
    const relayId = relay.put({
      environmentId: 'environment-1',
      providerId: 'provider-1',
      operationId: 'operation-1',
      envelope,
    })

    expect(relayId).toBe('relay_test')
    expect(
      relay.consume(relayId, {
        environmentId: 'environment-1',
        providerId: 'provider-1',
        operationId: 'operation-1',
      }),
    ).toEqual(envelope)
    expect(() =>
      relay.consume(relayId, {
        environmentId: 'environment-1',
        providerId: 'provider-1',
        operationId: 'operation-1',
      }),
    ).toThrow('provider_secret_relay_not_found')
  })

  test('does not release ciphertext to a mismatched environment', () => {
    const relay = new ProviderSecretRelay({
      now: () => 1_000,
      randomId: () => 'relay_test',
    })
    const relayId = relay.put({
      environmentId: 'environment-1',
      providerId: 'provider-1',
      operationId: 'operation-1',
      envelope,
    })

    expect(() =>
      relay.consume(relayId, {
        environmentId: 'environment-2',
        providerId: 'provider-1',
        operationId: 'operation-1',
      }),
    ).toThrow('provider_secret_relay_mismatch')
    relay.delete(relayId)
  })
})
