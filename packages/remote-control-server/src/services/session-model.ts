import {
  storeGetEnvironment,
  storeGetSession,
  storeUpdateSession,
} from '../store'
import type {
  PersistedSessionEvent,
  SessionModelSelection,
} from '../persistence/types'
import {
  readEnvironmentProviderCatalog,
  type EnvironmentProviderCatalog,
} from './provider-catalog'

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

function availableModel(
  catalog: EnvironmentProviderCatalog,
  providerId: string,
  modelProfileId: string,
) {
  const provider = catalog.providers.find(
    candidate => candidate.id === providerId,
  )
  const model = provider?.models.find(
    candidate => candidate.id === modelProfileId,
  )
  if (
    provider === undefined ||
    model === undefined ||
    !provider.enabled ||
    provider.archived ||
    !model.enabled ||
    model.archived ||
    model.validation.status === 'invalid'
  ) {
    return null
  }
  return { provider, model }
}

function selectionFromInit(
  catalog: EnvironmentProviderCatalog,
  initEvent: PersistedSessionEvent,
): {
  selection: SessionModelSelection | null
  legacyResolvedModelId: string | null
} {
  const event = eventPayload(initEvent.payload)
  if (event === null || event['subtype'] !== 'init') {
    return { selection: null, legacyResolvedModelId: null }
  }
  const legacyResolvedModelId = nonEmpty(event['model']) ? event['model'] : null
  if (
    nonEmpty(event['provider_id']) &&
    nonEmpty(event['model_profile_id']) &&
    nonEmpty(event['resolved_model_id']) &&
    Number.isSafeInteger(event['provider_config_revision']) &&
    event['provider_config_revision'] === catalog.revision
  ) {
    const match = availableModel(
      catalog,
      event['provider_id'],
      event['model_profile_id'],
    )
    if (match?.model.remoteModelId === event['resolved_model_id']) {
      return {
        selection: {
          providerId: match.provider.id,
          modelProfileId: match.model.id,
          resolvedModelId: match.model.remoteModelId,
          providerConfigRevision: catalog.revision,
          updatedAt: initEvent.createdAt,
        },
        legacyResolvedModelId:
          legacyResolvedModelId ?? match.model.remoteModelId,
      }
    }
  }
  if (legacyResolvedModelId === null) {
    return { selection: null, legacyResolvedModelId: null }
  }
  const matches = catalog.providers.flatMap(provider =>
    provider.models
      .filter(model => model.remoteModelId === legacyResolvedModelId)
      .map(model => availableModel(catalog, provider.id, model.id))
      .filter(match => match !== null),
  )
  if (matches.length !== 1) {
    return { selection: null, legacyResolvedModelId }
  }
  const [match] = matches
  return {
    selection: {
      providerId: match.provider.id,
      modelProfileId: match.model.id,
      resolvedModelId: match.model.remoteModelId,
      providerConfigRevision: catalog.revision,
      updatedAt: initEvent.createdAt,
    },
    legacyResolvedModelId,
  }
}

/** Recover an old session only when its last runtime model is unambiguous. */
export function recoverLegacySessionModel(
  session: { modelSelection: SessionModelSelection | null },
  catalog: EnvironmentProviderCatalog,
  initEvent: PersistedSessionEvent | null | undefined,
): {
  persistedSelection: SessionModelSelection | null
  legacyResolvedModelId: string | null
} {
  if (session.modelSelection !== null) {
    return {
      persistedSelection: session.modelSelection,
      legacyResolvedModelId: session.modelSelection.resolvedModelId,
    }
  }
  if (initEvent == null) {
    return { persistedSelection: null, legacyResolvedModelId: null }
  }
  const recovered = selectionFromInit(catalog, initEvent)
  return {
    persistedSelection: recovered.selection,
    legacyResolvedModelId: recovered.legacyResolvedModelId,
  }
}

/**
 * Reconcile the desired/legacy selection immediately before dispatch. A
 * revision drift is harmless when the stable provider/model identity still
 * exists; deleted identities fall back to an unambiguous legacy init model or
 * the catalog default. The returned `recovered` flag lets the caller publish
 * an audit event without treating authentication as a recovery case.
 */
