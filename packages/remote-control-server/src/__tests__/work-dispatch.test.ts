import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock config before imports
const mockConfig = {
  port: 3000,
  host: '0.0.0.0',
  apiKeys: ['test-api-key'],
  baseUrl: 'http://localhost:3000',
  pollTimeout: 1, // Short timeout for tests
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
  storeCreateProject,
  storeCreateSession,
  storeGetWorkItem,
  storeGetPendingWorkItem,
} from '../store'
import {
  createWorkItem,
  pollWork,
  ackWork,
  stopWork,
  heartbeatWork,
  reconnectWorkForEnvironment,
} from '../services/work-dispatch'
import {
  createEnvironmentCommand,
  runEnvironmentCommand,
} from '../services/environment-command'
import { getPersistence } from '../persistence/runtime'

describe('Work Dispatch', () => {
  let envId: string
  let sessionId: string

  beforeEach(() => {
    storeReset()
    const env = storeCreateEnvironment({ secret: 's' })
    envId = env.id
    const session = storeCreateSession({ environmentId: envId })
    sessionId = session.id
  })

  describe('createWorkItem', () => {
    test('creates work item for active environment', async () => {
      const workId = await createWorkItem(envId, sessionId)
      expect(workId).toMatch(/^work_/)
      const item = storeGetWorkItem(workId)
      expect(item?.state).toBe('pending')
      expect(item?.sessionId).toBe(sessionId)
    })

    test('throws for non-existent environment', async () => {
      await expect(createWorkItem('env_no', sessionId)).rejects.toThrow(
        'not found',
      )
    })

    test('throws for inactive environment', async () => {
      const inactiveEnv = storeCreateEnvironment({ secret: 's2' })
      // Manually set status to deregistered
      const { storeUpdateEnvironment } = await import('../store')
      storeUpdateEnvironment(inactiveEnv.id, { status: 'deregistered' })
      await expect(createWorkItem(inactiveEnv.id, sessionId)).rejects.toThrow(
        'not active',
      )
    })

    test('encodes work secret as base64 JSON', async () => {
      const workId = await createWorkItem(envId, sessionId)
      const item = storeGetWorkItem(workId)
      const decoded = JSON.parse(
        Buffer.from(item!.secret, 'base64url').toString(),
      )
      expect(decoded.version).toBe(1)
      expect(decoded.session_ingress_token).toBe('test-api-key')
      expect(decoded.api_base_url).toBe('http://localhost:3000')
    })
  })

  describe('pollWork', () => {
    test('returns null when no work available (timeout)', async () => {
      const result = await pollWork(envId, 0.1)
      expect(result).toBeNull()
    })

    test('returns pending work and marks as dispatched', async () => {
      const workId = await createWorkItem(envId, sessionId)
      const result = await pollWork(envId, 1)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(workId)
      expect(result!.state).toBe('dispatched')
      expect(result!.data).toMatchObject({ type: 'session', id: sessionId })
      // Work should no longer be pending
      expect(storeGetPendingWorkItem(envId)).toBeUndefined()
    })

    test('does not return work for different environment', async () => {
      const env2 = storeCreateEnvironment({ secret: 's2' })
      await createWorkItem(envId, sessionId)
      const result = await pollWork(env2.id, 0.1)
      expect(result).toBeNull()
    })

    test('includes session directory override in work data', async () => {
      const dirSession = storeCreateSession({
        environmentId: envId,
        directory: '/workspace/other-project',
      })
      await createWorkItem(envId, dirSession.id)
      const result = await pollWork(envId, 1)
      expect(result!.data).toMatchObject({
        type: 'session',
        id: dirSession.id,
        directory: '/workspace/other-project',
      })
    })

    test('includes immutable Code project and artifact identity in session work', async () => {
      const project = storeCreateProject({
        ownerId: 'owner-1',
        product: 'code',
        name: 'repo',
        projectPrompt: 'Keep changes focused on the selected workspace.',
        promptRevision: 0,
        state: 'active',
        deviceId: 'device-1',
        workspaceKey: 'wrk-1',
        canonicalPath: '/workspace/repo',
        gitRoot: '/workspace/repo',
        gitRepoUrl: null,
        missingConfirmedAt: null,
      })
      const codeSession = storeCreateSession({
        environmentId: envId,
        product: 'code',
        projectId: project.id,
        directory: '/workspace/repo',
        dataDirectory: '/workspace/repo/.real-agentc/sessions/session-product',
      })
      await createWorkItem(envId, codeSession.id)

      expect((await pollWork(envId, 1))?.data).toMatchObject({
        type: 'session',
        id: codeSession.id,
        product: 'code',
        project_id: project.id,
        directory: '/workspace/repo',
        artifact_directory:
          '/workspace/repo/.real-agentc/sessions/session-product',
        project_prompt: 'Keep changes focused on the selected workspace.',
      })
    })

    test('omits an empty project prompt from session work', async () => {
      const project = storeCreateProject({
        ownerId: 'owner-1',
        product: 'code',
        name: 'repo',
        projectPrompt: '',
        promptRevision: 0,
        state: 'active',
        deviceId: 'device-1',
        workspaceKey: 'wrk-empty-prompt',
        canonicalPath: '/workspace/empty-prompt',
        gitRoot: '/workspace/empty-prompt',
        gitRepoUrl: null,
        missingConfirmedAt: null,
      })
      const codeSession = storeCreateSession({
        environmentId: envId,
        product: 'code',
        projectId: project.id,
      })
      await createWorkItem(envId, codeSession.id)

      expect(await pollWork(envId, 1)).not.toMatchObject({
        data: { project_prompt: expect.anything() },
      })
    })

    test('omits directory from work data when session has none', async () => {
      await createWorkItem(envId, sessionId)
      const result = await pollWork(envId, 1)
      expect(result!.data).toMatchObject({ type: 'session', id: sessionId })
      expect('directory' in result!.data).toBe(false)
    })

    test('dispatches a durable environment command exactly once', async () => {
      const command = createEnvironmentCommand({
        environmentId: envId,
        ownerId: 'owner-1',
        kind: 'list_directory',
        payload: { path: '/workspace' },
      })

      const first = await pollWork(envId, 1)
      expect(first).toMatchObject({
        id: command.id,
        data: { type: 'list_directory', path: '/workspace' },
      })
      expect(await pollWork(envId, 0.1)).toBeNull()
      expect(getPersistence().getEnvironmentCommand(command.id)?.state).toBe(
        'dispatched',
      )
    })

    test('prioritizes cleanup commands over interactive commands and sessions', async () => {
      await createWorkItem(envId, sessionId)
      createEnvironmentCommand({
        environmentId: envId,
        ownerId: 'owner-1',
        kind: 'list_directory',
        payload: { path: '/workspace' },
      })
      createEnvironmentCommand({
        environmentId: envId,
        ownerId: 'owner-1',
        kind: 'cleanup_chat_session',
        payload: {
          dataDirectory: '/scratch/session-1',
          browserScopeId: 'session-1',
        },
      })

      expect((await pollWork(envId, 1))?.data.type).toBe('cleanup_chat_session')
      expect((await pollWork(envId, 1))?.data.type).toBe('list_directory')
      expect((await pollWork(envId, 1))?.data.type).toBe('session')
    })

    test('requeues an in-flight environment command when its runtime reconnects', async () => {
      const command = createEnvironmentCommand({
        environmentId: envId,
        ownerId: 'owner-1',
        kind: 'probe_workspace',
        payload: { path: '/workspace' },
      })
      expect((await pollWork(envId, 1))?.id).toBe(command.id)

      await reconnectWorkForEnvironment(envId)

      expect((await pollWork(envId, 1))?.id).toBe(command.id)
      expect(
        getPersistence().getEnvironmentCommand(command.id)?.attemptCount,
      ).toBe(1)
    })
  })

  describe('environment command timeout', () => {
    test('fails an interactive timeout without consuming pending cleanup', async () => {
      const cleanup = createEnvironmentCommand({
        environmentId: envId,
        ownerId: 'owner-1',
        kind: 'cleanup_chat_session',
        payload: {
          dataDirectory: '/scratch/session-1',
          browserScopeId: 'session-1',
        },
      })

      await expect(
        runEnvironmentCommand(
          {
            environmentId: envId,
            ownerId: 'owner-1',
            kind: 'list_directory',
            payload: { path: '/workspace' },
          },
          10,
        ),
      ).rejects.toThrow(/timed out/i)

      const failed = getPersistence()
        .listPendingEnvironmentCommands(envId)
        .find(command => command.kind === 'list_directory')
      expect(failed).toBeUndefined()
      expect(getPersistence().getEnvironmentCommand(cleanup.id)?.state).toBe(
        'pending',
      )
    })
  })

  describe('ackWork', () => {
    test('marks work as acked', async () => {
      const workId = await createWorkItem(envId, sessionId)
      ackWork(workId)
      expect(storeGetWorkItem(workId)?.state).toBe('acked')
    })
  })

  describe('stopWork', () => {
    test('marks work as completed', async () => {
      const workId = await createWorkItem(envId, sessionId)
      stopWork(workId)
      expect(storeGetWorkItem(workId)?.state).toBe('completed')
    })
  })

  describe('heartbeatWork', () => {
    test('extends lease and returns heartbeat info', async () => {
      const workId = await createWorkItem(envId, sessionId)
      const result = heartbeatWork(workId)
      expect(result.lease_extended).toBe(true)
      expect(result.ttl_seconds).toBe(40) // heartbeatInterval * 2
      expect(result.last_heartbeat).toBeTruthy()
    })

    test('returns default state for non-existent work', async () => {
      const result = heartbeatWork('work_no')
      expect(result.state).toBe('acked')
    })
  })

  describe('reconnectWorkForEnvironment', () => {
    test('creates work items for idle sessions in environment', async () => {
      // Create another idle session
      storeCreateSession({ environmentId: envId })
      const workIds = await reconnectWorkForEnvironment(envId)
      expect(workIds).toHaveLength(2)
      for (const id of workIds) {
        expect(storeGetWorkItem(id)?.state).toBe('pending')
      }
    })

    test('takes over running sessions and replaces work held by the old lease', async () => {
      const activeSession = storeCreateSession({ environmentId: envId })
      const { storeGetSession, storeUpdateSession } = await import('../store')
      storeUpdateSession(activeSession.id, { status: 'running' })
      const oldWorkId = await createWorkItem(envId, activeSession.id)
      ackWork(oldWorkId)

      const workIds = await reconnectWorkForEnvironment(envId)

      expect(workIds).toHaveLength(2)
      expect(storeGetWorkItem(oldWorkId)?.state).toBe('completed')
      expect(storeGetSession(activeSession.id)?.status).toBe('idle')
      expect(storeGetPendingWorkItem(envId)?.state).toBe('pending')
    })

    test('returns empty for environment with no sessions', async () => {
      const emptyEnv = storeCreateEnvironment({ secret: 's_empty' })
      const workIds = await reconnectWorkForEnvironment(emptyEnv.id)
      expect(workIds).toHaveLength(0)
    })
  })
})
