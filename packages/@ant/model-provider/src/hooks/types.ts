/**
 * Hooks for dependency injection.
 * Main project provides implementations; model-provider calls them.
 *
 * This decouples the model-provider from main project specifics like
 * analytics, cost tracking, feature flags, etc.
 */
export interface ModelProviderHooks {
  /** Log an analytics event (replaces direct logEvent calls) */
  logEvent: (eventName: string, metadata?: Record<string, unknown>) => void

  /** Report API cost after each response */
  reportCost: (params: {
    costUSD: number
    usage: Record<string, unknown>
    model: string
  }) => void

  /** Get tool permission context */
  getToolPermissionContext?: () => Promise<Record<string, unknown>>

  /** Debug logging */
  logForDebugging: (msg: string, opts?: { level?: string }) => void

  /** Error logging */
  logError: (error: Error) => void

  /** Get feature flag value */
  getFeatureFlag?: (flagName: string) => unknown

  /** Get session ID */
  getSessionId: () => string

  /** Add a notification */
  addNotification?: (notification: Record<string, unknown>) => void

  /** Get API provider name */
  getAPIProvider: () => string

  /** Get user ID */
  getOrCreateUserID: () => string

  /** Check if non-interactive session */
  isNonInteractiveSession: () => boolean

  /** Get OAuth account info */
  getOauthAccountInfo?: () => Record<string, unknown> | undefined
}
