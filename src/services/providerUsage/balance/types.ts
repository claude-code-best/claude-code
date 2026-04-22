import type { ProviderBalance } from '../types.js'

export interface BalanceProvider {
  readonly providerId: string
  /** Whether the user has configured this provider (env vars etc.). */
  isEnabled(): boolean
  /** Fetch a fresh snapshot; return null on any soft failure. */
  fetchBalance(signal?: AbortSignal): Promise<ProviderBalance | null>
}
