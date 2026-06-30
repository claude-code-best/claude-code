// Pure helpers used by the forwarding loop to resolve contextWindow from the
// modelUsage map by longest prefix match.

export function commonPrefixLength(a: string, b: string): number {
  let i = 0
  const maxLen = Math.min(a.length, b.length)
  while (i < maxLen && a[i] === b[i]) i++
  return i
}

export function getMatchingModelUsage(
  modelUsage: Record<string, { contextWindow?: number }>,
  currentModel: string,
): { contextWindow?: number } | null {
  let bestKey: string | null = null
  let bestLen = 0

  for (const key of Object.keys(modelUsage)) {
    const len = commonPrefixLength(key, currentModel)
    if (len > bestLen) {
      bestLen = len
      bestKey = key
    }
  }

  return bestKey ? (modelUsage[bestKey] ?? null) : null
}
