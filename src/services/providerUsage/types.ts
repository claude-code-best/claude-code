/**
 * Unified provider usage model.
 *
 * Each API client (Anthropic, OpenAI, Bedrock, ...) parses its own response
 * headers through a `ProviderUsageAdapter` and pushes buckets into the store.
 * A balance poller may additionally populate `ProviderBalance`.
 */

export type BucketKind =
  | 'session' // Anthropic 5-hour window
  | 'weekly' // Anthropic 7-day window
  | 'requests' // OpenAI-style RPM bucket
  | 'tokens' // OpenAI-style TPM bucket
  | 'throttle' // Bedrock / generic throttle
  | 'custom'

export interface ProviderUsageBucket {
  kind: BucketKind
  label: string
  utilization: number
  resetsAt?: number
}

export interface ProviderBalance {
  currency: string
  remaining: number
  total?: number
  updatedAt?: number
}

export interface ProviderUsage {
  providerId: string
  buckets: ProviderUsageBucket[]
  balance?: ProviderBalance
}

export interface ProviderUsageAdapter {
  providerId: string
  parseHeaders(headers: globalThis.Headers): ProviderUsageBucket[]
}
