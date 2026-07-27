import { providerCredentialEnvName } from '../providerRuntime/resolveSnapshot.js'
import { hydrateProviderSecretsIntoEnv } from './providerSecrets.js'
import type { ProviderConfigurationV2, ProviderProfile } from './types.js'

export type DiscoveredProviderModel = {
  remoteModelId: string
  displayName: string
  ownedBy?: string
}

export type ModelDiscoveryOutcome =
  | { status: 'success'; models: DiscoveredProviderModel[] }
  | { status: 'unsupported' | 'error'; code: string }

export type ModelDiscoveryDependencies = {
  fetch: typeof fetch
  baseEnv: Record<string, string | undefined>
  hydrateSecrets: typeof hydrateProviderSecretsIntoEnv
  timeoutMs: number
}

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_MODELS = 2_000
const MAX_PAGES = 20

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function appendModelsPath(
  baseUrl: string,
  family: 'anthropic' | 'openai' | 'gemini',
): URL {
  const url = new URL(trimTrailingSlash(baseUrl))
  const path = url.pathname.replace(/\/+$/, '')

  if (family === 'anthropic') {
    if (/\/v1\/messages$/i.test(path)) {
      url.pathname = path.replace(/\/v1\/messages$/i, '/v1/models')
    } else if (/\/v1$/i.test(path)) {
      url.pathname = `${path}/models`
    } else if (!/\/models$/i.test(path)) {
      url.pathname = `${path}/v1/models`
    }
    return url
  }

  if (family === 'openai') {
    if (/\/chat\/completions$/i.test(path)) {
      url.pathname = path.replace(/\/chat\/completions$/i, '/models')
    } else if (/\/responses$/i.test(path)) {
      url.pathname = path.replace(/\/responses$/i, '/models')
    } else if (!/\/models$/i.test(path)) {
      url.pathname = `${path}/models`
    }
    return url
  }

  if (!/\/models$/i.test(path)) url.pathname = `${path}/models`
  return url
}

type DiscoveryRequest = {
  family: 'anthropic' | 'openai' | 'gemini'
  url: URL
  headers: Record<string, string>
}

