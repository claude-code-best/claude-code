import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'

import { setupAxiosMock } from '../../../tests/mocks/axios.js'
import { createSessionSpawner } from '../sessionRunner.js'
import type { BridgeConfig } from '../types.js'

type RequestConfig = {
  headers?: Record<string, string>
  timeout?: number
}
type MockResponse = { status: number; data: unknown }

const post = mock(
  async (
    _url: string,
    _data?: unknown,
    _config?: RequestConfig,
  ): Promise<MockResponse> => ({ status: 200, data: {} }),
)
const get = mock(
  async (_url: string, _config?: RequestConfig): Promise<MockResponse> => ({
    status: 204,
    data: null,
  }),
)
const axiosHandle = setupAxiosMock()
axiosHandle.stubs.post = post
axiosHandle.stubs.get = get

let createBridgeApiClient: typeof import('../bridgeApi.js').createBridgeApiClient
let BridgeFatalError: typeof import('../bridgeApi.js').BridgeFatalError

beforeAll(async () => {
  axiosHandle.useStubs = true
  const module = await import('../bridgeApi.js')
  createBridgeApiClient = module.createBridgeApiClient
  BridgeFatalError = module.BridgeFatalError
})

afterAll(() => {
  axiosHandle.useStubs = false
})

beforeEach(() => {
  post.mockClear()
  get.mockClear()
})

function config(): BridgeConfig {
  return {
    dir: '/repo',
    machineName: 'macbook',
    branch: 'main',
    gitRepoUrl: 'https://example.test/repo.git',
    maxSessions: 1,
    spawnMode: 'single-session',
    verbose: false,
    sandbox: false,
    bridgeId: 'legacy-bridge-id',
    deviceId: 'device-a',
    deviceName: 'macbook',
    workspaceKey: 'wrk-repo',
    connectionId: 'connection-a',
    reuseEnvironmentId: 'env-old',
    resumeSessionId: 'session-old',
    workerType: 'claude_code',
    apiBaseUrl: 'https://rcs.test',
    sessionIngressUrl: 'https://rcs.test',
  }
}

