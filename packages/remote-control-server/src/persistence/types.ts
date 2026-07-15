import type {
  EnvironmentCommandKind,
  EnvironmentCommandState,
  Product,
  ProjectState,
} from '../domain/product'

export interface SessionModelSelection {
  providerId: string
  modelProfileId: string
  resolvedModelId: string
  providerConfigRevision: number
  updatedAt: number
}

export interface PersistedSession {
  id: string
  environmentId: string | null
  title: string | null
  status: string
  source: string
  permissionMode: string | null
  directory: string | null
  product: Product
  projectId: string | null
  runtimeEnvironmentId: string | null
  dataDirectory: string | null
  projectPromptRevision: number | null
  modelSelection: SessionModelSelection | null
  workerEpoch: number
  username: string | null
  createdAt: number
  updatedAt: number
  archivedAt: number | null
}

export type PersistedSessionInput = Omit<
  PersistedSession,
  | 'product'
  | 'projectId'
  | 'runtimeEnvironmentId'
  | 'dataDirectory'
  | 'projectPromptRevision'
  | 'modelSelection'
> &
  Partial<
    Pick<
      PersistedSession,
      | 'product'
      | 'projectId'
      | 'runtimeEnvironmentId'
      | 'dataDirectory'
      | 'projectPromptRevision'
      | 'modelSelection'
    >
  >

export interface PersistedProject {
  id: string
  ownerId: string
  product: Product
  name: string
  projectPrompt: string
  promptRevision: number
  state: ProjectState
  deviceId: string | null
  workspaceKey: string | null
  canonicalPath: string | null
  gitRoot: string | null
  gitRepoUrl: string | null
  missingConfirmedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface PersistedEnvironmentCommand {
  id: string
  environmentId: string
  ownerId: string
  kind: EnvironmentCommandKind
  payload: Record<string, unknown>
  state: EnvironmentCommandState
  result: unknown | null
  error: string | null
  attemptCount: number
  createdAt: number
  updatedAt: number
}

export interface PersistedCleanupTombstone {
  sessionId: string
  environmentId: string
  dataDirectory: string
  browserScopeId: string
  attemptCount: number
  lastError: string | null
  createdAt: number
  updatedAt: number
}

export interface PersistedEnvironment {
  id: string
  accountId: string
  deviceId: string | null
  deviceName: string | null
  workspaceKey: string | null
  machineName: string | null
  directory: string | null
  branch: string | null
  gitRepoUrl: string | null
  maxSessions: number
  workerType: string
  bridgeId: string | null
  capabilities: Record<string, unknown> | null
  status: string
  username: string | null
  leaseEpoch: number
  leaseTokenHash: string | null
  connectionId: string | null
  lastPollAt: number | null
  createdAt: number
  updatedAt: number
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

export type EventDeliveryStatus = 'received' | 'processing' | 'processed'

export interface PersistedEventDelivery {
  sessionId: string
  eventId: string
  sequenceNum: number
  workerEpoch: number
  status: EventDeliveryStatus
  receivedAt: number | null
  processingAt: number | null
  processedAt: number | null
  updatedAt: number
}

export interface PersistedInternalEventInput {
  sessionId: string
  eventId: string
  eventType: string
  payload: Record<string, unknown>
  eventMetadata: Record<string, unknown> | null
  isCompaction: boolean
  agentId: string | null
  createdAt: number
}

export interface PersistedInternalEvent extends PersistedInternalEventInput {}

export interface PersistedInternalEventCursor {
  createdAt: number
  eventId: string
}

export interface PersistedInternalEventPage {
  events: PersistedInternalEvent[]
  nextCursor?: PersistedInternalEventCursor
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
