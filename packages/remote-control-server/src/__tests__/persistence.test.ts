import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  IdempotencyConflictError,
  RcsDatabase,
  shouldCompactDatabase,
} from '../persistence/database'
import type {
  PersistedEnvironmentCommand,
  PersistedSessionInput,
} from '../persistence/types'

describe('RcsDatabase', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('migrates idempotently and restores sessions, owners, and events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const path = join(dir, 'rcs.sqlite')
    const first = new RcsDatabase(path)
    first.upsertSession({
      id: 'session-1',
      environmentId: null,
      title: 'Saved',
      status: 'idle',
      source: 'web',
      permissionMode: 'default',
      directory: '/workspace/project',
      workerEpoch: 0,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
    })
    first.bindOwner('session-1', 'owner-1', 100)
    const committed = first.commitEvent({
      id: 'event-1',
      sessionId: 'session-1',
      type: 'user',
      payload: { content: 'hello', uuid: 'message-1' },
      direction: 'outbound',
      sourceEventId: 'message-1',
      dedupeScope: 'web:outbound:user',
      createdAt: 101,
    })
    expect(committed.duplicate).toBe(false)
    expect(committed.event.seqNum).toBe(1)
    first.close()

    const second = new RcsDatabase(path)
    expect(second.getSession('session-1')?.title).toBe('Saved')
    expect(second.getSession('session-1')?.directory).toBe('/workspace/project')
    expect(second.isOwner('session-1', 'owner-1')).toBe(true)
    expect(second.listEvents('session-1', 0, 100).events).toHaveLength(1)
    second.migrate()
    second.close()
  })

  test('finds the latest system init without returning newer system events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const database = new RcsDatabase(join(dir, 'rcs.sqlite'))
    database.upsertSession({
      id: 'session-init',
      environmentId: null,
      title: null,
      status: 'idle',
      source: 'web',
      permissionMode: null,
      directory: null,
      workerEpoch: 0,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
    })
    for (const [id, payload, createdAt] of [
      ['old-init', { subtype: 'init', model: 'old-model' }, 101],
      ['status', { subtype: 'status', status: 'idle' }, 102],
      ['latest-init', { raw: { subtype: 'init', model: 'new-model' } }, 103],
      ['changed', { subtype: 'session_model_changed' }, 104],
    ] as const) {
      database.commitEvent({
        id,
        sessionId: 'session-init',
        type: 'system',
        payload,
        direction: 'inbound',
        sourceEventId: id,
        dedupeScope: 'test:inbound:system',
        createdAt,
      })
    }

    expect(database.getLatestSessionInitEvent('session-init')).toMatchObject({
      id: 'latest-init',
      createdAt: 103,
    })
    database.close()
  })

  test('version 7 migrates old sessions and persists an atomic model snapshot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const path = join(dir, 'rcs.sqlite')
    const legacy = new Database(path)
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at_ms INTEGER NOT NULL
      );
      INSERT INTO schema_migrations(version, applied_at_ms)
      VALUES (1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 1);
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        environment_id TEXT,
        title TEXT,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        permission_mode TEXT,
        worker_epoch INTEGER NOT NULL DEFAULT 0,
        username TEXT,
        last_seq INTEGER NOT NULL DEFAULT 0,
        archived_at_ms INTEGER,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        directory TEXT,
        product TEXT NOT NULL DEFAULT 'code',
        project_id TEXT,
        runtime_environment_id TEXT,
        data_directory TEXT,
        project_prompt_revision INTEGER
      );
      CREATE TABLE session_events (
        session_id TEXT NOT NULL,
        seq_num INTEGER NOT NULL,
        id TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        direction TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        source_event_id TEXT,
        dedupe_scope TEXT,
        created_at_ms INTEGER NOT NULL
      );
      INSERT INTO sessions (
        id, status, source, worker_epoch, created_at_ms, updated_at_ms,
        product
      ) VALUES ('legacy-session', 'idle', 'web', 0, 100, 100, 'code');
    `)
    legacy.close()

    const database = new RcsDatabase(path)
    expect(database.getSession('legacy-session')?.modelSelection).toBeNull()
    database.upsertSession({
      id: 'model-session',
      environmentId: null,
      title: null,
      status: 'idle',
      source: 'web',
      permissionMode: null,
      directory: null,
      workerEpoch: 0,
      username: null,
      createdAt: 200,
      updatedAt: 200,
      archivedAt: null,
      modelSelection: {
        providerId: 'custom-openai',
        modelProfileId: 'model-b',
        resolvedModelId: 'remote-b',
        providerConfigRevision: 7,
        updatedAt: 123,
      },
    })
    database.migrate()
    database.close()

    const reopened = new RcsDatabase(path)
    expect(reopened.getSession('model-session')?.modelSelection).toEqual({
      providerId: 'custom-openai',
      modelProfileId: 'model-b',
      resolvedModelId: 'remote-b',
      providerConfigRevision: 7,
      updatedAt: 123,
    })
    reopened.close()
  })

  test('rejects incomplete session model selections', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const path = join(dir, 'rcs.sqlite')
    const database = new RcsDatabase(path)
    const invalid = {
      id: 'invalid-model-session',
      environmentId: null,
      title: null,
      status: 'idle',
      source: 'web',
      permissionMode: null,
      directory: null,
      workerEpoch: 0,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
      modelSelection: { providerId: 'custom-openai' },
    } as unknown as PersistedSessionInput

    expect(() => database.upsertSession(invalid)).toThrow(
      'invalid persisted session model selection',
    )
    database.upsertSession({
      ...invalid,
      id: 'corrupt-model-session',
      modelSelection: null,
    })
    database.close()

    const raw = new Database(path)
    raw
      .query(
        `UPDATE sessions
         SET model_provider_id = 'custom-openai'
         WHERE id = 'corrupt-model-session'`,
      )
      .run()
    raw.close()

    const reopened = new RcsDatabase(path)
    expect(() => reopened.getSession('corrupt-model-session')).toThrow(
      'invalid persisted session model selection',
    )
    reopened.close()
  })

  test('persists monotonic outbound delivery state across restarts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const path = join(dir, 'rcs.sqlite')
    const first = new RcsDatabase(path)
    first.upsertSession({
      id: 'session-delivery',
      environmentId: null,
      title: null,
      status: 'idle',
      source: 'web',
      permissionMode: null,
      directory: null,
      workerEpoch: 2,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
    })
    first.commitEvent({
      id: 'event-delivery',
      sessionId: 'session-delivery',
      type: 'user',
      payload: { content: 'hello' },
      direction: 'outbound',
      sourceEventId: 'message-delivery',
      dedupeScope: 'web:outbound:user',
      createdAt: 101,
    })

    first.recordEventDelivery(
      'session-delivery',
      'event-delivery',
      1,
      'received',
      110,
    )
    first.recordEventDelivery(
      'session-delivery',
      'event-delivery',
      1,
      'processing',
      120,
    )
    first.recordEventDelivery(
      'session-delivery',
      'event-delivery',
      1,
      'processed',
      130,
    )
    first.recordEventDelivery(
      'session-delivery',
      'event-delivery',
      2,
      'received',
      140,
    )
    first.close()

    const second = new RcsDatabase(path)
    expect(
      second.getEventDelivery('session-delivery', 'event-delivery'),
    ).toEqual({
      sessionId: 'session-delivery',
      eventId: 'event-delivery',
      sequenceNum: 1,
      workerEpoch: 2,
      status: 'processed',
      receivedAt: 110,
      processingAt: 120,
      processedAt: 130,
      updatedAt: 140,
    })
    expect(second.isEventProcessed('session-delivery', 'event-delivery')).toBe(
      true,
    )
    second.close()
  })

  test('resolves delivery acknowledgements sent with the source event ID', () => {
    const database = new RcsDatabase(':memory:')
    database.upsertSession({
      id: 'session-source-delivery',
      environmentId: null,
      title: null,
      status: 'idle',
      source: 'web',
      permissionMode: null,
      directory: null,
      workerEpoch: 1,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
    })
    database.commitEvent({
      id: 'server-event-1',
      sessionId: 'session-source-delivery',
      type: 'user',
      payload: { content: 'hello', uuid: 'payload-event-1' },
      direction: 'outbound',
      sourceEventId: 'payload-event-1',
      dedupeScope: 'web:outbound:user',
      createdAt: 101,
    })

    expect(
      database.recordEventDelivery(
        'session-source-delivery',
        'payload-event-1',
        1,
        'processed',
        110,
      ),
    ).toMatchObject({
      eventId: 'server-event-1',
      status: 'processed',
    })
    database.close()
  })

  test('persists CCR internal events idempotently and pages by agent scope', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const database = new RcsDatabase(join(dir, 'rcs.sqlite'))
    database.upsertSession({
      id: 'session-internal-events',
      environmentId: null,
      title: null,
      status: 'idle',
      source: 'web',
      permissionMode: null,
      directory: null,
      workerEpoch: 1,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
    })

    expect(
      database.insertInternalEvents([
        {
          sessionId: 'session-internal-events',
          eventId: 'foreground-1',
          eventType: 'transcript',
          payload: { type: 'user', content: 'hello' },
          eventMetadata: null,
          isCompaction: false,
          agentId: null,
          createdAt: 101,
        },
        {
          sessionId: 'session-internal-events',
          eventId: 'agent-1',
          eventType: 'transcript',
          payload: { type: 'assistant', content: 'tool result' },
          eventMetadata: { source: 'subagent' },
          isCompaction: false,
          agentId: 'agent-a',
          createdAt: 102,
        },
        {
          sessionId: 'session-internal-events',
          eventId: 'foreground-2',
          eventType: 'transcript',
          payload: { type: 'assistant', content: 'world' },
          eventMetadata: null,
          isCompaction: true,
          agentId: null,
          createdAt: 103,
        },
      ]),
    ).toEqual({ inserted: 3 })

    expect(
      database.insertInternalEvents([
        {
          sessionId: 'session-internal-events',
          eventId: 'foreground-1',
          eventType: 'transcript',
          payload: { type: 'user', content: 'hello' },
          eventMetadata: null,
          isCompaction: false,
          agentId: null,
          createdAt: 101,
        },
      ]),
    ).toEqual({ inserted: 0 })

    expect(
      database.listInternalEvents('session-internal-events', {
        limit: 1,
        subagents: false,
      }),
    ).toMatchObject({
      events: [
        {
          eventId: 'foreground-1',
          eventType: 'transcript',
          payload: { type: 'user', content: 'hello' },
          agentId: null,
        },
      ],
      nextCursor: { createdAt: 101, eventId: 'foreground-1' },
    })

    expect(
      database
        .listInternalEvents('session-internal-events', {
          limit: 10,
          after: { createdAt: 101, eventId: 'foreground-1' },
          subagents: false,
        })
        .events.map(event => event.eventId),
    ).toEqual(['foreground-2'])
    expect(
      database
        .listInternalEvents('session-internal-events', {
          limit: 10,
          subagents: true,
        })
        .events.map(event => event.eventId),
    ).toEqual(['agent-1'])
    database.close()
  })

  test('ignores non-deliverable outbound history when locating replay work', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const database = new RcsDatabase(join(dir, 'rcs.sqlite'))
    database.upsertSession({
      id: 'session-policy-replay',
      environmentId: null,
      title: null,
      status: 'idle',
      source: 'web',
      permissionMode: null,
      directory: null,
      workerEpoch: 0,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
    })
    database.commitEvent({
      id: 'event-unsupported-outbound',
      sessionId: 'session-policy-replay',
      type: 'automation_state',
      payload: { enabled: true },
      direction: 'outbound',
      sourceEventId: null,
      dedupeScope: null,
      createdAt: 101,
    })

    expect(
      database.getEarliestUnprocessedOutboundSeq('session-policy-replay'),
    ).toBeUndefined()
    database.close()
  })

  test('live-event migrations remove terminal and outbound interrupt history without renumbering', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const path = join(dir, 'rcs.sqlite')
    const first = new RcsDatabase(path)
    first.upsertSession({
      id: 'session-migrate-terminal',
      environmentId: null,
      title: null,
      status: 'idle',
      source: 'web',
      permissionMode: null,
      directory: null,
      workerEpoch: 0,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
    })
    first.commitEvent({
      id: 'event-terminal',
      sessionId: 'session-migrate-terminal',
      type: 'terminal_input',
      payload: { data: 'must-not-survive' },
      direction: 'outbound',
      sourceEventId: null,
      dedupeScope: null,
      createdAt: 101,
    })
    first.commitEvent({
      id: 'event-interrupt',
      sessionId: 'session-migrate-terminal',
      type: 'interrupt',
      payload: { action: 'interrupt' },
      direction: 'outbound',
      sourceEventId: null,
      dedupeScope: null,
      createdAt: 102,
    })
    first.commitEvent({
      id: 'event-user',
      sessionId: 'session-migrate-terminal',
      type: 'user',
      payload: { content: 'keep me' },
      direction: 'outbound',
      sourceEventId: 'message-user',
      dedupeScope: 'web:outbound:user',
      createdAt: 103,
    })
    first.commitEvent({
      id: 'event-terminal-word',
      sessionId: 'session-migrate-terminal',
      type: 'terminalNotice',
      payload: { content: 'not a terminal protocol event' },
      direction: 'inbound',
      sourceEventId: null,
      dedupeScope: null,
      createdAt: 104,
    })
    first.close()

    const raw = new Database(path)
    raw.query('DELETE FROM schema_migrations WHERE version = 5').run()
    raw.query('DELETE FROM schema_migrations WHERE version = 6').run()
    raw.close()

    const second = new RcsDatabase(path)
    const events = second.listEvents('session-migrate-terminal', 0, 100).events
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ id: 'event-user', seqNum: 3 })
    expect(events[1]).toMatchObject({ id: 'event-terminal-word', seqNum: 4 })
    expect(second.getLastSeq('session-migrate-terminal')).toBe(4)
    second.close()
  })

  test('persists stable environments across database restarts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const path = join(dir, 'rcs.sqlite')
    const first = new RcsDatabase(path)
    first.upsertEnvironment({
      id: 'env-stable',
      accountId: 'single-user',
      deviceId: 'device-a',
      deviceName: 'macbook',
      workspaceKey: 'wrk-repo',
      machineName: 'macbook',
      directory: '/repo',
      branch: 'main',
      gitRepoUrl: 'https://example.test/repo.git',
      maxSessions: 4,
      workerType: 'claude_code',
      bridgeId: null,
      capabilities: { terminal: true },
      status: 'active',
      username: null,
      leaseEpoch: 2,
      leaseTokenHash: 'hash',
      connectionId: 'connection-a',
      lastPollAt: 120,
      createdAt: 100,
      updatedAt: 120,
    })
    first.close()

    const second = new RcsDatabase(path)
    expect(second.getEnvironment('env-stable')).toMatchObject({
      accountId: 'single-user',
      deviceId: 'device-a',
      workspaceKey: 'wrk-repo',
      leaseEpoch: 2,
      connectionId: 'connection-a',
    })
    expect(second.listEnvironments()).toHaveLength(1)
    second.close()
  })

  test('canonicalizes nested object keys for idempotency while preserving changed values', () => {
    const database = new RcsDatabase(':memory:')
    database.upsertSession({
      id: 'session-1',
      environmentId: null,
      title: null,
      status: 'idle',
      source: 'web',
      permissionMode: null,
      directory: null,
      workerEpoch: 0,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
    })

    const first = database.commitEvent({
      id: 'event-1',
      sessionId: 'session-1',
      type: 'user',
      payload: {
        content: 'hello',
        raw: {
          metadata: { beta: 2, alpha: 1 },
          parts: [{ second: 2, first: 1 }, 'tail'],
        },
      },
      direction: 'outbound',
      sourceEventId: 'message-1',
      dedupeScope: 'web:outbound:user',
      createdAt: 101,
    })
    const reorderedRetry = database.commitEvent({
      id: 'event-2',
      sessionId: 'session-1',
      type: 'user',
      payload: {
        raw: {
          parts: [{ first: 1, second: 2 }, 'tail'],
          metadata: { alpha: 1, beta: 2 },
        },
        content: 'hello',
      },
      direction: 'outbound',
      sourceEventId: 'message-1',
      dedupeScope: 'web:outbound:user',
      createdAt: 102,
    })

    expect(reorderedRetry).toEqual({ event: first.event, duplicate: true })
    expect(database.listEvents('session-1', 0, 100).events).toHaveLength(1)
    expect(database.getLastSeq('session-1')).toBe(1)

    expect(() =>
      database.commitEvent({
        id: 'event-3',
        sessionId: 'session-1',
        type: 'user',
        payload: {
          content: 'hello',
          raw: {
            metadata: { alpha: 1, beta: 3 },
            parts: [{ first: 1, second: 2 }, 'tail'],
          },
        },
        direction: 'outbound',
        sourceEventId: 'message-1',
        dedupeScope: 'web:outbound:user',
        createdAt: 103,
      }),
    ).toThrow(IdempotencyConflictError)

    database.close()
  })

  test('persists product projects and rejects cross-product session assignment', () => {
    const database = new RcsDatabase(':memory:')
    database.upsertProject({
      id: 'project-chat',
      ownerId: 'owner-1',
      product: 'chat',
      name: 'Research',
      projectPrompt: 'Cite sources.',
      promptRevision: 1,
      state: 'active',
      deviceId: null,
      workspaceKey: null,
      canonicalPath: null,
      gitRoot: null,
      gitRepoUrl: null,
      missingConfirmedAt: null,
      createdAt: 1,
      updatedAt: 1,
    })

    expect(database.getProject('project-chat')).toMatchObject({
      product: 'chat',
      projectPrompt: 'Cite sources.',
    })
    expect(() =>
      database.upsertSession({
        id: 'session-code',
        environmentId: null,
        title: null,
        status: 'idle',
        source: 'web',
        permissionMode: null,
        directory: null,
        workerEpoch: 0,
        username: null,
        product: 'code',
        projectId: 'project-chat',
        runtimeEnvironmentId: null,
        dataDirectory: null,
        projectPromptRevision: null,
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
      }),
    ).toThrow(/product mismatch/)
    database.close()
  })

  test('round-trips durable environment commands and cleanup tombstones', () => {
    const database = new RcsDatabase(':memory:')
    database.createEnvironmentCommand({
      id: 'cmd-1',
      environmentId: 'env-1',
      ownerId: 'owner-1',
      kind: 'list_directory',
      payload: { path: '/workspace' },
      state: 'pending',
      result: null,
      error: null,
      attemptCount: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    database.upsertCleanupTombstone({
      sessionId: 'session-1',
      environmentId: 'env-1',
      dataDirectory: '/scratch/session-1',
      browserScopeId: 'session-1',
      attemptCount: 0,
      lastError: null,
      createdAt: 1,
      updatedAt: 1,
    })

    expect(database.listPendingEnvironmentCommands('env-1')).toHaveLength(1)
    expect(database.getCleanupTombstone('session-1')?.dataDirectory).toBe(
      '/scratch/session-1',
    )
    database.close()
  })

  test('version 8 permits every provider environment command kind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const database = new RcsDatabase(join(dir, 'rcs.sqlite'))
    const kinds = [
      'get_provider_catalog',
      'save_provider_profile',
      'archive_provider_profile',
      'save_model_profile',
      'archive_model_profile',
      'set_default_model',
      'validate_provider_model',
      'begin_provider_auth',
      'get_provider_auth_status',
      'submit_provider_auth_code',
      'cancel_provider_auth',
      'remove_provider_auth',
      'refresh_provider_auth',
      'begin_provider_secret',
    ] as const

    for (const [index, kind] of kinds.entries()) {
      const command = {
        id: `provider-command-${index}`,
        environmentId: 'environment-1',
        ownerId: 'owner-1',
        kind,
        payload: {},
        state: 'pending',
        result: null,
        error: null,
        attemptCount: 0,
        createdAt: 100 + index,
        updatedAt: 100 + index,
      } satisfies PersistedEnvironmentCommand
      database.createEnvironmentCommand(command)
      expect(database.getEnvironmentCommand(command.id)?.kind).toBe(kind)
    }
    database.migrate()
    database.close()
  })

  test('requeues one dispatched environment command for a later worker', () => {
    const database = new RcsDatabase(':memory:')
    database.createEnvironmentCommand({
      id: 'cmd-requeue',
      environmentId: 'env-1',
      ownerId: 'owner-1',
      kind: 'get_provider_catalog',
      payload: {},
      state: 'pending',
      result: null,
      error: null,
      attemptCount: 0,
      createdAt: 10,
      updatedAt: 10,
    })

    expect(database.markEnvironmentCommandDispatched('cmd-requeue', 20)).toBe(
      true,
    )
    expect(database.requeueEnvironmentCommand('cmd-requeue', 30)).toBe(true)
    expect(database.getEnvironmentCommand('cmd-requeue')).toMatchObject({
      state: 'pending',
      attemptCount: 1,
      updatedAt: 30,
    })
    database.close()
  })

  test('lists and deletes projects, commands, and cleanup tombstones', () => {
    const database = new RcsDatabase(':memory:')
    database.upsertProject({
      id: 'project-chat',
      ownerId: 'owner-1',
      product: 'chat',
      name: 'Research',
      projectPrompt: '',
      promptRevision: 0,
      state: 'active',
      deviceId: null,
      workspaceKey: null,
      canonicalPath: null,
      gitRoot: null,
      gitRepoUrl: null,
      missingConfirmedAt: null,
      createdAt: 1,
      updatedAt: 1,
    })
    database.createEnvironmentCommand({
      id: 'cmd-success',
      environmentId: 'env-1',
      ownerId: 'owner-1',
      kind: 'list_directory',
      payload: { path: '/workspace' },
      state: 'pending',
      result: null,
      error: null,
      attemptCount: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    database.createEnvironmentCommand({
      id: 'cmd-failure',
      environmentId: 'env-1',
      ownerId: 'owner-1',
      kind: 'probe_workspace',
      payload: { path: '/missing' },
      state: 'pending',
      result: null,
      error: null,
      attemptCount: 0,
      createdAt: 2,
      updatedAt: 2,
    })
    database.upsertCleanupTombstone({
      sessionId: 'session-1',
      environmentId: 'env-1',
      dataDirectory: '/scratch/session-1',
      browserScopeId: 'scope-1',
      attemptCount: 0,
      lastError: null,
      createdAt: 1,
      updatedAt: 1,
    })
    expect(database.listProjects()).toHaveLength(1)
    expect(database.markEnvironmentCommandDispatched('cmd-success', 3)).toBe(
      true,
    )
    expect(
      database.completeEnvironmentCommand(
        'cmd-success',
        { entries: [] },
        null,
        4,
      ),
    ).toBe(true)
    expect(database.getEnvironmentCommand('cmd-success')).toMatchObject({
      state: 'completed',
      result: { entries: [] },
      attemptCount: 0,
    })
    expect(
      database.completeEnvironmentCommand('cmd-failure', null, 'offline', 4),
    ).toBe(true)
    expect(database.getEnvironmentCommand('cmd-failure')).toMatchObject({
      state: 'failed',
      error: 'offline',
      attemptCount: 1,
    })
    expect(database.listCleanupTombstones('env-1')).toHaveLength(1)
    expect(database.deleteCleanupTombstone('session-1')).toBe(true)
    expect(database.deleteEnvironmentCommand('cmd-success')).toBe(true)
    expect(database.deleteProject('project-chat')).toBe(true)
    database.close()
  })

  function upsertPlainSession(database: RcsDatabase, id: string): void {
    database.upsertSession({
      id,
      environmentId: null,
      title: null,
      status: 'idle',
      source: 'web',
      permissionMode: null,
      directory: null,
      workerEpoch: 0,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
    })
  }

  test('caps retained inbound control_response rows per session', () => {
    const database = new RcsDatabase(':memory:')
    upsertPlainSession(database, 'session-cap')
    for (let index = 1; index <= 12; index++) {
      database.commitEvent({
        id: `ctrl-${index}`,
        sessionId: 'session-cap',
        type: 'control_response',
        payload: { response: { request_id: `req-${index}` } },
        direction: 'inbound',
        sourceEventId: null,
        dedupeScope: null,
        createdAt: 100 + index,
      })
    }
    database.commitEvent({
      id: 'user-1',
      sessionId: 'session-cap',
      type: 'user',
      payload: { content: 'hello' },
      direction: 'outbound',
      sourceEventId: null,
      dedupeScope: null,
      createdAt: 200,
    })

    const events = database.listEvents('session-cap', 0, 100).events
    const controls = events.filter(event => event.type === 'control_response')
    expect(controls).toHaveLength(8)
    expect(controls[0]?.seqNum).toBe(5)
    expect(controls.at(-1)?.seqNum).toBe(12)
    expect(events.filter(event => event.type === 'user')).toHaveLength(1)
    // Pruning never rolls back sequence allocation.
    expect(database.getLastSeq('session-cap')).toBe(13)

    // Other event classes — e.g. inbound control_request carrying pending
    // permission prompts — must survive in full.
    for (let index = 1; index <= 12; index++) {
      database.commitEvent({
        id: `perm-${index}`,
        sessionId: 'session-cap',
        type: 'control_request',
        payload: { request_id: `perm-${index}`, request: {} },
        direction: 'inbound',
        sourceEventId: null,
        dedupeScope: null,
        createdAt: 300 + index,
      })
    }
    expect(
      database
        .listEvents('session-cap', 0, 100)
        .events.filter(event => event.type === 'control_request'),
    ).toHaveLength(12)
    database.close()
  })

  test('listEventsTail returns the newest rows in ascending order across seq gaps', () => {
    const database = new RcsDatabase(':memory:')
    upsertPlainSession(database, 'session-tail')
    for (let index = 1; index <= 12; index++) {
      database.commitEvent({
        id: `ctrl-${index}`,
        sessionId: 'session-tail',
        type: 'control_response',
        payload: { response: { request_id: `req-${index}` } },
        direction: 'inbound',
        sourceEventId: null,
        dedupeScope: null,
        createdAt: 100 + index,
      })
    }
    for (let index = 1; index <= 2; index++) {
      database.commitEvent({
        id: `user-${index}`,
        sessionId: 'session-tail',
        type: 'user',
        payload: { content: `prompt ${index}` },
        direction: 'outbound',
        sourceEventId: null,
        dedupeScope: null,
        createdAt: 200 + index,
      })
    }

    // seqs 1..4 were pruned by the retention cap; the tail must anchor on
    // surviving rows instead of last_seq arithmetic.
    const tail = database.listEventsTail('session-tail', 4).events
    expect(tail.map(event => event.seqNum)).toEqual([11, 12, 13, 14])
    const everything = database.listEventsTail('session-tail', 100).events
    expect(everything).toHaveLength(10)
    expect(everything[0]?.seqNum).toBe(5)
    expect(everything.at(-1)?.seqNum).toBe(14)
    database.close()
  })

  test('migration prunes the legacy control_response backlog', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const path = join(dir, 'rcs.sqlite')
    const seeded = new RcsDatabase(path)
    upsertPlainSession(seeded, 'session-legacy')
    seeded.close()

    // Simulate a pre-v10 database: raw-insert a control_response backlog the
    // way old servers accumulated it, then roll the migration marker back.
    const raw = new Database(path, { strict: true })
    const insert = raw.query<
      unknown,
      { id: string; sessionId: string; seqNum: number; createdAt: number }
    >(
      `INSERT INTO session_events (
         id, session_id, seq_num, type, direction, payload_json,
         source_event_id, dedupe_scope, created_at_ms
       ) VALUES (
         $id, $sessionId, $seqNum, 'control_response', 'inbound',
         '{"response":{}}', NULL, NULL, $createdAt
       )`,
    )
    for (let index = 1; index <= 40; index++) {
      insert.run({
        id: `legacy-${index}`,
        sessionId: 'session-legacy',
        seqNum: index,
        createdAt: index,
      })
    }
    raw
      .query<unknown, { id: string }>(
        'UPDATE sessions SET last_seq = 40 WHERE id = $id',
      )
      .run({ id: 'session-legacy' })
    raw.query('DELETE FROM schema_migrations WHERE version = 10').run()
    raw.close()

    const reopened = new RcsDatabase(path)
    const events = reopened.listEvents('session-legacy', 0, 100).events
    expect(events).toHaveLength(8)
    expect(events[0]?.seqNum).toBe(33)
    expect(events.at(-1)?.seqNum).toBe(40)
    expect(reopened.getLastSeq('session-legacy')).toBe(40)
    expect(reopened.listEventsTail('session-legacy', 4).events[0]?.seqNum).toBe(
      37,
    )
    reopened.close()
  })

  test('opens file-backed databases in WAL journal mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const path = join(dir, 'rcs.sqlite')
    const database = new RcsDatabase(path)
    database.close()

    const raw = new Database(path)
    const mode = raw
      .query<{ journal_mode: string }, []>('PRAGMA journal_mode')
      .get()
    expect(mode?.journal_mode).toBe('wal')
    raw.close()
  })

  test('shouldCompactDatabase requires both share and absolute floors', () => {
    expect(shouldCompactDatabase(0, 0)).toBe(false)
    // At/below the ~8MB absolute floor: never compact, share irrelevant.
    expect(shouldCompactDatabase(4000, 2048)).toBe(false)
    // Above the floor but a small share of a big file: skip.
    expect(shouldCompactDatabase(100_000, 20_000)).toBe(false)
    // Above the floor and >25% of the file: compact.
    expect(shouldCompactDatabase(10_000, 2600)).toBe(true)
    // The real-world bloat that motivated this: 11489 of 23874 pages free.
    expect(shouldCompactDatabase(23_874, 11_489)).toBe(true)
  })
})
