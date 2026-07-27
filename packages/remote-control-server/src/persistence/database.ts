import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { assertProjectShape } from '../domain/product'
import { log } from '../logger'
import {
  DURABLE_EVENT_RETENTION_CAPS,
  DURABLE_OUTBOUND_EVENT_TYPES,
} from '../transport/event-delivery-policy'
import { migrateSchema } from './schema'
import {
  IdempotencyConflictError,
  type EventDeliveryStatus,
  type PersistedCleanupTombstone,
  type PersistedEnvironmentCommand,
  type PersistedEventCommitResult,
  type PersistedEventInput,
  type PersistedEventDelivery,
  type PersistedEventPage,
  type PersistedEnvironment,
  type PersistedProject,
  type PersistedSession,
  type PersistedSessionInput,
  type PersistedSessionEvent,
  type PersistedSessionOwner,
  type PersistedSessionWorker,
  type PersistedInternalEvent,
  type PersistedInternalEventCursor,
  type PersistedInternalEventInput,
  type PersistedInternalEventPage,
  type SessionModelSelection,
  type PersistedSessionWorkItem,
  type SessionWorkState,
  type OutboundResolution,
} from './types'

export { IdempotencyConflictError } from './types'
export type {
  EventDeliveryStatus,
  PersistedEventCommitResult,
  PersistedEventInput,
  PersistedEventDelivery,
  PersistedEventPage,
  PersistedCleanupTombstone,
  PersistedEnvironmentCommand,
  PersistedEnvironment,
  PersistedProject,
  PersistedSession,
  PersistedSessionInput,
  PersistedSessionEvent,
  PersistedSessionOwner,
  PersistedSessionWorker,
  PersistedInternalEvent,
  PersistedInternalEventCursor,
  PersistedInternalEventInput,
  PersistedInternalEventPage,
  SessionModelSelection,
  PersistedSessionWorkItem,
  SessionWorkState,
  OutboundResolution,
} from './types'

interface SessionRow {
  id: string
  environmentId: string | null
  title: string | null
  status: string
  source: string
  permissionMode: string | null
  directory: string | null
  product: 'chat' | 'code'
  projectId: string | null
  runtimeEnvironmentId: string | null
  dataDirectory: string | null
  projectPromptRevision: number | null
  modelProviderId: string | null
  modelProfileId: string | null
  modelResolvedId: string | null
  modelConfigRevision: number | null
  modelUpdatedAt: number | null
  desiredModelProviderId: string | null
  desiredModelProfileId: string | null
  desiredModelResolvedId: string | null
  desiredModelConfigRevision: number | null
  desiredModelUpdatedAt: number | null
  actualModelProviderId: string | null
  actualModelProfileId: string | null
  actualModelResolvedId: string | null
  actualModelConfigRevision: number | null
  actualModelUpdatedAt: number | null
  modelOperationId: string | null
  processedOutboundSeq: number
  workerEpoch: number
  username: string | null
  archivedAt: number | null
  createdAt: number
  updatedAt: number
}

interface EventDeliveryRow {
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

interface InternalEventRow {
  sessionId: string
  eventId: string
  eventType: string
  payloadJson: string
  eventMetadataJson: string | null
  isCompaction: number
  agentId: string | null
  createdAt: number
}

interface ProjectRow {
  id: string
  ownerId: string
  product: 'chat' | 'code'
  name: string
  projectPrompt: string
  promptRevision: number
  state: 'active' | 'archived' | 'missing'
  deviceId: string | null
  workspaceKey: string | null
  canonicalPath: string | null
  gitRoot: string | null
  gitRepoUrl: string | null
  missingConfirmedAt: number | null
  createdAt: number
  updatedAt: number
}

interface EnvironmentCommandRow {
  id: string
  environmentId: string
  ownerId: string
  kind: string
  payloadJson: string
  state:
    | 'pending'
    | 'dispatched'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelled'
  resultJson: string | null
  error: string | null
  attemptCount: number
  createdAt: number
  updatedAt: number
  operationId: string | null
  dedupeKey: string | null
  priority: number
  expiresAt: number | null
  maxAttempts: number
}

interface CleanupTombstoneRow {
  sessionId: string
  environmentId: string
  dataDirectory: string
  browserScopeId: string
  attemptCount: number
  lastError: string | null
  createdAt: number
  updatedAt: number
}

interface EnvironmentRow {
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
  capabilitiesJson: string | null
  status: string
  username: string | null
  leaseEpoch: number
  leaseTokenHash: string | null
  connectionId: string | null
  lastPollAt: number | null
  createdAt: number
  updatedAt: number
}

type EnvironmentUpsertParams = Omit<PersistedEnvironment, 'capabilities'> & {
  capabilitiesJson: string | null
}

type ProjectUpsertParams = {
  id: string
  ownerId: string
  product: 'chat' | 'code'
  name: string
  projectPrompt: string
  promptRevision: number
  state: 'active' | 'archived' | 'missing'
  deviceId: string | null
  workspaceKey: string | null
  canonicalPath: string | null
  gitRoot: string | null
  gitRepoUrl: string | null
  missingConfirmedAt: number | null
  createdAt: number
  updatedAt: number
}

type CleanupTombstoneUpsertParams = {
  sessionId: string
  environmentId: string
  dataDirectory: string
  browserScopeId: string
  attemptCount: number
  lastError: string | null
  createdAt: number
  updatedAt: number
}

interface OwnerRow {
  sessionId: string
  ownerUuid: string
  createdAt: number
}

interface WorkerRow {
  sessionId: string
  workerStatus: string | null
  externalMetadataJson: string | null
  requiresActionDetailsJson: string | null
  lastHeartbeatAt: number | null
  createdAt: number
  updatedAt: number
}

interface EventRow {
  id: string
  sessionId: string
  seqNum: number
  type: string
  payloadJson: string
  direction: 'inbound' | 'outbound'
  sourceEventId: string | null
  dedupeScope: string | null
  createdAt: number
}

const SESSION_COLUMNS = `
  id,
  environment_id AS environmentId,
  title,
  status,
  source,
  permission_mode AS permissionMode,
  directory,
  product,
  project_id AS projectId,
  runtime_environment_id AS runtimeEnvironmentId,
  data_directory AS dataDirectory,
  project_prompt_revision AS projectPromptRevision,
  model_provider_id AS modelProviderId,
  model_profile_id AS modelProfileId,
  model_resolved_id AS modelResolvedId,
  model_config_revision AS modelConfigRevision,
  model_updated_at_ms AS modelUpdatedAt,
  desired_model_provider_id AS desiredModelProviderId,
  desired_model_profile_id AS desiredModelProfileId,
  desired_model_resolved_id AS desiredModelResolvedId,
  desired_model_config_revision AS desiredModelConfigRevision,
  desired_model_updated_at_ms AS desiredModelUpdatedAt,
  actual_model_provider_id AS actualModelProviderId,
  actual_model_profile_id AS actualModelProfileId,
  actual_model_resolved_id AS actualModelResolvedId,
  actual_model_config_revision AS actualModelConfigRevision,
  actual_model_updated_at_ms AS actualModelUpdatedAt,
  model_operation_id AS modelOperationId,
  processed_outbound_seq AS processedOutboundSeq,
  worker_epoch AS workerEpoch,
  username,
  archived_at_ms AS archivedAt,
  created_at_ms AS createdAt,
  updated_at_ms AS updatedAt
`

const PROJECT_COLUMNS = `
  id,
  owner_id AS ownerId,
  product,
  name,
  project_prompt AS projectPrompt,
  prompt_revision AS promptRevision,
  state,
  device_id AS deviceId,
  workspace_key AS workspaceKey,
  canonical_path AS canonicalPath,
  git_root AS gitRoot,
  git_repo_url AS gitRepoUrl,
  missing_confirmed_at_ms AS missingConfirmedAt,
  created_at_ms AS createdAt,
  updated_at_ms AS updatedAt
`

const ENVIRONMENT_COMMAND_COLUMNS = `
  id,
  environment_id AS environmentId,
  owner_id AS ownerId,
  kind,
  payload_json AS payloadJson,
  state,
  result_json AS resultJson,
  error,
  attempt_count AS attemptCount,
  operation_id AS operationId,
  dedupe_key AS dedupeKey,
  priority,
  expires_at_ms AS expiresAt,
  max_attempts AS maxAttempts,
  created_at_ms AS createdAt,
  updated_at_ms AS updatedAt
`

const CLEANUP_TOMBSTONE_COLUMNS = `
  session_id AS sessionId,
  environment_id AS environmentId,
  data_directory AS dataDirectory,
  browser_scope_id AS browserScopeId,
  attempt_count AS attemptCount,
  last_error AS lastError,
  created_at_ms AS createdAt,
  updated_at_ms AS updatedAt
`

const EVENT_COLUMNS = `
  id,
  session_id AS sessionId,
  seq_num AS seqNum,
  type,
  payload_json AS payloadJson,
  direction,
  source_event_id AS sourceEventId,
  dedupe_scope AS dedupeScope,
  created_at_ms AS createdAt
`

const ENVIRONMENT_COLUMNS = `
  id,
  account_id AS accountId,
  device_id AS deviceId,
  device_name AS deviceName,
  workspace_key AS workspaceKey,
  machine_name AS machineName,
  directory,
  branch,
  git_repo_url AS gitRepoUrl,
  max_sessions AS maxSessions,
  worker_type AS workerType,
  bridge_id AS bridgeId,
  capabilities_json AS capabilitiesJson,
  status,
  username,
  lease_epoch AS leaseEpoch,
  lease_token_hash AS leaseTokenHash,
  connection_id AS connectionId,
  last_poll_at_ms AS lastPollAt,
  created_at_ms AS createdAt,
  updated_at_ms AS updatedAt
`

function isBoxedJsonPrimitive(value: object): boolean {
  const tag = Object.prototype.toString.call(value)
  return (
    tag === '[object Boolean]' ||
    tag === '[object Number]' ||
    tag === '[object String]' ||
    tag === '[object BigInt]' ||
    tag === '[object Symbol]'
  )
}

function createCanonicalJsonReplacer() {
  const sortedObjects = new WeakMap<object, object>()

  return (_key: string, value: unknown): unknown => {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      isBoxedJsonPrimitive(value)
    ) {
      return value
    }

    const cached = sortedObjects.get(value)
    if (cached) return cached

    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    sortedObjects.set(value, sorted)
    for (const key of Object.keys(record).sort()) {
      sorted[key] = record[key]
    }
    return sorted
  }
}

