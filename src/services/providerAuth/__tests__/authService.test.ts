import { describe, expect, test } from 'bun:test'
import {
  ProviderAuthService,
  type ProviderAuthDependencies,
} from '../authService.js'
import type { OAuthTokens } from '../../oauth/types.js'

const tokens = {
  accessToken: 'private',
  refreshToken: 'private',
} as OAuthTokens

function dependencies() {
  let oauthOptions: Record<string, unknown> | undefined
  let resolveOAuth: ((tokens: OAuthTokens) => void) | undefined
  let resolveDevice: (() => void) | undefined
  const installed: string[] = []
  const deps: ProviderAuthDependencies = {
    createOAuth: () => ({
      startOAuthFlow: async (handler, options) => {
        oauthOptions = options
        await handler('https://auth.example/manual')
        return new Promise(resolve => {
          resolveOAuth = resolve
        })
      },
      handleManualAuthCodeInput: () => {},
      cleanup: () => {},
    }),
    installOAuth: async () => {
      installed.push('oauth')
    },
    requestChatGPTCode: async () => ({
      verificationUrl: 'https://auth.openai.test/device',
      userCode: 'ABCD-EFGH',
      deviceAuthId: 'private-device-code',
      intervalSeconds: 3,
    }),
    completeChatGPTLogin: async () =>
      new Promise<void>(resolve => {
        resolveDevice = resolve
      }),
    saveProviderSettings: async kind => {
      installed.push(kind)
    },
    removeChatGPT: async () => {},
    refreshCloud: async () => {},
    now: () => 100,
  }
  return {
    deps,
    installed,
    oauthOptions: () => oauthOptions,
    finishOAuth: () => resolveOAuth?.(tokens),
    finishDevice: () => resolveDevice?.(),
  }
}

describe('ProviderAuthService', () => {
  test('runs subscription and console OAuth without exposing tokens', async () => {
    for (const [method, loginWithClaudeAi] of [
      ['claude-subscription-oauth', true],
      ['anthropic-console-oauth', false],
    ] as const) {
      const fixture = dependencies()
      const service = new ProviderAuthService(fixture.deps)
      service.begin({ operationId: method, providerId: 'anthropic', method })
      await Promise.resolve()
      expect(service.get(method)).toMatchObject({
        state: 'waiting',
        authorizationUrl: 'https://auth.example/manual',
      })
      expect(fixture.oauthOptions()).toMatchObject({
        loginWithClaudeAi,
        skipBrowserOpen: true,
      })
      expect(JSON.stringify(service.get(method))).not.toContain('private')
      fixture.finishOAuth()
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(service.get(method).state).toBe('succeeded')
    }
  })

  test('keeps ChatGPT device code private and exposes only user instructions', async () => {
    const fixture = dependencies()
    const service = new ProviderAuthService(fixture.deps)
    service.begin({
      operationId: 'chatgpt-login',
      providerId: 'chatgpt',
      method: 'chatgpt-device-oauth',
    })
    await Promise.resolve()
    const status = service.get('chatgpt-login')
    expect(status).toMatchObject({
      state: 'waiting',
      userCode: 'ABCD-EFGH',
      pollIntervalMs: 3000,
    })
    expect(JSON.stringify(status)).not.toContain('private-device-code')
    fixture.finishDevice()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(service.get('chatgpt-login').state).toBe('succeeded')
  })

  test('cancels operations and rejects browser-provided shell fields', async () => {
    const fixture = dependencies()
    const service = new ProviderAuthService(fixture.deps)
    service.begin({
      operationId: 'cancel-me',
      providerId: 'chatgpt',
      method: 'chatgpt-device-oauth',
    })
    expect(service.cancel('cancel-me').state).toBe('cancelled')
    await expect(
      service.refresh({
        method: 'aws-iam',
        action: 'aws-refresh',
        command: 'rm -rf /',
      }),
    ).rejects.toThrow('invalid_auth_refresh_request')
    await expect(
      service.refresh({ method: 'aws-iam', action: 'aws-refresh' }),
    ).resolves.toBeUndefined()
  })
})
