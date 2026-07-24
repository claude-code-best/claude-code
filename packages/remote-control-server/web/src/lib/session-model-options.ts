import type {
  Environment,
  ProviderModelCatalog,
  SessionModelSelection,
} from '../types'
import { parseProviderModelCatalog } from './provider-catalog-model'

export type SessionModelOption = {
  providerId: string
  providerName: string
  modelProfileId: string
  modelName: string
  remoteModelId: string
  label: string
  unverified: boolean
}

/**
 * Detected-only providers (env/OAuth credentials the CLI probed) are advertised
 * in the environment catalog under a `detected-*` id so the Provider Settings
 * page can offer to adopt them. They are NOT in the worker's providers.json, so
 * selecting one as a session model resolves to `model_not_found` at spawn. Keep
 * them out of the switchable menu until the user materializes a real profile.
 */
function isDetectedOnlyProvider(providerId: string): boolean {
  return providerId.startsWith('detected-')
}

export function buildSessionModelOptions(
  catalog: ProviderModelCatalog,
): SessionModelOption[] {
  return catalog.providers
    .filter(
      provider =>
        provider.enabled &&
        !provider.archived &&
        !isDetectedOnlyProvider(provider.id),
    )
    .flatMap(provider =>
      provider.models
        .filter(
          model =>
            model.enabled &&
            !model.archived &&
            model.validation.status !== 'invalid',
        )
        .map(model => ({
          providerId: provider.id,
          providerName: provider.displayName,
          modelProfileId: model.id,
          modelName: model.displayName,
          remoteModelId: model.remoteModelId,
          label: `${provider.displayName} / ${model.displayName}`,
          unverified: model.validation.status === 'unverified',
        })),
    )
}

export function findSelectedSessionModel(
  options: SessionModelOption[],
  selection: SessionModelSelection | null | undefined,
): SessionModelOption | null {
  if (!selection) return null
  return (
    options.find(
      option =>
        option.providerId === selection.provider_id &&
        option.modelProfileId === selection.model_profile_id,
    ) ?? null
  )
}

export function environmentDefaultModelLabel(
  environment: Environment | null | undefined,
): string | null {
  const value = environment?.capabilities?.provider_model_catalog_v1
  if (value === undefined) return null
  try {
    const catalog = parseProviderModelCatalog(value)
    if (!catalog.defaultModel) return null
    const provider = catalog.providers.find(
      candidate => candidate.id === catalog.defaultModel?.providerId,
    )
    const model = provider?.models.find(
      candidate => candidate.id === catalog.defaultModel?.modelProfileId,
    )
    return provider && model
      ? `${provider.displayName} / ${model.displayName}`
      : null
  } catch {
    return null
  }
}
