import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { logError } from '../../utils/log.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { ProvidersFileSchema, type ProviderConfig } from './types.js'

/**
 * The four built-in OpenAI-compat providers.
 *
 * These are used when providers.json is absent or contains no entries.
 * User-defined providers in ~/.claude/providers.json are merged on top
 * (they replace a built-in with the same id).
 */
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'cerebras',
    kind: 'openai-compat',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    defaultModel: 'llama-3.3-70b',
    compatRule: 'cerebras',
  },
  {
    id: 'groq',
    kind: 'openai-compat',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    compatRule: 'groq',
  },
  {
    id: 'qwen',
    kind: 'openai-compat',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    defaultModel: 'qwen-max',
    compatRule: 'strict-openai',
  },
  {
    id: 'deepseek',
    kind: 'openai-compat',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    compatRule: 'deepseek',
  },
]

/**
 * Returns the path to the providers.json file in the Claude config directory.
 */
export function getProvidersFilePath(): string {
  return join(getClaudeConfigHomeDir(), 'providers.json')
}

// ── J1: per-process memoization with stale-on-invalidate ─────────────────────

let _cachedProviders: ProviderConfig[] | null = null

/** Invalidate the in-process provider cache (called after saveProviders). */
export function _invalidateProviderCache(): void {
  _cachedProviders = null
}

/**
 * Load provider configurations.
 *
 * Strategy:
 * 1. Start with DEFAULT_PROVIDERS.
 * 2. If ~/.claude/providers.json exists, parse and validate it with Zod.
 *    - Valid entries replace defaults with matching id; new ids are appended.
 *    - Corrupt/invalid file: log warning, return defaults only.
 * 3. Empty providers.json: return defaults.
 *
 * A1 fix: returns load diagnostics so callers (ProviderView) can surface errors.
 * J1 fix: memoized per-process; invalidated after saveProviders().
 *
 * This function never throws — corrupt files produce a warning + fallback.
 */
export function loadProviders(): ProviderConfig[] {
  // J1: return cached result if available (prevents repeated disk reads on findProvider)
  if (_cachedProviders !== null) return _cachedProviders

  const result = _loadProvidersInternal()
  _cachedProviders = result.providers
  return result.providers
}

/**
 * Load providers with diagnostic information.
 * Returns { providers, error? } — callers can surface the error to the UI.
 * A1 fix: exposes parse errors to UI layer instead of only logError.
 */
export function loadProvidersWithDiagnostic(): {
  providers: ProviderConfig[]
  error?: string
} {
  const result = _loadProvidersInternal()
  _cachedProviders = result.providers
  return result
}

function _loadProvidersInternal(): {
  providers: ProviderConfig[]
  error?: string
} {
  const filePath = getProvidersFilePath()

  if (!existsSync(filePath)) {
    return { providers: [...DEFAULT_PROVIDERS] }
  }

  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch (err: unknown) {
    const msg = `loadProviders: failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    logError(new Error(msg))
    return { providers: [...DEFAULT_PROVIDERS], error: msg }
  }

  // Empty file → return defaults
  if (!raw.trim()) {
    return { providers: [...DEFAULT_PROVIDERS] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    const msg = `loadProviders: ${filePath} is not valid JSON. Using default providers.`
    logError(new Error(msg))
    return { providers: [...DEFAULT_PROVIDERS], error: msg }
  }

  const result = ProvidersFileSchema.safeParse(parsed)
  if (!result.success) {
    const msg = `loadProviders: ${filePath} failed schema validation: ${result.error.message}. Using default providers.`
    logError(new Error(msg))
    return { providers: [...DEFAULT_PROVIDERS], error: msg }
  }

  if (result.data.length === 0) {
    return { providers: [...DEFAULT_PROVIDERS] }
  }

  // Merge: user entries override defaults with same id; new ids are appended.
  const merged = new Map<string, ProviderConfig>()
  for (const p of DEFAULT_PROVIDERS) {
    merged.set(p.id, p)
  }
  for (const p of result.data) {
    merged.set(p.id, p)
  }

  return { providers: Array.from(merged.values()) }
}

/**
 * Find a provider by id in the loaded list. Returns undefined if not found.
 */
export function findProvider(
  id: string,
  providers?: ProviderConfig[],
): ProviderConfig | undefined {
  return (providers ?? loadProviders()).find(p => p.id === id)
}

/**
 * Deep-equal comparison for ProviderConfig objects, key-order independent.
 * E4 fix: replaces JSON.stringify comparison which is key-order sensitive.
 */
function providerConfigEqual(a: ProviderConfig, b: ProviderConfig): boolean {
  const keysA = Object.keys(a).sort()
  const keysB = Object.keys(b).sort()
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (a[k as keyof ProviderConfig] !== b[k as keyof ProviderConfig])
      return false
  }
  return true
}

/**
 * Write additional providers to ~/.claude/providers.json.
 *
 * Only writes providers that are NOT already in DEFAULT_PROVIDERS (or the
 * existing file). If a provider with the same id exists, it is replaced.
 *
 * C3 fix: uses atomic tmp+rename write.
 * E4 fix: uses key-order-independent deep equal for default comparison.
 * J1 fix: invalidates cache after write.
 *
 * Returns the final merged list that was written.
 */
export function saveProviders(providers: ProviderConfig[]): ProviderConfig[] {
  const filePath = getProvidersFilePath()

  // Build merged list (providers override defaults by id)
  const merged = new Map<string, ProviderConfig>()
  for (const p of DEFAULT_PROVIDERS) {
    merged.set(p.id, p)
  }
  for (const p of providers) {
    merged.set(p.id, p)
  }

  // Only persist non-default providers (defaults are always built in)
  const toWrite: ProviderConfig[] = []
  for (const [id, p] of merged) {
    const isDefault = DEFAULT_PROVIDERS.some(d => d.id === id)
    if (!isDefault) {
      toWrite.push(p)
    } else {
      // E4: If user overrode a default, persist the override (key-order-independent compare)
      const defaultEntry = DEFAULT_PROVIDERS.find(d => d.id === id)
      if (defaultEntry && !providerConfigEqual(defaultEntry, p)) {
        toWrite.push(p)
      }
    }
  }

  // C3: atomic write — tmp file + rename prevents lost-update on concurrent save
  const tmpPath = join(
    tmpdir(),
    `.providers-${randomBytes(8).toString('hex')}.tmp`,
  )
  try {
    writeFileSync(tmpPath, JSON.stringify(toWrite, null, 2), 'utf-8')
    renameSync(tmpPath, filePath)
  } catch (err) {
    try {
      renameSync(tmpPath, tmpPath + '.cleanup')
    } catch {
      /* ignore */
    }
    throw err
  }

  // J1: invalidate cache so next loadProviders() reads fresh data
  _invalidateProviderCache()

  return Array.from(merged.values())
}
