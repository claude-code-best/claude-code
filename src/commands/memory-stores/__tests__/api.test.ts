/**
 * Regression tests for memoryStoresApi.ts
 *
 * Key invariants under test:
 *   - updateMemory MUST use PATCH, not POST (spec: PATCH /v1/memory_stores/{id}/memories)
 *   - archiveStore uses POST /v1/memory_stores/{id}/archive (not DELETE)
 *   - redactVersion uses POST /v1/memory_stores/{id}/memory_versions/{vid}/redact
 *   - All endpoints hit /v1/memory_stores (not /v1/code/triggers or /v1/agents)
 *   - 401/403/404/429/5xx classified correctly
 *   - withRetry retries only 5xx, not 4xx
 */

import {
  afterAll,
  afterEach,
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

// ── Workspace API key mock ──────────────────────────────────────────────────
const mockApiKey = 'sk-ant-api03-test-memory-stores-key'

mock.module('src/constants/oauth.js', () => ({
  getOauthConfig: () => ({ BASE_API_URL: 'https://api.anthropic.com' }),
}))

const prepareWorkspaceApiRequestMock = mock(async () => ({
  apiKey: mockApiKey,
}))

mock.module('src/utils/teleport/api.js', () => ({
  prepareWorkspaceApiRequest: prepareWorkspaceApiRequestMock,
}))

// Note: we do NOT mock src/services/auth/hostGuard.js here.
// The real assertWorkspaceHost() is called with the URL from getOauthConfig()
// (mocked to https://api.anthropic.com), which passes the host guard.
// Mocking hostGuard would pollute hostGuard's own test file via Bun process-level cache.

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

// ── Lazy import after mocks ─────────────────────────────────────────────────
let listStores: typeof import('../memoryStoresApi.js').listStores
let getStore: typeof import('../memoryStoresApi.js').getStore
let createStore: typeof import('../memoryStoresApi.js').createStore
let archiveStore: typeof import('../memoryStoresApi.js').archiveStore
let listMemories: typeof import('../memoryStoresApi.js').listMemories
let createMemory: typeof import('../memoryStoresApi.js').createMemory
let getMemory: typeof import('../memoryStoresApi.js').getMemory
let updateMemory: typeof import('../memoryStoresApi.js').updateMemory
let deleteMemory: typeof import('../memoryStoresApi.js').deleteMemory
let listVersions: typeof import('../memoryStoresApi.js').listVersions
let redactVersion: typeof import('../memoryStoresApi.js').redactVersion

beforeAll(async () => {
  axiosHandle.useStubs = true
  const mod = await import('../memoryStoresApi.js')
  listStores = mod.listStores
  getStore = mod.getStore
  createStore = mod.createStore
  archiveStore = mod.archiveStore
  listMemories = mod.listMemories
  createMemory = mod.createMemory
  getMemory = mod.getMemory
  updateMemory = mod.updateMemory
  deleteMemory = mod.deleteMemory
  listVersions = mod.listVersions
  redactVersion = mod.redactVersion
})

afterAll(() => {
  axiosHandle.useStubs = false
})

beforeEach(() => {
  axiosGetMock.mockClear()
  axiosPostMock.mockClear()
  axiosPatchMock.mockClear()
  axiosDeleteMock.mockClear()
  prepareWorkspaceApiRequestMock.mockClear()
  process.env['ANTHROPIC_API_KEY'] = mockApiKey
})

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY']
})

