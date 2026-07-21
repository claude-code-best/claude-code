import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock config before importing modules
const mockConfig = {
  port: 3000,
  host: '0.0.0.0',
  apiKeys: ['test-api-key'],
  baseUrl: 'http://localhost:3000',
  pollTimeout: 8,
  heartbeatInterval: 20,
  jwtExpiresIn: 3600,
  disconnectTimeout: 300,
  webCorsOrigins: [],
  wsIdleTimeout: 30,
  wsKeepaliveInterval: 20,
}

mock.module('../config', () => ({
  config: mockConfig,
  getBaseUrl: () => 'http://localhost:3000',
}))

import {
  storeReset,
  storeCreateEnvironment,
  storeCreateSession,
  storeBindSession,
  storeGetSession,
  storeGetSessionWorker,
  storeGetPendingWorkItem,
  storeUpdateSession,
  storeUpdateEnvironment,
  storeClearPersistentCachesForTests,
  storeHydratePersistentState,
} from '../store'
import {
  createSession,
  createCodeSession,
  getSession,
  updateSessionTitle,
  updateSessionStatus,
  archiveSession,
  restoreSession,
  deleteSession,
  incrementEpoch,
  listSessions,
  listSessionSummaries,
  listSessionSummariesByUsername,
  listSessionsByEnvironment,
} from '../services/session'
import {
  registerEnvironment,
  deregisterEnvironment,
  getEnvironment,
  updatePollTime,
  listActiveEnvironments,
  listActiveEnvironmentsResponse,
  listActiveEnvironmentsByUsername,
  reconnectEnvironment,
} from '../services/environment'
import { normalizePayload, publishSessionEvent } from '../services/transport'
import {
  getEventBus,
  removeEventBus,
  getAllEventBuses,
} from '../transport/event-bus'
import { getPersistence } from '../persistence/runtime'
import { IdempotencyConflictError } from '../persistence/database'
import {
  createChatProductSession,
  createCodeProductSession,
} from '../services/product-session'
import { archiveCodeProject, upsertCodeProject } from '../services/project'
import {
  MISSING_RECHECK_MS,
  recordWorkspaceProbe,
} from '../services/code-project-lifecycle'
import { storeGetProject, storeListSessionsByProject } from '../store'

function providerCapabilities(defaultModelId: 'model-a' | 'model-b') {
  return {
    provider_model_catalog_v1: {
      version: 1,
      revision: defaultModelId === 'model-a' ? 4 : 5,
      defaultModel: {
        providerId: 'custom-openai',
        modelProfileId: defaultModelId,
      },
      providers: [
        {
          id: 'custom-openai',
          displayName: 'Custom OpenAI',
          kind: 'openai-compatible',
          baseUrl: 'https://example.test/v1',
          auth: {
            scheme: 'api-key',
            source: 'environment',
            envName: 'CUSTOM_OPENAI_API_KEY',
            configured: true,
          },
          compatRule: 'permissive',
          enabled: true,
          archived: false,
          models: [
            {
              id: 'model-a',
              displayName: 'Model A',
              remoteModelId: 'remote-a',
              enabled: true,
              archived: false,
              validation: { status: 'valid' },
            },
            {
              id: 'model-b',
              displayName: 'Model B',
              remoteModelId: 'remote-b',
              enabled: true,
              archived: false,
              validation: { status: 'valid' },
            },
          ],
        },
      ],
      features: {
        catalogWrite: false,
        sessionPersistence: false,
        runtimeSwitch: false,
        secretControl: false,
      },
    },
  }
}

