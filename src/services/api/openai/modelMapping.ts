/**
 * Default mapping from Anthropic model names to OpenAI model names.
 * Used only when ANTHROPIC_DEFAULT_*_MODEL env vars are not set.
 */
const DEFAULT_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-20250514': 'gpt-4o',
  'claude-sonnet-4-5-20250929': 'gpt-4o',
  'claude-sonnet-4-6': 'gpt-4o',
  'claude-opus-4-20250514': 'o3',
  'claude-opus-4-1-20250805': 'o3',
  'claude-opus-4-5-20251101': 'o3',
  'claude-opus-4-6': 'o3',
  'claude-haiku-4-5-20251001': 'gpt-4o-mini',
  'claude-3-5-haiku-20241022': 'gpt-4o-mini',
  'claude-3-7-sonnet-20250219': 'gpt-4o',
  'claude-3-5-sonnet-20241022': 'gpt-4o',
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
 * Resolve the OpenAI model name for a given Anthropic model.
 *
 * Priority:
 * 1. OPENAI_MODEL env var (override all)
 * 2. ANTHROPIC_DEFAULT_{FAMILY}_MODEL env var (e.g. ANTHROPIC_DEFAULT_SONNET_MODEL)
 * 3. DEFAULT_MODEL_MAP lookup
 * 4. Pass through original model name
 */
export function resolveOpenAIModel(anthropicModel: string): string {
  // Highest priority: explicit override
  if (process.env.OPENAI_MODEL) {
    return process.env.OPENAI_MODEL
  }

  // Strip [1m] suffix if present (Claude-specific modifier)
  const cleanModel = anthropicModel.replace(/\[1m\]$/, '')

  // Check ANTHROPIC_DEFAULT_*_MODEL env vars based on model family
  const family = getModelFamily(cleanModel)
  if (family) {
    const envVar = `ANTHROPIC_DEFAULT_${family.toUpperCase()}_MODEL`
    const override = process.env[envVar]
    if (override) return override
  }

  return DEFAULT_MODEL_MAP[cleanModel] ?? cleanModel
}
