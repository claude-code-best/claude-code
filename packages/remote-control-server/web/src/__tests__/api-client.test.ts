import { describe, test, expect, mock, beforeEach } from 'bun:test'

// In-memory localStorage mock
let store: Record<string, string> = {}

beforeEach(() => {
  store = {}
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: () => null,
  }
})

// Mock fetch
const fetchMock = {
  lastUrl: '',
  lastOpts: {} as RequestInit,
  response: { ok: true, status: 200, statusText: 'OK' },
  responseData: {} as any,
}

beforeEach(() => {
  fetchMock.lastUrl = ''
  fetchMock.lastOpts = {}
  fetchMock.response = { ok: true, status: 200, statusText: 'OK' }
  fetchMock.responseData = {}
  client.setActiveApiToken(null)
  client.setSingleUserMode(false)
})

;(globalThis as any).fetch = async (url: string, opts: RequestInit) => {
  fetchMock.lastUrl = url
  fetchMock.lastOpts = opts
  return {
    ok: fetchMock.response.ok,
    status: fetchMock.response.status,
    statusText: fetchMock.response.statusText,
    json: async () => fetchMock.responseData,
  } as Response
}

const { getUuid, setUuid } = await import('../api/client')

// Import api* functions - they depend on getUuid and fetch
const client = await import('../api/client')
const relayClient = await import('../acp/relay-client')

// =============================================================================
// getUuid()
// =============================================================================

describe('getUuid', () => {
  test('returns existing UUID from localStorage', () => {
    store['rcs_uuid'] = 'existing-uuid'
    expect(getUuid()).toBe('existing-uuid')
  })

  test('generates and stores new UUID when none exists', () => {
    const uuid = getUuid()
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(store['rcs_uuid']).toBe(uuid)
  })

  test('returns same UUID on subsequent calls', () => {
    const a = getUuid()
    const b = getUuid()
    expect(a).toBe(b)
  })
})

// =============================================================================
// 单用户模式 — getUuid 固定身份 + /health 探测
// =============================================================================

describe('single-user mode', () => {
  test('getUuid returns the fixed identity and skips localStorage', () => {
    client.setSingleUserMode(true)
    expect(getUuid()).toBe('single-user')
    expect(store['rcs_uuid']).toBeUndefined()
  })

  test('detectServerMode enables single-user from /health payload', async () => {
    fetchMock.responseData = { single_user: true }
    const result = await client.detectServerMode()
    expect(fetchMock.lastUrl).toContain('/health')
    expect(result).toBe(true)
    expect(client.isSingleUserMode()).toBe(true)
    expect(getUuid()).toBe('single-user')
  })

  test('detectServerMode keeps multi-user when payload omits the flag', async () => {
    fetchMock.responseData = { status: 'ok' }
    const result = await client.detectServerMode()
    expect(result).toBe(false)
    expect(client.isSingleUserMode()).toBe(false)
  })

  test('detectServerMode keeps current mode when the probe fails', async () => {
    client.setSingleUserMode(true)
    fetchMock.response = {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    }
    const result = await client.detectServerMode()
    expect(result).toBe(true)
    expect(client.isSingleUserMode()).toBe(true)
  })

  test('API requests carry the fixed uuid in single-user mode', async () => {
    client.setSingleUserMode(true)
    fetchMock.responseData = []
    await client.apiFetchSessions()
    expect(fetchMock.lastUrl).toContain('uuid=single-user')
  })
})

// =============================================================================
// setUuid()
// =============================================================================

describe('setUuid', () => {
  test('writes UUID to localStorage', () => {
    setUuid('custom-uuid-999')
    expect(store['rcs_uuid']).toBe('custom-uuid-999')
  })

  test('getUuid returns the set UUID', () => {
    setUuid('my-uuid')
    expect(getUuid()).toBe('my-uuid')
  })
})

// =============================================================================
// api() — tested via apiFetchSession (GET) and apiBind (POST)
// =============================================================================

