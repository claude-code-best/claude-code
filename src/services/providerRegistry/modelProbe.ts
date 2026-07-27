import { isModelAllowed } from '../../utils/model/modelAllowlist.js'
import {
  projectRuntimeEnvironment,
  resolveProviderRuntimeSnapshot,
} from '../providerRuntime/resolveSnapshot.js'
import {
  ProviderRuntimeResolutionError,
  type ProviderRuntimeSnapshot,
} from '../providerRuntime/types.js'
import { hydrateProviderSecretsIntoEnv } from './providerSecrets.js'
import type { ProviderConfigurationV2 } from './types.js'

// =============================================================================
// Real model verification probe
//
// The "验证" button used to be a lie: it resolved a local snapshot and then
// unconditionally stamped the model `valid`, without ever contacting the
// provider. This module performs a *real* minimal request against the same
// base URL + credential a live session would use (built by mirroring the
// activation path in providerRuntime/sessionControl.ts), so a `valid` result
// means the model would actually run. Prefer a models-list GET (usually free)
// as the reachability + auth check; kinds without a cheap probe (ChatGPT
// OAuth, Bedrock/Vertex/Foundry cloud chains) are reported `unsupported` rather
// than faked.
// =============================================================================

/** Result of attempting to verify one catalog model against its provider. */
export type ModelProbeOutcome =
  | { status: 'valid' }
  | { status: 'invalid'; code: string }
  | { status: 'unsupported'; code: string }
  | { status: 'error'; code: string }

export type ModelProbeDependencies = {
  fetch: typeof fetch
  baseEnv: Record<string, string | undefined>
  hydrateSecrets: typeof hydrateProviderSecretsIntoEnv
  isModelAllowed: (model: string) => boolean
  timeoutMs: number
}

const DEFAULT_TIMEOUT_MS = 8_000

const DEFAULT_BASE_URL = {
  openai: 'https://api.openai.com/v1',
  grok: 'https://api.x.ai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  anthropic: 'https://api.anthropic.com',
} as const

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

type ProbeEndpoint = { url: string; headers: Record<string, string> }

/**
 * Build the reachability/auth request for kinds that expose a cheap models
 * endpoint, given the resolved credential. Returns null for kinds with no
 * lightweight network probe (ChatGPT OAuth, and the Bedrock/Vertex/Foundry
 * cloud chains) — those are reported `unsupported` rather than faked.
 */
function resolveProbeEndpoint(
  snapshot: ProviderRuntimeSnapshot,
  credential: string,
): ProbeEndpoint | null {
  const template = snapshot.environmentTemplate
  switch (snapshot.apiProvider) {
    case 'openai': {
      // ChatGPT subscription uses OAuth, not an API key — no cheap probe.
      if (template['OPENAI_AUTH_MODE'] === 'chatgpt') return null
      const base = trimTrailingSlash(
        template['OPENAI_BASE_URL'] ?? DEFAULT_BASE_URL.openai,
      )
      return {
        url: `${base}/models`,
        headers: { Authorization: `Bearer ${credential}` },
      }
    }
    case 'grok': {
      const base = trimTrailingSlash(
        template['GROK_BASE_URL'] ?? DEFAULT_BASE_URL.grok,
      )
      return {
        url: `${base}/models`,
        headers: { Authorization: `Bearer ${credential}` },
      }
    }
    case 'gemini': {
      const base = trimTrailingSlash(
        template['GEMINI_BASE_URL'] ?? DEFAULT_BASE_URL.gemini,
      )
      return {
        url: `${base}/models?key=${encodeURIComponent(credential)}`,
        headers: {},
      }
    }
    case 'firstParty': {
      // anthropic / anthropic-compatible with an api-key or bearer token.
      const base = trimTrailingSlash(
        template['ANTHROPIC_BASE_URL'] ?? DEFAULT_BASE_URL.anthropic,
      )
      const headers: Record<string, string> = {
        'anthropic-version': '2023-06-01',
      }
      if (snapshot.credentialTargetEnvName === 'ANTHROPIC_AUTH_TOKEN') {
        headers['Authorization'] = `Bearer ${credential}`
      } else {
        headers['x-api-key'] = credential
      }
      return { url: `${base}/v1/models`, headers }
    }
    default:
      // bedrock / vertex / foundry — no lightweight credential probe.
      return null
  }
}

/**
 * Whether the kind exposes a lightweight network probe at all, independent of
 * whether a credential is currently present. Distinguishes "unsupported kind"
 * (ChatGPT OAuth / cloud chains) from "probeable kind but no key configured".
 */
