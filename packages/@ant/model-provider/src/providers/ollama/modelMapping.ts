/**
 * Resolve the Ollama model name from the selected model setting.
 *
 * Priority:
 * 1. Direct Ollama model names selected from /model or --model
 * 2. OLLAMA_DEFAULT_{FAMILY}_MODEL env var — per-family override
 * 3. Fall back to qwen3-coder, a coding-oriented Ollama model name
 *
 * Ollama users configure model routing through per-family overrides.
 * The fallback avoids sending Claude model IDs to Ollama, which would fail for
 * users who only selected the provider and have not copied model aliases.
 */

function getModelFamily(model: string): 'haiku' | 'sonnet' | 'opus' | null {
  if (/haiku/i.test(model)) return 'haiku'
  if (/opus/i.test(model)) return 'opus'
  if (/sonnet/i.test(model)) return 'sonnet'
  return null
}

function isClaudeModelId(model: string): boolean {
  return /\bclaude[-.]/i.test(model) || /\banthropic\.claude[-.]/i.test(model)
}

export function resolveOllamaModel(selectedModel: string): string {
  const cleanModel = selectedModel.replace(/\[1m\]$/, '')
  if (!isClaudeModelId(cleanModel)) {
    return cleanModel
  }

  const family = getModelFamily(cleanModel)

  // 2. Per-family env var (OLLAMA_DEFAULT_OPUS_MODEL, etc.)
  if (family) {
    const ollamaEnvVar = `OLLAMA_DEFAULT_${family.toUpperCase()}_MODEL`
    const ollamaOverride = process.env[ollamaEnvVar]
    if (ollamaOverride) return ollamaOverride
  }

  return 'qwen3-coder'
}