// ── REGRESSION: updateMemory MUST use PATCH not POST ─────────────────────
describe('updateMemory regression: must use PATCH not POST', () => {
  test('updateMemory calls PATCH /v1/memory_stores/{id}/memories/{mid} (not POST)', async () => {
    const updated = {
      memory_id: 'mem_upd',
      memory_store_id: 'ms_1',
      content: 'Updated content',
    }
    axiosPatchMock.mockResolvedValueOnce({ data: updated, status: 200 })

    await updateMemory('ms_1', 'mem_upd', 'Updated content')

    // PATCH must have been called
    expect(axiosPatchMock).toHaveBeenCalledTimes(1)
    // POST must NOT have been called for update
    expect(axiosPostMock).not.toHaveBeenCalled()
    // The URL must contain the store id, memories path, and memory id
    const calls = axiosPatchMock.mock.calls as unknown as [
      string,
      unknown,
      unknown,
    ][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('ms_1')
    expect(url).toContain('/memories/')
    expect(url).toContain('mem_upd')
    expect(url).toContain('/v1/memory_stores/')
  })
})

// ── listStores ────────────────────────────────────────────────────────────
describe('listStores', () => {
  test('returns stores on 200', async () => {
    const stores = [
      {
        memory_store_id: 'ms_1',
        name: 'My Store',
        namespace: 'work',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    axiosGetMock.mockResolvedValueOnce({ data: { data: stores }, status: 200 })

    const result = await listStores()
    expect(result).toHaveLength(1)
    expect(result[0]!.memory_store_id).toBe('ms_1')
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0]).toContain('/v1/memory_stores')
  })

  test('returns empty array on empty response', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    const result = await listStores()
    expect(result).toHaveLength(0)
  })

  test('throws 401 with friendly message', async () => {
    const err = Object.assign(new Error('Unauthorized'), {
      isAxiosError: true,
      response: { status: 401, data: {} },
    })
    axiosGetMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    await expect(listStores()).rejects.toThrow(/login|authenticate/i)
  })

  test('throws 403 with subscription message', async () => {
    const err = Object.assign(new Error('Forbidden'), {
      isAxiosError: true,
      response: { status: 403, data: {} },
    })
    axiosGetMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    await expect(listStores()).rejects.toThrow(/subscription|pro|max|team/i)
  })

  test('retries on 5xx and eventually throws', async () => {
    const make5xx = () =>
      Object.assign(new Error('Server Error'), {
        isAxiosError: true,
        response: { status: 500, data: {} },
      })
    axiosGetMock
      .mockRejectedValueOnce(make5xx())
      .mockRejectedValueOnce(make5xx())
      .mockRejectedValueOnce(make5xx())
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    await expect(listStores()).rejects.toThrow()
    expect(axiosGetMock).toHaveBeenCalledTimes(3)
  }, 15000)

  test('honors Retry-After header on 5xx', async () => {
    const serverErr = Object.assign(new Error('Service Unavailable'), {
      isAxiosError: true,
      response: { status: 503, data: {}, headers: { 'retry-after': '0' } },
    })
    axiosGetMock
      .mockRejectedValueOnce(serverErr)
      .mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    const result = await listStores()
    expect(result).toHaveLength(0)
    expect(axiosGetMock).toHaveBeenCalledTimes(2)
  })
})

// ── getStore ──────────────────────────────────────────────────────────────
describe('getStore', () => {
  test('calls GET /v1/memory_stores/{id}', async () => {
    const store = {
      memory_store_id: 'ms_get',
      name: 'Work Store',
      namespace: 'work',
    }
    axiosGetMock.mockResolvedValueOnce({ data: store, status: 200 })

    const result = await getStore('ms_get')
    expect(result.memory_store_id).toBe('ms_get')
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0]).toContain('ms_get')
  })

  test('throws 404 with not found message', async () => {
    const err = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404, data: {} },
    })
    axiosGetMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    await expect(getStore('nonexistent')).rejects.toThrow(/not found/i)
  })
})

// ── createStore ───────────────────────────────────────────────────────────
describe('createStore', () => {
  test('sends POST /v1/memory_stores with name', async () => {
    const store = {
      memory_store_id: 'ms_new',
      name: 'My New Store',
      namespace: 'default',
    }
    axiosPostMock.mockResolvedValueOnce({ data: store, status: 201 })

    const result = await createStore('My New Store')
    expect(result.memory_store_id).toBe('ms_new')
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      unknown,
      unknown,
    ][]
    const url = calls[0]?.[0] as string
    const body = calls[0]?.[1] as Record<string, unknown>
    expect(url).toContain('/v1/memory_stores')
    expect(url).not.toContain('/v1/agents')
    expect(body.name).toBe('My New Store')
  })
})

