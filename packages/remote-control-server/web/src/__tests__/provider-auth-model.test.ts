import { describe, expect, test } from 'bun:test'
import {
  ProviderAuthModel,
  parseProviderAuthStatus,
} from '../lib/provider-auth-model'

describe('provider auth model', () => {
  test('exposes instructions but rejects private flow state', () => {
    const status = parseProviderAuthStatus({
      operationId: 'operation-1',
      state: 'waiting',
      authorizationUrl: 'https://auth.example/device',
      userCode: 'ABCD-EFGH',
      expiresAt: 123,
      pollIntervalMs: 3000,
    })
    expect(status.userCode).toBe('ABCD-EFGH')
    expect(() =>
      parseProviderAuthStatus({
        ...status,
        deviceAuthId: 'private-device-code',
      }),
    ).toThrow('provider_auth_status_contains_secret')
  })

  test('uses the worker polling interval and maps only public error codes', () => {
    const model = new ProviderAuthModel()
    model.status = {
      operationId: 'operation-2',
      state: 'failed',
      expiresAt: 123,
      pollIntervalMs: 4500,
      errorCode: 'provider_auth_failed',
    }
    expect(model.pollDelay()).toBe(4500)
    expect(model.errorText()).toContain('认证失败')
  })
})
