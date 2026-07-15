export type ProviderAuthMethod =
  | 'claude-subscription-oauth'
  | 'anthropic-console-oauth'
  | 'chatgpt-device-oauth'
  | 'api-key'
  | 'bearer-token'
  | 'aws-iam'
  | 'gcp-adc'
  | 'azure-ad'
  | 'proxy'

export type ProviderAuthOperationState =
  | 'starting'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'

export type ProviderAuthOperationStatus = {
  operationId: string
  state: ProviderAuthOperationState
  authorizationUrl?: string
  userCode?: string
  expiresAt: number
  pollIntervalMs?: number
  errorCode?: string
}

export type ProviderCloudRefreshRequest =
  | { method: 'aws-iam'; action: 'aws-refresh' }
  | { method: 'gcp-adc'; action: 'gcp-refresh' }
  | { method: 'azure-ad'; action: 'azure-refresh' }
  | { method: 'proxy'; action: 'proxy-probe' }