describe('Code product lifecycle', () => {
  beforeEach(() => {
    storeReset()
  })

  test('creates separate immutable sessions in one project for one canonical workspace', async () => {
    const environment = storeCreateEnvironment({
      secret: 'secret',
      deviceId: 'device-1',
    })
    const workspace = {
      deviceId: 'device-1',
      canonicalPath: '/real/repo',
      workspaceKey: 'wrk-1',
      gitRoot: '/real/repo',
      gitRepoUrl: 'https://example.test/repo.git',
    }
    const deps = { resolveWorkspace: async () => workspace }

    const first = await createCodeProductSession(
      {
        ownerId: 'owner-1',
        accountId: environment.accountId,
        environmentId: environment.id,
        requestedDirectory: '/repo-link',
        title: 'First',
        permissionMode: 'default',
      },
      deps,
    )
    const second = await createCodeProductSession(
      {
        ownerId: 'owner-1',
        accountId: environment.accountId,
        environmentId: environment.id,
        requestedDirectory: '/repo',
        title: 'Second',
        permissionMode: 'default',
      },
      deps,
    )

    expect(first.id).not.toBe(second.id)
    expect(first.projectId).toBe(second.projectId)
    expect(first.directory).toBe('/real/repo')
    expect(first.dataDirectory).toBe(
      `/real/repo/.real-agentc/sessions/${first.id}`,
    )
  })

  test('copies the environment default once for Code and Chat sessions', async () => {
    const codeEnvironment = storeCreateEnvironment({
      secret: 'secret',
      deviceId: 'device-1',
      capabilities: providerCapabilities('model-a'),
    })
    const workspace = {
      deviceId: 'device-1',
      canonicalPath: '/real/repo',
      workspaceKey: 'wrk-models',
      gitRoot: '/real/repo',
      gitRepoUrl: null,
    }
    const first = await createCodeProductSession(
      {
        ownerId: 'owner-1',
        accountId: codeEnvironment.accountId,
        environmentId: codeEnvironment.id,
        requestedDirectory: '/real/repo',
        title: 'First',
        permissionMode: 'default',
      },
      { resolveWorkspace: async () => workspace },
    )
    storeUpdateEnvironment(codeEnvironment.id, {
      capabilities: providerCapabilities('model-b'),
    })
    const second = await createCodeProductSession(
      {
        ownerId: 'owner-1',
        accountId: codeEnvironment.accountId,
        environmentId: codeEnvironment.id,
        requestedDirectory: '/real/repo',
        title: 'Second',
        permissionMode: 'default',
      },
      { resolveWorkspace: async () => workspace },
    )
    expect(first.modelSelection?.modelProfileId).toBe('model-a')
    expect(second.modelSelection?.modelProfileId).toBe('model-b')
    expect(storeGetSession(first.id)?.modelSelection?.modelProfileId).toBe(
      'model-a',
    )

    const chatEnvironment = storeCreateEnvironment({
      secret: 'chat-secret',
      accountId: 'chat-account',
      capabilities: {
        chat: true,
        chat_sandbox: true,
        ...providerCapabilities('model-b'),
      },
    })
    const chat = createChatProductSession({
      ownerId: 'owner-chat',
      accountId: chatEnvironment.accountId,
      projectId: null,
      title: 'Chat',
    })
    expect(chat.modelSelection?.modelProfileId).toBe('model-b')
  })

  test('archives on delete and hard-deletes only after two online missing probes', async () => {
    const project = upsertCodeProject('owner-1', {
      deviceId: 'device-1',
      canonicalPath: '/real/repo',
      workspaceKey: 'wrk-1',
      gitRoot: '/real/repo',
      gitRepoUrl: null,
    })
    const environment = storeCreateEnvironment({
      secret: 'secret',
      deviceId: 'device-1',
    })
    await createCodeProductSession(
      {
        ownerId: 'owner-1',
        accountId: environment.accountId,
        environmentId: environment.id,
        requestedDirectory: '/real/repo',
        title: 'Session',
        permissionMode: 'default',
      },
      {
        resolveWorkspace: async () => ({
          deviceId: 'device-1',
          canonicalPath: '/real/repo',
          workspaceKey: 'wrk-1',
          gitRoot: '/real/repo',
          gitRepoUrl: null,
        }),
      },
    )

    expect(archiveCodeProject(project.id, 'owner-1').state).toBe('archived')
    await recordWorkspaceProbe(
      project.id,
      { online: false, exists: false },
      500,
    )
    expect(storeGetProject(project.id)?.state).toBe('archived')

    await recordWorkspaceProbe(
      project.id,
      { online: true, exists: false },
      1_000,
    )
    expect(storeGetProject(project.id)?.state).toBe('missing')
    await recordWorkspaceProbe(
      project.id,
      { online: true, exists: false },
      1_000 + MISSING_RECHECK_MS,
    )
    expect(storeGetProject(project.id)).toBeUndefined()
    expect(storeListSessionsByProject(project.id)).toEqual([])
  })
})

// ---------- Session Service ----------

