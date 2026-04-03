/**
 * Sentry integration module
 *
 * Initializes Sentry SDK when SENTRY_DSN environment variable is set.
 * When DSN is not configured, all exports are no-ops.
 */

import * as Sentry from '@sentry/node'
import { logForDebugging } from './debug.js'

let initialized = false

/**
 * Initialize Sentry SDK. Safe to call multiple times — subsequent calls are no-ops.
 * Only activates when SENTRY_DSN environment variable is set.
 */
export function initSentry(): void {
  if (initialized) {
    return
  }

  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    logForDebugging('[sentry] SENTRY_DSN not set, skipping initialization')
    return
  }

  Sentry.init({
    dsn,
    release: typeof MACRO !== 'undefined' ? MACRO.VERSION : undefined,
    environment:
      typeof BUILD_ENV !== 'undefined' ? BUILD_ENV : process.env.NODE_ENV || 'development',

    // Limit breadcrumbs and attachments to control payload size
    maxBreadcrumbs: 20,

    // Sample rate for error events (1.0 = capture all)
    sampleRate: 1.0,

    // Filter sensitive information before sending
    beforeSend(event) {
      // Strip auth headers from request data
      const request = event.request
      if (request?.headers) {
        const sensitiveHeaders = [
          'authorization',
          'x-api-key',
          'cookie',
          'set-cookie',
        ]
        for (const key of Object.keys(request.headers)) {
          if (sensitiveHeaders.includes(key.toLowerCase())) {
            delete request.headers[key]
          }
        }
      }

      return event
    },

    // Ignore specific error patterns
    ignoreErrors: [
      // Network errors from unreachable hosts — not actionable
      'ECONNREFUSED',
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
      // User-initiated aborts
      'AbortError',
      'The user aborted a request',
      // Interactive cancellation signals
      'CancelError',
    ],

    beforeSendTransaction(event) {
      // Don't send performance transactions for now — errors only
      return null
    },
  })

  initialized = true
  logForDebugging('[sentry] Initialized successfully')
}

/**
 * Capture an exception and send it to Sentry.
 * No-op if Sentry has not been initialized.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) {
    return
  }

  try {
    Sentry.withScope(scope => {
      if (context) {
        scope.setExtras(context)
      }
      Sentry.captureException(error)
    })
  } catch {
    // Sentry itself failed — don't let it crash the app
  }
}

/**
 * Set a tag on the current scope for grouping/filtering in Sentry.
 * No-op if Sentry has not been initialized.
 */
export function setTag(key: string, value: string): void {
  if (!initialized) {
    return
  }

  try {
    Sentry.setTag(key, value)
  } catch {
    // Ignore
  }
}

/**
 * Set user context in Sentry for error attribution.
 * No-op if Sentry has not been initialized.
 */
export function setUser(user: { id?: string; email?: string; username?: string }): void {
  if (!initialized) {
    return
  }

  try {
    Sentry.setUser(user)
  } catch {
    // Ignore
  }
}

/**
 * Flush pending Sentry events and close the client.
 * Call during graceful shutdown to ensure events are sent.
 */
export async function closeSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) {
    return
  }

  try {
    await Sentry.close(timeoutMs)
    logForDebugging('[sentry] Closed successfully')
  } catch {
    // Ignore — we're shutting down anyway
  }
}

/**
 * Check if Sentry is initialized. Useful for conditional UI rendering.
 */
export function isSentryInitialized(): boolean {
  return initialized
}