function serializeJson(value: unknown, label: string): string {
  const serialized = JSON.stringify(value, createCanonicalJsonReplacer())
  if (serialized === undefined) {
    throw new TypeError(`${label} must be JSON-serializable`)
  }
  return serialized
}

function canonicalizeSerializedJson(serialized: string): string {
  return serializeJson(JSON.parse(serialized) as unknown, 'stored payload')
}

function parseNullableRecord(
  serialized: string | null,
): Record<string, unknown> | null {
  return serialized === null
    ? null
    : (JSON.parse(serialized) as Record<string, unknown>)
}

function parseNullableJson(serialized: string | null): unknown | null {
  return serialized === null ? null : (JSON.parse(serialized) as unknown)
}

function isValidSessionModelSelection(
  value: unknown,
): value is SessionModelSelection {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const selection = value as Record<string, unknown>
  return (
    typeof selection['providerId'] === 'string' &&
    selection['providerId'].trim().length > 0 &&
    typeof selection['modelProfileId'] === 'string' &&
    selection['modelProfileId'].trim().length > 0 &&
    typeof selection['resolvedModelId'] === 'string' &&
    selection['resolvedModelId'].trim().length > 0 &&
    Number.isInteger(selection['providerConfigRevision']) &&
    (selection['providerConfigRevision'] as number) >= 0 &&
    Number.isInteger(selection['updatedAt']) &&
    (selection['updatedAt'] as number) >= 0
  )
}

function assertSessionModelSelection(
  value: SessionModelSelection | null,
): void {
  if (value !== null && !isValidSessionModelSelection(value)) {
    throw new Error('invalid persisted session model selection')
  }
}

function toSessionModelSelection(
  row: SessionRow,
): SessionModelSelection | null {
  const values = [
    row.modelProviderId,
    row.modelProfileId,
    row.modelResolvedId,
    row.modelConfigRevision,
    row.modelUpdatedAt,
  ]
  if (values.every(value => value === null)) return null
  if (values.some(value => value === null)) {
    throw new Error('invalid persisted session model selection')
  }
  const selection = {
    providerId: row.modelProviderId,
    modelProfileId: row.modelProfileId,
    resolvedModelId: row.modelResolvedId,
    providerConfigRevision: row.modelConfigRevision,
    updatedAt: row.modelUpdatedAt,
  }
  if (!isValidSessionModelSelection(selection)) {
    throw new Error('invalid persisted session model selection')
  }
  return selection
}

function toSession(row: SessionRow): PersistedSession {
  const {
    modelProviderId: _modelProviderId,
    modelProfileId: _modelProfileId,
    modelResolvedId: _modelResolvedId,
    modelConfigRevision: _modelConfigRevision,
    modelUpdatedAt: _modelUpdatedAt,
    ...session
  } = row
  const desiredValues = {
    modelProviderId: row.desiredModelProviderId,
    modelProfileId: row.desiredModelProfileId,
    modelResolvedId: row.desiredModelResolvedId,
    modelConfigRevision: row.desiredModelConfigRevision,
    modelUpdatedAt: row.desiredModelUpdatedAt,
  }
  const actualValues = {
    modelProviderId: row.actualModelProviderId,
    modelProfileId: row.actualModelProfileId,
    modelResolvedId: row.actualModelResolvedId,
    modelConfigRevision: row.actualModelConfigRevision,
    modelUpdatedAt: row.actualModelUpdatedAt,
  }
  return {
    ...session,
    modelSelection: toSessionModelSelection(row),
    desiredModelSelection: toSessionModelSelection({
      ...row,
      ...desiredValues,
    }),
    actualModelSelection: toSessionModelSelection({ ...row, ...actualValues }),
  }
}

function toProject(row: ProjectRow): PersistedProject {
  return row
}

function toEnvironmentCommand(
  row: EnvironmentCommandRow,
): PersistedEnvironmentCommand {
  return {
    ...row,
    kind: row.kind as PersistedEnvironmentCommand['kind'],
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    result: parseNullableJson(row.resultJson),
  }
}

function toCleanupTombstone(
  row: CleanupTombstoneRow,
): PersistedCleanupTombstone {
  return row
}

function toEnvironment(row: EnvironmentRow): PersistedEnvironment {
  return {
    ...row,
    capabilities: parseNullableRecord(row.capabilitiesJson),
  }
}

function toOwner(row: OwnerRow): PersistedSessionOwner {
  return row
}

