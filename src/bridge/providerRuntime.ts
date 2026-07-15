import type { ProviderConfigurationV2 } from '../services/providerRegistry/types.js'
import {
  projectRuntimeEnvironment,
  resolveProviderRuntimeSnapshot,
  type ResolveSnapshotOptions,
} from '../services/providerRuntime/resolveSnapshot.js'
import type {
  ProviderRuntimeSelection,
  ProviderRuntimeSnapshot,
} from '../services/providerRuntime/types.js'

export type BridgeProviderRuntime = {
  selection: ProviderRuntimeSelection
  snapshot: ProviderRuntimeSnapshot
  providerEnvironment: Record<string, string | undefined>
  stale: boolean
}

export function parseSessionModelSelectionPayload(
  value: unknown,
): ProviderRuntimeSelection {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_session_model_selection')
  }
  const selection = value as Record<string, unknown>
  const keys = [
    'provider_id',
    'model_profile_id',
    'resolved_model_id',
    'provider_config_revision',
    'updated_at',
  ] as const
  if (
    Object.keys(selection).some(
      key => !keys.includes(key as (typeof keys)[number]),
    ) ||
    typeof selection['provider_id'] !== 'string' ||
    selection['provider_id'].trim().length === 0 ||
    typeof selection['model_profile_id'] !== 'string' ||
    selection['model_profile_id'].trim().length === 0 ||
    typeof selection['resolved_model_id'] !== 'string' ||
    selection['resolved_model_id'].trim().length === 0 ||
    !Number.isSafeInteger(selection['provider_config_revision']) ||
    (selection['provider_config_revision'] as number) < 0 ||
    !Number.isSafeInteger(selection['updated_at']) ||
    (selection['updated_at'] as number) < 0
  ) {
    throw new Error('invalid_session_model_selection')
  }
  return Object.freeze({
    providerId: selection['provider_id'],
    modelProfileId: selection['model_profile_id'],
    resolvedModelId: selection['resolved_model_id'],
    providerConfigRevision: selection['provider_config_revision'] as number,
    updatedAt: selection['updated_at'] as number,
  })
}

/**
 * Resolve persisted work against the bridge's local catalog. A revision-only
 * mismatch is recoverable when the stable IDs and remote model still match;
 * the normal runtime resolver enforces every other availability/auth check.
 */
export function resolveBridgeProviderRuntime(
  configuration: ProviderConfigurationV2,
  selection: ProviderRuntimeSelection,
  baseEnvironment: Readonly<Record<string, string | undefined>>,
  options: ResolveSnapshotOptions = {},
): BridgeProviderRuntime {
  const stale = selection.providerConfigRevision !== configuration.revision
  const effectiveSelection = stale
    ? {
        ...selection,
        providerConfigRevision: configuration.revision,
      }
    : selection
  const snapshot = resolveProviderRuntimeSnapshot(
    configuration,
    effectiveSelection,
    baseEnvironment,
    options,
  )
  return {
    selection: Object.freeze({ ...selection }),
    snapshot,
    providerEnvironment: projectRuntimeEnvironment(snapshot, baseEnvironment),
    stale,
  }
}
