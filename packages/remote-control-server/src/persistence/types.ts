export interface PersistedSession {
  id: string
  environmentId: string | null
  title: string | null
  status: string
  source: string
  permissionMode: string | null
  workerEpoch: number
  username: string | null
  createdAt: number
  updatedAt: number
  archivedAt: number | null
}

export interface PersistedSessionOwner {
  sessionId: string
  ownerUuid: string
  createdAt: number
}

export interface PersistedSessionWorker {
  sessionId: string
  workerStatus: string | null
  externalMetadata: Record<string, unknown> | null
  requiresActionDetails: Record<string, unknown> | null
  lastHeartbeatAt: number | null
  createdAt: number
  updatedAt: number
}

export interface PersistedEventInput {
  id: string
  sessionId: string
  type: string
  payload: unknown
  direction: 'inbound' | 'outbound'
  sourceEventId: string | null
  dedupeScope: string | null
  createdAt: number
}

export interface PersistedSessionEvent extends PersistedEventInput {
  seqNum: number
}

export type PersistedEventCommitResult = {
  event: PersistedSessionEvent
  duplicate: boolean
}

export interface PersistedEventPage {
  events: PersistedSessionEvent[]
}

export class IdempotencyConflictError extends Error {
  constructor(
    readonly sessionId: string,
    readonly dedupeScope: string,
    readonly sourceEventId: string,
  ) {
    super(
      `Conflicting payload for event ${sessionId}:${dedupeScope}:${sourceEventId}`,
    )
    this.name = 'IdempotencyConflictError'
  }
}