// ── archiveStore ──────────────────────────────────────────────────────────
describe('archiveStore', () => {
  test('calls POST /v1/memory_stores/{id}/archive (not DELETE)', async () => {
    const store = {
      memory_store_id: 'ms_arc',
      name: 'Archived Store',
      archived_at: '2026-01-01T00:00:00Z',
    }
    axiosPostMock.mockResolvedValueOnce({ data: store, status: 200 })

    const result = await archiveStore('ms_arc')
    expect(result.memory_store_id).toBe('ms_arc')
    // POST must be called for archive
    expect(axiosPostMock).toHaveBeenCalledTimes(1)
    // DELETE must NOT be called
    expect(axiosDeleteMock).not.toHaveBeenCalled()
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      unknown,
      unknown,
    ][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('ms_arc')
    expect(url).toContain('/archive')
  })
})

// ── listMemories ──────────────────────────────────────────────────────────
describe('listMemories', () => {
  test('calls GET /v1/memory_stores/{id}/memories', async () => {
    const memories = [
      { memory_id: 'mem_1', memory_store_id: 'ms_1', content: 'Test memory' },
    ]
    axiosGetMock.mockResolvedValueOnce({
      data: { data: memories },
      status: 200,
    })

    const result = await listMemories('ms_1')
    expect(result).toHaveLength(1)
    expect(result[0]!.memory_id).toBe('mem_1')
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0]).toContain('ms_1')
    expect(calls[0]?.[0]).toContain('/memories')
  })

  test('throws 404 when store not found', async () => {
    const err = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404, data: {} },
    })
    axiosGetMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    await expect(listMemories('nonexistent')).rejects.toThrow(/not found/i)
  })
})

// ── createMemory ──────────────────────────────────────────────────────────
describe('createMemory', () => {
  test('sends POST /v1/memory_stores/{id}/memories', async () => {
    const memory = {
      memory_id: 'mem_new',
      memory_store_id: 'ms_1',
      content: 'New memory content',
    }
    axiosPostMock.mockResolvedValueOnce({ data: memory, status: 201 })

    const result = await createMemory('ms_1', 'New memory content')
    expect(result.memory_id).toBe('mem_new')
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      unknown,
      unknown,
    ][]
    const url = calls[0]?.[0] as string
    const body = calls[0]?.[1] as Record<string, unknown>
    expect(url).toContain('ms_1')
    expect(url).toContain('/memories')
    expect(body.content).toBe('New memory content')
  })
})

// ── getMemory ─────────────────────────────────────────────────────────────
describe('getMemory', () => {
  test('calls GET /v1/memory_stores/{id}/memories/{mid}', async () => {
    const memory = {
      memory_id: 'mem_get',
      memory_store_id: 'ms_1',
      content: 'Memory content',
    }
    axiosGetMock.mockResolvedValueOnce({ data: memory, status: 200 })

    const result = await getMemory('ms_1', 'mem_get')
    expect(result.memory_id).toBe('mem_get')
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0]).toContain('ms_1')
    expect(calls[0]?.[0]).toContain('/memories/')
    expect(calls[0]?.[0]).toContain('mem_get')
  })
})

