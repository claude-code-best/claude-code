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

export function buildSessionModelOptions(
  catalog: ProviderModelCatalog,
): SessionModelOption[] {
  return catalog.providers
    .filter(provider => provider.enabled && !provider.archived)
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