function toWorker(row: WorkerRow): PersistedSessionWorker {
  return {
    sessionId: row.sessionId,
    workerStatus: row.workerStatus,
    externalMetadata: parseNullableRecord(row.externalMetadataJson),
    requiresActionDetails: parseNullableRecord(row.requiresActionDetailsJson),
    lastHeartbeatAt: row.lastHeartbeatAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toEvent(row: EventRow): PersistedSessionEvent {
  return {
    id: row.id,
    sessionId: row.sessionId,
    seqNum: row.seqNum,
    type: row.type,
    payload: JSON.parse(row.payloadJson) as unknown,
    direction: row.direction,
    sourceEventId: row.sourceEventId,
    dedupeScope: row.dedupeScope,
    createdAt: row.createdAt,
  }
}

function toInternalEvent(row: InternalEventRow): PersistedInternalEvent {
  return {
    sessionId: row.sessionId,
    eventId: row.eventId,
    eventType: row.eventType,
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    eventMetadata:
      row.eventMetadataJson === null
        ? null
        : (JSON.parse(row.eventMetadataJson) as Record<string, unknown>),
    isCompaction: row.isCompaction === 1,
    agentId: row.agentId,
    createdAt: row.createdAt,
  }
}

/**
 * Compact once free pages are both a meaningful share of the file (>25%) and
 * a meaningful absolute size (>~8MB at the default 4KB page size), so startup
 * only pays for VACUUM when a real chunk of the file is dead weight.
 */
export function shouldCompactDatabase(
  pageCount: number,
  freelistCount: number,
): boolean {
  const MIN_FREE_PAGES = 2048 // ~8MB at the default 4KB page size
  if (pageCount <= 0 || freelistCount <= MIN_FREE_PAGES) return false
  return freelistCount / pageCount > 0.25
}

export class RcsDatabase {
  private readonly database: Database

  constructor(path: string) {
    const fileBacked = path !== ':memory:' && path !== ''
    if (fileBacked) {
      mkdirSync(dirname(resolve(path)), { recursive: true })
    }

    const database = new Database(path, { create: true, strict: true })
    this.database = database

    try {
      this.configureConnection()
      this.migrate()
      if (fileBacked) this.compactIfBloated()
    } catch (error) {
      database.close()
      throw error
    }
  }

  /**
   * Connection tuning. WAL keeps readers (history pagination, SSE catch-up,
   * external inspection) from blocking event commits and vice versa;
   * synchronous=NORMAL is the recommended WAL pairing (durable across app
   * crashes, may lose only the most recent commits on OS/power failure);
   * busy_timeout retries locked writes instead of surfacing SQLITE_BUSY,
   * which used to silently drop bridge events mid-conversation.
   */
  private configureConnection(): void {
    this.database.exec('PRAGMA busy_timeout = 5000;')
    this.database.exec('PRAGMA journal_mode = WAL;')
    this.database.exec('PRAGMA synchronous = NORMAL;')
  }

  /**
   * Reclaim free pages left behind by retention pruning and migrations.
   * VACUUM must run outside any transaction, so this happens right after
   * migrations while the process is still single-threaded at startup.
   */
  private compactIfBloated(): void {
    const pageCount =
      this.database.query<{ page_count: number }, []>('PRAGMA page_count').get()
        ?.page_count ?? 0
    const freelistCount =
      this.database
        .query<{ freelist_count: number }, []>('PRAGMA freelist_count')
        .get()?.freelist_count ?? 0
    if (!shouldCompactDatabase(pageCount, freelistCount)) return
    const startedAt = Date.now()
    this.database.exec('VACUUM;')
    log(
      `[persistence] VACUUM reclaimed ${freelistCount} of ${pageCount} pages in ${Date.now() - startedAt}ms`,
    )
  }

  migrate(): void {
    migrateSchema(this.database)
  }

  upsertProject(project: PersistedProject): void {
    assertProjectShape(project)
    this.database
      .query<unknown, ProjectUpsertParams>(
        `INSERT INTO projects (
           id, owner_id, product, name, project_prompt, prompt_revision, state,
           device_id, workspace_key, canonical_path, git_root, git_repo_url,
           missing_confirmed_at_ms, created_at_ms, updated_at_ms
         ) VALUES (
           $id, $ownerId, $product, $name, $projectPrompt, $promptRevision,
           $state, $deviceId, $workspaceKey, $canonicalPath, $gitRoot,
           $gitRepoUrl, $missingConfirmedAt, $createdAt, $updatedAt
         )
         ON CONFLICT(id) DO UPDATE SET
           owner_id = excluded.owner_id,
           product = excluded.product,
           name = excluded.name,
           project_prompt = excluded.project_prompt,
           prompt_revision = excluded.prompt_revision,
           state = excluded.state,
           device_id = excluded.device_id,
           workspace_key = excluded.workspace_key,
           canonical_path = excluded.canonical_path,
           git_root = excluded.git_root,
           git_repo_url = excluded.git_repo_url,
           missing_confirmed_at_ms = excluded.missing_confirmed_at_ms,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run(project)
  }

  getProject(id: string): PersistedProject | undefined {
    const row = this.database
      .query<ProjectRow, { id: string }>(
        `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $id`,
      )
      .get({ id })
    return row ? toProject(row) : undefined
  }

  listProjects(): PersistedProject[] {
    return this.database
      .query<ProjectRow, []>(
        `SELECT ${PROJECT_COLUMNS}
         FROM projects
         ORDER BY created_at_ms, id`,
      )
      .all()
      .map(toProject)
  }

  deleteProject(id: string): boolean {
    const result = this.database
      .query<unknown, { id: string }>('DELETE FROM projects WHERE id = $id')
      .run({ id })
    return result.changes > 0
  }

  deleteProjectWithSessions(id: string): string[] | undefined {
    const remove = this.database.transaction(() => {
      const project = this.database
        .query<{ id: string }, { id: string }>(
          'SELECT id FROM projects WHERE id = $id',
        )
        .get({ id })
      if (!project) return undefined

      const sessionIds = this.database
        .query<{ id: string }, { id: string }>(
          'SELECT id FROM sessions WHERE project_id = $id ORDER BY id',
        )
        .all({ id })
        .map(row => row.id)
      this.database
        .query<unknown, { id: string }>(
          'DELETE FROM sessions WHERE project_id = $id',
        )
        .run({ id })
      this.database
        .query<unknown, { id: string }>('DELETE FROM projects WHERE id = $id')
        .run({ id })
      return sessionIds
    })
    return remove.immediate()
  }

  upsertEnvironment(environment: PersistedEnvironment): void {
    const { capabilities, ...values } = environment
    this.database
      .query<unknown, EnvironmentUpsertParams>(
        `INSERT INTO environments (
           id, account_id, device_id, device_name, workspace_key, machine_name,
           directory, branch, git_repo_url, max_sessions, worker_type,
           bridge_id, capabilities_json, status, username, lease_epoch,
           lease_token_hash, connection_id, last_poll_at_ms, created_at_ms,
           updated_at_ms
         ) VALUES (
           $id, $accountId, $deviceId, $deviceName, $workspaceKey, $machineName,
           $directory, $branch, $gitRepoUrl, $maxSessions, $workerType,
           $bridgeId, $capabilitiesJson, $status, $username, $leaseEpoch,
           $leaseTokenHash, $connectionId, $lastPollAt, $createdAt, $updatedAt
         )
         ON CONFLICT(id) DO UPDATE SET
           account_id = excluded.account_id,
           device_id = excluded.device_id,
           device_name = excluded.device_name,
           workspace_key = excluded.workspace_key,
           machine_name = excluded.machine_name,
           directory = excluded.directory,
           branch = excluded.branch,
           git_repo_url = excluded.git_repo_url,
           max_sessions = excluded.max_sessions,
           worker_type = excluded.worker_type,
           bridge_id = excluded.bridge_id,
           capabilities_json = excluded.capabilities_json,
           status = excluded.status,
           username = excluded.username,
           lease_epoch = excluded.lease_epoch,
           lease_token_hash = excluded.lease_token_hash,
           connection_id = excluded.connection_id,
           last_poll_at_ms = excluded.last_poll_at_ms,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run({
        ...values,
        capabilitiesJson:
          capabilities === null
            ? null
            : serializeJson(capabilities, 'environment capabilities'),
      })
  }

  getEnvironment(id: string): PersistedEnvironment | undefined {
    const row = this.database
      .query<EnvironmentRow, { id: string }>(
        `SELECT ${ENVIRONMENT_COLUMNS} FROM environments WHERE id = $id`,
      )
      .get({ id })
    return row ? toEnvironment(row) : undefined
  }

  listEnvironments(): PersistedEnvironment[] {
    return this.database
      .query<EnvironmentRow, []>(
        `SELECT ${ENVIRONMENT_COLUMNS}
         FROM environments
         ORDER BY created_at_ms, id`,
      )
      .all()
      .map(toEnvironment)
  }

  upsertSession(session: PersistedSessionInput): void {
    const modelSelection = session.modelSelection ?? null
    const desiredModelSelection =
      session.desiredModelSelection !== undefined
        ? session.desiredModelSelection
        : modelSelection
    const actualModelSelection =
      session.actualModelSelection !== undefined
        ? session.actualModelSelection
        : desiredModelSelection
    assertSessionModelSelection(modelSelection)
    assertSessionModelSelection(desiredModelSelection)
    assertSessionModelSelection(actualModelSelection)
    const values: PersistedSession = {
      ...session,
      product: session.product ?? 'code',
      projectId: session.projectId ?? null,
      runtimeEnvironmentId:
        session.runtimeEnvironmentId ?? session.environmentId ?? null,
      dataDirectory: session.dataDirectory ?? null,
      projectPromptRevision: session.projectPromptRevision ?? null,
      modelSelection,
      desiredModelSelection,
      actualModelSelection,
      modelOperationId: session.modelOperationId ?? null,
      processedOutboundSeq: session.processedOutboundSeq ?? 0,
    }
    const {
      modelSelection: _modelSelection,
      desiredModelSelection: _desiredModelSelection,
      actualModelSelection: _actualModelSelection,
      ...sessionValues
    } = values
    const queryValues = {
      ...sessionValues,
      modelProviderId: modelSelection?.providerId ?? null,
      modelProfileId: modelSelection?.modelProfileId ?? null,
      modelResolvedId: modelSelection?.resolvedModelId ?? null,
      modelConfigRevision: modelSelection?.providerConfigRevision ?? null,
      modelUpdatedAt: modelSelection?.updatedAt ?? null,
      desiredModelProviderId: desiredModelSelection?.providerId ?? null,
      desiredModelProfileId: desiredModelSelection?.modelProfileId ?? null,
      desiredModelResolvedId: desiredModelSelection?.resolvedModelId ?? null,
      desiredModelConfigRevision:
        desiredModelSelection?.providerConfigRevision ?? null,
      desiredModelUpdatedAt: desiredModelSelection?.updatedAt ?? null,
      actualModelProviderId: actualModelSelection?.providerId ?? null,
      actualModelProfileId: actualModelSelection?.modelProfileId ?? null,
      actualModelResolvedId: actualModelSelection?.resolvedModelId ?? null,
      actualModelConfigRevision:
        actualModelSelection?.providerConfigRevision ?? null,
      actualModelUpdatedAt: actualModelSelection?.updatedAt ?? null,
    }
    this.database
      .query<
        unknown,
        {
          id: string
          environmentId: string | null
          title: string | null
          status: string
          source: string
          permissionMode: string | null
          directory: string | null
          product: 'chat' | 'code'
          projectId: string | null
          runtimeEnvironmentId: string | null
          dataDirectory: string | null
          projectPromptRevision: number | null
          modelProviderId: string | null
          modelProfileId: string | null
          modelResolvedId: string | null
          modelConfigRevision: number | null
          modelUpdatedAt: number | null
          desiredModelProviderId: string | null
          desiredModelProfileId: string | null
          desiredModelResolvedId: string | null
          desiredModelConfigRevision: number | null
          desiredModelUpdatedAt: number | null
          actualModelProviderId: string | null
          actualModelProfileId: string | null
          actualModelResolvedId: string | null
          actualModelConfigRevision: number | null
          actualModelUpdatedAt: number | null
          modelOperationId: string | null
          processedOutboundSeq: number
          workerEpoch: number
          username: string | null
          archivedAt: number | null
          createdAt: number
          updatedAt: number
        }
      >(
        `INSERT INTO sessions (
           id, environment_id, title, status, source, permission_mode,
           directory, product, project_id, runtime_environment_id,
           data_directory, project_prompt_revision, model_provider_id,
           model_profile_id, model_resolved_id, model_config_revision,
           model_updated_at_ms, desired_model_provider_id,
           desired_model_profile_id, desired_model_resolved_id,
           desired_model_config_revision, desired_model_updated_at_ms,
           actual_model_provider_id, actual_model_profile_id,
           actual_model_resolved_id, actual_model_config_revision,
           actual_model_updated_at_ms, model_operation_id,
           processed_outbound_seq, worker_epoch, username, archived_at_ms,
           created_at_ms, updated_at_ms
         ) VALUES (
           $id, $environmentId, $title, $status, $source, $permissionMode,
           $directory, $product, $projectId, $runtimeEnvironmentId,
           $dataDirectory, $projectPromptRevision, $modelProviderId,
           $modelProfileId, $modelResolvedId, $modelConfigRevision,
           $modelUpdatedAt, $desiredModelProviderId, $desiredModelProfileId,
           $desiredModelResolvedId, $desiredModelConfigRevision,
           $desiredModelUpdatedAt, $actualModelProviderId,
           $actualModelProfileId, $actualModelResolvedId,
           $actualModelConfigRevision, $actualModelUpdatedAt,
           $modelOperationId, $processedOutboundSeq, $workerEpoch,
           $username, $archivedAt, $createdAt, $updatedAt
         )
         ON CONFLICT(id) DO UPDATE SET
           environment_id = excluded.environment_id,
           title = excluded.title,
           status = excluded.status,
           source = excluded.source,
           permission_mode = excluded.permission_mode,
           directory = excluded.directory,
           product = excluded.product,
           project_id = excluded.project_id,
           runtime_environment_id = excluded.runtime_environment_id,
           data_directory = excluded.data_directory,
           project_prompt_revision = excluded.project_prompt_revision,
           model_provider_id = excluded.model_provider_id,
           model_profile_id = excluded.model_profile_id,
           model_resolved_id = excluded.model_resolved_id,
           model_config_revision = excluded.model_config_revision,
           model_updated_at_ms = excluded.model_updated_at_ms,
           desired_model_provider_id = excluded.desired_model_provider_id,
           desired_model_profile_id = excluded.desired_model_profile_id,
           desired_model_resolved_id = excluded.desired_model_resolved_id,
           desired_model_config_revision = excluded.desired_model_config_revision,
           desired_model_updated_at_ms = excluded.desired_model_updated_at_ms,
           actual_model_provider_id = excluded.actual_model_provider_id,
           actual_model_profile_id = excluded.actual_model_profile_id,
           actual_model_resolved_id = excluded.actual_model_resolved_id,
           actual_model_config_revision = excluded.actual_model_config_revision,
           actual_model_updated_at_ms = excluded.actual_model_updated_at_ms,
           model_operation_id = excluded.model_operation_id,
           processed_outbound_seq = excluded.processed_outbound_seq,
           worker_epoch = excluded.worker_epoch,
           username = excluded.username,
           archived_at_ms = excluded.archived_at_ms,
           created_at_ms = excluded.created_at_ms,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run(queryValues)
  }

  getSession(id: string): PersistedSession | undefined {
    const row = this.database
      .query<SessionRow, { id: string }>(
        `SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = $id`,
      )
      .get({ id })
    return row ? toSession(row) : undefined
  }

  listSessions(): PersistedSession[] {
    return this.database
      .query<SessionRow, []>(
        `SELECT ${SESSION_COLUMNS}
         FROM sessions
         ORDER BY created_at_ms, id`,
      )
      .all()
      .map(toSession)
  }

  createEnvironmentCommand(command: PersistedEnvironmentCommand): void {
    this.database
      .query<
        unknown,
        Omit<PersistedEnvironmentCommand, 'payload' | 'result'> & {
          payloadJson: string
          resultJson: string | null
        }
      >(
        `INSERT INTO environment_commands (
           id, environment_id, owner_id, kind, payload_json, state,
           result_json, error, attempt_count, operation_id, dedupe_key,
           priority, expires_at_ms, max_attempts, created_at_ms, updated_at_ms
         ) VALUES (
           $id, $environmentId, $ownerId, $kind, $payloadJson, $state,
           $resultJson, $error, $attemptCount, $operationId, $dedupeKey,
           $priority, $expiresAt, $maxAttempts, $createdAt, $updatedAt
         )`,
      )
      .run({
        id: command.id,
        environmentId: command.environmentId,
        ownerId: command.ownerId,
        kind: command.kind,
        payloadJson: serializeJson(command.payload, 'command payload'),
        state: command.state,
        resultJson:
          command.result === null
            ? null
            : serializeJson(command.result, 'command result'),
        error: command.error,
        attemptCount: command.attemptCount,
        operationId: command.operationId ?? null,
        dedupeKey: command.dedupeKey ?? null,
        priority: command.priority ?? 100,
        expiresAt: command.expiresAt ?? null,
        maxAttempts: command.maxAttempts ?? 2,
        createdAt: command.createdAt,
        updatedAt: command.updatedAt,
      })
  }

  listPendingEnvironmentCommands(
    environmentId: string,
  ): PersistedEnvironmentCommand[] {
    return this.database
      .query<EnvironmentCommandRow, { environmentId: string }>(
        `SELECT ${ENVIRONMENT_COMMAND_COLUMNS}
         FROM environment_commands
         WHERE environment_id = $environmentId AND state = 'pending'
         ORDER BY
           priority,
           created_at_ms,
           id`,
      )
      .all({ environmentId })
      .map(toEnvironmentCommand)
  }

  listEnvironmentCommands(
    environmentId: string,
  ): PersistedEnvironmentCommand[] {
    return this.database
      .query<EnvironmentCommandRow, { environmentId: string }>(
        `SELECT ${ENVIRONMENT_COMMAND_COLUMNS}
         FROM environment_commands
         WHERE environment_id = $environmentId
         ORDER BY created_at_ms, id`,
      )
      .all({ environmentId })
      .map(toEnvironmentCommand)
  }

  getEnvironmentCommand(id: string): PersistedEnvironmentCommand | undefined {
    const row = this.database
      .query<EnvironmentCommandRow, { id: string }>(
        `SELECT ${ENVIRONMENT_COMMAND_COLUMNS}
         FROM environment_commands
         WHERE id = $id`,
      )
      .get({ id })
    return row ? toEnvironmentCommand(row) : undefined
  }

  markEnvironmentCommandDispatched(id: string, now: number): boolean {
    const result = this.database
      .query<unknown, { id: string; now: number }>(
        `UPDATE environment_commands
         SET state = 'dispatched', updated_at_ms = $now
         WHERE id = $id AND state = 'pending'`,
      )
      .run({ id, now })
    return result.changes > 0
  }

  requeueDispatchedEnvironmentCommands(
    environmentId: string,
    now: number,
  ): number {
    const result = this.database
      .query<unknown, { environmentId: string; now: number }>(
        `UPDATE environment_commands
         SET state = 'pending',
             attempt_count = attempt_count + 1,
             updated_at_ms = $now
         WHERE environment_id = $environmentId AND state = 'dispatched'
           AND (expires_at_ms IS NULL OR expires_at_ms > $now)
           AND attempt_count < max_attempts`,
      )
      .run({ environmentId, now })
    return result.changes
  }

  requeueEnvironmentCommand(id: string, now: number): boolean {
    const result = this.database
      .query<unknown, { id: string; now: number }>(
        `UPDATE environment_commands
         SET state = 'pending',
             attempt_count = attempt_count + 1,
             updated_at_ms = $now
         WHERE id = $id AND state = 'dispatched'
           AND (expires_at_ms IS NULL OR expires_at_ms > $now)
           AND attempt_count < max_attempts`,
      )
      .run({ id, now })
    return result.changes > 0
  }

  expireEnvironmentCommand(id: string, error: string, now: number): boolean {
    const result = this.database
      .query<unknown, { id: string; error: string; now: number }>(
        `UPDATE environment_commands
         SET state = 'expired', error = $error, updated_at_ms = $now
         WHERE id = $id AND state IN ('pending', 'dispatched')`,
      )
      .run({ id, error, now })
    return result.changes > 0
  }

  completeEnvironmentCommand(
    id: string,
    resultValue: unknown | null,
    error: string | null,
    now: number,
  ): boolean {
    const state = error === null ? 'completed' : 'failed'
    const result = this.database
      .query<
        unknown,
        {
          id: string
          state: 'completed' | 'failed'
          resultJson: string | null
          error: string | null
          attemptIncrement: number
          now: number
        }
      >(
        `UPDATE environment_commands
         SET state = $state,
             result_json = $resultJson,
             error = $error,
             attempt_count = attempt_count + $attemptIncrement,
             updated_at_ms = $now
         WHERE id = $id AND state IN ('pending', 'dispatched')`,
      )
      .run({
        id,
        state,
        resultJson:
          resultValue === null
            ? null
            : serializeJson(resultValue, 'command result'),
        error,
        attemptIncrement: error === null ? 0 : 1,
        now,
      })
    return result.changes > 0
  }

  deleteEnvironmentCommand(id: string): boolean {
    const result = this.database
      .query<unknown, { id: string }>(
        'DELETE FROM environment_commands WHERE id = $id',
      )
      .run({ id })
    return result.changes > 0
  }

  createSessionWorkItem(item: PersistedSessionWorkItem): void {
    this.database
      .query<unknown, Record<string, string | number | null>>(
        `INSERT INTO session_work_items (
           id, environment_id, session_id, state, worker_epoch,
           attempt_count, lease_expires_at_ms, stop_reason, created_at_ms,
           updated_at_ms, started_at_ms, completed_at_ms
         ) VALUES (
           $id, $environmentId, $sessionId, $state, $workerEpoch,
           $attemptCount, $leaseExpiresAt, $stopReason, $createdAt,
           $updatedAt, $startedAt, $completedAt
         )`,
      )
      .run(item as unknown as Record<string, string | number | null>)
  }

  getSessionWorkItem(id: string): PersistedSessionWorkItem | undefined {
    return this.database
      .query<PersistedSessionWorkItem, { id: string }>(
        `SELECT id, environment_id AS environmentId, session_id AS sessionId,
           state, worker_epoch AS workerEpoch, attempt_count AS attemptCount,
           lease_expires_at_ms AS leaseExpiresAt, stop_reason AS stopReason,
           created_at_ms AS createdAt, updated_at_ms AS updatedAt,
           started_at_ms AS startedAt, completed_at_ms AS completedAt
         FROM session_work_items WHERE id = $id`,
      )
      .get({ id }) as PersistedSessionWorkItem | undefined
  }

  getOpenSessionWorkItem(
    sessionId: string,
  ): PersistedSessionWorkItem | undefined {
    return this.database
      .query<PersistedSessionWorkItem, { sessionId: string }>(
        `SELECT id, environment_id AS environmentId, session_id AS sessionId,
           state, worker_epoch AS workerEpoch, attempt_count AS attemptCount,
           lease_expires_at_ms AS leaseExpiresAt, stop_reason AS stopReason,
           created_at_ms AS createdAt, updated_at_ms AS updatedAt,
           started_at_ms AS startedAt, completed_at_ms AS completedAt
         FROM session_work_items
         WHERE session_id = $sessionId
           AND state IN ('pending', 'dispatched', 'acked', 'stopping')
         ORDER BY created_at_ms DESC LIMIT 1`,
      )
      .get({ sessionId }) as PersistedSessionWorkItem | undefined
  }

  getPendingSessionWorkItem(
    environmentId: string,
  ): PersistedSessionWorkItem | undefined {
    return this.database
      .query<PersistedSessionWorkItem, { environmentId: string }>(
        `SELECT id, environment_id AS environmentId, session_id AS sessionId,
           state, worker_epoch AS workerEpoch, attempt_count AS attemptCount,
           lease_expires_at_ms AS leaseExpiresAt, stop_reason AS stopReason,
           created_at_ms AS createdAt, updated_at_ms AS updatedAt,
           started_at_ms AS startedAt, completed_at_ms AS completedAt
         FROM session_work_items
         WHERE environment_id = $environmentId AND state = 'pending'
         ORDER BY created_at_ms, id LIMIT 1`,
      )
      .get({ environmentId }) as PersistedSessionWorkItem | undefined
  }

  updateSessionWorkItem(
    id: string,
    patch: Partial<PersistedSessionWorkItem> & { updatedAt: number },
  ): boolean {
    const current = this.getSessionWorkItem(id)
    if (!current) return false
    const next = { ...current, ...patch }
    const result = this.database
      .query<unknown, Record<string, string | number | null>>(
        `UPDATE session_work_items SET
           state = $state, worker_epoch = $workerEpoch,
           attempt_count = $attemptCount, lease_expires_at_ms = $leaseExpiresAt,
           stop_reason = $stopReason, updated_at_ms = $updatedAt,
           started_at_ms = $startedAt, completed_at_ms = $completedAt
         WHERE id = $id`,
      )
      .run(next as unknown as Record<string, string | number | null>)
    return result.changes > 0
  }

  upsertCleanupTombstone(tombstone: PersistedCleanupTombstone): void {
    this.database
      .query<unknown, CleanupTombstoneUpsertParams>(
        `INSERT INTO cleanup_tombstones (
           session_id, environment_id, data_directory, browser_scope_id,
           attempt_count, last_error, created_at_ms, updated_at_ms
         ) VALUES (
           $sessionId, $environmentId, $dataDirectory, $browserScopeId,
           $attemptCount, $lastError, $createdAt, $updatedAt
         )
         ON CONFLICT(session_id) DO UPDATE SET
           environment_id = excluded.environment_id,
           data_directory = excluded.data_directory,
           browser_scope_id = excluded.browser_scope_id,
           attempt_count = excluded.attempt_count,
           last_error = excluded.last_error,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run(tombstone)
  }

  getCleanupTombstone(
    sessionId: string,
  ): PersistedCleanupTombstone | undefined {
    const row = this.database
      .query<CleanupTombstoneRow, { sessionId: string }>(
        `SELECT ${CLEANUP_TOMBSTONE_COLUMNS}
         FROM cleanup_tombstones
         WHERE session_id = $sessionId`,
      )
      .get({ sessionId })
    return row ? toCleanupTombstone(row) : undefined
  }

  listCleanupTombstones(environmentId?: string): PersistedCleanupTombstone[] {
    const rows = environmentId
      ? this.database
          .query<CleanupTombstoneRow, { environmentId: string }>(
            `SELECT ${CLEANUP_TOMBSTONE_COLUMNS}
             FROM cleanup_tombstones
             WHERE environment_id = $environmentId
             ORDER BY created_at_ms, session_id`,
          )
          .all({ environmentId })
      : this.database
          .query<CleanupTombstoneRow, []>(
            `SELECT ${CLEANUP_TOMBSTONE_COLUMNS}
             FROM cleanup_tombstones
             ORDER BY created_at_ms, session_id`,
          )
          .all()
    return rows.map(toCleanupTombstone)
  }

  deleteCleanupTombstone(sessionId: string): boolean {
    const result = this.database
      .query<unknown, { sessionId: string }>(
        'DELETE FROM cleanup_tombstones WHERE session_id = $sessionId',
      )
      .run({ sessionId })
    return result.changes > 0
  }

  bindOwner(sessionId: string, ownerUuid: string, createdAt: number): void {
    this.database
      .query<
        unknown,
        { sessionId: string; ownerUuid: string; createdAt: number }
      >(
        `INSERT OR IGNORE INTO session_owners (
           session_id, owner_uuid, created_at_ms
         ) VALUES ($sessionId, $ownerUuid, $createdAt)`,
      )
      .run({ sessionId, ownerUuid, createdAt })
  }

  isOwner(sessionId: string, ownerUuid: string): boolean {
    return Boolean(
      this.database
        .query<{ owned: number }, { sessionId: string; ownerUuid: string }>(
          `SELECT 1 AS owned
           FROM session_owners
           WHERE session_id = $sessionId AND owner_uuid = $ownerUuid`,
        )
        .get({ sessionId, ownerUuid }),
    )
  }

  listOwners(): PersistedSessionOwner[] {
    return this.database
      .query<OwnerRow, []>(
        `SELECT
           session_id AS sessionId,
           owner_uuid AS ownerUuid,
           created_at_ms AS createdAt
         FROM session_owners
         ORDER BY session_id, owner_uuid`,
      )
      .all()
      .map(toOwner)
  }

  upsertWorker(worker: PersistedSessionWorker): void {
    this.database
      .query<
        unknown,
        {
          sessionId: string
          workerStatus: string | null
          externalMetadataJson: string | null
          requiresActionDetailsJson: string | null
          lastHeartbeatAt: number | null
          createdAt: number
          updatedAt: number
        }
      >(
        `INSERT INTO session_workers (
           session_id, worker_status, external_metadata_json,
           requires_action_details_json, last_heartbeat_at_ms,
           created_at_ms, updated_at_ms
         ) VALUES (
           $sessionId, $workerStatus, $externalMetadataJson,
           $requiresActionDetailsJson, $lastHeartbeatAt,
           $createdAt, $updatedAt
         )
         ON CONFLICT(session_id) DO UPDATE SET
           worker_status = excluded.worker_status,
           external_metadata_json = excluded.external_metadata_json,
           requires_action_details_json = excluded.requires_action_details_json,
           last_heartbeat_at_ms = excluded.last_heartbeat_at_ms,
           created_at_ms = excluded.created_at_ms,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run({
        sessionId: worker.sessionId,
        workerStatus: worker.workerStatus,
        externalMetadataJson:
          worker.externalMetadata === null
            ? null
            : serializeJson(worker.externalMetadata, 'externalMetadata'),
        requiresActionDetailsJson:
          worker.requiresActionDetails === null
            ? null
            : serializeJson(
                worker.requiresActionDetails,
                'requiresActionDetails',
              ),
        lastHeartbeatAt: worker.lastHeartbeatAt,
        createdAt: worker.createdAt,
        updatedAt: worker.updatedAt,
      })
  }

  getWorker(sessionId: string): PersistedSessionWorker | undefined {
    const row = this.database
      .query<WorkerRow, { sessionId: string }>(
        `SELECT
           session_id AS sessionId,
           worker_status AS workerStatus,
           external_metadata_json AS externalMetadataJson,
           requires_action_details_json AS requiresActionDetailsJson,
           last_heartbeat_at_ms AS lastHeartbeatAt,
           created_at_ms AS createdAt,
           updated_at_ms AS updatedAt
         FROM session_workers
         WHERE session_id = $sessionId`,
      )
      .get({ sessionId })
    return row ? toWorker(row) : undefined
  }

  commitEvent(input: PersistedEventInput): PersistedEventCommitResult {
    const payloadJson = serializeJson(input.payload, 'payload')
    const commit = this.database.transaction(() => {
      if (input.dedupeScope !== null && input.sourceEventId !== null) {
        const existing = this.database
          .query<
            EventRow,
            {
              sessionId: string
              dedupeScope: string
              sourceEventId: string
            }
          >(
            `SELECT ${EVENT_COLUMNS}
             FROM session_events
             WHERE session_id = $sessionId
               AND dedupe_scope = $dedupeScope
               AND source_event_id = $sourceEventId`,
          )
          .get({
            sessionId: input.sessionId,
            dedupeScope: input.dedupeScope,
            sourceEventId: input.sourceEventId,
          })

        if (existing) {
          if (
            existing.payloadJson !== payloadJson &&
            canonicalizeSerializedJson(existing.payloadJson) !== payloadJson
          ) {
            throw new IdempotencyConflictError(
              input.sessionId,
              input.dedupeScope,
              input.sourceEventId,
            )
          }
          return { event: toEvent(existing), duplicate: true }
        }
      }

      const sequence = this.database
        .query<{ seqNum: number }, { sessionId: string }>(
          `UPDATE sessions
           SET last_seq = last_seq + 1
           WHERE id = $sessionId
           RETURNING last_seq AS seqNum`,
        )
        .get({ sessionId: input.sessionId })

      if (!sequence) {
        throw new Error(
          `Cannot commit event for missing session ${input.sessionId}`,
        )
      }

      this.database
        .query<
          unknown,
          {
            id: string
            sessionId: string
            seqNum: number
            type: string
            direction: 'inbound' | 'outbound'
            payloadJson: string
            sourceEventId: string | null
            dedupeScope: string | null
            createdAt: number
          }
        >(
          `INSERT INTO session_events (
             id, session_id, seq_num, type, direction, payload_json,
             source_event_id, dedupe_scope, created_at_ms
           ) VALUES (
             $id, $sessionId, $seqNum, $type, $direction, $payloadJson,
             $sourceEventId, $dedupeScope, $createdAt
           )`,
        )
        .run({
          id: input.id,
          sessionId: input.sessionId,
          seqNum: sequence.seqNum,
          type: input.type,
          direction: input.direction,
          payloadJson,
          sourceEventId: input.sourceEventId,
          dedupeScope: input.dedupeScope,
          createdAt: input.createdAt,
        })

      // Retention-capped protocol traffic: keep only the newest `keep` rows
      // of this event class so request/response noise (e.g. ~100KB initialize
      // control_responses) cannot grow the database or crowd replay windows.
      for (const cap of DURABLE_EVENT_RETENTION_CAPS) {
        if (cap.type !== input.type || cap.direction !== input.direction) {
          continue
        }
        this.database
          .query<
            unknown,
            {
              sessionId: string
              type: string
              direction: string
              keep: number
            }
          >(
            `DELETE FROM session_events
             WHERE session_id = $sessionId
               AND type = $type
               AND direction = $direction
               AND seq_num <= (
                 SELECT seq_num FROM session_events
                 WHERE session_id = $sessionId
                   AND type = $type
                   AND direction = $direction
                 ORDER BY seq_num DESC
                 LIMIT 1 OFFSET $keep
               )`,
          )
          .run({
            sessionId: input.sessionId,
            type: input.type,
            direction: input.direction,
            keep: cap.keep,
          })
      }

      return {
        event: { ...input, seqNum: sequence.seqNum },
        duplicate: false,
      }
    })

    return commit.immediate()
  }

  listEvents(
    sessionId: string,
    afterSeq: number,
    limit: number,
  ): PersistedEventPage {
    const rows = this.database
      .query<EventRow, { sessionId: string; afterSeq: number; limit: number }>(
        `SELECT ${EVENT_COLUMNS}
         FROM session_events
         WHERE session_id = $sessionId AND seq_num > $afterSeq
         ORDER BY seq_num
         LIMIT $limit`,
      )
      .all({ sessionId, afterSeq, limit })
    return { events: rows.map(toEvent) }
  }

  /**
   * The newest `limit` events, returned in ascending seq order. Replay
   * anchors must use this instead of `last_seq - N` arithmetic: retention
   * pruning and migrations leave seq gaps, so a fixed arithmetic window can
   * land on a range with no surviving rows and replay nothing at all.
   */
  listEventsTail(sessionId: string, limit: number): PersistedEventPage {
    const rows = this.database
      .query<EventRow, { sessionId: string; limit: number }>(
        `SELECT ${EVENT_COLUMNS}
         FROM session_events
         WHERE session_id = $sessionId
         ORDER BY seq_num DESC
         LIMIT $limit`,
      )
      .all({ sessionId, limit })
    rows.reverse()
    return { events: rows.map(toEvent) }
  }

  insertInternalEvents(inputs: readonly PersistedInternalEventInput[]): {
    inserted: number
  } {
    if (inputs.length === 0) return { inserted: 0 }

    const insert = this.database.transaction(() => {
      let inserted = 0
      for (const input of inputs) {
        const result = this.database
          .query<
            unknown,
            {
              sessionId: string
              eventId: string
              eventType: string
              payloadJson: string
              eventMetadataJson: string | null
              isCompaction: number
              agentId: string | null
              createdAt: number
            }
          >(
            `INSERT OR IGNORE INTO session_internal_events (
               session_id, event_id, event_type, payload_json,
               event_metadata_json, is_compaction, agent_id, created_at_ms
             ) VALUES (
               $sessionId, $eventId, $eventType, $payloadJson,
               $eventMetadataJson, $isCompaction, $agentId, $createdAt
             )`,
          )
          .run({
            sessionId: input.sessionId,
            eventId: input.eventId,
            eventType: input.eventType,
            payloadJson: serializeJson(input.payload, 'internal event payload'),
            eventMetadataJson:
              input.eventMetadata === null
                ? null
                : serializeJson(input.eventMetadata, 'internal event metadata'),
            isCompaction: input.isCompaction ? 1 : 0,
            agentId: input.agentId,
            createdAt: input.createdAt,
          })
        inserted += result.changes
      }
      return { inserted }
    })

    return insert.immediate()
  }

  listInternalEvents(
    sessionId: string,
    {
      after,
      limit = 100,
      subagents = false,
    }: {
      after?: PersistedInternalEventCursor
      limit?: number
      subagents?: boolean
    } = {},
  ): PersistedInternalEventPage {
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 500))
    const rows = this.database
      .query<
        InternalEventRow,
        {
          sessionId: string
          afterCreatedAt: number
          afterEventId: string
          limit: number
          subagents: number
        }
      >(
        `SELECT
           session_id AS sessionId,
           event_id AS eventId,
           event_type AS eventType,
           payload_json AS payloadJson,
           event_metadata_json AS eventMetadataJson,
           is_compaction AS isCompaction,
           agent_id AS agentId,
           created_at_ms AS createdAt
         FROM session_internal_events
         WHERE session_id = $sessionId
           AND (
             $subagents = 1 AND agent_id IS NOT NULL
             OR $subagents = 0 AND agent_id IS NULL
           )
           AND (
             $afterCreatedAt < 0
             OR created_at_ms > $afterCreatedAt
             OR (created_at_ms = $afterCreatedAt AND event_id > $afterEventId)
           )
         ORDER BY created_at_ms, event_id
         LIMIT $limit`,
      )
      .all({
        sessionId,
        afterCreatedAt: after?.createdAt ?? -1,
        afterEventId: after?.eventId ?? '',
        limit: safeLimit + 1,
        subagents: subagents ? 1 : 0,
      })

    const hasMore = rows.length > safeLimit
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows
    const events = pageRows.map(toInternalEvent)
    const last = events.at(-1)
    return {
      events,
      ...(hasMore && last
        ? { nextCursor: { createdAt: last.createdAt, eventId: last.eventId } }
        : {}),
    }
  }

  /** Read the newest system/init using the reverse system-event index. */
  getLatestSessionInitEvent(
    sessionId: string,
  ): PersistedSessionEvent | undefined {
    const query = this.database.query<
      EventRow,
      { sessionId: string; beforeSeq: number; limit: number }
    >(
      `SELECT ${EVENT_COLUMNS}
         FROM session_events
         WHERE session_id = $sessionId
           AND type = 'system'
           AND seq_num < $beforeSeq
         ORDER BY seq_num DESC
         LIMIT $limit`,
    )
    let beforeSeq = Number.MAX_SAFE_INTEGER
    const limit = 64
    while (true) {
      const rows = query.all({ sessionId, beforeSeq, limit })
      for (const row of rows) {
        const event = toEvent(row)
        if (
          event.payload !== null &&
          typeof event.payload === 'object' &&
          !Array.isArray(event.payload)
        ) {
          const normalized = event.payload as Record<string, unknown>
          const raw = normalized['raw']
          const payload =
            raw !== null && typeof raw === 'object' && !Array.isArray(raw)
              ? (raw as Record<string, unknown>)
              : normalized
          if (payload['subtype'] === 'init') return event
        }
      }
      if (rows.length < limit) return undefined
      beforeSeq = rows[rows.length - 1]!.seqNum
    }
  }

  getLastSeq(sessionId: string): number {
    return (
      this.database
        .query<{ lastSeq: number }, { sessionId: string }>(
          `SELECT last_seq AS lastSeq FROM sessions WHERE id = $sessionId`,
        )
        .get({ sessionId })?.lastSeq ?? 0
    )
  }

  recordEventDelivery(
    sessionId: string,
    eventId: string,
    workerEpoch: number,
    status: EventDeliveryStatus,
    now = Date.now(),
  ): PersistedEventDelivery | undefined {
    const event = this.database
      .query<
        { id: string; seqNum: number },
        { sessionId: string; eventId: string }
      >(
        `SELECT id, seq_num AS seqNum
         FROM session_events
         WHERE session_id = $sessionId
           AND direction = 'outbound'
           AND (id = $eventId OR source_event_id = $eventId)
         ORDER BY CASE WHEN id = $eventId THEN 0 ELSE 1 END
         LIMIT 1`,
      )
      .get({ sessionId, eventId })
    if (!event) return undefined
    const canonicalEventId = event.id

    const receivedAt = status === 'received' ? now : null
    const processingAt = status === 'processing' ? now : null
    const processedAt = status === 'processed' ? now : null
    this.database
      .query<
        unknown,
        {
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
      >(
        `INSERT INTO session_event_deliveries (
           session_id, event_id, sequence_num, worker_epoch, status,
           received_at_ms, processing_at_ms, processed_at_ms, updated_at_ms
         ) VALUES (
           $sessionId, $eventId, $sequenceNum, $workerEpoch, $status,
           $receivedAt, $processingAt, $processedAt, $updatedAt
         )
         ON CONFLICT(session_id, event_id) DO UPDATE SET
           worker_epoch = excluded.worker_epoch,
           status = CASE
             WHEN session_event_deliveries.status = 'processed' THEN 'processed'
             WHEN excluded.status = 'processed' THEN 'processed'
             WHEN session_event_deliveries.status = 'processing' THEN 'processing'
             ELSE excluded.status
           END,
           received_at_ms = COALESCE(
             session_event_deliveries.received_at_ms,
             excluded.received_at_ms
           ),
           processing_at_ms = COALESCE(
             session_event_deliveries.processing_at_ms,
             excluded.processing_at_ms
           ),
           processed_at_ms = COALESCE(
             session_event_deliveries.processed_at_ms,
             excluded.processed_at_ms
           ),
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run({
        sessionId,
        eventId: canonicalEventId,
        sequenceNum: event.seqNum,
        workerEpoch,
        status,
        receivedAt,
        processingAt,
        processedAt,
        updatedAt: now,
      })
    if (status === 'processed') {
      this.resolveOutboundEvent(
        sessionId,
        canonicalEventId,
        'processed',
        workerEpoch,
        'worker_delivery_processed',
        now,
      )
    }
    return this.getEventDelivery(sessionId, canonicalEventId)
  }

  resolveOutboundEvent(
    sessionId: string,
    eventId: string,
    resolution: OutboundResolution,
    workerEpoch: number,
    reason: string | null = null,
    now = Date.now(),
  ): boolean {
    const transaction = this.database.transaction(() => {
      const event = this.database
        .query<
          { id: string; seqNum: number },
          { sessionId: string; eventId: string }
        >(
          `SELECT id, seq_num AS seqNum
           FROM session_events
           WHERE session_id = $sessionId AND direction = 'outbound'
             AND (id = $eventId OR source_event_id = $eventId)
           ORDER BY CASE WHEN id = $eventId THEN 0 ELSE 1 END
           LIMIT 1`,
        )
        .get({ sessionId, eventId })
      if (!event) return false

      this.database
        .query<
          unknown,
          {
            sessionId: string
            eventId: string
            sequenceNum: number
            resolution: OutboundResolution
            workerEpoch: number
            reason: string | null
            resolvedAt: number
          }
        >(
          `INSERT INTO session_outbound_resolutions (
             session_id, event_id, sequence_num, resolution, worker_epoch,
             reason, resolved_at_ms
           ) VALUES (
             $sessionId, $eventId, $sequenceNum, $resolution, $workerEpoch,
             $reason, $resolvedAt
           )
           ON CONFLICT(session_id, event_id) DO UPDATE SET
             resolution = CASE
               WHEN session_outbound_resolutions.resolution = 'processed'
                 THEN 'processed'
               WHEN excluded.resolution = 'processed' THEN 'processed'
               ELSE session_outbound_resolutions.resolution
             END,
             worker_epoch = excluded.worker_epoch,
             reason = COALESCE(session_outbound_resolutions.reason, excluded.reason),
             resolved_at_ms = MIN(session_outbound_resolutions.resolved_at_ms, excluded.resolved_at_ms)`,
        )
        .run({
          sessionId,
          eventId: event.id,
          sequenceNum: event.seqNum,
          resolution,
          workerEpoch,
          reason,
          resolvedAt: now,
        })

      if (resolution === 'processed') {
        this.database
          .query<unknown, { sessionId: string; eventId: string; now: number }>(
            `UPDATE session_event_deliveries
             SET status = 'processed', processed_at_ms = COALESCE(processed_at_ms, $now),
                 updated_at_ms = $now
             WHERE session_id = $sessionId AND event_id = $eventId`,
          )
          .run({ sessionId, eventId: event.id, now })
      }

      const session = this.database
        .query<{ processedSeq: number }, { sessionId: string }>(
          `SELECT processed_outbound_seq AS processedSeq
           FROM sessions WHERE id = $sessionId`,
        )
        .get({ sessionId })
      if (!session) return true
      const [
        userType,
        controlRequestType,
        controlResponseType,
        permissionType,
      ] = DURABLE_OUTBOUND_EVENT_TYPES
      const candidates = this.database
        .query<
          { seqNum: number; resolved: number },
          {
            sessionId: string
            afterSeq: number
            userType: string
            controlRequestType: string
            controlResponseType: string
            permissionType: string
          }
        >(
          `SELECT events.seq_num AS seqNum,
             CASE WHEN resolutions.resolution IS NOT NULL
                    OR deliveries.status = 'processed' THEN 1 ELSE 0 END AS resolved
           FROM session_events AS events
           LEFT JOIN session_outbound_resolutions AS resolutions
             ON resolutions.session_id = events.session_id
            AND resolutions.event_id = events.id
           LEFT JOIN session_event_deliveries AS deliveries
             ON deliveries.session_id = events.session_id
            AND deliveries.event_id = events.id
           WHERE events.session_id = $sessionId
             AND events.direction = 'outbound'
             AND events.type IN ($userType, $controlRequestType, $controlResponseType, $permissionType)
             AND events.seq_num > $afterSeq
           ORDER BY events.seq_num`,
        )
        .all({
          sessionId,
          afterSeq: session.processedSeq,
          userType,
          controlRequestType,
          controlResponseType,
          permissionType,
        })
      let watermark = session.processedSeq
      for (const candidate of candidates) {
        if (candidate.resolved !== 1) break
        watermark = candidate.seqNum
      }
      if (watermark !== session.processedSeq) {
        this.database
          .query<
            unknown,
            { sessionId: string; watermark: number; now: number }
          >(
            `UPDATE sessions
             SET processed_outbound_seq = $watermark, updated_at_ms = $now
             WHERE id = $sessionId`,
          )
          .run({ sessionId, watermark, now })
      }
      return true
    })
    return transaction.immediate()
  }

  getProcessedOutboundSeq(sessionId: string): number {
    return (
      this.database
        .query<{ processedSeq: number }, { sessionId: string }>(
          `SELECT processed_outbound_seq AS processedSeq
           FROM sessions WHERE id = $sessionId`,
        )
        .get({ sessionId })?.processedSeq ?? 0
    )
  }

  getEventDelivery(
    sessionId: string,
    eventId: string,
  ): PersistedEventDelivery | undefined {
    return this.database
      .query<EventDeliveryRow, { sessionId: string; eventId: string }>(
        `SELECT
           session_id AS sessionId,
           event_id AS eventId,
           sequence_num AS sequenceNum,
           worker_epoch AS workerEpoch,
           status,
           received_at_ms AS receivedAt,
           processing_at_ms AS processingAt,
           processed_at_ms AS processedAt,
           updated_at_ms AS updatedAt
         FROM session_event_deliveries
         WHERE session_id = $sessionId AND event_id = $eventId`,
      )
      .get({ sessionId, eventId }) as PersistedEventDelivery | undefined
  }

  isEventProcessed(sessionId: string, eventId: string): boolean {
    return (
      this.database
        .query<{ processed: number }, { sessionId: string; eventId: string }>(
          `SELECT CASE WHEN status = 'processed' THEN 1 ELSE 0 END AS processed
           FROM session_event_deliveries
           WHERE session_id = $sessionId AND event_id = $eventId`,
        )
        .get({ sessionId, eventId })?.processed === 1
    )
  }

  getEarliestUnprocessedOutboundSeq(sessionId: string): number | undefined {
    const [user, controlRequest, controlResponse, permissionResponse] =
      DURABLE_OUTBOUND_EVENT_TYPES
    const row = this.database
      .query<
        { sequenceNum: number | null },
        {
          sessionId: string
          user: string
          controlRequest: string
          controlResponse: string
          permissionResponse: string
        }
      >(
        `SELECT MIN(events.seq_num) AS sequenceNum
         FROM session_events AS events
         LEFT JOIN session_event_deliveries AS deliveries
           ON deliveries.session_id = events.session_id
          AND deliveries.event_id = events.id
         LEFT JOIN session_outbound_resolutions AS resolutions
           ON resolutions.session_id = events.session_id
          AND resolutions.event_id = events.id
         WHERE events.session_id = $sessionId
           AND events.direction = 'outbound'
           AND events.type IN (
             $user, $controlRequest, $controlResponse, $permissionResponse
           )
           AND events.seq_num > (
             SELECT processed_outbound_seq FROM sessions WHERE id = $sessionId
           )
           AND resolutions.resolution IS NULL
           AND (deliveries.status IS NULL OR deliveries.status != 'processed')`,
      )
      .get({
        sessionId,
        user,
        controlRequest,
        controlResponse,
        permissionResponse,
      })
    return typeof row?.sequenceNum === 'number' ? row.sequenceNum : undefined
  }

  archiveSession(sessionId: string, now: number): boolean {
    const result = this.database
      .query<unknown, { sessionId: string; now: number }>(
        `UPDATE sessions
         SET status = 'archived', archived_at_ms = $now, updated_at_ms = $now
         WHERE id = $sessionId AND archived_at_ms IS NULL`,
      )
      .run({ sessionId, now })
    return result.changes > 0
  }

  restoreSession(sessionId: string, now: number): boolean {
    const result = this.database
      .query<unknown, { sessionId: string; now: number }>(
        `UPDATE sessions
         SET status = 'idle', archived_at_ms = NULL, updated_at_ms = $now
         WHERE id = $sessionId
           AND (archived_at_ms IS NOT NULL OR status = 'archived')`,
      )
      .run({ sessionId, now })
    return result.changes > 0
  }

  deleteSession(sessionId: string): boolean {
    const result = this.database
      .query<unknown, { sessionId: string }>(
        'DELETE FROM sessions WHERE id = $sessionId',
      )
      .run({ sessionId })
    return result.changes > 0
  }

  reset(): void {
    const reset = this.database.transaction(() => {
      this.database.exec('DELETE FROM cleanup_tombstones')
      this.database.exec('DELETE FROM environment_commands')
      this.database.exec('DELETE FROM session_workers')
      this.database.exec('DELETE FROM session_event_deliveries')
      this.database.exec('DELETE FROM session_events')
      this.database.exec('DELETE FROM session_owners')
      this.database.exec('DELETE FROM sessions')
      this.database.exec('DELETE FROM projects')
      this.database.exec('DELETE FROM environments')
    })
    reset.immediate()
  }

  close(): void {
    this.database.close()
  }
}