// ── deleteMemory ──────────────────────────────────────────────────────────
describe('deleteMemory', () => {
  test('calls DELETE /v1/memory_stores/{id}/memories/{mid}', async () => {
    axiosDeleteMock.mockResolvedValueOnce({ status: 204 })

    await deleteMemory('ms_1', 'mem_del')
    const calls = axiosDeleteMock.mock.calls as unknown as [string, unknown][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('ms_1')
    expect(url).toContain('/memories/')
    expect(url).toContain('mem_del')
  })

  test('throws 401 when not authenticated', async () => {
    const err = Object.assign(new Error('Unauthorized'), {
      isAxiosError: true,
      response: { status: 401, data: {} },
    })
    axiosDeleteMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    await expect(deleteMemory('ms_1', 'mem_x')).rejects.toThrow(
      /login|authenticate/i,
    )
  })
})

// ── listVersions ──────────────────────────────────────────────────────────
describe('listVersions', () => {
  test('calls GET /v1/memory_stores/{id}/memory_versions', async () => {
    const versions = [
      {
        version_id: 'ver_1',
        memory_store_id: 'ms_1',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    axiosGetMock.mockResolvedValueOnce({
      data: { data: versions },
      status: 200,
    })

    const result = await listVersions('ms_1')
    expect(result).toHaveLength(1)
    expect(result[0]!.version_id).toBe('ver_1')
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0]).toContain('ms_1')
    expect(calls[0]?.[0]).toContain('/memory_versions')
  })
})

// ── redactVersion ─────────────────────────────────────────────────────────
describe('redactVersion', () => {
  test('calls POST /v1/memory_stores/{id}/memory_versions/{vid}/redact (not DELETE)', async () => {
    const version = {
      version_id: 'ver_red',
      memory_store_id: 'ms_1',
      redacted_at: '2026-01-01T00:00:00Z',
    }
    axiosPostMock.mockResolvedValueOnce({ data: version, status: 200 })

    const result = await redactVersion('ms_1', 'ver_red')
    expect(result.version_id).toBe('ver_red')
    // POST must be called for redact
    expect(axiosPostMock).toHaveBeenCalledTimes(1)
    // DELETE must NOT be called
    expect(axiosDeleteMock).not.toHaveBeenCalled()
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      unknown,
      unknown,
    ][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('ms_1')
    expect(url).toContain('/memory_versions/')
    expect(url).toContain('ver_red')
    expect(url).toContain('/redact')
  })

  test('throws 403 with subscription message', async () => {
    const err = Object.assign(new Error('Forbidden'), {
      isAxiosError: true,
      response: { status: 403, data: {} },
    })
    axiosPostMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    await expect(redactVersion('ms_1', 'ver_x')).rejects.toThrow(
      /subscription|pro|max|team/i,
    )
  })
})

// ── 429 rate-limit ────────────────────────────────────────────────────────
describe('429 rate-limit: not retried (non-5xx)', () => {
  test('throws immediately on 429 without retry', async () => {
    const err = Object.assign(new Error('Too Many Requests'), {
      isAxiosError: true,
      response: { status: 429, data: {}, headers: { 'retry-after': '60' } },
    })
    axiosGetMock.mockRejectedValueOnce(err)
    axiosIsAxiosError.mockImplementation(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        'isAxiosError' in e &&
        (e as { isAxiosError: boolean }).isAxiosError === true,
    )
    await expect(listStores()).rejects.toThrow()
    // Must NOT have retried — 429 is not a 5xx
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
  })
})

// ── Invariant: buildHeaders must return x-api-key, not Authorization ─────────
describe('invariant: x-api-key present, no Authorization, no x-organization-uuid', () => {
  test('buildHeaders returns x-api-key header (workspace key)', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listStores()
    const calls = axiosGetMock.mock.calls as unknown as [
      string,
      { headers: Record<string, string> },
    ][]
    const headers = calls[0]?.[1]?.headers ?? {}
    expect(headers['x-api-key']).toBe(mockApiKey)
  })

  test('buildHeaders does NOT include Authorization header', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listStores()
    const calls = axiosGetMock.mock.calls as unknown as [
      string,
      { headers: Record<string, string> },
    ][]
    const headers = calls[0]?.[1]?.headers ?? {}
    expect(headers['Authorization']).toBeUndefined()
  })

  test('buildHeaders does NOT include x-organization-uuid header', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listStores()
    const calls = axiosGetMock.mock.calls as unknown as [
      string,
      { headers: Record<string, string> },
    ][]
    const headers = calls[0]?.[1]?.headers ?? {}
    expect(headers['x-organization-uuid']).toBeUndefined()
  })

  test('uses prepareWorkspaceApiRequest to obtain API key', async () => {
    prepareWorkspaceApiRequestMock.mockClear()
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listStores()
    expect(prepareWorkspaceApiRequestMock).toHaveBeenCalledTimes(1)
  })

  test('request goes to api.anthropic.com (host guard passes for correct host)', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listStores()
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0]).toContain('api.anthropic.com')
  })
})
