import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export type CodexModelInfo = {
  id: string
  label: string
  description: string
  isDefault: boolean
}

type CodexModelsCache = {
  models?: Array<{
    slug?: string
    display_name?: string
    description?: string
    visibility?: string
    is_default?: boolean
    isDefault?: boolean
  }>
}

const FALLBACK_CODEX_MODELS: CodexModelInfo[] = [
  {
    id: 'gpt-5.4',
    label: 'gpt-5.4',
    description: 'Latest frontier agentic coding model.',
    isDefault: true,
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4-Mini',
    description: 'Smaller frontier agentic coding model.',
    isDefault: false,
  },
  {
    id: 'gpt-5.3-codex',
    label: 'gpt-5.3-codex',
    description: 'Frontier Codex-optimized agentic coding model.',
    isDefault: false,
  },
]

let cachedPath: string | null = null
let cachedModels: CodexModelInfo[] | null = null

function getCodexModelsCachePath(): string {
  return (
    process.env.CLAUDE_CODE_CODEX_MODELS_CACHE_PATH ??
    join(homedir(), '.codex', 'models_cache.json')
  )
}

function mapCacheToModels(cache: CodexModelsCache): CodexModelInfo[] {
  const models = cache.models
    ?.filter(model => model.visibility !== 'hidden' && !!model.slug)
    .map(model => ({
      id: model.slug!,
      label: model.display_name ?? model.slug!,
      description: model.description ?? 'Codex model',
      isDefault: model.isDefault === true || model.is_default === true,
    }))

  if (!models || models.length === 0) {
    return FALLBACK_CODEX_MODELS
  }

  if (models.some(model => model.isDefault)) {
    return models
  }

  return models.map((model, index) => ({
    ...model,
    isDefault: index === 0,
  }))
}

export function getCodexModels(): CodexModelInfo[] {
  const path = getCodexModelsCachePath()
  if (cachedModels && cachedPath === path) {
    return cachedModels
  }

  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as CodexModelsCache
    cachedModels = mapCacheToModels(parsed)
  } catch {
    cachedModels = FALLBACK_CODEX_MODELS
  }

  cachedPath = path
  return cachedModels
}

export function getDefaultCodexModel(): string {
  if (process.env.ANTHROPIC_MODEL) {
    return process.env.ANTHROPIC_MODEL
  }

  const defaultModel = getCodexModels().find(model => model.isDefault)
  return defaultModel?.id ?? FALLBACK_CODEX_MODELS[0]!.id
}

export function isKnownCodexModel(model: string): boolean {
  return getCodexModels().some(entry => entry.id === model)
}

export function resetCodexModelsCacheForTests(): void {
  cachedPath = null
  cachedModels = null
}
