import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// ── Analytics mock ──────────────────────────────────────────────────────────
const logEventMock = mock(() => {})
mock.module('src/services/analytics/index.js', () => ({
  logEvent: logEventMock,
}))

// ── MemoryStoresView mock ───────────────────────────────────────────────────
const memoryStoresViewMock = mock((_props: unknown) => null)
mock.module('src/commands/memory-stores/MemoryStoresView.js', () => ({
  MemoryStoresView: memoryStoresViewMock,
}))

// ── memoryStoresApi mock ──────────────────────────────────────────────────
const listStoresMock = mock(async () => [] as unknown)
const getStoreMock = mock(async () => ({}) as unknown)
const createStoreMock = mock(async () => ({}) as unknown)
const archiveStoreMock = mock(async () => ({}) as unknown)
const listMemoriesMock = mock(async () => [] as unknown)
const createMemoryMock = mock(async () => ({}) as unknown)
const getMemoryMock = mock(async () => ({}) as unknown)
const updateMemoryMock = mock(async () => ({}) as unknown)
const deleteMemoryMock = mock(async () => undefined)
const listVersionsMock = mock(async () => [] as unknown)
const redactVersionMock = mock(async () => ({}) as unknown)

mock.module('src/commands/memory-stores/memoryStoresApi.js', () => ({
  listStores: listStoresMock,
  getStore: getStoreMock,
  createStore: createStoreMock,
  archiveStore: archiveStoreMock,
  listMemories: listMemoriesMock,
  createMemory: createMemoryMock,
  getMemory: getMemoryMock,
  updateMemory: updateMemoryMock,
  deleteMemory: deleteMemoryMock,
  listVersions: listVersionsMock,
  redactVersion: redactVersionMock,
}))

let callMemoryStores: typeof import('../launchMemoryStores.js').callMemoryStores

beforeAll(async () => {
  const mod = await import('../launchMemoryStores.js')
  callMemoryStores = mod.callMemoryStores
})

function makeOnDone() {
  return mock(() => {})
}

beforeEach(() => {
  logEventMock.mockClear()
  listStoresMock.mockClear()
  getStoreMock.mockClear()
  createStoreMock.mockClear()
  archiveStoreMock.mockClear()
  listMemoriesMock.mockClear()
  createMemoryMock.mockClear()
  getMemoryMock.mockClear()
  updateMemoryMock.mockClear()
  deleteMemoryMock.mockClear()
  listVersionsMock.mockClear()
  redactVersionMock.mockClear()
  memoryStoresViewMock.mockClear()
})

describe('callMemoryStores: invalid args', () => {
  test('invalid subcommand → onDone with usage + null', async () => {
    const onDone = makeOnDone()
    const result = await callMemoryStores(onDone, {} as never, 'badcmd')
    expect(result).toBeNull()
    expect(onDone).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/Usage/i)
  })
})

describe('callMemoryStores: list', () => {
  test('list returns empty stores', async () => {
    listStoresMock.mockResolvedValueOnce([])
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'list')
    expect(listStoresMock).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/no memory stores/i)
  })

  test('list with stores reports count', async () => {
    const stores = [
      { memory_store_id: 'ms_1', name: 'Work', namespace: 'work' },
    ]
    listStoresMock.mockResolvedValueOnce(stores)
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, '')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/1 memory store/)
  })

  test('list API error → error view', async () => {
    listStoresMock.mockRejectedValueOnce(new Error('Network error'))
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'list')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to list memory stores/i)
  })
})

describe('callMemoryStores: get', () => {
  test('get calls getStore with id', async () => {
    const store = { memory_store_id: 'ms_get', name: 'Work Store' }
    getStoreMock.mockResolvedValueOnce(store)
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'get ms_get')
    expect(getStoreMock).toHaveBeenCalledTimes(1)
    const calls = getStoreMock.mock.calls as unknown as [string][]
    expect(calls[0]?.[0]).toBe('ms_get')
  })

  test('get API error → error message', async () => {
    getStoreMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'get ms_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to get memory store/i)
  })
})

describe('callMemoryStores: create', () => {
  test('create calls createStore with name', async () => {
    const store = { memory_store_id: 'ms_new', name: 'New Store' }
    createStoreMock.mockResolvedValueOnce(store)
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'create New Store')
    expect(createStoreMock).toHaveBeenCalledTimes(1)
    const calls = createStoreMock.mock.calls as unknown as [string][]
    expect(calls[0]?.[0]).toBe('New Store')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/memory store created/i)
  })

  test('create API error → error message', async () => {
    createStoreMock.mockRejectedValueOnce(new Error('Subscription required'))
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'create My Store')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to create memory store/i)
  })
})

describe('callMemoryStores: archive', () => {
  test('archive calls archiveStore with id', async () => {
    const store = {
      memory_store_id: 'ms_arc',
      name: 'Old Store',
      archived_at: '2026-01-01',
    }
    archiveStoreMock.mockResolvedValueOnce(store)
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'archive ms_arc')
    expect(archiveStoreMock).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/archived/i)
  })

  test('archive API error → error message', async () => {
    archiveStoreMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'archive ms_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to archive memory store/i)
  })
})

describe('callMemoryStores: memories', () => {
  test('memories lists memories in store', async () => {
    const memories = [
      { memory_id: 'mem_1', memory_store_id: 'ms_1', content: 'Test' },
    ]
    listMemoriesMock.mockResolvedValueOnce(memories)
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'memories ms_1')
    expect(listMemoriesMock).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/1 memory/)
  })

  test('memories API error → error message', async () => {
    listMemoriesMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'memories ms_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to list memories/i)
  })
})