function discoveryRequest(
  provider: ProviderProfile,
  credential: string,
): DiscoveryRequest | null {
  switch (provider.kind) {
    case 'anthropic':
    case 'anthropic-compatible': {
      if (
        provider.auth.scheme !== 'api-key' &&
        provider.auth.scheme !== 'bearer'
      ) {
        return null
      }
      const url = appendModelsPath(
        provider.baseUrl ?? 'https://api.anthropic.com',
        'anthropic',
      )
      url.searchParams.set('limit', '1000')
      const headers: Record<string, string> = {
        'anthropic-version': '2023-06-01',
      }
      if (provider.auth.scheme === 'bearer') {
        headers['Authorization'] = `Bearer ${credential}`
      } else {
        headers['x-api-key'] = credential
      }
      return { family: 'anthropic', url, headers }
    }
    case 'openai-compatible': {
      const url = appendModelsPath(
        provider.baseUrl ?? 'https://api.openai.com/v1',
        'openai',
      )
      return {
        family: 'openai',
        url,
        headers: { Authorization: `Bearer ${credential}` },
      }
    }
    case 'grok': {
      const url = appendModelsPath(
        provider.baseUrl ?? 'https://api.x.ai/v1',
        'openai',
      )
      return {
        family: 'openai',
        url,
        headers: { Authorization: `Bearer ${credential}` },
      }
    }
    case 'gemini': {
      const url = appendModelsPath(
        provider.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta',
        'gemini',
      )
      url.searchParams.set('key', credential)
      url.searchParams.set('pageSize', '1000')
      return { family: 'gemini', url, headers: {} }
    }
    case 'chatgpt':
    case 'bedrock':
    case 'vertex':
    case 'foundry':
      return null
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= 512 ? trimmed : undefined
}

function parseDataModels(value: unknown): DiscoveredProviderModel[] {
  const root = object(value)
  if (!root || !Array.isArray(root['data'])) {
    throw new Error('invalid_model_discovery_response')
  }
  return root['data'].flatMap(item => {
    const model = object(item)
    const remoteModelId = text(model?.['id'])
    if (!model || remoteModelId === undefined) return []
    const displayName =
      text(model['display_name']) ?? text(model['name']) ?? remoteModelId
    const ownedBy = text(model['owned_by'])
    return [
      {
        remoteModelId,
        displayName,
        ...(ownedBy === undefined ? {} : { ownedBy }),
      },
    ]
  })
}

function parseGeminiModels(value: unknown): DiscoveredProviderModel[] {
  const root = object(value)
  if (!root || !Array.isArray(root['models'])) {
    throw new Error('invalid_model_discovery_response')
  }
  return root['models'].flatMap(item => {
    const model = object(item)
    const name = text(model?.['name'])
    if (!model || name === undefined) return []
    const methods = model['supportedGenerationMethods']
    if (
      Array.isArray(methods) &&
      !methods.includes('generateContent') &&
      !methods.includes('bidiGenerateContent')
    ) {
      return []
    }
    const remoteModelId = name.replace(/^models\//, '')
    return [
      {
        remoteModelId,
        displayName: text(model['displayName']) ?? remoteModelId,
      },
    ]
  })
}

function mergeModels(
  target: Map<string, DiscoveredProviderModel>,
  models: DiscoveredProviderModel[],
): void {
  for (const model of models) {
    if (target.size >= MAX_MODELS) return
    if (!target.has(model.remoteModelId)) target.set(model.remoteModelId, model)
  }
}

function mapHttpStatus(status: number): ModelDiscoveryOutcome {
  if (status === 401 || status === 403) {
    return { status: 'error', code: 'authentication_failed' }
  }
  if (status === 404) {
    return { status: 'unsupported', code: 'model_list_unsupported' }
  }
  if (status === 429) {
    return { status: 'error', code: 'model_discovery_rate_limited' }
  }
  if (status >= 500) {
    return { status: 'error', code: 'provider_unavailable' }
  }
  return { status: 'error', code: 'model_discovery_failed' }
}

async function fetchPage(
  request: DiscoveryRequest,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<
  { ok: true; value: unknown } | { ok: false; outcome: ModelDiscoveryOutcome }
> {
  const response = await fetchImpl(request.url, {
    method: 'GET',
    headers: request.headers,
    signal,
  })
  if (!response.ok) {
    return { ok: false, outcome: mapHttpStatus(response.status) }
  }
  try {
    return { ok: true, value: await response.json() }
  } catch {
    throw new Error('invalid_model_discovery_response')
  }
}

async function fetchModels(
  request: DiscoveryRequest,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<ModelDiscoveryOutcome> {
  const models = new Map<string, DiscoveredProviderModel>()
  let nextToken: string | undefined

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(request.url)
    if (nextToken !== undefined) {
      url.searchParams.set(
        request.family === 'gemini' ? 'pageToken' : 'after_id',
        nextToken,
      )
    }
    const result = await fetchPage({ ...request, url }, signal, fetchImpl)
    if (!result.ok) return result.outcome

    const root = object(result.value)
    mergeModels(
      models,
      request.family === 'gemini'
        ? parseGeminiModels(result.value)
        : parseDataModels(result.value),
    )
    if (models.size >= MAX_MODELS) break

    if (request.family === 'gemini') {
      nextToken = text(root?.['nextPageToken'])
    } else if (request.family === 'anthropic' && root?.['has_more'] === true) {
      nextToken = text(root['last_id'])
    } else {
      nextToken = undefined
    }
    if (nextToken === undefined) break
  }

  return {
    status: 'success',
    models: [...models.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    ),
  }
}

/**
 * Fetch the provider's model catalog with the credential already installed on
 * the local Worker. The returned shape contains model metadata only.
 */
export async function discoverProviderModels(
  configuration: ProviderConfigurationV2,
  providerId: string,
  overrides: Partial<ModelDiscoveryDependencies> = {},
): Promise<ModelDiscoveryOutcome> {
  const provider = configuration.providers.find(
    candidate => candidate.id === providerId,
  )
  if (provider === undefined) {
    return { status: 'error', code: 'provider_not_found' }
  }
  if (!provider.enabled || provider.archived) {
    return { status: 'error', code: 'provider_unavailable' }
  }

  const credentialEnvName = providerCredentialEnvName(provider)
  if (credentialEnvName === undefined) {
    return {
      status: 'unsupported',
      code: 'model_discovery_unsupported_provider',
    }
  }

  const env = { ...(overrides.baseEnv ?? process.env) }
  const hydrateSecrets =
    overrides.hydrateSecrets ?? hydrateProviderSecretsIntoEnv
  hydrateSecrets(env, { activeProviderId: provider.id })
  const credential = env[credentialEnvName]
  if (!credential) {
    return { status: 'error', code: 'authentication_required' }
  }

  const request = discoveryRequest(provider, credential)
  if (request === null) {
    return {
      status: 'unsupported',
      code: 'model_discovery_unsupported_provider',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    overrides.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )
  try {
    return await fetchModels(
      request,
      controller.signal,
      overrides.fetch ?? globalThis.fetch,
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'error', code: 'model_discovery_timeout' }
    }
    if (
      error instanceof Error &&
      error.message === 'invalid_model_discovery_response'
    ) {
      return { status: 'error', code: error.message }
    }
    return { status: 'error', code: 'provider_unreachable' }
  } finally {
    clearTimeout(timer)
  }
}
