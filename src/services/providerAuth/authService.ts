import { installOAuthTokens } from '../../cli/handlers/auth.js'
import {
  completeChatGPTDeviceLogin,
  removeChatGPTAuth,
  requestChatGPTDeviceCode,
  type ChatGPTDeviceCode,
} from '../api/openai/chatgptAuth.js'
import { OAuthService } from '../oauth/index.js'
import type { OAuthTokens } from '../oauth/types.js'
import { saveCompatibleProviderSettings } from '../providerRegistry/providerSettingsWriter.js'
import type {
  ProviderAuthMethod,
  ProviderAuthOperationStatus,
  ProviderCloudRefreshRequest,
} from './types.js'

type OAuthAdapter = {
  startOAuthFlow: (
    handler: (url: string, automaticUrl?: string) => Promise<void>,
    options?: {
      loginWithClaudeAi?: boolean
      skipBrowserOpen?: boolean
    },
  ) => Promise<OAuthTokens>
  handleManualAuthCodeInput: (input: {
    authorizationCode: string
    state: string
  }) => void
  cleanup: () => void
}

type AuthOperation = {
  providerId: string
  method: ProviderAuthMethod
  status: ProviderAuthOperationStatus
  controller: AbortController
  oauth?: OAuthAdapter
  deviceCode?: ChatGPTDeviceCode
}

export type ProviderAuthDependencies = {
  createOAuth: () => OAuthAdapter
  installOAuth: (tokens: OAuthTokens) => Promise<void>
  requestChatGPTCode: () => Promise<ChatGPTDeviceCode>
  completeChatGPTLogin: (
    code: ChatGPTDeviceCode,
    signal: AbortSignal,
  ) => Promise<unknown>
  saveProviderSettings: (kind: 'anthropic' | 'chatgpt') => Promise<void>
  removeChatGPT: () => Promise<void>
  refreshCloud: (request: ProviderCloudRefreshRequest) => Promise<void>
  now: () => number
}

const defaultDependencies: ProviderAuthDependencies = {
  createOAuth: () => new OAuthService(),
  installOAuth: installOAuthTokens,
  requestChatGPTCode: requestChatGPTDeviceCode,
  completeChatGPTLogin: completeChatGPTDeviceLogin,
  saveProviderSettings: async kind => {
    await saveCompatibleProviderSettings({ kind, models: [] })
  },
  removeChatGPT: removeChatGPTAuth,
  refreshCloud: async () => {},
  now: Date.now,
}

const AUTH_TTL_MS = 15 * 60 * 1000

function publicStatus(operation: AuthOperation): ProviderAuthOperationStatus {
  return { ...operation.status }
}

function errorCode(error: unknown): string {
  if (error instanceof Error && /cancel/i.test(error.message)) {
    return 'provider_auth_cancelled'
  }
  return 'provider_auth_failed'
}

function isOAuthMethod(method: ProviderAuthMethod): boolean {
  return (
    method === 'claude-subscription-oauth' ||
    method === 'anthropic-console-oauth'
  )
}

export class ProviderAuthService {
  private readonly operations = new Map<string, AuthOperation>()

  constructor(
    private readonly dependencies: ProviderAuthDependencies = defaultDependencies,
    private readonly operationLimit = 32,
  ) {
    if (!Number.isInteger(operationLimit) || operationLimit < 1) {
      throw new RangeError('operationLimit must be positive')
    }
  }

  begin(input: {
    operationId: string
    providerId: string
    method: ProviderAuthMethod
  }): ProviderAuthOperationStatus {
    this.cleanupExpired()
    const existing = this.operations.get(input.operationId)
    if (existing) return publicStatus(existing)
    if (this.operations.size >= this.operationLimit) {
      const oldest = this.operations.keys().next().value
      if (oldest) this.destroy(oldest)
    }
    const operation: AuthOperation = {
      providerId: input.providerId,
      method: input.method,
      controller: new AbortController(),
      status: {
        operationId: input.operationId,
        state: 'starting',
        expiresAt: this.dependencies.now() + AUTH_TTL_MS,
      },
    }
    this.operations.set(input.operationId, operation)
    if (isOAuthMethod(input.method)) {
      void this.runClaudeOAuth(operation)
    } else if (input.method === 'chatgpt-device-oauth') {
      void this.runChatGPTDeviceFlow(operation)
    } else {
      operation.status = {
        ...operation.status,
        state: 'waiting',
        errorCode: 'provider_secret_required',
      }
    }
    return publicStatus(operation)
  }

