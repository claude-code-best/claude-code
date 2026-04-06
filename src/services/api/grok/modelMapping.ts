/**
 * Default mapping from Anthropic model names to Grok model names.
 * Used only when GROK_MODEL / ANTHROPIC_DEFAULT_*_MODEL env vars are not set.
 */
const DEFAULT_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-20250514': 'grok-3',
  'claude-sonnet-4-5-20250929': 'grok-3',
  'claude-sonnet-4-6': 'grok-3',
  'claude-opus-4-20250514': 'grok-3',
  'claude-opus-4-1-20250805': 'grok-3',
  'claude-opus-4-5-20251101': 'grok-3',
  'claude-opus-4-6': 'grok-3',
  'claude-haiku-4-5-20251001': 'grok-3-mini',
  'claude-3-5-haiku-20241022': 'grok-3-mini',
  'claude-3-7-sonnet-20250219': 'grok-3',
  'claude-3-5-sonnet-20241022': 'grok-3',
}

/**
 * Determine the model family (haiku / sonnet / opus) from an Anthropic model ID.
 */
function getModelFamily(model: string): 'haiku' | 'sonnet' | 'opus' | null {
  if (/haiku/i.test(model)) return 'haiku'
  if (/opus/i.test(model)) return 'opus'
  if (/sonnet/i.test(model)) return 'sonnet'
  return null
}

/**
 * Resolve the Grok model name for a given Anthropic model.
 *
 * Priority:
 * 1. GROK_MODEL env var (override all)
 * 2. ANTHROPIC_DEFAULT_{FAMILY}_MODEL env var
 * 3. DEFAULT_MODEL_MAP lookup
 * 4. Pass through original model name
 */
export function resolveGrokModel(anthropicModel: string): string {
  if (process.env.GROK_MODEL) {
    return process.env.GROK_MODEL
  }

  const cleanModel = anthropicModel.replace(/\[1m\]$/, '')

  const family = getModelFamily(cleanModel)
  if (family) {
    const envVar = `ANTHROPIC_DEFAULT_${family.toUpperCase()}_MODEL`
    const override = process.env[envVar]
    if (override) return override
  }

  return DEFAULT_MODEL_MAP[cleanModel] ?? cleanModel
}
