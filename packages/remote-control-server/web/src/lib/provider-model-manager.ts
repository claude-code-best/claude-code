import type {
  ProviderCatalogModelProfile,
  ProviderDiscoveredModel,
  ProviderModelMutationPayload,
} from '../types'

export type ManagedProviderModel = ProviderDiscoveredModel & {
  configured?: ProviderCatalogModelProfile
  discovered: boolean
}

export function mergeManagedProviderModels(
  discovered: ProviderDiscoveredModel[],
  configured: ProviderCatalogModelProfile[],
): ManagedProviderModel[] {
  const byRemoteId = new Map<string, ManagedProviderModel>()
  for (const model of discovered) {
    byRemoteId.set(model.remoteModelId, { ...model, discovered: true })
  }
  for (const model of configured) {
    const remote = byRemoteId.get(model.remoteModelId)
    byRemoteId.set(model.remoteModelId, {
      remoteModelId: model.remoteModelId,
      displayName: model.displayName,
      ...(remote?.ownedBy === undefined ? {} : { ownedBy: remote.ownedBy }),
      configured: model,
      discovered: remote !== undefined,
    })
  }
  return [...byRemoteId.values()].sort((left, right) => {
    const leftEnabled =
      left.configured?.enabled === true && !left.configured.archived
    const rightEnabled =
      right.configured?.enabled === true && !right.configured.archived
    if (leftEnabled !== rightEnabled) return leftEnabled ? -1 : 1
    return left.displayName.localeCompare(right.displayName, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

export function createModelProfileId(
  remoteModelId: string,
  existingIds: Iterable<string>,
): string {
  const used = new Set(existingIds)
  const normalized =
    remoteModelId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'model'
  if (!used.has(normalized)) return normalized
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${normalized.slice(0, 74).replace(/-+$/g, '')}-${suffix}`
    if (!used.has(candidate)) return candidate
  }
  throw new Error('model_profile_id_exhausted')
}

export function discoveredModelMutation(
  model: ProviderDiscoveredModel,
  configured: ProviderCatalogModelProfile[],
): ProviderModelMutationPayload {
  return {
    id: createModelProfileId(
      model.remoteModelId,
      configured.map(candidate => candidate.id),
    ),
    display_name: model.displayName,
    remote_model_id: model.remoteModelId,
    enabled: true,
    archived: false,
    validation: { status: 'unverified' },
  }
}
