import { findProvider, loadProviders } from './loader.js'
import type { ProviderConfig } from './types.js'

export interface SwitchProviderResult {
  /**
   * Environment variables to set before the next session.
   * This is informational — the caller must NOT mutate process.env.
   * The user copies these into their shell profile.
   */
  env: Record<string, string>

  /**
   * Human-readable warnings (e.g. missing API key in current env).
   * Non-fatal: the user can still configure the provider.
   */
  warnings: string[]

  /**
   * The resolved provider config used for this switch.
   */
  provider: ProviderConfig
}

/**
 * Compute the environment variables needed to activate an OpenAI-compat provider.
 *
 * Design constraints (from plan):
 * - Pure functional: does NOT mutate process.env
 * - Calls assertNoAnthropicEnvForOpenAI() at the top to warn on credential
 *   confusion (ANTHROPIC_API_KEY + OPENAI-compat mode both set)
 * - Returns shell export commands the user can paste into their profile
 * - Restart required for the env vars to take effect (OpenAI client is cached)
 *
 * @param id - Provider id (e.g. 'cerebras', 'groq', 'deepseek', 'qwen')
 * @param providers - Optional pre-loaded list (defaults to loadProviders())
 * @throws {Error} if provider id is not found
 */
export function switchProvider(
  id: string,
  providers?: ProviderConfig[],
): SwitchProviderResult {
  const list = providers ?? loadProviders()
  const found = findProvider(id, list)

  if (!found) {
    const ids = list.map(p => p.id).join(', ')
    throw new Error(
      `switchProvider: provider "${id}" not found. Available: ${ids}`,
    )
  }

  const env: Record<string, string> = {
    CLAUDE_CODE_USE_OPENAI: '1',
    OPENAI_BASE_URL: found.baseUrl,
    OPENAI_MODEL: found.defaultModel,
    // The value is the env var name that holds the key, not the key itself.
    // Shell snippet: export OPENAI_API_KEY=$CEREBRAS_API_KEY
    // We return the recommended export, but the actual value depends on user env.
  }

  // Include the api key env var name so callers can construct the shell snippet.
  // We do NOT read process.env[found.apiKeyEnv] to avoid leaking the key.
  const warnings: string[] = []

  // G3: include ANTHROPIC_API_KEY conflict warning in result.warnings (not just logError)
  // so that the Ink view (/providers use) can render it to the user rather than losing it
  // in a side-channel stderr log.
  const hasOpenAIMode =
    process.env['CLAUDE_CODE_USE_OPENAI'] === '1' ||
    Boolean(process.env['OPENAI_API_KEY'])
  const hasAnthropicKey = Boolean(process.env['ANTHROPIC_API_KEY'])
  if (hasOpenAIMode && hasAnthropicKey) {
    warnings.push(
      'Both ANTHROPIC_API_KEY and OpenAI-compat mode are set. ' +
        'ANTHROPIC_API_KEY is for Anthropic workspace endpoints (/v1/agents, /v1/vaults). ' +
        'OpenAI-compat mode routes /v1/messages to a third-party provider. ' +
        'These are separate planes — verify this is intentional.',
    )
  }

  if (!process.env[found.apiKeyEnv]) {
    warnings.push(
      `${found.apiKeyEnv} is not set in the current environment. ` +
        `Set it before starting Claude Code: export ${found.apiKeyEnv}=<your-api-key>`,
    )
  }

  return { env, warnings, provider: found }
}

/**
 * Build the shell export block to display to the user.
 *
 * Example output:
 *   export CLAUDE_CODE_USE_OPENAI=1
 *   export OPENAI_BASE_URL=https://api.cerebras.ai/v1
 *   export OPENAI_API_KEY=$CEREBRAS_API_KEY
 *   export OPENAI_MODEL=llama-3.3-70b
 *
 * The API key line uses a variable reference so the actual key is never echoed.
 */
export function buildShellExportBlock(result: SwitchProviderResult): string {
  const { env, provider } = result
  const lines: string[] = [
    `export CLAUDE_CODE_USE_OPENAI=${env['CLAUDE_CODE_USE_OPENAI'] ?? '1'}`,
    `export OPENAI_BASE_URL=${env['OPENAI_BASE_URL'] ?? provider.baseUrl}`,
    `export OPENAI_API_KEY=$${provider.apiKeyEnv}`,
    `export OPENAI_MODEL=${env['OPENAI_MODEL'] ?? provider.defaultModel}`,
  ]
  return lines.join('\n')
}
