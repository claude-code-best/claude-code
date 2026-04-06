function getModelFamily(model: string): 'haiku' | 'sonnet' | 'opus' | null {
  if (/haiku/i.test(model)) return 'haiku'
  if (/opus/i.test(model)) return 'opus'
  if (/sonnet/i.test(model)) return 'sonnet'
  return null
}

export function resolveGeminiModel(anthropicModel: string): string {
  if (process.env.GEMINI_MODEL) {
    return process.env.GEMINI_MODEL
  }

  const cleanModel = anthropicModel.replace(/\[1m\]$/i, '')
  const family = getModelFamily(cleanModel)

  if (!family) {
    return cleanModel
  }

  // First, try Gemini-specific DEFAULT variables (separated from Anthropic)
  const geminiEnvVar = `GEMINI_DEFAULT_${family.toUpperCase()}_MODEL`
  const geminiModel = process.env[geminiEnvVar]
  if (geminiModel) {
    return geminiModel
  }

  // Fallback to Anthropic DEFAULT variables for backward compatibility
  const sharedEnvVar = `ANTHROPIC_DEFAULT_${family.toUpperCase()}_MODEL`
  const resolvedModel = process.env[sharedEnvVar]
  if (resolvedModel) {
    return resolvedModel
  }

  throw new Error(
    `Gemini provider requires GEMINI_MODEL or ${geminiEnvVar} (or ${sharedEnvVar} for backward compatibility) to be configured.`,
  )
}
