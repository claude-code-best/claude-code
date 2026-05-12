/**
 * Tests for launchMemoryStores.ts
 *
 * Strategy per feedback_mock_dependency_not_subject:
 * - DO NOT mock memoryStoresApi.js itself (would pollute api.test.ts)
 * - Mock axios (the underlying HTTP layer) to control API responses
 * - Let real memoryStoresApi functions run real code paths
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'
import { setupAxiosMock } from '../../../../tests/mocks/axios.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// ── Analytics mock ──────────────────────────────────────────────────────────
const realAnalytics = await import('src/services/analytics/index.js')
const logEventMock = mock(() => {})
mock.module('src/services/analytics/index.js', () => ({
  ...realAnalytics,
  logEvent: logEventMock,
}))

// ── Auth / OAuth mocks ──────────────────────────────────────────────────────
const realAuth = await import('src/utils/auth.js')
mock.module('src/utils/auth.js', () => ({
  ...realAuth,
  getClaudeAIOAuthTokens: () => ({ accessToken: 'test-token-ms' }),
}))
mock.module('src/services/oauth/client.js', () => ({
  getOrganizationUUID: async () => 'org-uuid-ms',
}))
mock.module('src/constants/oauth.js', () => ({
  getOauthConfig: () => ({ BASE_API_URL: 'https://api.anthropic.com' }),
}))
// Spread real teleport/api so any export not explicitly stubbed (like
// prepareApiRequest, axiosGetWithRetry, type guards, schemas)
// remains available to transitive importers.
const realTeleportApi = await import('src/utils/teleport/api.js')
mock.module('src/utils/teleport/api.js', () => ({
  ...realTeleportApi,
  getOAuthHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }),
  prepareApiRequest: async () => ({
    apiKey: 'test-workspace-key',
  }),
  prepareWorkspaceApiRequest: async () => ({
    apiKey: 'test-workspace-key',
  }),
}))
mock.module('src/services/auth/hostGuard.ts', () => ({
  assertSubscriptionBaseUrl: () => {},
  assertWorkspaceHost: () => {},
  assertNoAnthropicEnvForOpenAI: () => {},
}))

// ── MemoryStoresView mock ───────────────────────────────────────────────────
const memoryStoresViewMock = mock((_props: unknown) => null)
mock.module('src/commands/memory-stores/MemoryStoresView.js', () => ({
  MemoryStoresView: memoryStoresViewMock,
}))

// ── Axios mock ──────────────────────────────────────────────────────────────
const axiosGetMock = mock(async () => ({}))
const axiosPostMock = mock(async () => ({}))
const axiosPatchMock = mock(async () => ({}))
const axiosDeleteMock = mock(async () => ({}))
const axiosIsAxiosError = mock((err: unknown) => {
  return (
    typeof err === 'object' &&
    err !== null &&
    'isAxiosError' in err &&
    (err as { isAxiosError: boolean }).isAxiosError === true
  )
})

const axiosHandle = setupAxiosMock()
axiosHandle.stubs.get = axiosGetMock
axiosHandle.stubs.post = axiosPostMock
axiosHandle.stubs.patch = axiosPatchMock
axiosHandle.stubs.delete = axiosDeleteMock
axiosHandle.stubs.isAxiosError = axiosIsAxiosError

// ── Lazy imports ─────────────────────────────────────────────────────────────
let callMemoryStores: typeof import('../launchMemoryStores.js').callMemoryStores

beforeAll(async () => {
  axiosHandle.useStubs = true
  const mod = await import('../launchMemoryStores.js')
  callMemoryStores = mod.callMemoryStores
})

afterAll(() => {
  axiosHandle.useStubs = false
})

// ── Helper ────────────────────────────────────────────────────────────────────
function makeOnDone() {
  const calls: [string | undefined, unknown][] = []
  const onDone = (msg?: string, opts?: unknown) => calls.push([msg, opts])
  return { onDone, calls }
}

beforeEach(() => {
  axiosGetMock.mockClear()
  axiosPostMock.mockClear()
  axiosPatchMock.mockClear()
  axiosDeleteMock.mockClear()
  logEventMock.mockClear()
  memoryStoresViewMock.mockClear()
})

// ── invalid args ──────────────────────────────────────────────────────────────
describe('callMemoryStores: invalid args', () => {
  test('invalid subcommand → onDone with usage + null', async () => {
    const { onDone, calls } = makeOnDone()
    const result = await callMemoryStores(onDone, {} as never, 'badcmd')
    expect(result).toBeNull()
    expect(calls[0]?.[0]).toMatch(/Usage/i)
  })
})

// ── list ──────────────────────────────────────────────────────────────────────
describe('callMemoryStores: list', () => {
  test('list returns empty stores', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'list')
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
    expect(calls[0]?.[0]).toMatch(/no memory stores/i)
  })

  test('list with stores reports count', async () => {
    const stores = [
      { memory_store_id: 'ms_1', name: 'Work', namespace: 'work' },
    ]
    axiosGetMock.mockResolvedValueOnce({ data: { data: stores }, status: 200 })
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, '')
    expect(calls[0]?.[0]).toMatch(/1 memory store/)
  })

  test('list API error → error view', async () => {
    axiosGetMock.mockRejectedValueOnce(new Error('Network error'))
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'list')
    expect(calls[0]?.[0]).toMatch(/failed to list memory stores/i)
  })
})

// ── get ───────────────────────────────────────────────────────────────────────
describe('callMemoryStores: get', () => {
  test('get calls axios.get with id in URL', async () => {
    const store = { memory_store_id: 'ms_get', name: 'Work Store' }
    axiosGetMock.mockResolvedValueOnce({ data: store, status: 200 })
    const { onDone } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'get ms_get')
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
    const getCall = axiosGetMock.mock.calls[0] as unknown as [string]
    expect(getCall[0]).toContain('ms_get')
  })

  test('get API error → error message', async () => {
    axiosGetMock.mockRejectedValueOnce(new Error('Not found'))
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'get ms_missing')
    expect(calls[0]?.[0]).toMatch(/failed to get memory store/i)
  })
})

// ── create ────────────────────────────────────────────────────────────────────
describe('callMemoryStores: create', () => {
  test('create calls axios.post with name in body', async () => {
    const store = { memory_store_id: 'ms_new', name: 'New Store' }
    axiosPostMock.mockResolvedValueOnce({ data: store, status: 200 })
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'create New Store')
    expect(axiosPostMock).toHaveBeenCalledTimes(1)
    const postCall = axiosPostMock.mock.calls[0] as unknown as [
      string,
      Record<string, string>,
    ]
    expect(postCall[1]).toEqual({ name: 'New Store' })
    expect(calls[0]?.[0]).toMatch(/memory store created/i)
  })

  test('create API error → error message', async () => {
    axiosPostMock.mockRejectedValueOnce(new Error('Subscription required'))
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'create My Store')
    expect(calls[0]?.[0]).toMatch(/failed to create memory store/i)
  })
})

// ── archive ───────────────────────────────────────────────────────────────────
describe('callMemoryStores: archive', () => {
  test('archive calls axios.post with id in URL', async () => {
    const store = {
      memory_store_id: 'ms_arc',
      name: 'Old Store',
      archived_at: '2026-01-01',
    }
    axiosPostMock.mockResolvedValueOnce({ data: store, status: 200 })
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'archive ms_arc')
    expect(axiosPostMock).toHaveBeenCalledTimes(1)
    const postCall = axiosPostMock.mock.calls[0] as unknown as [string]
    expect(postCall[0]).toContain('ms_arc')
    expect(postCall[0]).toContain('archive')
    expect(calls[0]?.[0]).toMatch(/archived/i)
  })

  test('archive API error → error message', async () => {
    axiosPostMock.mockRejectedValueOnce(new Error('Not found'))
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'archive ms_missing')
    expect(calls[0]?.[0]).toMatch(/failed to archive memory store/i)
  })
})

// ── memories ──────────────────────────────────────────────────────────────────
describe('callMemoryStores: memories', () => {
  test('memories lists memories in store', async () => {
    const memories = [
      { memory_id: 'mem_1', memory_store_id: 'ms_1', content: 'Test' },
    ]
    axiosGetMock.mockResolvedValueOnce({
      data: { data: memories },
      status: 200,
    })
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'memories ms_1')
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
    expect(calls[0]?.[0]).toMatch(/1 memory/)
  })

  test('memories API error → error message', async () => {
    axiosGetMock.mockRejectedValueOnce(new Error('Not found'))
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'memories ms_missing')
    expect(calls[0]?.[0]).toMatch(/failed to list memories/i)
  })
})

// ── create-memory ─────────────────────────────────────────────────────────────
describe('callMemoryStores: create-memory', () => {
  test('create-memory calls axios.post with storeId in URL and content in body', async () => {
    const memory = {
      memory_id: 'mem_new',
      memory_store_id: 'ms_1',
      content: 'hello world',
    }
    axiosPostMock.mockResolvedValueOnce({ data: memory, status: 200 })
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(
      onDone,
      {} as never,
      'create-memory ms_1 hello world',
    )
    expect(axiosPostMock).toHaveBeenCalledTimes(1)
    const postCall = axiosPostMock.mock.calls[0] as unknown as [
      string,
      Record<string, string>,
    ]
    expect(postCall[0]).toContain('ms_1')
    expect(postCall[0]).toContain('memories')
    expect(postCall[1]).toEqual({ content: 'hello world' })
    expect(calls[0]?.[0]).toMatch(/memory created/i)
  })

  test('create-memory API error → error message', async () => {
    axiosPostMock.mockRejectedValueOnce(new Error('Forbidden'))
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(
      onDone,
      {} as never,
      'create-memory ms_1 test content',
    )
    expect(calls[0]?.[0]).toMatch(/failed to create memory/i)
  })
})

// ── get-memory ────────────────────────────────────────────────────────────────
describe('callMemoryStores: get-memory', () => {
  test('get-memory calls axios.get with storeId and memoryId in URL', async () => {
    const memory = {
      memory_id: 'mem_get',
      memory_store_id: 'ms_1',
      content: 'Test',
    }
    axiosGetMock.mockResolvedValueOnce({ data: memory, status: 200 })
    const { onDone } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'get-memory ms_1 mem_get')
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
    const getCall = axiosGetMock.mock.calls[0] as unknown as [string]
    expect(getCall[0]).toContain('ms_1')
    expect(getCall[0]).toContain('mem_get')
  })

  test('get-memory API error → error message', async () => {
    axiosGetMock.mockRejectedValueOnce(new Error('Not found'))
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'get-memory ms_1 mem_missing')
    expect(calls[0]?.[0]).toMatch(/failed to get memory/i)
  })
})

// ── update-memory ─────────────────────────────────────────────────────────────
describe('callMemoryStores: update-memory', () => {
  test('update-memory calls axios.patch with storeId, memoryId in URL and content in body', async () => {
    const memory = {
      memory_id: 'mem_upd',
      memory_store_id: 'ms_1',
      content: 'new content',
    }
    axiosPatchMock.mockResolvedValueOnce({ data: memory, status: 200 })
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(
      onDone,
      {} as never,
      'update-memory ms_1 mem_upd new content',
    )
    expect(axiosPatchMock).toHaveBeenCalledTimes(1)
    const patchCall = axiosPatchMock.mock.calls[0] as unknown as [
      string,
      Record<string, string>,
    ]
    expect(patchCall[0]).toContain('ms_1')
    expect(patchCall[0]).toContain('mem_upd')
    expect(patchCall[1]).toEqual({ content: 'new content' })
    expect(calls[0]?.[0]).toMatch(/updated/i)
  })

  test('update-memory API error → error message', async () => {
    axiosPatchMock.mockRejectedValueOnce(new Error('Not found'))
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(
      onDone,
      {} as never,
      'update-memory ms_1 mem_missing new content',
    )
    expect(calls[0]?.[0]).toMatch(/failed to update memory/i)
  })
})

// ── delete-memory ─────────────────────────────────────────────────────────────
describe('callMemoryStores: delete-memory', () => {
  test('delete-memory calls axios.delete with storeId and memoryId in URL', async () => {
    axiosDeleteMock.mockResolvedValueOnce({ data: {}, status: 204 })
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'delete-memory ms_1 mem_del')
    expect(axiosDeleteMock).toHaveBeenCalledTimes(1)
    const deleteCall = axiosDeleteMock.mock.calls[0] as unknown as [string]
    expect(deleteCall[0]).toContain('ms_1')
    expect(deleteCall[0]).toContain('mem_del')
    expect(calls[0]?.[0]).toMatch(/deleted/i)
  })

  test('delete-memory API error → error message', async () => {
    axiosDeleteMock.mockRejectedValueOnce(new Error('Not found'))
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(
      onDone,
      {} as never,
      'delete-memory ms_1 mem_missing',
    )
    expect(calls[0]?.[0]).toMatch(/failed to delete memory/i)
  })
})

// ── versions ──────────────────────────────────────────────────────────────────
describe('callMemoryStores: versions', () => {
  test('versions lists memory versions', async () => {
    const versions = [
      {
        version_id: 'ver_1',
        memory_store_id: 'ms_1',
        created_at: '2026-01-01',
      },
    ]
    axiosGetMock.mockResolvedValueOnce({
      data: { data: versions },
      status: 200,
    })
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'versions ms_1')
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
    expect(calls[0]?.[0]).toMatch(/1 version/)
  })

  test('versions API error → error message', async () => {
    axiosGetMock.mockRejectedValueOnce(new Error('Not found'))
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'versions ms_missing')
    expect(calls[0]?.[0]).toMatch(/failed to list versions/i)
  })
})

// ── redact ────────────────────────────────────────────────────────────────────
describe('callMemoryStores: redact', () => {
  test('redact calls axios.post with storeId and versionId in URL', async () => {
    const version = {
      version_id: 'ver_red',
      memory_store_id: 'ms_1',
      redacted_at: '2026-01-01',
    }
    axiosPostMock.mockResolvedValueOnce({ data: version, status: 200 })
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'redact ms_1 ver_red')
    expect(axiosPostMock).toHaveBeenCalledTimes(1)
    const postCall = axiosPostMock.mock.calls[0] as unknown as [string]
    expect(postCall[0]).toContain('ms_1')
    expect(postCall[0]).toContain('ver_red')
    expect(postCall[0]).toContain('redact')
    expect(calls[0]?.[0]).toMatch(/redacted/i)
  })

  test('redact API error → error message', async () => {
    axiosPostMock.mockRejectedValueOnce(new Error('Forbidden'))
    const { onDone, calls } = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'redact ms_1 ver_missing')
    expect(calls[0]?.[0]).toMatch(/failed to redact version/i)
  })
})
