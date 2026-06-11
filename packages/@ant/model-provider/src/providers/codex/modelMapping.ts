/**
 * Default mapping from Anthropic model names to Codex model names.
 *
 * Users can override per-family via CODEX_DEFAULT_{FAMILY}_MODEL env vars.
 * CODEX_MODEL is a default model used only when the caller did not select a
 * concrete model.
 */
const DEFAULT_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-opus-4-20250514': 'claude-opus-4-20250514',
  'claude-opus-4-1-20250805': 'claude-opus-4-1-20250805',
  'claude-opus-4-5-20251101': 'claude-opus-4-5-20251101',
  'claude-opus-4-6': 'claude-opus-4-6',
  'claude-opus-4-7': 'claude-opus-4-7',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
  'claude-3-5-haiku-20241022': 'claude-3-5-haiku-20241022',
  'claude-3-7-sonnet-20250219': 'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet-20241022',
}

const DEFAULT_FAMILY_MAP: Record<string, string> = {
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
}

function getModelFamily(model: string): 'haiku' | 'sonnet' | 'opus' | null {
  if (/haiku/i.test(model)) return 'haiku'
  if (/opus/i.test(model)) return 'opus'
  if (/sonnet/i.test(model)) return 'sonnet'
  return null
}

/**
 * Resolve the Codex model name for a given Anthropic model.
 */
export function resolveCodexModel(anthropicModel: string): string {
  if (
    process.env.CODEX_MODEL &&
    ['sonnet', 'opus', 'haiku'].includes(anthropicModel)
  ) {
    return process.env.CODEX_MODEL
  }

  const cleanModel = anthropicModel.replace(/\[1m\]$/, '')
  const family = getModelFamily(cleanModel)

  if (family) {
    const codexEnvVar = `CODEX_DEFAULT_${family.toUpperCase()}_MODEL`
    const codexOverride = process.env[codexEnvVar]
    if (codexOverride) return codexOverride

    const anthropicEnvVar = `ANTHROPIC_DEFAULT_${family.toUpperCase()}_MODEL`
    const anthropicOverride = process.env[anthropicEnvVar]
    if (anthropicOverride) return anthropicOverride
  }

  if (DEFAULT_MODEL_MAP[cleanModel]) {
    return DEFAULT_MODEL_MAP[cleanModel]
  }

  if (family && DEFAULT_FAMILY_MAP[family]) {
    return DEFAULT_FAMILY_MAP[family]
  }

  return cleanModel
}