function isProbeableKind(snapshot: ProviderRuntimeSnapshot): boolean {
  switch (snapshot.apiProvider) {
    case 'openai':
      return snapshot.environmentTemplate['OPENAI_AUTH_MODE'] !== 'chatgpt'
    case 'grok':
    case 'gemini':
      return true
    case 'firstParty':
      return snapshot.credentialTargetEnvName !== undefined
    default:
      return false
  }
}

function mapHttpStatus(status: number): ModelProbeOutcome {
  if (status >= 200 && status < 300) return { status: 'valid' }
  if (status === 401 || status === 403) {
    return { status: 'invalid', code: 'authentication_failed' }
  }
  if (status === 404) return { status: 'invalid', code: 'endpoint_not_found' }
  if (status >= 500) return { status: 'error', code: 'provider_unavailable' }
  return { status: 'invalid', code: `http_${status}` }
}

/**
 * Verify a catalog model by issuing a real minimal request with the exact
 * base URL + credential a live session would resolve. Never mutates
 * process.env (works on an isolated copy).
 */
export async function probeProviderModel(
  configuration: ProviderConfigurationV2,
  providerId: string,
  modelProfileId: string,
  overrides: Partial<ModelProbeDependencies> = {},
): Promise<ModelProbeOutcome> {
  const deps: ModelProbeDependencies = {
    fetch: overrides.fetch ?? globalThis.fetch,
    baseEnv: overrides.baseEnv ?? process.env,
    hydrateSecrets: overrides.hydrateSecrets ?? hydrateProviderSecretsIntoEnv,
    isModelAllowed: overrides.isModelAllowed ?? isModelAllowed,
    timeoutMs: overrides.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  }

  const provider = configuration.providers.find(
    candidate => candidate.id === providerId,
  )
  const model = provider?.models.find(
    candidate => candidate.id === modelProfileId,
  )
  if (provider === undefined)
    return { status: 'error', code: 'provider_not_found' }
  if (model === undefined) return { status: 'error', code: 'model_not_found' }

  // Mirror activation (sessionControl.ts) on an ISOLATED env: backfill this
  // provider's durable secret into its slot, then resolve + project, so the
  // probe sees exactly the base URL + key a real session would.
  const probeEnv: Record<string, string | undefined> = { ...deps.baseEnv }
  deps.hydrateSecrets(probeEnv, { activeProviderId: provider.id })

  let snapshot: ProviderRuntimeSnapshot
  try {
    snapshot = resolveProviderRuntimeSnapshot(
      configuration,
      {
        providerId: provider.id,
        modelProfileId: model.id,
        resolvedModelId: model.remoteModelId,
        providerConfigRevision: configuration.revision,
        updatedAt: Date.now(),
      },
      probeEnv,
      { isModelAllowed: deps.isModelAllowed },
    )
  } catch (error) {
    if (error instanceof ProviderRuntimeResolutionError) {
      if (error.code === 'authentication_required') {
        return { status: 'invalid', code: 'authentication_required' }
      }
      if (error.code === 'model_not_allowed') {
        return { status: 'invalid', code: 'model_not_allowed' }
      }
      return { status: 'error', code: error.code }
    }
    throw error
  }

  // Kinds with no cheap network probe (ChatGPT OAuth / cloud chains) — report
  // honestly as unsupported instead of fabricating a status.
  if (!isProbeableKind(snapshot)) {
    return { status: 'unsupported', code: 'probe_unsupported_provider' }
  }

  const projected = projectRuntimeEnvironment(snapshot, probeEnv)
  const credential =
    snapshot.credentialTargetEnvName === undefined
      ? undefined
      : projected[snapshot.credentialTargetEnvName]
  if (credential === undefined || credential.length === 0) {
    return { status: 'invalid', code: 'authentication_required' }
  }

  const probeEndpoint = resolveProbeEndpoint(snapshot, credential)
  if (probeEndpoint === null) {
    return { status: 'unsupported', code: 'probe_unsupported_provider' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs)
  try {
    const response = await deps.fetch(probeEndpoint.url, {
      method: 'GET',
      headers: probeEndpoint.headers,
      signal: controller.signal,
    })
    return mapHttpStatus(response.status)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'error', code: 'probe_timeout' }
    }
    return { status: 'error', code: 'provider_unreachable' }
  } finally {
    clearTimeout(timer)
  }
}
