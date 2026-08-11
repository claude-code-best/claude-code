import { getSettings_DEPRECATED } from '../settings/settings.js'
import type { ModelCosts } from '../modelCost.js'

/**
 * A custom model entry configured via settings.json customModels array.
 * The id is auto-generated — do not set it in settings.json.
 */
export interface CustomModelConfig {
  /** Auto-generated unique identifier (format: @custom/<index>) */
  id: string
  /** Model string sent to the API (required) */
  modelName: string
  /** Display name shown in the /model picker (required) */
  name: string
  /** API base URL for this model (required) */
  baseUrl: string
  /** Auth token (Bearer) for this model (required) */
  authToken: string
  /** Short description shown in /model picker (optional) */
  description?: string
  /** Optional pricing override */
  pricing?: {
    inputCost: number
    outputCost: number
    cacheWriteCost: number
    cacheReadCost: number
  }
}

/**
 * Parse the raw settings entry into a fully resolved CustomModelConfig.
 * id is auto-generated from the array index.
 */
function toCustomModelConfig(
  entry: Record<string, unknown>,
  index: number,
): CustomModelConfig {
  return {
    id: `@custom/${index}`,
    modelName: String(entry.modelName ?? ''),
    name: String(entry.name ?? ''),
    baseUrl: String(entry.baseUrl ?? ''),
    authToken: String(entry.authToken ?? ''),
    description: (entry.description as string) || undefined,
    pricing:
      entry.inputCost !== undefined
        ? {
            inputCost: Number(entry.inputCost),
            outputCost: Number(entry.outputCost ?? 0),
            cacheWriteCost:
              Number(entry.cacheWriteCost ?? (entry.inputCost as number)) *
              1.25,
            cacheReadCost:
              Number(entry.cacheReadCost ?? (entry.inputCost as number)) * 0.1,
          }
        : undefined,
  }
}

/**
 * Return all custom models configured in settings.json.
 * Reads from the settings cache — call after settings are initialized.
 */
export function getCustomModels(): CustomModelConfig[] {
  const settings = getSettings_DEPRECATED()
  const raw = settings?.customModels
  if (!Array.isArray(raw) || raw.length === 0) {
    return []
  }
  return raw.map((entry, i) =>
    toCustomModelConfig(entry as Record<string, unknown>, i),
  )
}

/**
 * Check if a model ID matches any registered custom model.
 * Matches by both auto-generated ID (@custom/N) and modelName.
 */
export function isCustomModel(modelId: string): boolean {
  return getCustomModels().some(
    c => c.id === modelId || c.modelName === modelId,
  )
}

/**
 * Look up a custom model config by its auto-generated ID or modelName.
 * First tries exact match by id (@custom/N), then by modelName.
 * When multiple entries share the same modelName, returns the first one.
 */
export function getCustomModelById(
  modelId: string,
): CustomModelConfig | undefined {
  // Phase 1: exact id match (@custom/N)
  const byId = getCustomModels().find(c => c.id === modelId)
  if (byId) return byId
  // Phase 2: fallback to modelName match (resolved API model names)
  return getCustomModels().find(c => c.modelName === modelId)
}

/**
 * Get pricing for a custom model, if configured.
 * Returns undefined for unknown or unpriced custom models.
 */
export function getCustomModelCosts(modelId: string): ModelCosts | undefined {
  const model = getCustomModelById(modelId)
  if (!model?.pricing) return undefined
  return {
    inputTokens: model.pricing.inputCost,
    outputTokens: model.pricing.outputCost,
    promptCacheWriteTokens: model.pricing.cacheWriteCost,
    promptCacheReadTokens: model.pricing.cacheReadCost,
    webSearchRequests: 0.01,
  }
}

/**
 * Check if a model string is an auto-generated custom model ID (starts with @custom/).
 */
export function isCustomModelId(model: string): boolean {
  return model.startsWith('@custom/')
}

/**
 * Resolve the API model name for a custom model.
 * If the given model ID matches a custom model, returns its modelName.
 * Preserves [1m] suffix. Otherwise returns the input unchanged.
 */
export function resolveCustomModelApiName(modelInput: string): string {
  const has1m = /\[1m\]$/i.test(modelInput)
  const base = has1m
    ? modelInput.replace(/\[1m\]$/i, '').trim()
    : modelInput.trim()
  const custom = getCustomModelById(base)
  if (custom) {
    return custom.modelName + (has1m ? '[1m]' : '')
  }
  return modelInput
}