export function reconcileSessionModelSelection(
  session: {
    modelSelection: SessionModelSelection | null
    desiredModelSelection?: SessionModelSelection | null
  },
  catalog: EnvironmentProviderCatalog,
  initEvent: PersistedSessionEvent | null | undefined,
): {
  selection: SessionModelSelection | null
  recovered: boolean
  reason:
    | 'revision_drift'
    | 'deleted_selection'
    | 'legacy_selection'
    | 'default_model'
    | null
} {
  const candidate = session.desiredModelSelection ?? session.modelSelection
  if (candidate !== null) {
    const match = availableModel(
      catalog,
      candidate.providerId,
      candidate.modelProfileId,
    )
    if (match && match.model.remoteModelId === candidate.resolvedModelId) {
      const selection = {
        providerId: match.provider.id,
        modelProfileId: match.model.id,
        resolvedModelId: match.model.remoteModelId,
        providerConfigRevision: catalog.revision,
        updatedAt: candidate.updatedAt,
      }
      return {
        selection,
        recovered:
          selection.providerConfigRevision !== candidate.providerConfigRevision,
        reason:
          selection.providerConfigRevision !== candidate.providerConfigRevision
            ? 'revision_drift'
            : null,
      }
    }
  }

  const legacy = recoverLegacySessionModel(
    { modelSelection: null },
    catalog,
    initEvent,
  )
  if (legacy.persistedSelection !== null) {
    return {
      selection: legacy.persistedSelection,
      recovered: true,
      reason: candidate === null ? 'legacy_selection' : 'deleted_selection',
    }
  }
  // A legacy model name that maps to multiple providers is not safe to
  // replace with the current default: doing so silently changes provider
  // intent. Keep the session recoverable and wait for an explicit choice.
  if (legacy.legacyResolvedModelId !== null) {
    return { selection: null, recovered: false, reason: null }
  }

  const defaultModel = catalog.defaultModel
    ? availableModel(
        catalog,
        catalog.defaultModel.providerId,
        catalog.defaultModel.modelProfileId,
      )
    : null
  if (defaultModel !== null) {
    return {
      selection: {
        providerId: defaultModel.provider.id,
        modelProfileId: defaultModel.model.id,
        resolvedModelId: defaultModel.model.remoteModelId,
        providerConfigRevision: catalog.revision,
        updatedAt: Date.now(),
      },
      recovered: candidate !== null,
      reason: candidate === null ? 'default_model' : 'deleted_selection',
    }
  }
  return { selection: null, recovered: false, reason: null }
}

/** Reconcile only a worker-confirmed selection against its environment view. */
export function reconcileConfirmedSessionModel(
  sessionId: string,
  payload: unknown,
  createdAt = Date.now(),
): SessionModelReconcileResult {
  const event = eventPayload(payload)
  if (event === null) return 'ignored'
  const session = storeGetSession(sessionId)
  if (!session) return 'missing_session'
  const environmentId = session.runtimeEnvironmentId ?? session.environmentId
  if (!environmentId) return 'missing_environment'
  const environment = storeGetEnvironment(environmentId)
  if (!environment) return 'missing_environment'
  const result = readEnvironmentProviderCatalog(environment.capabilities)
  if (!result.supported) return 'ignored'

  if (event['subtype'] === 'init') {
    const recovered = selectionFromInit(result.catalog, {
      id: 'runtime-init',
      sessionId,
      seqNum: 0,
      type: 'system',
      payload,
      direction: 'inbound',
      sourceEventId: null,
      dedupeScope: null,
      createdAt,
    })
    if (recovered.selection === null) return 'ignored'
    storeUpdateSession(sessionId, {
      // Keep the legacy model_selection field as the last confirmed runtime
      // value. desired/actual remain the authoritative two-phase fields.
      modelSelection: recovered.selection,
      desiredModelSelection: session.desiredModelSelection,
      actualModelSelection: recovered.selection,
      modelOperationId: null,
    })
    return 'updated'
  }

  if (
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
  if (
    session.modelOperationId !== null &&
    session.modelOperationId !== event['operation_id']
  ) {
    return 'ignored'
  }
  if (result.catalog.revision !== event['provider_config_revision']) {
    return 'ignored'
  }
  const match = availableModel(
    result.catalog,
    event['provider_id'],
    event['model_profile_id'],
  )
  if (
    match === null ||
    match.model.remoteModelId !== event['resolved_model_id']
  ) {
    return 'ignored'
  }
  storeUpdateSession(sessionId, {
    modelSelection: {
      providerId: match.provider.id,
      modelProfileId: match.model.id,
      resolvedModelId: match.model.remoteModelId,
      providerConfigRevision: result.catalog.revision,
      updatedAt: event['updated_at'] as number,
    },
    desiredModelSelection: session.desiredModelSelection,
    actualModelSelection: {
      providerId: match.provider.id,
      modelProfileId: match.model.id,
      resolvedModelId: match.model.remoteModelId,
      providerConfigRevision: result.catalog.revision,
      updatedAt: event['updated_at'] as number,
    },
    modelOperationId: null,
  })
  return 'updated'
}