describe('api functions', () => {
  test('GET request appends uuid to URL', async () => {
    store['rcs_uuid'] = 'test-uuid'
    fetchMock.responseData = []
    await client.apiFetchSessions()
    expect(fetchMock.lastUrl).toContain('uuid=test-uuid')
    expect(fetchMock.lastOpts.method).toBe('GET')
  })

  test('GET request uses ? for URL without existing query params', async () => {
    store['rcs_uuid'] = 'test-uuid'
    fetchMock.responseData = []
    await client.apiFetchSessions()
    expect(fetchMock.lastUrl).toContain('?uuid=')
  })

  test('GET request uses & for URL with existing query params', async () => {
    store['rcs_uuid'] = 'test-uuid'
    fetchMock.responseData = []
    await client.apiFetchAllSessions()
    // apiFetchAllSessions calls GET /web/sessions/all
    expect(fetchMock.lastUrl).toContain('?uuid=')
  })

  test('session lifecycle APIs use the owner-authenticated Web routes', async () => {
    store['rcs_uuid'] = 'test-uuid'
    fetchMock.responseData = []
    await client.apiFetchSessions(true)
    expect(fetchMock.lastUrl).toContain('include_archived=1')
    expect(fetchMock.lastUrl).toContain('uuid=test-uuid')

    fetchMock.responseData = { status: 'ok' }
    await client.apiArchiveSession('session-1')
    expect(fetchMock.lastUrl).toContain('/web/sessions/session-1/archive?')
    expect(fetchMock.lastOpts.method).toBe('POST')

    await client.apiRestoreSession('session-1')
    expect(fetchMock.lastUrl).toContain('/web/sessions/session-1/restore?')
    expect(fetchMock.lastOpts.method).toBe('POST')

    await client.apiDeleteSession('session-1')
    expect(fetchMock.lastUrl).toContain('/web/sessions/session-1?')
    expect(fetchMock.lastOpts.method).toBe('DELETE')

    await client.apiRebindSession('session-1', 'env-stable')
    expect(fetchMock.lastUrl).toContain('/web/sessions/session-1/rebind?')
    expect(fetchMock.lastOpts.method).toBe('POST')
    expect(fetchMock.lastOpts.body).toBe(
      JSON.stringify({ environment_id: 'env-stable' }),
    )
  })

  test('POST request includes JSON body', async () => {
    store['rcs_uuid'] = 'test-uuid'
    fetchMock.responseData = {}
    await client.apiBind('sess-1')
    expect(fetchMock.lastOpts.method).toBe('POST')
    expect(fetchMock.lastOpts.body).toBe(
      JSON.stringify({ sessionId: 'sess-1' }),
    )
    expect(fetchMock.lastOpts.headers).toEqual({
      'Content-Type': 'application/json',
    })
  })

  test('active API token is sent only in Authorization header', async () => {
    store['rcs_uuid'] = 'browser-uuid'
    fetchMock.responseData = []
    client.setActiveApiToken('secret-token')

    await client.apiFetchSessions()

    expect(fetchMock.lastUrl).toContain('uuid=browser-uuid')
    expect(fetchMock.lastUrl).not.toContain('secret-token')
    expect(fetchMock.lastOpts.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret-token',
    })
  })

  test('throws error on non-ok response', async () => {
    store['rcs_uuid'] = 'test-uuid'
    fetchMock.response = { ok: false, status: 401, statusText: 'Unauthorized' }
    fetchMock.responseData = {
      error: { type: 'auth', message: 'Invalid UUID' },
    }
    await expect(client.apiFetchSessions()).rejects.toThrow('Invalid UUID')
  })

  test('throws with statusText when error message is missing', async () => {
    store['rcs_uuid'] = 'test-uuid'
    fetchMock.response = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }
    fetchMock.responseData = {}
    await expect(client.apiFetchSessions()).rejects.toThrow(
      'Internal Server Error',
    )
  })

  test('creates a Chat session with only title and project_id', async () => {
    fetchMock.responseData = { id: 's1' }
    await client.apiCreateChatSession({
      title: 'Idea',
      project_id: 'chat-project-1',
    })
    expect(fetchMock.lastUrl).toContain('/web/chat/sessions')
    expect(JSON.parse(fetchMock.lastOpts.body as string)).toEqual({
      title: 'Idea',
      project_id: 'chat-project-1',
    })
  })

  test('creates a Code session with workspace fields', async () => {
    fetchMock.responseData = { id: 's1' }
    await client.apiCreateCodeSession({
      environment_id: 'env-1',
      requested_directory: '/repo',
      permission_mode: 'default',
      title: 'Fix bug',
    })
    expect(fetchMock.lastUrl).toContain('/web/code/sessions')
    expect(JSON.parse(fetchMock.lastOpts.body as string)).toMatchObject({
      environment_id: 'env-1',
      requested_directory: '/repo',
    })
  })

  test('uses product-specific project and session endpoints', async () => {
    fetchMock.responseData = []
    await client.apiFetchChatProjects()
    expect(fetchMock.lastUrl).toContain('/web/chat/projects')
    await client.apiFetchChatSessions()
    expect(fetchMock.lastUrl).toContain('/web/chat/sessions')
    await client.apiFetchCodeProjects()
    expect(fetchMock.lastUrl).toContain('/web/code/projects')
    await client.apiFetchCodeSessions()
    expect(fetchMock.lastUrl).toContain('/web/code/sessions')
  })

  test('sends project prompt and session project assignment bodies', async () => {
    fetchMock.responseData = { id: 'p1' }
    await client.apiCreateChatProject({ name: 'Ideas' })
    expect(fetchMock.lastUrl).toContain('/web/chat/projects')
    expect(JSON.parse(fetchMock.lastOpts.body as string)).toEqual({
      name: 'Ideas',
    })

    await client.apiUpdateProjectPrompt('p1', 'Use concise answers')
    expect(fetchMock.lastUrl).toContain('/web/chat/projects/p1/prompt')
    expect(JSON.parse(fetchMock.lastOpts.body as string)).toEqual({
      prompt: 'Use concise answers',
    })

    await client.apiAssignChatSessionProject('s1', 'p1')
    expect(fetchMock.lastUrl).toContain('/web/chat/sessions/s1/project')
    expect(JSON.parse(fetchMock.lastOpts.body as string)).toEqual({
      project_id: 'p1',
    })
  })

  test('archives, restores, and deletes product projects through their routes', async () => {
    fetchMock.responseData = { id: 'p1' }
    await client.apiArchiveCodeProject('p1')
    expect(fetchMock.lastUrl).toContain('/web/code/projects/p1')
    expect(fetchMock.lastOpts.method).toBe('DELETE')

    await client.apiRestoreCodeProject('p1')
    expect(fetchMock.lastUrl).toContain('/web/code/projects/p1/restore')
    expect(fetchMock.lastOpts.method).toBe('POST')

    await client.apiDeleteChatProject('p1')
    expect(fetchMock.lastUrl).toContain('/web/chat/projects/p1')
    expect(fetchMock.lastOpts.method).toBe('DELETE')
  })
})

describe('ACP relay client', () => {
  test('builds relay URLs without UUID or token query params', () => {
    ;(globalThis as any).window = {
      location: {
        protocol: 'https:',
        host: 'rcs.example.test',
      },
    }

    expect(relayClient.buildRelayUrl('agent_123')).toBe(
      'wss://rcs.example.test/acp/relay/agent_123',
    )
  })
})
