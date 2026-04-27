import { feature } from 'bun:bundle'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import {
  getClaudeAIOAuthTokens,
  isAnthropicAuthEnabled,
} from '../utils/auth.js'

/**
 * Kill-switch check for voice mode. Returns true unless the
 * `tengu_amber_quartz_disabled` GrowthBook flag is flipped on (emergency
 * off). Default `false` means a missing/stale disk cache reads as "not
 * killed" — so fresh installs get voice working immediately without
 * waiting for GrowthBook init. Use this for deciding whether voice mode
 * should be *visible* (e.g., command registration, config UI).
 */
export function isVoiceGrowthBookEnabled(): boolean {
  // Positive ternary pattern — see docs/feature-gating.md.
  // Negative pattern (if (!feature(...)) return) does not eliminate
  // inline string literals from external builds.
  return feature('VOICE_MODE')
    ? !getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_quartz_disabled', false)
    : false
}

/**
 * Auth-only check for voice mode. Returns true when the user has a valid
 * Anthropic OAuth token. Backed by the memoized getClaudeAIOAuthTokens —
 * first call spawns `security` on macOS (~20-50ms), subsequent calls are
 * cache hits. The memoize clears on token refresh (~once/hour), so one
 * cold spawn per refresh is expected. Cheap enough for usage-time checks.
 */
export function hasVoiceAuth(): boolean {
  // Voice mode requires Anthropic OAuth — it uses the voice_stream
  // endpoint on claude.ai which is not available with API keys,
  // Bedrock, Vertex, or Foundry.
  if (!isAnthropicAuthEnabled()) {
    return false
  }
  // isAnthropicAuthEnabled only checks the auth *provider*, not whether
  // a token exists. Without this check, the voice UI renders but
  // connectVoiceStream fails silently when the user isn't logged in.
  const tokens = getClaudeAIOAuthTokens()
  return Boolean(tokens?.accessToken)
}

/**
 * Full runtime check for Anthropic voice_stream backend.
 * Returns true when both auth + GrowthBook kill-switch pass.
 */
export function isVoiceModeEnabled(): boolean {
  return hasVoiceAuth() && isVoiceGrowthBookEnabled()
}

/**
 * Check if voice mode can be activated with any STT backend.
 * Always returns true when VOICE_MODE feature flag is on and GrowthBook
 * kill-switch is off — the Doubao backend does not require Anthropic auth.
 */
export function isVoiceAvailable(): boolean {
  return isVoiceGrowthBookEnabled()
}
