import {
  storeGetEnvironment,
  storeGetSession,
  storeUpdateSession,
} from '../store'
import { readEnvironmentProviderCatalog } from './provider-catalog'

export type SessionModelReconcileResult =
  | 'updated'
  | 'ignored'
  | 'missing_session'
  | 'missing_environment'

function eventPayload(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const normalized = value as Record<string, unknown>
  const raw = normalized['raw']
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : normalized
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Reconcile only a worker-confirmed selection against its environment view. */
export function reconcileConfirmedSessionModel(
  sessionId: string,
  payload: unknown,
): SessionModelReconcileResult {
  const event = eventPayload(payload)
  if (
    event === null ||
    event['subtype'] !== 'session_model_changed' ||
    !nonEmpty(event['operation_id']) ||
    event['uuid'] !== event['operation_id'] ||
    !nonEmpty(event['provider_id']) ||
    !nonEmpty(event['model_profile_id']) ||
    !nonEmpty(event['resolved_model_id']) ||
    !Number.isSafeInteger(event['provider_config_revision']) ||
    (event['provider_config_revision'] as number) < 0 ||
    !Number.isSafeInteger(event['updated_at']) ||
    (event['updated_at'] as number) < 0
  ) {
    return 'ignored'
  }
  const session = storeGetSession(sessionId)
  if (!session) return 'missing_session'
  const environmentId = session.runtimeEnvironmentId ?? session.environmentId
  if (!environmentId) return 'missing_environment'
  const environment = storeGetEnvironment(environmentId)
  if (!environment) return 'missing_environment'
  const result = readEnvironmentProviderCatalog(environment.capabilities)
  if (
    !result.supported ||
    result.catalog.revision !== event['provider_config_revision']
  ) {
    return 'ignored'
  }
  const provider = result.catalog.providers.find(
    candidate => candidate.id === event['provider_id'],
  )
  const model = provider?.models.find(
    candidate => candidate.id === event['model_profile_id'],
  )
  if (
    provider === undefined ||
    model === undefined ||
    !provider.enabled ||
    provider.archived ||
    !model.enabled ||
    model.archived ||
    model.validation.status === 'invalid' ||
    model.remoteModelId !== event['resolved_model_id']
  ) {
    return 'ignored'
  }
  storeUpdateSession(sessionId, {
    modelSelection: {
      providerId: provider.id,
      modelProfileId: model.id,
      resolvedModelId: model.remoteModelId,
      providerConfigRevision: result.catalog.revision,
      updatedAt: event['updated_at'] as number,
    },
  })
  return 'updated'
}