describe('Session Service', () => {
  beforeEach(() => {
    storeReset()
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
  })

  describe('createSession', () => {
    test('creates a session with defaults', () => {
      const resp = createSession({})
      expect(resp.id).toMatch(/^session_/)
      expect(resp.status).toBe('idle')
      expect(resp.source).toBe('remote-control')
      expect(resp.environment_id).toBeNull()
      expect(resp.worker_epoch).toBe(0)
      expect(resp.model_selection).toBeNull()
      expect(resp.created_at).toBeGreaterThan(0)
    })

    test('creates a session with all options', () => {
      const env = storeCreateEnvironment({ secret: 's' })
      const resp = createSession({
        environment_id: env.id,
        title: 'My Session',
        source: 'cli',
        permission_mode: 'auto',
      })
      expect(resp.environment_id).toBe(env.id)
      expect(resp.title).toBe('My Session')
      expect(resp.source).toBe('cli')
      expect(resp.permission_mode).toBe('auto')
    })

    test('creates session with username', () => {
      const resp = createSession({ username: 'alice' })
      expect(resp.username).toBe('alice')
    })

    test('returns the persisted model selection in API form', () => {
      const modelSelection = {
        provider_id: 'custom-openai',
        model_profile_id: 'model-b',
        resolved_model_id: 'remote-b',
        provider_config_revision: 7,
        updated_at: 123,
      }

      const created = createSession({ model_selection: modelSelection })

      expect(created.model_selection).toEqual(modelSelection)
      expect(getSession(created.id)?.model_selection).toEqual(modelSelection)
    })
  })

  describe('createCodeSession', () => {
    test('creates a code session with cse_ prefix', () => {
      const resp = createCodeSession({})
      expect(resp.id).toMatch(/^cse_/)
    })
  })

  describe('getSession', () => {
    test('returns null for non-existent session', () => {
      expect(getSession('nope')).toBeNull()
    })

    test('returns created session', () => {
      const created = createSession({})
      const fetched = getSession(created.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(created.id)
    })
  })

  describe('updateSessionTitle', () => {
    test('updates title', () => {
      const s = createSession({})
      updateSessionTitle(s.id, 'New Title')
      expect(getSession(s.id)?.title).toBe('New Title')
    })
  })

  describe('updateSessionStatus', () => {
    test('updates status', () => {
      const s = createSession({})
      updateSessionStatus(s.id, 'active')
      expect(getSession(s.id)?.status).toBe('active')
    })

    test('publishes successful updates durably and emits nothing when the store update fails', () => {
      const session = createSession({})
      const received: Array<{
        type: string
        seqNum: number
        payload: unknown
      }> = []
      getEventBus(session.id).subscribe(event => {
        received.push({
          type: event.type,
          seqNum: event.seqNum,
          payload: event.payload,
        })
      })

      updateSessionStatus(session.id, 'active')

      expect(received).toEqual([
        {
          type: 'session_status',
          seqNum: 1,
          payload: { status: 'active' },
        },
      ])
      expect(getPersistence().getLastSeq(session.id)).toBe(1)
      expect(
        getPersistence()
          .listEvents(session.id, 0, 100)
          .events.map(event => ({
            type: event.type,
            seqNum: event.seqNum,
          })),
      ).toEqual([{ type: 'session_status', seqNum: 1 }])

      const missingBus = getEventBus('missing-session')
      updateSessionStatus('missing-session', 'active')
      expect(missingBus.getEventsSince(0)).toEqual([])
      expect(getPersistence().getLastSeq('missing-session')).toBe(0)
    })
  })

  describe('archiveSession', () => {
    test('is idempotent, publishes once, and preserves a live subscriber', () => {
      const s = createSession({})
      const received: Array<{ type: string; status?: string }> = []
      const unsubscribe = getEventBus(s.id).subscribe(event => {
        received.push({
          type: event.type,
          status: (event.payload as { status?: string }).status,
        })
      })
      expect(archiveSession(s.id)).toBe('changed')
      const firstUpdatedAt = getSession(s.id)?.updated_at
      expect(archiveSession(s.id)).toBe('unchanged')
      expect(getSession(s.id)?.status).toBe('archived')
      expect(getSession(s.id)?.updated_at).toBe(firstUpdatedAt)
      expect(received).toEqual([{ type: 'session_status', status: 'archived' }])
      expect(
        getPersistence()
          .listEvents(s.id, 0, 100)
          .events.map(event => ({
            type: event.type,
            seqNum: event.seqNum,
          })),
      ).toEqual([{ type: 'session_status', seqNum: 1 }])
      expect(getAllEventBuses().has(s.id)).toBe(true)
      unsubscribe()
    })

    test('releases an idle bus after archiving', () => {
      const session = createSession({})
      getEventBus(session.id)
      expect(archiveSession(session.id)).toBe('changed')
      expect(getAllEventBuses().has(session.id)).toBe(false)
    })

    test('restore changes archived to idle with an offline worker once', () => {
      const session = createSession({})
      archiveSession(session.id)
      const beforeRestoreSeq = getPersistence().getLastSeq(session.id)

      expect(restoreSession(session.id)).toBe('changed')
      const firstUpdatedAt = getSession(session.id)?.updated_at
      expect(getSession(session.id)?.status).toBe('idle')
      expect(storeGetSessionWorker(session.id)?.workerStatus).toBe('offline')
      expect(restoreSession(session.id)).toBe('unchanged')
      expect(getSession(session.id)?.updated_at).toBe(firstUpdatedAt)
      expect(getPersistence().getLastSeq(session.id)).toBe(beforeRestoreSeq + 2)
    })

    test('permanent delete removes a subscribed bus and ownership', () => {
      const session = createSession({})
      storeBindSession(session.id, 'owner-1')
      getEventBus(session.id).subscribe(() => {})

      expect(deleteSession(session.id)).toBe(true)
      expect(getSession(session.id)).toBeNull()
      expect(getAllEventBuses().has(session.id)).toBe(false)
      expect(getPersistence().isOwner(session.id, 'owner-1')).toBe(false)
      expect(deleteSession(session.id)).toBe(false)
    })
  })

  describe('incrementEpoch', () => {
    test('increments epoch by 1', () => {
      const s = createSession({})
      expect(incrementEpoch(s.id)).toBe(1)
      expect(incrementEpoch(s.id)).toBe(2)
      expect(getSession(s.id)?.worker_epoch).toBe(2)
    })

    test('throws for non-existent session', () => {
      expect(() => incrementEpoch('nope')).toThrow('Session not found')
    })
  })

  describe('listSessions', () => {
    test('returns all sessions', () => {
      createSession({})
      createSession({})
      expect(listSessions()).toHaveLength(2)
    })
  })

  describe('listSessionSummaries', () => {
    test('returns summaries with correct fields', () => {
      createSession({ title: 'Test' })
      const summaries = listSessionSummaries()
      expect(summaries).toHaveLength(1)
      expect(summaries[0].title).toBe('Test')
      expect(summaries[0].updated_at).toBeGreaterThan(0)
      // Summary should not have environment_id
      expect('environment_id' in summaries[0]).toBe(false)
    })
  })

  describe('listSessionSummariesByUsername', () => {
    test('filters by username', () => {
      createSession({ username: 'alice' })
      createSession({ username: 'bob' })
      expect(listSessionSummariesByUsername('alice')).toHaveLength(1)
    })
  })

  describe('listSessionsByEnvironment', () => {
    test('filters by environment', () => {
      const env = storeCreateEnvironment({ secret: 's' })
      createSession({ environment_id: env.id })
      createSession({})
      expect(listSessionsByEnvironment(env.id)).toHaveLength(1)
    })
  })
})

// ---------- Environment Service ----------

describe('Environment Service', () => {
  beforeEach(() => {
    storeReset()
  })

  describe('registerEnvironment', () => {
    test('registers environment with defaults', () => {
      const result = registerEnvironment({})
      expect(result.environment_id).toMatch(/^env_/)
      expect(result.environment_secret).toBe('test-api-key')
      expect(result.status).toBe('active')
    })

    test('registers with options', () => {
      const result = registerEnvironment({
        machine_name: 'mac1',
        directory: '/home/user',
        branch: 'main',
        git_repo_url: 'https://github.com/test/repo',
        max_sessions: 5,
        worker_type: 'custom',
      })
      const env = getEnvironment(result.environment_id)
      expect(env?.machineName).toBe('mac1')
      expect(env?.directory).toBe('/home/user')
      expect(env?.maxSessions).toBe(5)
    })

    test('registers with username', () => {
      const result = registerEnvironment({ username: 'alice' })
      const env = getEnvironment(result.environment_id)
      expect(env?.username).toBe('alice')
    })

    test('reuses one logical environment and rotates its connection lease', () => {
      const first = registerEnvironment({
        accountId: 'single-user',
        device_id: 'device-a',
        device_name: 'macbook',
        workspace_key: 'wrk-repo',
        connection_id: 'connection-1',
        worker_type: 'claude_code',
      })
      const second = registerEnvironment({
        accountId: 'single-user',
        device_id: 'device-a',
        device_name: 'renamed-macbook',
        workspace_key: 'wrk-repo',
        connection_id: 'connection-2',
        worker_type: 'claude_code',
      })

      expect(second.environment_id).toBe(first.environment_id)
      expect(first.reused).toBe(false)
      expect(second.reused).toBe(true)
      expect(second.lease_epoch).toBe((first.lease_epoch ?? 0) + 1)
      expect(second.lease_token).not.toBe(first.lease_token)
      expect(getEnvironment(first.environment_id)).toMatchObject({
        deviceName: 'renamed-macbook',
        connectionId: 'connection-2',
        leaseEpoch: second.lease_epoch,
      })
    })

    test('returns the configured secret when reusing an environment hydrated from persistence', () => {
      const first = registerEnvironment({
        accountId: 'single-user',
        device_id: 'device-a',
        workspace_key: 'wrk-repo',
        connection_id: 'connection-1',
        worker_type: 'claude_code',
      })

      storeClearPersistentCachesForTests()
      storeHydratePersistentState()

      const second = registerEnvironment({
        accountId: 'single-user',
        device_id: 'device-a',
        workspace_key: 'wrk-repo',
        connection_id: 'connection-2',
        worker_type: 'claude_code',
      })

      expect(second.environment_id).toBe(first.environment_id)
      expect(second.environment_secret).toBe('test-api-key')
    })

    test('upgrades an owned legacy environment in place', () => {
      const legacy = storeCreateEnvironment({
        secret: 'old',
        accountId: 'legacy',
        machineName: 'macbook',
      })

      const registered = registerEnvironment({
        accountId: 'single-user',
        device_id: 'device-a',
        device_name: 'macbook',
        workspace_key: 'wrk-repo',
        connection_id: 'connection-1',
        legacy_environment_id: legacy.id,
        worker_type: 'claude_code',
      })

      expect(registered.environment_id).toBe(legacy.id)
      expect(registered.reused).toBe(true)
      expect(getEnvironment(legacy.id)).toMatchObject({
        accountId: 'single-user',
        deviceId: 'device-a',
        workspaceKey: 'wrk-repo',
      })
    })

    test('keeps different devices and workspaces isolated', () => {
      const base = {
        accountId: 'single-user',
        device_name: 'macbook',
        connection_id: 'connection',
        worker_type: 'claude_code',
      }
      const first = registerEnvironment({
        ...base,
        device_id: 'device-a',
        workspace_key: 'wrk-one',
      })
      const otherDevice = registerEnvironment({
        ...base,
        device_id: 'device-b',
        workspace_key: 'wrk-one',
      })
      const otherWorkspace = registerEnvironment({
        ...base,
        device_id: 'device-a',
        workspace_key: 'wrk-two',
      })

      expect(
        new Set([
          first.environment_id,
          otherDevice.environment_id,
          otherWorkspace.environment_id,
        ]).size,
      ).toBe(3)
    })

    test('precisely rebinds and requeues only the pointer session', () => {
      const oldEnvironment = storeCreateEnvironment({ secret: 'old' })
      const target = storeCreateSession({
        environmentId: oldEnvironment.id,
        username: 'alice',
      })
      const untouched = storeCreateSession({
        environmentId: oldEnvironment.id,
        username: 'alice',
      })
      storeUpdateSession(target.id, { status: 'inactive' })

      const registered = registerEnvironment({
        accountId: 'single-user',
        username: 'alice',
        device_id: 'device-a',
        device_name: 'macbook',
        workspace_key: 'wrk-repo',
        connection_id: 'connection-1',
        resume_session_id: target.id,
        worker_type: 'claude_code',
      })

      expect(registered.migrated_session_id).toBe(target.id)
      expect(storeGetSession(target.id)).toMatchObject({
        environmentId: registered.environment_id,
        status: 'idle',
      })
      expect(storeGetSession(untouched.id)?.environmentId).toBe(
        oldEnvironment.id,
      )
      expect(
        storeGetPendingWorkItem(registered.environment_id)?.sessionId,
      ).toBe(target.id)
    })

    test('never migrates Chat or project-backed Code sessions through resume registration', () => {
      const oldEnvironment = storeCreateEnvironment({ secret: 'old' })
      const project = upsertCodeProject('owner-1', {
        deviceId: 'device-old',
        canonicalPath: '/repo',
        workspaceKey: 'workspace-old',
        gitRoot: '/repo',
        gitRepoUrl: null,
      })
      const chat = storeCreateSession({
        environmentId: oldEnvironment.id,
        runtimeEnvironmentId: oldEnvironment.id,
        product: 'chat',
      })
      const code = storeCreateSession({
        environmentId: oldEnvironment.id,
        runtimeEnvironmentId: oldEnvironment.id,
        product: 'code',
        projectId: project.id,
        directory: '/repo',
      })

      const chatRegistration = registerEnvironment({
        accountId: 'single-user',
        device_id: 'device-new-chat',
        workspace_key: 'workspace-new-chat',
        connection_id: 'connection-chat',
        resume_session_id: chat.id,
        worker_type: 'claude_code',
      })
      const codeRegistration = registerEnvironment({
        accountId: 'single-user',
        device_id: 'device-new-code',
        workspace_key: 'workspace-new-code',
        connection_id: 'connection-code',
        resume_session_id: code.id,
        worker_type: 'claude_code',
      })

      expect(chatRegistration.migrated_session_id).toBeUndefined()
      expect(codeRegistration.migrated_session_id).toBeUndefined()
      expect(storeGetSession(chat.id)?.environmentId).toBe(oldEnvironment.id)
      expect(storeGetSession(code.id)?.environmentId).toBe(oldEnvironment.id)
      expect(
        storeGetPendingWorkItem(chatRegistration.environment_id),
      ).toBeUndefined()
      expect(
        storeGetPendingWorkItem(codeRegistration.environment_id),
      ).toBeUndefined()
    })

    test('does not claim orphan sessions without an exact resume session id', () => {
      const oldEnvironment = storeCreateEnvironment({ secret: 'old' })
      const orphan = storeCreateSession({ environmentId: oldEnvironment.id })

      registerEnvironment({
        accountId: 'single-user',
        device_id: 'device-a',
        workspace_key: 'wrk-repo',
        connection_id: 'connection-1',
        worker_type: 'claude_code',
      })

      expect(storeGetSession(orphan.id)?.environmentId).toBe(oldEnvironment.id)
    })
  })

  describe('deregisterEnvironment', () => {
    test('sets status to deregistered', () => {
      const result = registerEnvironment({})
      deregisterEnvironment(result.environment_id)
      const env = getEnvironment(result.environment_id)
      expect(env?.status).toBe('deregistered')
    })

    test('parks bound sessions as idle history with completed work', async () => {
      const {
        storeCreateSession,
        storeUpdateSession,
        storeGetSessionWorker,
        storeGetOpenWorkItemForSession,
      } = await import('../store')
      const { createWorkItem } = await import('../services/work-dispatch')

      const result = registerEnvironment({})
      const session = storeCreateSession({
        environmentId: result.environment_id,
      })
      storeUpdateSession(session.id, { status: 'running' })
      await createWorkItem(result.environment_id, session.id)

      deregisterEnvironment(result.environment_id)

      expect(storeGetSession(session.id)?.status).toBe('idle')
      expect(storeGetSessionWorker(session.id)?.workerStatus).toBe('offline')
      expect(storeGetOpenWorkItemForSession(session.id)).toBeUndefined()
    })

    test('does not touch archived sessions', async () => {
      const { storeCreateSession, storeUpdateSession } = await import(
        '../store'
      )
      const result = registerEnvironment({})
      const session = storeCreateSession({
        environmentId: result.environment_id,
      })
      storeUpdateSession(session.id, { status: 'archived' })

      deregisterEnvironment(result.environment_id)

      expect(storeGetSession(session.id)?.status).toBe('archived')
    })
  })

  describe('updatePollTime', () => {
    test('updates lastPollAt', () => {
      const result = registerEnvironment({})
      const before = getEnvironment(result.environment_id)?.lastPollAt
      // Small delay to ensure time difference
      updatePollTime(result.environment_id)
      const after = getEnvironment(result.environment_id)?.lastPollAt
      expect(after!.getTime()).toBeGreaterThanOrEqual(before!.getTime())
    })
  })

  describe('listActiveEnvironments', () => {
    test('returns active environments', () => {
      registerEnvironment({})
      registerEnvironment({})
      expect(listActiveEnvironments()).toHaveLength(2)
    })
  })

  describe('listActiveEnvironmentsResponse', () => {
    test('returns response format', () => {
      registerEnvironment({ machine_name: 'mac1' })
      const envs = listActiveEnvironmentsResponse()
      expect(envs).toHaveLength(1)
      expect(envs[0].machine_name).toBe('mac1')
      expect(envs[0].last_poll_at).toBeGreaterThan(0)
    })
  })

  describe('listActiveEnvironmentsByUsername', () => {
    test('filters by username', () => {
      registerEnvironment({ username: 'alice' })
      registerEnvironment({ username: 'bob' })
      expect(listActiveEnvironmentsByUsername('alice')).toHaveLength(1)
    })
  })

  describe('reconnectEnvironment', () => {
    test('sets status back to active', () => {
      const result = registerEnvironment({})
      deregisterEnvironment(result.environment_id)
      expect(getEnvironment(result.environment_id)?.status).toBe('deregistered')
      reconnectEnvironment(result.environment_id)
      expect(getEnvironment(result.environment_id)?.status).toBe('active')
    })
  })
})

// ---------- Transport Service ----------

describe('Transport Service', () => {
  beforeEach(() => {
    storeReset()
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
  })

  describe('normalizePayload', () => {
    test('handles string payload', () => {
      const result = normalizePayload('user', 'hello world')
      expect(result.content).toBe('hello world')
      expect(result.raw).toBe('hello world')
    })

    test('handles null payload', () => {
      const result = normalizePayload('user', null)
      expect(result.content).toBe('')
      expect(result.raw).toBeNull()
    })

    test('handles object with direct content', () => {
      const result = normalizePayload('user', { content: 'direct text' })
      expect(result.content).toBe('direct text')
    })

    test('handles object with message.content string', () => {
      const result = normalizePayload('assistant', {
        message: { role: 'assistant', content: 'reply' },
      })
      expect(result.content).toBe('reply')
    })

    test('handles object with message.content array', () => {
      const result = normalizePayload('assistant', {
        message: {
          content: [
            { type: 'text', text: 'hello ' },
            { type: 'text', text: 'world' },
          ],
        },
      })
      expect(result.content).toBe('hello world')
    })

    test('preserves tool fields', () => {
      const result = normalizePayload('tool_use', {
        tool_name: 'Bash',
        tool_input: { cmd: 'ls' },
      })
      expect(result.tool_name).toBe('Bash')
      expect(result.tool_input).toEqual({ cmd: 'ls' })
    })

    test('preserves permission fields', () => {
      const result = normalizePayload('permission', {
        request_id: 'req_1',
        approved: true,
        updated_input: { cmd: 'ls -la' },
      })
      expect(result.request_id).toBe('req_1')
      expect(result.approved).toBe(true)
      expect(result.updated_input).toEqual({ cmd: 'ls -la' })
    })

    test('preserves message field', () => {
      const msg = { role: 'user', content: 'hi' }
      const result = normalizePayload('user', { message: msg })
      expect(result.message).toEqual(msg)
    })

    test('preserves uuid field', () => {
      const result = normalizePayload('user', {
        uuid: 'msg_123',
        content: 'hi',
      })
      expect(result.uuid).toBe('msg_123')
    })

    test('preserves isSynthetic field', () => {
      const result = normalizePayload('user', {
        content: 'scheduled job: refresh analytics cache',
        isSynthetic: true,
      })
      expect(result.isSynthetic).toBe(true)
    })

    test('uses name as tool_name fallback', () => {
      const result = normalizePayload('tool', { name: 'Read' })
      expect(result.tool_name).toBe('Read')
    })

    test('uses input as tool_input fallback', () => {
      const result = normalizePayload('tool', { input: { path: '/tmp' } })
      expect(result.tool_input).toEqual({ path: '/tmp' })
    })

    test('handles empty content array', () => {
      const result = normalizePayload('assistant', {
        message: { content: [] },
      })
      expect(result.content).toBe('')
    })

    test('preserves task_state fields', () => {
      const result = normalizePayload('task_state', {
        task_list_id: 'team-alpha',
        tasks: [{ id: '1', subject: 'Task 1', status: 'pending' }],
      })
      expect(result.task_list_id).toBe('team-alpha')
      expect(result.tasks).toEqual([
        { id: '1', subject: 'Task 1', status: 'pending' },
      ])
    })

    test('preserves status metadata for conversation reset events', () => {
      const result = normalizePayload('status', {
        status: 'conversation_cleared',
        subtype: 'status',
        message: 'conversation_cleared',
      })
      expect(result.status).toBe('conversation_cleared')
      expect(result.subtype).toBe('status')
      expect(result.message).toBe('conversation_cleared')
    })

    test('handles undefined payload', () => {
      const result = normalizePayload('user', undefined)
      expect(result.content).toBe('')
    })
  })

  describe('publishSessionEvent', () => {
    test('refuses to persist live terminal and interrupt protocol events', () => {
      const session = storeCreateSession({})

      expect(() =>
        publishSessionEvent(
          session.id,
          'terminal_output',
          { data: 'sensitive output' },
          'inbound',
        ),
      ).toThrow(/non-durable live channel/)
      expect(() =>
        publishSessionEvent(
          session.id,
          'interrupt',
          { action: 'interrupt' },
          'outbound',
        ),
      ).toThrow(/non-durable live channel/)
      expect(getPersistence().listEvents(session.id, 0, 100).events).toEqual([])
    })

    test('publishes event to session bus', () => {
      const session = storeCreateSession({})
      const { event, duplicate } = publishSessionEvent(
        session.id,
        'user',
        { content: 'hello' },
        'outbound',
      )
      expect(duplicate).toBe(false)
      expect(event.type).toBe('user')
      expect(event.direction).toBe('outbound')
      expect(event.sessionId).toBe(session.id)
      expect(event.seqNum).toBe(1)
    })

    test('normalizes payload before publishing', () => {
      const session = storeCreateSession({})
      const { event } = publishSessionEvent(
        session.id,
        'assistant',
        { message: { content: 'reply' } },
        'inbound',
      )
      const payload = event.payload as Record<string, unknown>
      expect(payload.content).toBe('reply')
    })

    test('returns the canonical first event for a duplicate and throws for a conflicting payload', () => {
      const session = storeCreateSession({})
      const identity = { producer: 'web' as const, sourceEventId: 'stable-1' }
      const first = publishSessionEvent(
        session.id,
        'user',
        { content: 'hello' },
        'outbound',
        identity,
      )
      const retry = publishSessionEvent(
        session.id,
        'user',
        { content: 'hello' },
        'outbound',
        identity,
      )

      expect(first.duplicate).toBe(false)
      expect(retry.duplicate).toBe(true)
      expect(retry.event).toEqual(first.event)
      expect(getAllEventBuses().has(session.id)).toBe(false)
      expect(
        getPersistence().listEvents(session.id, 0, 100).events,
      ).toHaveLength(1)
      expect(getPersistence().getLastSeq(session.id)).toBe(1)

      expect(() =>
        publishSessionEvent(
          session.id,
          'user',
          { content: 'different' },
          'outbound',
          identity,
        ),
      ).toThrow(IdempotencyConflictError)
    })

    test('separates the same source ID by producer, direction, and type scope', () => {
      const session = storeCreateSession({})
      const sourceEventId = 'shared-source'

      publishSessionEvent(
        session.id,
        'user',
        { content: 'hello' },
        'outbound',
        { producer: 'web', sourceEventId },
      )
      publishSessionEvent(session.id, 'user', { content: 'hello' }, 'inbound', {
        producer: 'v1-ingress',
        sourceEventId,
      })
      publishSessionEvent(
        session.id,
        'status',
        { content: 'hello' },
        'outbound',
        { producer: 'web', sourceEventId },
      )

      const events = getPersistence().listEvents(session.id, 0, 100).events
      expect(events).toHaveLength(3)
      expect(events.map(event => event.dedupeScope)).toEqual([
        'web:outbound:user',
        'v1-ingress:inbound:user',
        'web:outbound:status',
      ])
    })

    test('does not treat an empty source ID as a stable identity', () => {
      const session = storeCreateSession({})
      const identity = { producer: 'web' as const, sourceEventId: '' }

      const first = publishSessionEvent(
        session.id,
        'user',
        { content: 'same' },
        'outbound',
        identity,
      )
      const second = publishSessionEvent(
        session.id,
        'user',
        { content: 'same' },
        'outbound',
        identity,
      )

      expect(first.duplicate).toBe(false)
      expect(second.duplicate).toBe(false)
      expect(
        getPersistence().listEvents(session.id, 0, 100).events,
      ).toHaveLength(2)
    })
  })
})
