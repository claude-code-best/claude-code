/**
 * Default mapping from Anthropic model names to Codex (OpenAI Responses API) model names.
 * Used only when CODEX_DEFAULT_{FAMILY}_MODEL env vars are not set.
 */
const DEFAULT_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-20250514': 'gpt-5.4-mini',
  'claude-sonnet-4-5-20250929': 'gpt-5.4-mini',
  'claude-sonnet-4-6': 'gpt-5.4-mini',
  'claude-3-7-sonnet-20250219': 'gpt-5.4-mini',
  'claude-3-5-sonnet-20241022': 'gpt-5.4-mini',
  'claude-opus-4-20250514': 'gpt-5.4',
  'claude-opus-4-1-20250805': 'gpt-5.4',
  'claude-opus-4-5-20251101': 'gpt-5.4',
  'claude-opus-4-6': 'gpt-5.4',
  'claude-opus-4-7': 'gpt-5.5',
  'claude-haiku-4-5-20251001': 'gpt-5.4-mini',
  'claude-3-5-haiku-20241022': 'gpt-5.4-mini',
}

/**
 * Default model for each family when an exact match is not in DEFAULT_MODEL_MAP.
 */
const DEFAULT_FAMILY_MAP: Record<string, string> = {
  haiku: 'gpt-5.4-mini',
  sonnet: 'gpt-5.4-mini',
  opus: 'gpt-5.4',
}

function getModelFamily(model: string): 'haiku' | 'sonnet' | 'opus' | null {
  if (/haiku/i.test(model)) return 'haiku'
  if (/opus/i.test(model)) return 'opus'
  if (/sonnet/i.test(model)) return 'sonnet'
  return null
}

/**
 * Resolve the Codex (OpenAI Responses API) model name for a given Anthropic model.
 *
 * Priority:
 * 1. CODEX_MODEL env var (override all)
 * 2. CODEX_DEFAULT_{FAMILY}_MODEL env var (e.g. CODEX_DEFAULT_SONNET_MODEL)
 * 3. DEFAULT_MODEL_MAP lookup (exact Anthropic model name match)
 * 4. DEFAULT_FAMILY_MAP lookup (family-based default)
 * 5. Pass through original model name
 */
export function resolveCodexModel(model: string): string {
  if (process.env.CODEX_MODEL) {
    return process.env.CODEX_MODEL
  }

  const cleanModel = model.replace(/\[1m\]$/, '')
  const family = getModelFamily(cleanModel)
  if (family) {
    const familyOverride = process.env[`CODEX_DEFAULT_${family.toUpperCase()}_MODEL`]
    if (familyOverride) {
      return familyOverride
    }
  }

  const mapped = DEFAULT_MODEL_MAP[cleanModel]
  if (mapped) {
    return mapped
  }

  if (family) {
    return DEFAULT_FAMILY_MAP[family]
  }

  return cleanModel
}

export function resolveCodexMaxTokens(
  upperLimit: number,
  maxOutputTokensOverride?: number,
): number {
  return (
    maxOutputTokensOverride ??
    (process.env.CODEX_MAX_TOKENS
      ? parseInt(process.env.CODEX_MAX_TOKENS, 10) || undefined
      : undefined) ??
    (process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS
      ? parseInt(process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, 10) || undefined
      : undefined) ??
    upperLimit
  )
}
