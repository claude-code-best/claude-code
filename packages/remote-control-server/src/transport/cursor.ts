export function parseNonNegativeSafeInteger(
  raw: string | undefined,
): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) return undefined
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : undefined
}
