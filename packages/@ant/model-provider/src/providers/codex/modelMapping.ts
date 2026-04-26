function getModelFamily(model: string): 'haiku' | 'sonnet' | 'opus' | null {
  if (/haiku/i.test(model)) return 'haiku'
  if (/opus/i.test(model)) return 'opus'
  if (/sonnet/i.test(model)) return 'sonnet'
  return null
}

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
