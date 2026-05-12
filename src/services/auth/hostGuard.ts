/**
 * Host guard utilities for multi-auth routing.
 *
 * These guards enforce that workspace API key requests only go to Anthropic's
 * API host and that subscription OAuth requests stay on the subscription plane.
 * This prevents credential leakage to third-party hosts.
 *
 * Design: ~/.claude/rules/deep-debug/security.md §2 (read-only investigation first,
 * then minimal guard at earliest detection point).
 */

import { logError } from '../../utils/log.js'

/** The canonical Anthropic API host for workspace (non-subscription) endpoints. */
const WORKSPACE_API_HOST = 'api.anthropic.com'

/**
 * Asserts that `url` points to Anthropic's workspace API host.
 *
 * Called before every workspace API key request (agents, vaults, memory_stores,
 * skills) to prevent the API key from being sent to a third-party host.
 *
 * @throws {Error} if the URL does not resolve to api.anthropic.com
 */
export function assertWorkspaceHost(url: string): void {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    throw new Error(
      `assertWorkspaceHost: invalid URL "${url}". Workspace API key requests must target ${WORKSPACE_API_HOST}.`,
    )
  }

  if (hostname !== WORKSPACE_API_HOST) {
    throw new Error(
      `assertWorkspaceHost: refusing to send workspace API key to non-Anthropic host "${hostname}". ` +
        `Workspace API key requests must target ${WORKSPACE_API_HOST}. ` +
        `If you are using a custom base URL, workspace endpoints are only available on the Anthropic API.`,
    )
  }
}

/**
 * Asserts that `url` points to the Anthropic subscription base URL.
 *
 * Called before subscription-OAuth requests (schedule, ultrareview, teleport)
 * to ensure they only target the expected host. Less strict than assertWorkspaceHost —
 * it still allows the configured BASE_API_URL which may vary in test/staging.
 *
 * @throws {Error} if the URL does not resolve to api.anthropic.com
 */
export function assertSubscriptionBaseUrl(url: string): void {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    throw new Error(
      `assertSubscriptionBaseUrl: invalid URL "${url}". Subscription OAuth requests must target ${WORKSPACE_API_HOST}.`,
    )
  }

  if (hostname !== WORKSPACE_API_HOST) {
    throw new Error(
      `assertSubscriptionBaseUrl: refusing subscription OAuth request to non-Anthropic host "${hostname}". ` +
        `Subscription OAuth requests must target ${WORKSPACE_API_HOST}.`,
    )
  }
}

/**
 * Warns (but does not throw) when Anthropic API environment variables are set
 * alongside OpenAI-compat configuration.
 *
 * This prevents silent credential confusion when a user has both
 * ANTHROPIC_API_KEY and OPENAI_API_KEY / CLAUDE_CODE_USE_OPENAI set.
 * The warning is informational — the calling code decides what to do.
 */
export function assertNoAnthropicEnvForOpenAI(): void {
  const hasOpenAIMode =
    process.env['CLAUDE_CODE_USE_OPENAI'] === '1' ||
    Boolean(process.env['OPENAI_API_KEY'])
  const hasAnthropicKey = Boolean(process.env['ANTHROPIC_API_KEY'])

  if (hasOpenAIMode && hasAnthropicKey) {
    logError(
      new Error(
        'assertNoAnthropicEnvForOpenAI: Both ANTHROPIC_API_KEY and OpenAI-compat mode are set. ' +
          'ANTHROPIC_API_KEY is for Anthropic workspace endpoints (/v1/agents, /v1/vaults, /v1/memory_stores). ' +
          'OpenAI-compat mode routes /v1/messages to a third-party provider. ' +
          'These are separate credential planes and will not interfere, but verify this is intentional.',
      ),
    )
  }
}