describe('callMemoryStores: create-memory', () => {
  test('create-memory calls createMemory with storeId and content', async () => {
    const memory = {
      memory_id: 'mem_new',
      memory_store_id: 'ms_1',
      content: 'hello world',
    }
    createMemoryMock.mockResolvedValueOnce(memory)
    const onDone = makeOnDone()
    await callMemoryStores(
      onDone,
      {} as never,
      'create-memory ms_1 hello world',
    )
    expect(createMemoryMock).toHaveBeenCalledTimes(1)
    const calls = createMemoryMock.mock.calls as unknown as [string, string][]
    expect(calls[0]?.[0]).toBe('ms_1')
    expect(calls[0]?.[1]).toBe('hello world')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/memory created/i)
  })

  test('create-memory API error → error message', async () => {
    createMemoryMock.mockRejectedValueOnce(new Error('Forbidden'))
    const onDone = makeOnDone()
    await callMemoryStores(
      onDone,
      {} as never,
      'create-memory ms_1 test content',
    )
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to create memory/i)
  })
})

describe('callMemoryStores: get-memory', () => {
  test('get-memory calls getMemory', async () => {
    const memory = {
      memory_id: 'mem_get',
      memory_store_id: 'ms_1',
      content: 'Test',
    }
    getMemoryMock.mockResolvedValueOnce(memory)
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'get-memory ms_1 mem_get')
    expect(getMemoryMock).toHaveBeenCalledTimes(1)
    const calls = getMemoryMock.mock.calls as unknown as [string, string][]
    expect(calls[0]?.[0]).toBe('ms_1')
    expect(calls[0]?.[1]).toBe('mem_get')
  })

  test('get-memory API error → error message', async () => {
    getMemoryMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'get-memory ms_1 mem_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to get memory/i)
  })
})

describe('callMemoryStores: update-memory', () => {
  test('update-memory calls updateMemory with storeId, memoryId, and content', async () => {
    const memory = {
      memory_id: 'mem_upd',
      memory_store_id: 'ms_1',
      content: 'new content',
    }
    updateMemoryMock.mockResolvedValueOnce(memory)
    const onDone = makeOnDone()
    await callMemoryStores(
      onDone,
      {} as never,
      'update-memory ms_1 mem_upd new content',
    )
    expect(updateMemoryMock).toHaveBeenCalledTimes(1)
    const calls = updateMemoryMock.mock.calls as unknown as [
      string,
      string,
      string,
    ][]
    expect(calls[0]?.[0]).toBe('ms_1')
    expect(calls[0]?.[1]).toBe('mem_upd')
    expect(calls[0]?.[2]).toBe('new content')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/updated/i)
  })

  test('update-memory API error → error message', async () => {
    updateMemoryMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callMemoryStores(
      onDone,
      {} as never,
      'update-memory ms_1 mem_missing new content',
    )
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to update memory/i)
  })
})

describe('callMemoryStores: delete-memory', () => {
  test('delete-memory calls deleteMemory', async () => {
    deleteMemoryMock.mockResolvedValueOnce(undefined)
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'delete-memory ms_1 mem_del')
    expect(deleteMemoryMock).toHaveBeenCalledTimes(1)
    const calls = deleteMemoryMock.mock.calls as unknown as [string, string][]
    expect(calls[0]?.[0]).toBe('ms_1')
    expect(calls[0]?.[1]).toBe('mem_del')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/deleted/i)
  })

  test('delete-memory API error → error message', async () => {
    deleteMemoryMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callMemoryStores(
      onDone,
      {} as never,
      'delete-memory ms_1 mem_missing',
    )
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to delete memory/i)
  })
})

describe('callMemoryStores: versions', () => {
  test('versions lists memory versions', async () => {
    const versions = [
      {
        version_id: 'ver_1',
        memory_store_id: 'ms_1',
        created_at: '2026-01-01',
      },
    ]
    listVersionsMock.mockResolvedValueOnce(versions)
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'versions ms_1')
    expect(listVersionsMock).toHaveBeenCalledTimes(1)
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/1 version/)
  })

  test('versions API error → error message', async () => {
    listVersionsMock.mockRejectedValueOnce(new Error('Not found'))
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'versions ms_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to list versions/i)
  })
})

describe('callMemoryStores: redact', () => {
  test('redact calls redactVersion with storeId and versionId', async () => {
    const version = {
      version_id: 'ver_red',
      memory_store_id: 'ms_1',
      redacted_at: '2026-01-01',
    }
    redactVersionMock.mockResolvedValueOnce(version)
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'redact ms_1 ver_red')
    expect(redactVersionMock).toHaveBeenCalledTimes(1)
    const calls = redactVersionMock.mock.calls as unknown as [string, string][]
    expect(calls[0]?.[0]).toBe('ms_1')
    expect(calls[0]?.[1]).toBe('ver_red')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/redacted/i)
  })

  test('redact API error → error message', async () => {
    redactVersionMock.mockRejectedValueOnce(new Error('Forbidden'))
    const onDone = makeOnDone()
    await callMemoryStores(onDone, {} as never, 'redact ms_1 ver_missing')
    const [msg] = (onDone.mock.calls as unknown as [string, unknown][])[0] ?? []
    expect(msg).toMatch(/failed to redact version/i)
  })
})
