import { safeParseJSON } from '../../../utils/json.js'

/**
 * Default mapping from Anthropic model names to OpenAI model names.
 * Users can override via OPENAI_MODEL or OPENAI_MODEL_MAP environment variables.
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

/** Cached parsed OPENAI_MODEL_MAP */
let cachedModelMap: Record<string, string> | null = null

function getOpenAIModelMap(): Record<string, string> {
  if (cachedModelMap) return cachedModelMap

  const envMap = process.env.OPENAI_MODEL_MAP
  if (envMap) {
    const parsed = safeParseJSON(envMap)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      cachedModelMap = { ...DEFAULT_MODEL_MAP, ...(parsed as Record<string, string>) }
      return cachedModelMap
    }
  }

  cachedModelMap = DEFAULT_MODEL_MAP
  return cachedModelMap
}

/**
 * Resolve the OpenAI model name for a given Anthropic model.
 *
 * Priority:
 * 1. OPENAI_MODEL env var (override all)
 * 2. OPENAI_MODEL_MAP lookup
 * 3. DEFAULT_MODEL_MAP lookup
 * 4. Pass through original model name (many compatible endpoints accept arbitrary names)
 */
export function resolveOpenAIModel(anthropicModel: string): string {
  // Highest priority: explicit override
  if (process.env.OPENAI_MODEL) {
    return process.env.OPENAI_MODEL
  }

  // Strip [1m] suffix if present (Claude-specific modifier)
  const cleanModel = anthropicModel.replace(/\[1m\]$/, '')

  const modelMap = getOpenAIModelMap()
  return modelMap[cleanModel] ?? cleanModel
}
