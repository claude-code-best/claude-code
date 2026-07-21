import {
  loadProviderConfiguration,
  reloadProviderConfiguration,
} from '../providerRegistry/loader.js'
import { hydrateProviderSecretsIntoEnv } from '../providerRegistry/providerSecrets.js'
import type { ProviderConfigurationV2 } from '../providerRegistry/types.js'
import { isModelAllowed } from '../../utils/model/modelAllowlist.js'
import {
  getRuntimeProviderOverride,
  setRuntimeProviderOverride,
} from '../../utils/model/providers.js'
import {
  clearProviderDerivedCaches,
  ProviderRuntimeService,
  type RuntimeActivationOptions,
  type RuntimeActivationResult,
  type RuntimeTurnState,
} from './runtimeService.js'
import type {
  ProviderRuntimeSelection,
  ProviderRuntimeSnapshot,
} from './types.js'

export type SetSessionModelRequest = {
  subtype: 'set_session_model'
  provider_id: string
  model_profile_id: string
  expected_provider_config_revision: number
  operation_id: string
}

export type SessionModelControlDependencies = {
  loadConfiguration: () => ProviderConfigurationV2
  activate: (
    selection: ProviderRuntimeSelection,
    options: RuntimeActivationOptions,
  ) => Promise<RuntimeActivationResult>
  now: () => number
}

function applyProcessEnvironment(
  environment: Record<string, string | undefined>,
): void {
  for (const key of Object.keys(process.env)) {
    if (!Object.hasOwn(environment, key)) delete process.env[key]
  }
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function validateRuntimeClient(
  snapshot: ProviderRuntimeSnapshot,
): Promise<void> {
  if (snapshot.apiProvider === 'openai') {
    if (snapshot.environmentTemplate['OPENAI_AUTH_MODE'] === 'chatgpt') return
    const { getOpenAIClient } = await import('../api/openai/client.js')
    getOpenAIClient()
    return
  }
  if (snapshot.apiProvider === 'grok') {
    const { getGrokClient } = await import('../api/grok/client.js')
    getGrokClient()
  }
}

const runtimeService = new ProviderRuntimeService({
  loadConfiguration: () => loadProviderConfiguration().configuration,
  getEnvironment: () => ({ ...process.env }),
  applyEnvironment: applyProcessEnvironment,
  getProviderOverride: getRuntimeProviderOverride,
  setProviderOverride: setRuntimeProviderOverride,
  clearDerivedCaches: clearProviderDerivedCaches,
  validateClient: validateRuntimeClient,
  isModelAllowed,
})

const defaultDependencies: SessionModelControlDependencies = {
  // Read fresh from disk on every model switch. Each session worker is a
  // long-lived process that caches the provider configuration at launch
  // (loader.ts caches loadProviderConfiguration). Provider edits made later
  // via the RCS "模型供应商" page bump the on-disk revision, but the worker's
  // cached revision stays frozen — so the expected_provider_config_revision
  // check below would fail forever with provider_revision_conflict until the
  // worker restarts. reloadProviderConfiguration re-reads the file and
  // refreshes the shared cache, so the subsequent runtimeService.activate
  // (which reads loadProviderConfiguration) also sees the fresh config.
  loadConfiguration: () => reloadProviderConfiguration().configuration,
  activate: (selection, options) => runtimeService.activate(selection, options),
  now: Date.now,
}

export async function activateSessionModelRequest(
  request: SetSessionModelRequest,
  turnState: RuntimeTurnState,
  dependencies: SessionModelControlDependencies = defaultDependencies,
): Promise<RuntimeActivationResult> {
  const configuration = dependencies.loadConfiguration()
  if (request.expected_provider_config_revision !== configuration.revision) {
    return { ok: false, code: 'provider_revision_conflict' }
  }
  const provider = configuration.providers.find(
    candidate => candidate.id === request.provider_id,
  )
  if (provider === undefined) return { ok: false, code: 'provider_not_found' }
  const model = provider.models.find(
    candidate => candidate.id === request.model_profile_id,
  )
  if (model === undefined) return { ok: false, code: 'model_not_found' }

  // Backfill this provider's key from the durable per-provider store into the
  // runtime env before resolving. After a restart the shared settings.json
  // slot may be empty (a sibling provider's save cleared it), which would make
  // resolveProviderRuntimeSnapshot throw authentication_required even though
  // the key is safely stored. hydrate makes the target provider win its slot.
  hydrateProviderSecretsIntoEnv(process.env, { activeProviderId: provider.id })

  return dependencies.activate(
    {
      providerId: provider.id,
      modelProfileId: model.id,
      resolvedModelId: model.remoteModelId,
      providerConfigRevision: configuration.revision,
      updatedAt: dependencies.now(),
    },
    { operationId: request.operation_id, turnState },
  )
}
