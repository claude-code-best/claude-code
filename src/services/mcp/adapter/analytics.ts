// Host analytics adapter — bridges logEvent to mcp-client's AnalyticsSink interface

import type { AnalyticsSink } from '@claude-code-best/mcp-client'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../analytics/index.js'

/**
 * Creates an AnalyticsSink implementation that delegates to the host's logEvent.
 */
export function createMcpAnalytics(): AnalyticsSink {
  return {
    trackEvent(event: string, metadata: Record<string, unknown>) {
      logEvent(event, metadata as Record<string, AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS>)
    },
  }
}
