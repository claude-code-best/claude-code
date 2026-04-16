/**
 * Default mapping from Anthropic model names to Grok model names.
 *
 * Users can override per-family via GROK_DEFAULT_{FAMILY}_MODEL env vars,
 * or override the entire mapping via GROK_MODEL_MAP env var (JSON string).
 */
const DEFAULT_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-20250514': 'grok-3-mini-fast',
  'claude-sonnet-4-5-20250929': 'grok-3-mini-fast',
  'claude-sonnet-4-6': 'grok-3-mini-fast',
  'claude-opus-4-20250514': 'grok-4.20-reasoning',
  'claude-opus-4-1-20250805': 'grok-4.20-reasoning',
  'claude-opus-4-5-20251101': 'grok-4.20-reasoning',
  'claude-opus-4-6': 'grok-4.20-reasoning',
  'claude-haiku-4-5-20251001': 'grok-3-mini-fast',
  'claude-3-5-haiku-20241022': 'grok-3-mini-fast',
  'claude-3-7-sonnet-20250219': 'grok-3-mini-fast',
  'claude-3-5-sonnet-20241022': 'grok-3-mini-fast',
}

const DEFAULT_FAMILY_MAP: Record<string, string> = {
  opus: 'grok-4.20-reasoning',
  sonnet: 'grok-3-mini-fast',
  haiku: 'grok-3-mini-fast',
}

function getModelFamily(model: string): 'haiku' | 'sonnet' | 'opus' | null {
  if (/haiku/i.test(model)) return 'haiku'
  if (/opus/i.test(model)) return 'opus'
  if (/sonnet/i.test(model)) return 'sonnet'
  return null
}

function getUserModelMap(): Record<string, string> | null {
  const raw = process.env.GROK_MODEL_MAP
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch {
    // ignore invalid JSON
  }
  return null
}

/**
 * Resolve the Grok model name for a given Anthropic model.
 */
export function resolveGrokModel(anthropicModel: string): string {
  if (process.env.GROK_MODEL) {
    return process.env.GROK_MODEL
  }

  const cleanModel = anthropicModel.replace(/\[1m\]$/, '')
  const family = getModelFamily(cleanModel)

  const userMap = getUserModelMap()
  if (userMap && family && userMap[family]) {
    return userMap[family]
  }

  if (family) {
    const grokEnvVar = `GROK_DEFAULT_${family.toUpperCase()}_MODEL`
    const grokOverride = process.env[grokEnvVar]
    if (grokOverride) return grokOverride

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