  get(operationId: string): ProviderAuthOperationStatus {
    this.cleanupExpired()
    const operation = this.operations.get(operationId)
    if (!operation) throw new Error('provider_auth_operation_not_found')
    return publicStatus(operation)
  }

  submitCode(operationId: string, value: string): ProviderAuthOperationStatus {
    const operation = this.operations.get(operationId)
    if (!operation?.oauth || !isOAuthMethod(operation.method)) {
      throw new Error('provider_auth_code_not_expected')
    }
    const [authorizationCode, state] = value.split('#')
    if (!authorizationCode || !state)
      throw new Error('invalid_provider_auth_code')
    operation.oauth.handleManualAuthCodeInput({ authorizationCode, state })
    return publicStatus(operation)
  }

  cancel(operationId: string): ProviderAuthOperationStatus {
    const operation = this.operations.get(operationId)
    if (!operation) throw new Error('provider_auth_operation_not_found')
    operation.controller.abort()
    operation.oauth?.cleanup()
    operation.status = { ...operation.status, state: 'cancelled' }
    return publicStatus(operation)
  }

  async remove(method: ProviderAuthMethod): Promise<void> {
    if (method === 'chatgpt-device-oauth')
      await this.dependencies.removeChatGPT()
  }

  async refresh(value: unknown): Promise<void> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid_auth_refresh_request')
    }
    const input = value as Record<string, unknown>
    if (
      Object.keys(input).some(key => !['method', 'action'].includes(key)) ||
      typeof input.method !== 'string' ||
      typeof input.action !== 'string'
    ) {
      throw new Error('invalid_auth_refresh_request')
    }
    const allowed = new Set([
      'aws-iam:aws-refresh',
      'gcp-adc:gcp-refresh',
      'azure-ad:azure-refresh',
      'proxy:proxy-probe',
    ])
    if (!allowed.has(`${input.method}:${input.action}`)) {
      throw new Error('invalid_auth_refresh_request')
    }
    await this.dependencies.refreshCloud(input as ProviderCloudRefreshRequest)
  }

  private async runClaudeOAuth(operation: AuthOperation): Promise<void> {
    const oauth = this.dependencies.createOAuth()
    operation.oauth = oauth
    try {
      const tokens = await oauth.startOAuthFlow(
        async url => {
          operation.status = {
            ...operation.status,
            state: 'waiting',
            authorizationUrl: url,
          }
        },
        {
          loginWithClaudeAi: operation.method === 'claude-subscription-oauth',
          skipBrowserOpen: true,
        },
      )
      if (operation.controller.signal.aborted) return
      await this.dependencies.installOAuth(tokens)
      await this.dependencies.saveProviderSettings('anthropic')
      operation.status = { ...operation.status, state: 'succeeded' }
    } catch (error) {
      if (operation.status.state === 'cancelled') return
      operation.status = {
        ...operation.status,
        state: operation.controller.signal.aborted ? 'cancelled' : 'failed',
        errorCode: errorCode(error),
      }
    } finally {
      oauth.cleanup()
      operation.oauth = undefined
    }
  }

  private async runChatGPTDeviceFlow(operation: AuthOperation): Promise<void> {
    try {
      const code = await this.dependencies.requestChatGPTCode()
      if (operation.controller.signal.aborted) return
      operation.deviceCode = code
      operation.status = {
        ...operation.status,
        state: 'waiting',
        authorizationUrl: code.verificationUrl,
        userCode: code.userCode,
        pollIntervalMs: code.intervalSeconds * 1000,
      }
      await this.dependencies.completeChatGPTLogin(
        code,
        operation.controller.signal,
      )
      if (operation.controller.signal.aborted) return
      await this.dependencies.saveProviderSettings('chatgpt')
      operation.status = { ...operation.status, state: 'succeeded' }
    } catch (error) {
      if (operation.status.state === 'cancelled') return
      operation.status = {
        ...operation.status,
        state: operation.controller.signal.aborted ? 'cancelled' : 'failed',
        errorCode: errorCode(error),
      }
    } finally {
      operation.deviceCode = undefined
    }
  }

  private cleanupExpired(): void {
    const now = this.dependencies.now()
    for (const [operationId, operation] of this.operations) {
      if (operation.status.expiresAt > now) continue
      operation.controller.abort()
      operation.oauth?.cleanup()
      operation.status = { ...operation.status, state: 'expired' }
      this.operations.delete(operationId)
    }
  }

  private destroy(operationId: string): void {
    const operation = this.operations.get(operationId)
    operation?.controller.abort()
    operation?.oauth?.cleanup()
    this.operations.delete(operationId)
  }
}

export const providerAuthService = new ProviderAuthService()
