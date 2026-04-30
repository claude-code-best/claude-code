// Host feature gate adapter — bridges feature() to mcp-client's FeatureGate interface

import type { FeatureGate } from '@claude-code-best/mcp-client'
import { feature } from 'bun:bundle'

/**
 * Creates a FeatureGate implementation using the host's feature flag system.
 */
export function createMcpFeatureGate(): FeatureGate {
  return {
    isEnabled(flag: string) {
      return feature(flag)
    },
  }
}