describe('bridge environment identity protocol', () => {
  test('registers stable identity fields and attaches the returned lease to later calls', async () => {
    post.mockResolvedValueOnce({
      status: 200,
      data: {
        environment_id: 'env-stable',
        environment_secret: 'environment-secret',
        lease_token: 'lease-current',
        lease_epoch: 3,
        reused: true,
        migrated_session_id: 'session-old',
      },
    })
    const api = createBridgeApiClient({
      baseUrl: 'https://rcs.test',
      getAccessToken: () => 'oauth-token',
      runnerVersion: 'test',
    })

    const registered = await api.registerBridgeEnvironment(config())
    await api.pollForWork('env-stable', 'environment-secret')

    expect(post.mock.calls[0]?.[1]).toMatchObject({
      device_id: 'device-a',
      device_name: 'macbook',
      workspace_key: 'wrk-repo',
      connection_id: 'connection-a',
      legacy_environment_id: 'env-old',
      resume_session_id: 'session-old',
      capabilities: {
        claude_code: true,
        chat: true,
        chat_sandbox: true,
      },
    })
    expect(registered.lease_epoch).toBe(3)
    expect(registered.migrated_session_id).toBe('session-old')
    expect(get.mock.calls[0]?.[1]?.headers).toMatchObject({
      'X-Bridge-Lease': 'lease-current',
    })
  })

  test('maps a superseded lease response to a fatal bridge error', async () => {
    get.mockResolvedValueOnce({
      status: 409,
      data: {
        error: {
          type: 'lease_superseded',
          message: 'superseded',
        },
      },
    })
    const api = createBridgeApiClient({
      baseUrl: 'https://rcs.test',
      getAccessToken: () => 'oauth-token',
      runnerVersion: 'test',
    })

    await expect(api.pollForWork('env-stable', 'secret')).rejects.toMatchObject(
      {
        constructor: BridgeFatalError,
        status: 409,
        errorType: 'lease_superseded',
      },
    )
  })

  test('keeps enough HTTP timeout headroom above the RCS long poll', async () => {
    const api = createBridgeApiClient({
      baseUrl: 'https://rcs.test',
      getAccessToken: () => 'oauth-token',
      runnerVersion: 'test',
    })

    await api.pollForWork('env-stable', 'secret')

    expect(get.mock.calls[0]?.[1]?.timeout).toBe(30_000)
  })

  test('posts environment command results with the current environment lease', async () => {
    post.mockResolvedValueOnce({
      status: 200,
      data: {
        environment_id: 'env-stable',
        environment_secret: 'environment-secret',
        lease_token: 'lease-current',
      },
    })
    const api = createBridgeApiClient({
      baseUrl: 'https://rcs.test',
      getAccessToken: () => 'oauth-token',
      runnerVersion: 'test',
    })
    await api.registerBridgeEnvironment(config())

    await api.completeEnvironmentCommand(
      'env-stable',
      'cmd_123',
      'environment-secret',
      { result: { kind: 'probe_workspace', value: { exists: true } } },
    )

    expect(post.mock.calls[1]?.[0]).toBe(
      'https://rcs.test/v1/environments/env-stable/work/cmd_123/result',
    )
    expect(post.mock.calls[1]?.[1]).toEqual({
      result: { kind: 'probe_workspace', value: { exists: true } },
    })
    expect(post.mock.calls[1]?.[2]?.headers).toMatchObject({
      Authorization: 'Bearer environment-secret',
      'X-Bridge-Lease': 'lease-current',
    })
  })

  test('accepts an old server already-complete conflict as idempotent success', async () => {
    post.mockResolvedValueOnce({
      status: 409,
      data: {
        error: {
          type: 'conflict',
          message: 'environment command is already complete',
        },
      },
    })
    const api = createBridgeApiClient({
      baseUrl: 'https://rcs.test',
      getAccessToken: () => 'oauth-token',
      runnerVersion: 'test',
    })

    await expect(
      api.completeEnvironmentCommand(
        'env-stable',
        'cmd_123',
        'environment-secret',
        { result: { exists: true } },
      ),
    ).resolves.toBeUndefined()
  })
})

describe('bridge session project prompt propagation', () => {
  test('fails closed when a Code child is not configured for CCR v2', () => {
    const spawner = createSessionSpawner({
      execPath: process.execPath,
      scriptArgs: ['-e', 'setInterval(() => {}, 1000)'],
      env: process.env,
      verbose: false,
      sandbox: false,
      onDebug: () => {},
    })

    expect(() =>
      spawner.spawn(
        {
          sessionId: 'session-code-legacy',
          sdkUrl: 'ws://localhost/v2/session_ingress/ws/session-code-legacy',
          accessToken: 'session-token',
          product: 'code',
        },
        process.cwd(),
      ),
    ).toThrow(/Code sessions require CCR v2 SSE transport/)
  })

  test('passes a non-empty project prompt to the child CLI system prompt flag', () => {
    const debug: string[] = []
    const spawner = createSessionSpawner({
      execPath: process.execPath,
      scriptArgs: ['-e', 'setInterval(() => {}, 1000)'],
      env: process.env,
      verbose: false,
      sandbox: false,
      onDebug: message => debug.push(message),
    })

    const handle = spawner.spawn(
      {
        sessionId: 'session-project-prompt',
        sdkUrl: 'http://localhost:3000/v1/sessions/session-project-prompt',
        accessToken: 'session-token',
        projectPrompt: 'Keep changes focused on the selected workspace.',
      },
      process.cwd(),
    )

    try {
      expect(debug.find(message => message.includes('Child args:'))).toContain(
        '--append-system-prompt Keep changes focused on the selected workspace.',
      )
    } finally {
      handle.kill()
    }
  })
})
