const ollamaContextLengthCache = new Map<string, number>()

export function getCachedOllamaContextLength(
  model: string,
): number | undefined {
  return ollamaContextLengthCache.get(model)
}

export function setCachedOllamaContextLength(
  model: string,
  contextLength: number,
): void {
  ollamaContextLengthCache.set(model, contextLength)
}

export function clearOllamaContextLengthCache(): void {
  ollamaContextLengthCache.clear()
}

export function extractOllamaModelInfoContextLength(
  modelInfo: Record<string, unknown> | undefined,
): number | undefined {
  if (!modelInfo) return undefined
  for (const [key, value] of Object.entries(modelInfo)) {
    if (!key.endsWith('.context_length')) continue
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value
    }
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return undefined
}

export function extractOllamaNumCtxParameter(
  parameters: string | undefined,
): number | undefined {
  if (!parameters) return undefined
  const match = parameters.match(/(?:^|\n)\s*num_ctx\s+(\d+)\b/i)
  if (!match?.[1]) return undefined
  const parsed = parseInt(match[1], 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}
