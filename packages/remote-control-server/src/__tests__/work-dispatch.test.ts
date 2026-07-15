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
  storeGetEnvironment,
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
  completeEnvironmentCommand,
  runEnvironmentCommand,
} from '../services/environment-command'
import { getPersistence } from '../persistence/runtime'
import { providerSecretRelay } from '../services/provider-secret-relay'
import type { SessionWorkData as ServerSessionWorkData } from '../types/api'

function providerCapabilities(duplicateRemoteId = false) {
  const modelProvider = (id: string, modelId: string) => ({
    id,
    displayName: id,
    kind: 'openai-compatible',
    baseUrl: `https://${id}.example.test/v1`,
    auth: {
      scheme: 'api-key',
      source: 'environment',
      envName: `${id.replaceAll('-', '_').toUpperCase()}_API_KEY`,
      configured: true,
    },
    enabled: true,
    archived: false,
    models: [
      {
        id: modelId,
        displayName: modelId,
        remoteModelId: 'legacy-remote',
        enabled: true,
        archived: false,
        validation: { status: 'valid' },
      },
    ],
  })
  return {
    provider_model_catalog_v1: {
      version: 1,
      revision: 9,
      defaultModel: { providerId: 'provider-one', modelProfileId: 'model-one' },
      providers: [
        modelProvider('provider-one', 'model-one'),
        ...(duplicateRemoteId
          ? [modelProvider('provider-two', 'model-two')]
          : []),
      ],
      features: {
        catalogWrite: false,
        sessionPersistence: true,
        runtimeSwitch: true,
        secretControl: false,
      },
    },
  }
}

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
      expect(decoded.use_code_sessions).toBe(true)
    })

    test('does not enable Code transport for Chat session work', async () => {
      const chatSession = storeCreateSession({
        environmentId: envId,
        product: 'chat',
      })
      const workId = await createWorkItem(envId, chatSession.id)
      const item = storeGetWorkItem(workId)
      const decoded = JSON.parse(
        Buffer.from(item!.secret, 'base64url').toString(),
      )
      expect(decoded.use_code_sessions).toBe(false)
    })
  })

  describe('pollWork', () => {
    test('server work contract carries a project prompt', () => {
      const data: ServerSessionWorkData = {
        type: 'session',
        id: 'session-project-prompt',
        project_prompt: 'Keep changes focused on the selected workspace.',
      }

      expect(data.project_prompt).toBe(
        'Keep changes focused on the selected workspace.',
      )
    })

    test('returns null when no work available (timeout)', async () => {
      const result = await pollWork(envId, 0.1)
      expect(result).toBeNull()
    })

    test('injects a one-time secret envelope without persisting ciphertext', async () => {
      const envelope = {
        algorithm: 'P256-HKDF-SHA256-AESGCM' as const,
        browser_public_key: 'browser-public-key',
        iv: 'encrypted-iv',
        ciphertext: 'encrypted-credential',
      }
      const relayId = providerSecretRelay.put({
        environmentId: envId,
        providerId: 'provider-1',
        operationId: 'operation-1',
        envelope,
      })
      const command = createEnvironmentCommand({
        environmentId: envId,
        ownerId: 'owner-1',
        kind: 'begin_provider_secret',
        payload: {
          providerId: 'provider-1',
          operationId: 'operation-1',
          method: 'api-key',
          action: relayId,
        },
      })

      expect(
        JSON.stringify(getPersistence().getEnvironmentCommand(command.id)),
      ).not.toContain('encrypted-credential')
      expect(await pollWork(envId, 1)).toMatchObject({
        data: {
          type: 'begin_provider_secret',
          provider_id: 'provider-1',
          operation_id: 'operation-1',
          secret_envelope: envelope,
        },
      })
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

    test('serializes the session model snapshot without rereading environment defaults', async () => {
      const modelSession = storeCreateSession({
        environmentId: envId,
        modelSelection: {
          providerId: 'custom-openai',
          modelProfileId: 'model-b',
          resolvedModelId: 'remote-b',
          providerConfigRevision: 7,
          updatedAt: 123,
        },
      })
      await createWorkItem(envId, modelSession.id)

      expect(await pollWork(envId, 1)).toMatchObject({
        data: {
          type: 'session',
          id: modelSession.id,
          model_selection: {
            provider_id: 'custom-openai',
            model_profile_id: 'model-b',
            resolved_model_id: 'remote-b',
            provider_config_revision: 7,
            updated_at: 123,
          },
        },
      })
    })

    test('recovers and persists a uniquely identifiable legacy session model', async () => {
      const legacyEnvironment = storeCreateEnvironment({
        secret: 'legacy-secret',
        capabilities: providerCapabilities(),
      })
      const legacySession = storeCreateSession({
        environmentId: legacyEnvironment.id,
      })
      getPersistence().commitEvent({
        id: 'legacy-init',
        sessionId: legacySession.id,
        type: 'system',
        payload: { subtype: 'init', model: 'legacy-remote' },
        direction: 'inbound',
        sourceEventId: 'legacy-init',
        dedupeScope: 'v2-worker:inbound:system',
        createdAt: 777,
      })
      await createWorkItem(legacyEnvironment.id, legacySession.id)

      expect(await pollWork(legacyEnvironment.id, 1)).toMatchObject({
        data: {
          model_selection: {
            provider_id: 'provider-one',
            model_profile_id: 'model-one',
            resolved_model_id: 'legacy-remote',
            provider_config_revision: 9,
            updated_at: 777,
          },
        },
      })
    })

    test('does not apply the current default to an ambiguous legacy model', async () => {
      const legacyEnvironment = storeCreateEnvironment({
        secret: 'ambiguous-secret',
        capabilities: providerCapabilities(true),
      })
      const legacySession = storeCreateSession({
        environmentId: legacyEnvironment.id,
      })
      getPersistence().commitEvent({
        id: 'ambiguous-init',
        sessionId: legacySession.id,
        type: 'system',
        payload: { subtype: 'init', model: 'legacy-remote' },
        direction: 'inbound',
        sourceEventId: 'ambiguous-init',
        dedupeScope: 'v2-worker:inbound:system',
        createdAt: 888,
      })
      await createWorkItem(legacyEnvironment.id, legacySession.id)

      const work = await pollWork(legacyEnvironment.id, 1)
      expect(work?.data).not.toHaveProperty('model_selection')
    })

    test('includes product for a project-less Code session', async () => {
      await createWorkItem(envId, sessionId)
      expect(await pollWork(envId, 1)).toMatchObject({
        data: { type: 'session', id: sessionId, product: 'code' },
      })
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
      const decoded = JSON.parse(
        Buffer.from(first!.secret, 'base64url').toString(),
      )
      expect(decoded.use_code_sessions).toBe(false)
    })

    test('maps provider mutations to explicit snake-case work data', async () => {
      const command = createEnvironmentCommand({
        environmentId: envId,
        ownerId: 'owner-1',
        kind: 'set_default_model',
        payload: {
          operationId: 'operation-1',
          expectedRevision: 4,
          model: {
            providerId: 'provider-one',
            modelProfileId: 'model-one',
          },
          allowUnverified: false,
          ignored: 'must-not-cross',
        },
      })

      expect(await pollWork(envId, 1)).toMatchObject({
        id: command.id,
        data: {
          type: 'set_default_model',
          operation_id: 'operation-1',
          expected_revision: 4,
          model: {
            provider_id: 'provider-one',
            model_profile_id: 'model-one',
          },
          allow_unverified: false,
        },
      })
      expect((await Promise.resolve(command)).payload).toHaveProperty('ignored')
    })

    test('accepts only a validated redacted catalog from provider results', () => {
      const environment = storeCreateEnvironment({
        secret: 'provider-result',
        capabilities: { chat: true },
      })
      const command = createEnvironmentCommand({
        environmentId: environment.id,
        ownerId: 'owner-1',
        kind: 'set_default_model',
        payload: {},
      })
      const capability = providerCapabilities().provider_model_catalog_v1
      completeEnvironmentCommand({
        commandId: command.id,
        environmentId: environment.id,
        result: {
          kind: 'set_default_model',
          ok: true,
          catalog: { ...capability, forged: 'ignored' },
        },
      })

      expect(storeGetEnvironment(environment.id)?.capabilities).toEqual({
        chat: true,
      })

      const validCommand = createEnvironmentCommand({
        environmentId: environment.id,
        ownerId: 'owner-1',
        kind: 'get_provider_catalog',
        payload: {},
      })
      completeEnvironmentCommand({
        commandId: validCommand.id,
        environmentId: environment.id,
        result: {
          kind: 'get_provider_catalog',
          ok: true,
          catalog: capability,
          unknown: 'not-copied',
        },
      })
      expect(storeGetEnvironment(environment.id)?.capabilities).toEqual({
        chat: true,
        provider_model_catalog_v1: capability,
      })
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
