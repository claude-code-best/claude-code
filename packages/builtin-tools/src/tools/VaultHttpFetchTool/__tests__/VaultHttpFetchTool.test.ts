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
import { setupAxiosMock } from '../../../../../../tests/mocks/axios'

// After this suite finishes, switch our getSecret override off so localVault's
// own store.test.ts (running in the same process) sees the real impl. Also
// flip the axios stub flag off so the spread mock falls through to real axios
// for any test file that runs after this one.
afterAll(() => {
  useMockForGetSecret = false
  getSecretShouldThrow = false
  axiosHandle.useStubs = false
})

beforeAll(() => {
  axiosHandle.useStubs = true
})

// We mock the LOWER layers (axios + localVault store + http util) rather
// than the tool itself, per memory feedback "Mock dependency not subject".

type AxiosRespLike = {
  status: number
  statusText: string
  headers: Record<string, string | string[]>
  data: string
}

const mockAxiosRequest = mock(
  async (): Promise<AxiosRespLike> => ({
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    data: '{"ok":true}',
  }),
)

const axiosHandle = setupAxiosMock()
axiosHandle.stubs.request = mockAxiosRequest

let mockedSecret: string | null = 'XSECRETXX'
let getSecretShouldThrow = false
// Sentinel: when true our tests use the per-test override; when false we
// delegate getSecret to the real impl so other test files (localVault's own
// store.test.ts) see real round-trip behavior.
let useMockForGetSecret = true
// Pre-import real store BEFORE mock.module is called so we keep references
// to real setSecret / deleteSecret / listKeys / maskSecret / error classes
// for delegation.
const realStore = await import('src/services/localVault/store.js')
mock.module('src/services/localVault/store.js', () => ({
  ...realStore,
  getSecret: async (key: string) => {
    if (getSecretShouldThrow) {
      throw new Error('vault unlock failed (mocked)')
    }
    if (useMockForGetSecret) return mockedSecret
    return realStore.getSecret(key)
  },
}))

// MACRO is a Bun build-time define injected at compile time. In bun:test
// it doesn't exist, so any code path that references it crashes. Inject a
// minimal MACRO object before any module under test imports
// src/utils/userAgent.ts (which references MACRO.VERSION).
;(globalThis as unknown as { MACRO: { VERSION: string } }).MACRO = {
  VERSION: '0.0.0-test',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

import { mockToolContext } from '../../../../../../tests/mocks/toolContext.js'
function mockContext() {
  return mockToolContext()
}

function makeAxiosResp(opts: {
  status?: number
  data?: string
  headers?: Record<string, string | string[]>
}) {
  return {
    status: opts.status ?? 200,
    statusText: 'STATUS',
    headers: opts.headers ?? {},
    data: opts.data ?? '',
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('VaultHttpFetchTool: schema + checkPermissions', () => {
  beforeEach(() => {
    mockAxiosRequest.mockClear()
    mockedSecret = 'XSECRETXX'
  })

  test('AC10: HTTP (non-https) URL is rejected at checkPermissions', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        url: 'http://insecure.example.com/api',
        method: 'GET',
        vault_auth_key: 'k',
        auth_scheme: 'bearer',
        reason: 'test',
      },
      mockContext(),
    )
    expect(result.behavior).toBe('deny')
    if (result.behavior === 'deny') {
      expect(result.message).toMatch(/https:\/\//)
    }
  })

  test('AC11: file:// is rejected', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        url: 'file:///etc/passwd',
        method: 'GET',
        vault_auth_key: 'k',
        auth_scheme: 'bearer',
        reason: 'test',
      },
      mockContext(),
    )
    expect(result.behavior).toBe('deny')
  })

  test('AC2: no allow rule → ask (not allow)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'gh',
        auth_scheme: 'bearer',
        reason: 'fetch repo',
      },
      mockContext(),
    )
    expect(result.behavior).toBe('ask')
  })

  test('invalid vault key (path-traversal-like) → deny', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: '../etc',
        auth_scheme: 'bearer',
        reason: 'test',
      },
      mockContext(),
    )
    expect(result.behavior).toBe('deny')
  })

  test('auth_scheme=custom requires auth_header_name', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'k',
        auth_scheme: 'custom',
        reason: 'test',
      },
      mockContext(),
    )
    expect(result.behavior).toBe('deny')
    if (result.behavior === 'deny') {
      expect(result.message).toMatch(/auth_header_name/)
    }
  })

  test('Tool definition: requiresUserInteraction = true (bypass-immune)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    expect(VaultHttpFetchTool.requiresUserInteraction!()).toBe(true)
  })

  test('Tool definition: isConcurrencySafe = false', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    expect(VaultHttpFetchTool.isConcurrencySafe!()).toBe(false)
  })
})

describe('VaultHttpFetchTool: call() — secret leak prevention', () => {
  beforeEach(() => {
    mockAxiosRequest.mockClear()
    mockedSecret = 'XSECRETXX'
  })

  test('AC4: secret never appears in returned data (Bearer scheme)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockAxiosRequest.mockImplementation(async () =>
      makeAxiosResp({ data: '{"hello":"world"}' }),
    )
    const result = await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'gh',
        auth_scheme: 'bearer',
        reason: 'test',
      },
      mockContext(),
    )
    const json = JSON.stringify(result.data)
    expect(json).not.toContain('XSECRETXX')
    expect(json).not.toContain('Bearer XSECRETXX')
  })

  test('AC14: secret echoed in 4xx response body is scrubbed', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    // Server returns 401 + body that echoes the auth header
    mockAxiosRequest.mockImplementation(async () =>
      makeAxiosResp({
        status: 401,
        data: 'Unauthorized: provided "Bearer XSECRETXX" is invalid',
      }),
    )
    const result = await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'POST',
        vault_auth_key: 'gh',
        auth_scheme: 'bearer',
        reason: 'test',
      },
      mockContext(),
    )
    expect(result.data.body).toBeDefined()
    expect(result.data.body).not.toContain('XSECRETXX')
    expect(result.data.body).toContain('[REDACTED]')
    // status preserved (4xx not in catch branch)
    expect(result.data.status).toBe(401)
  })

  test('AC15: secret echoed in 200 response body is scrubbed', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockAxiosRequest.mockImplementation(async () =>
      makeAxiosResp({
        status: 200,
        data: '{"echo":"Bearer XSECRETXX","ok":true}',
      }),
    )
    const result = await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'POST',
        vault_auth_key: 'gh',
        auth_scheme: 'bearer',
        reason: 'test',
      },
      mockContext(),
    )
    expect(result.data.body).not.toContain('XSECRETXX')
    expect(result.data.body).toContain('[REDACTED]')
  })

  test('AC16: all derived secret forms scrubbed (raw / Bearer / base64 / Basic)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const b64 = Buffer.from('XSECRETXX', 'utf8').toString('base64')
    mockAxiosRequest.mockImplementation(async () =>
      makeAxiosResp({
        data: `raw=XSECRETXX bearer=Bearer XSECRETXX b64=${b64} basic=Basic ${b64}`,
      }),
    )
    const result = await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'gh',
        auth_scheme: 'bearer',
        reason: 'test',
      },
      mockContext(),
    )
    expect(result.data.body).not.toContain('XSECRETXX')
    expect(result.data.body).not.toContain(b64)
  })

  test('AC9: response Authorization echo header is redacted by NAME', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockAxiosRequest.mockImplementation(async () =>
      makeAxiosResp({
        data: 'ok',
        headers: {
          authorization: 'Bearer XSECRETXX',
          'content-type': 'text/plain',
        },
      }),
    )
    const result = await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'gh',
        auth_scheme: 'bearer',
        reason: 'test',
      },
      mockContext(),
    )
    expect(result.data.responseHeaders!['authorization']).toBe('[REDACTED]')
    expect(result.data.responseHeaders!['content-type']).toBe('text/plain')
  })

  test('AC8: secret never appears in axios error path', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    class FakeAxiosError extends Error {
      config = { headers: { Authorization: 'Bearer XSECRETXX' } }
    }
    mockAxiosRequest.mockImplementation(async () => {
      throw new FakeAxiosError('connect ECONNREFUSED')
    })
    const result = await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'gh',
        auth_scheme: 'bearer',
        reason: 'test',
      },
      mockContext(),
    )
    expect(result.data.error).toBeDefined()
    expect(result.data.error).not.toContain('XSECRETXX')
    expect(result.data.error).not.toContain('Bearer')
  })

  test('AC17: maxRedirects=0 (no redirect Authorization re-leak)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockAxiosRequest.mockImplementation(async () =>
      makeAxiosResp({ data: 'ok' }),
    )
    await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'gh',
        auth_scheme: 'bearer',
        reason: 'test',
      },
      mockContext(),
    )
    expect(mockAxiosRequest).toHaveBeenCalledTimes(1)
    const calls = mockAxiosRequest.mock.calls as unknown as Array<
      Array<{ maxRedirects?: number }>
    >
    expect(calls[0]?.[0]?.maxRedirects).toBe(0)
  })

  test('vault key not found -> error message (no crash)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockedSecret = null
    const result = await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'missing',
        auth_scheme: 'bearer',
        reason: 'test',
      },
      mockContext(),
    )
    expect(result.data.error).toMatch(/not found/)
  })

  test('basic scheme uses base64 Authorization', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockAxiosRequest.mockImplementation(async () =>
      makeAxiosResp({ data: 'ok' }),
    )
    await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'k',
        auth_scheme: 'basic',
        reason: 'test',
      },
      mockContext(),
    )
    const calls = mockAxiosRequest.mock.calls as unknown as Array<
      Array<{ headers?: Record<string, string> }>
    >
    const callArgs = calls[0]?.[0] ?? { headers: {} }
    expect(callArgs.headers?.['Authorization']).toBe(
      `Basic ${Buffer.from('XSECRETXX', 'utf8').toString('base64')}`,
    )
  })

  test('header_x_api_key scheme sets X-Api-Key', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockAxiosRequest.mockImplementation(async () =>
      makeAxiosResp({ data: 'ok' }),
    )
    await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'k',
        auth_scheme: 'header_x_api_key',
        reason: 'test',
      },
      mockContext(),
    )
    const calls = mockAxiosRequest.mock.calls as unknown as Array<
      Array<{ headers?: Record<string, string> }>
    >
    const callArgs = calls[0]?.[0] ?? { headers: {} }
    expect(callArgs.headers?.['X-Api-Key']).toBe('XSECRETXX')
    expect(callArgs.headers?.['Authorization']).toBeUndefined()
  })

  test('auth_scheme=custom uses given auth_header_name', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockAxiosRequest.mockImplementation(async () => makeAxiosResp({ data: '' }))
    const result = await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'gh',
        auth_scheme: 'custom',
        auth_header_name: 'X-Custom-Auth',
        reason: 'test',
      },
      mockContext(),
    )
    const calls = mockAxiosRequest.mock.calls as unknown as Array<
      Array<{ headers?: Record<string, string> }>
    >
    const callArgs = calls[0]?.[0] ?? { headers: {} }
    expect(callArgs.headers?.['X-Custom-Auth']).toBe('XSECRETXX')
    expect(result.data).toBeDefined()
  })

  test('auth_scheme=basic encodes secret as base64 Bearer', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockAxiosRequest.mockImplementation(async () => makeAxiosResp({ data: '' }))
    await VaultHttpFetchTool.call(
      {
        url: 'https://api.example.com',
        method: 'GET',
        vault_auth_key: 'gh',
        auth_scheme: 'basic',
        reason: 'test',
      },
      mockContext(),
    )
    const calls = mockAxiosRequest.mock.calls as unknown as Array<
      Array<{ headers?: Record<string, string> }>
    >
    const auth = calls[0]?.[0]?.headers?.['Authorization']
    expect(auth).toMatch(/^Basic /)
    // 'XSECRETXX' base64 = 'WFNFQ1JFVFhY'
    expect(auth).toBe(`Basic ${Buffer.from('XSECRETXX').toString('base64')}`)
  })
})

describe('VaultHttpFetchTool: tool definition methods', () => {
  test('isReadOnly returns false (has network side-effects)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    expect(VaultHttpFetchTool.isReadOnly()).toBe(false)
  })

  test('isConcurrencySafe returns false', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    expect(VaultHttpFetchTool.isConcurrencySafe()).toBe(false)
  })

  test('requiresUserInteraction returns true (bypass-immune)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    expect(VaultHttpFetchTool.requiresUserInteraction()).toBe(true)
  })

  test('userFacingName returns "Vault HTTP"', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    expect(VaultHttpFetchTool.userFacingName()).toBe('Vault HTTP')
  })

  test('description returns DESCRIPTION constant', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const desc = await VaultHttpFetchTool.description()
    expect(typeof desc).toBe('string')
    expect(desc.length).toBeGreaterThan(0)
  })

  test('prompt returns the PROMPT constant', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const p = await VaultHttpFetchTool.prompt()
    expect(typeof p).toBe('string')
    expect(p.length).toBeGreaterThan(0)
  })

  test('toAutoClassifierInput formats method+url', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const out = VaultHttpFetchTool.toAutoClassifierInput({
      vault_auth_key: 'k',
      url: 'https://example.com/x',
      method: 'POST',
      reason: 'r',
    } as never)
    expect(out).toBe('POST https://example.com/x')
  })

  test('toAutoClassifierInput defaults method to GET when undefined', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const out = VaultHttpFetchTool.toAutoClassifierInput({
      vault_auth_key: 'k',
      url: 'https://example.com',
      reason: 'r',
    } as never)
    expect(out).toBe('GET https://example.com')
  })
})

describe('VaultHttpFetchTool: call() error paths', () => {
  beforeEach(() => {
    mockedSecret = 'XSECRETXX'
    getSecretShouldThrow = false
  })

  afterEach(() => {
    getSecretShouldThrow = false
  })

  test('getSecret throws → returns "Vault unlock failed" + logs analytics', async () => {
    getSecretShouldThrow = true
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.call(
      {
        vault_auth_key: 'k',
        url: 'https://example.com',
        method: 'GET',
        reason: 'r',
      } as never,
      mockContext() as never,
    )
    const data = (result as { data: { error?: string } }).data
    expect(data.error).toBe('Vault unlock failed')
  })

  test('non-HTTPS URL is rejected (defense in depth)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.call(
      {
        vault_auth_key: 'k',
        url: 'http://insecure.example.com/x',
        method: 'GET',
        reason: 'r',
      } as never,
      mockContext() as never,
    )
    const data = (result as { data: { error?: string } }).data
    expect(data.error).toContain('https://')
  })

  test('isHttps catches malformed URL (returns false → rejected)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.call(
      {
        vault_auth_key: 'k',
        url: 'not-a-real-url-at-all',
        method: 'GET',
        reason: 'r',
      } as never,
      mockContext() as never,
    )
    const data = (result as { data: { error?: string } }).data
    expect(data.error).toBeDefined()
  })

  test('vault key missing returns "not found" error', async () => {
    mockedSecret = null
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.call(
      {
        vault_auth_key: 'missing-key',
        url: 'https://example.com',
        method: 'GET',
        reason: 'r',
      } as never,
      mockContext() as never,
    )
    const data = (result as { data: { error?: string } }).data
    expect(data.error).toContain("'missing-key' not found")
  })
})

describe('AC18: VaultHttpFetch is in ALL_AGENT_DISALLOWED_TOOLS', () => {
  // Direct import of src/constants/tools.js depends on bun:bundle feature()
  // macros that don't resolve outside full-build context, and the various
  // mocks in this file can interfere when the suite is run together. Use a
  // grep snapshot — same approach as agentToolFilter AC11b.
  test('subagent gate layer 1 registration is wired', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const file = path.resolve('src/constants/tools.ts')
    const src = fs.readFileSync(file, 'utf8')
    // (a) constant is imported
    expect(src).toContain('VAULT_HTTP_FETCH_TOOL_NAME')
    expect(src).toContain(
      "from '@claude-code-best/builtin-tools/tools/VaultHttpFetchTool/constants.js'",
    )
    // (b) and used in the ALL_AGENT_DISALLOWED_TOOLS region.
    // Find the export and verify VAULT_HTTP_FETCH_TOOL_NAME appears before the
    // CUSTOM_AGENT_DISALLOWED_TOOLS (next export). This avoids a fragile
    // greedy-regex match against the nested AGENT_TOOL_NAME ternary.
    const exportIdx = src.indexOf(
      'export const ALL_AGENT_DISALLOWED_TOOLS = new Set(',
    )
    const customIdx = src.indexOf('export const CUSTOM_AGENT_DISALLOWED_TOOLS')
    expect(exportIdx).toBeGreaterThan(-1)
    expect(customIdx).toBeGreaterThan(exportIdx)
    const region = src.slice(exportIdx, customIdx)
    expect(region).toContain('VAULT_HTTP_FETCH_TOOL_NAME')
  })
})

describe('VaultHttpFetchTool: deny/allow rule branches', () => {
  test('deny rule for key@host → checkPermissions deny with rule reason', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        vault_auth_key: 'gh-token',
        url: 'https://api.example.com',
        method: 'GET',
        auth_scheme: 'bearer',
        reason: 'r',
      } as never,
      mockToolContext({
        permissionOverrides: {
          alwaysDenyRules: {
            userSettings: ['VaultHttpFetch(gh-token@api.example.com)'],
            projectSettings: [],
            localSettings: [],
            flagSettings: [],
            policySettings: [],
            cliArg: [],
            command: [],
          },
        },
      }) as never,
    )
    expect(result.behavior).toBe('deny')
    if (result.behavior === 'deny') {
      expect(result.message).toContain('Denied by rule')
    }
  })

  test('wildcard deny rule (key@*) matches any host', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        vault_auth_key: 'gh-token',
        url: 'https://different-host.example.com',
        method: 'GET',
        auth_scheme: 'bearer',
        reason: 'r',
      } as never,
      mockToolContext({
        permissionOverrides: {
          alwaysDenyRules: {
            userSettings: ['VaultHttpFetch(gh-token@*)'],
            projectSettings: [],
            localSettings: [],
            flagSettings: [],
            policySettings: [],
            cliArg: [],
            command: [],
          },
        },
      }) as never,
    )
    expect(result.behavior).toBe('deny')
  })

  test('allow rule for key@host → checkPermissions allow', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        vault_auth_key: 'gh-token',
        url: 'https://api.example.com',
        method: 'GET',
        auth_scheme: 'bearer',
        reason: 'r',
      } as never,
      mockToolContext({
        permissionOverrides: {
          alwaysAllowRules: {
            userSettings: ['VaultHttpFetch(gh-token@api.example.com)'],
            projectSettings: [],
            localSettings: [],
            flagSettings: [],
            policySettings: [],
            cliArg: [],
            command: [],
          },
        },
      }) as never,
    )
    expect(result.behavior).toBe('allow')
  })

  test('wildcard allow rule (key@*) matches any host', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        vault_auth_key: 'gh-token',
        url: 'https://random.example.com',
        method: 'POST',
        auth_scheme: 'bearer',
        reason: 'r',
      } as never,
      mockToolContext({
        permissionOverrides: {
          alwaysAllowRules: {
            userSettings: ['VaultHttpFetch(gh-token@*)'],
            projectSettings: [],
            localSettings: [],
            flagSettings: [],
            policySettings: [],
            cliArg: [],
            command: [],
          },
        },
      }) as never,
    )
    expect(result.behavior).toBe('allow')
  })

  // ── M2 (codecov-100 audit #5): port and IPv6 host scoping ──
  // The `host` property of `URL` includes :port and IPv6 brackets verbatim,
  // and the rule content is built from it directly. These tests pin that
  // contract so any future regression that strips ports (and weakens the
  // permission scope) or strips brackets (breaking IPv6 round-trip) is
  // caught.
  test('M2: distinct ports on the same host are distinct permission scopes', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    // Allow rule scoped to port 8080. Request to port 8443 must NOT match.
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        vault_auth_key: 'gh-token',
        url: 'https://api.example.com:8443/path',
        method: 'GET',
        auth_scheme: 'bearer',
        reason: 'r',
      } as never,
      mockToolContext({
        permissionOverrides: {
          alwaysAllowRules: {
            userSettings: ['VaultHttpFetch(gh-token@api.example.com:8080)'],
            projectSettings: [],
            localSettings: [],
            flagSettings: [],
            policySettings: [],
            cliArg: [],
            command: [],
          },
        },
      }) as never,
    )
    // No matching allow → falls through to ask (per docstring: bypass-immune)
    expect(result.behavior).toBe('ask')
  })

  test('M2: same port DOES match allow rule', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        vault_auth_key: 'gh-token',
        url: 'https://api.example.com:8080/path',
        method: 'GET',
        auth_scheme: 'bearer',
        reason: 'r',
      } as never,
      mockToolContext({
        permissionOverrides: {
          alwaysAllowRules: {
            userSettings: ['VaultHttpFetch(gh-token@api.example.com:8080)'],
            projectSettings: [],
            localSettings: [],
            flagSettings: [],
            policySettings: [],
            cliArg: [],
            command: [],
          },
        },
      }) as never,
    )
    expect(result.behavior).toBe('allow')
  })

  test('M2: IPv6 literal with brackets round-trips through allow rule', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    // new URL('https://[::1]:8080/').host === '[::1]:8080' (lowercase preserved)
    const result = await VaultHttpFetchTool.checkPermissions!(
      {
        vault_auth_key: 'gh-token',
        url: 'https://[::1]:8080/path',
        method: 'GET',
        auth_scheme: 'bearer',
        reason: 'r',
      } as never,
      mockToolContext({
        permissionOverrides: {
          alwaysAllowRules: {
            userSettings: ['VaultHttpFetch(gh-token@[::1]:8080)'],
            projectSettings: [],
            localSettings: [],
            flagSettings: [],
            policySettings: [],
            cliArg: [],
            command: [],
          },
        },
      }) as never,
    )
    expect(result.behavior).toBe('allow')
  })
})

describe('VaultHttpFetchTool: call() additional paths', () => {
  beforeEach(() => {
    mockAxiosRequest.mockClear()
    mockedSecret = 'XSECRETXX'
    getSecretShouldThrow = false
  })

  test('auth_scheme=custom without auth_header_name returns error (defensive)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.call(
      {
        vault_auth_key: 'k',
        url: 'https://example.com',
        method: 'GET',
        auth_scheme: 'custom',
        // auth_header_name missing on purpose (checkPermissions normally catches)
        reason: 'r',
      } as never,
      mockContext() as never,
    )
    const data = (result as { data: { error?: string } }).data
    expect(data.error).toContain('auth_header_name')
  })

  test('body sets Content-Type header (default application/json)', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockAxiosRequest.mockImplementation(async () => makeAxiosResp({ data: '' }))
    await VaultHttpFetchTool.call(
      {
        vault_auth_key: 'gh',
        url: 'https://api.example.com',
        method: 'POST',
        body: '{"x":1}',
        auth_scheme: 'bearer',
        reason: 'r',
      } as never,
      mockContext() as never,
    )
    const calls = mockAxiosRequest.mock.calls as unknown as Array<
      Array<{ headers?: Record<string, string> }>
    >
    expect(calls[0]?.[0]?.headers?.['Content-Type']).toBe('application/json')
  })

  test('body with explicit body_content_type uses that value', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockAxiosRequest.mockImplementation(async () => makeAxiosResp({ data: '' }))
    await VaultHttpFetchTool.call(
      {
        vault_auth_key: 'gh',
        url: 'https://api.example.com',
        method: 'POST',
        body: 'plain text',
        body_content_type: 'text/plain',
        auth_scheme: 'bearer',
        reason: 'r',
      } as never,
      mockContext() as never,
    )
    const calls = mockAxiosRequest.mock.calls as unknown as Array<
      Array<{ headers?: Record<string, string> }>
    >
    expect(calls[0]?.[0]?.headers?.['Content-Type']).toBe('text/plain')
  })

  test('response with null data is coerced to empty string', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    mockAxiosRequest.mockImplementation(async () =>
      makeAxiosResp({ data: null as unknown as string }),
    )
    const result = await VaultHttpFetchTool.call(
      {
        vault_auth_key: 'gh',
        url: 'https://api.example.com',
        method: 'GET',
        auth_scheme: 'bearer',
        reason: 'r',
      } as never,
      mockContext() as never,
    )
    expect(result.data.body).toBe('')
  })

  test('response with non-string data (Buffer-like) is coerced via String()', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const buf = Buffer.from('binary-content', 'utf8')
    mockAxiosRequest.mockImplementation(async () =>
      makeAxiosResp({ data: buf as unknown as string }),
    )
    const result = await VaultHttpFetchTool.call(
      {
        vault_auth_key: 'gh',
        url: 'https://api.example.com',
        method: 'GET',
        auth_scheme: 'bearer',
        reason: 'r',
      } as never,
      mockContext() as never,
    )
    expect(result.data.body).toContain('binary-content')
  })
})

describe('VaultHttpFetchTool: mapToolResultToToolResultBlockParam', () => {
  test('non-error output has is_error=false', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const out = VaultHttpFetchTool.mapToolResultToToolResultBlockParam!(
      {
        status: 200,
        body: 'ok',
        statusText: 'OK',
        responseHeaders: {},
      } as never,
      'tool-use-1',
    )
    expect(out.tool_use_id).toBe('tool-use-1')
    expect(out.is_error).toBe(false)
    expect(typeof out.content).toBe('string')
  })

  test('error output has is_error=true', async () => {
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const out = VaultHttpFetchTool.mapToolResultToToolResultBlockParam!(
      { error: 'Vault unlock failed' } as never,
      'tool-use-2',
    )
    expect(out.is_error).toBe(true)
  })

  test('unknown auth_scheme returns error (exhaustive default branch)', async () => {
    // Bypass TypeScript exhaustive type to exercise the never-guard default.
    const { VaultHttpFetchTool } = await import('../VaultHttpFetchTool.js')
    const result = await VaultHttpFetchTool.call(
      {
        vault_auth_key: 'k',
        url: 'https://example.com',
        method: 'GET',
        auth_scheme: 'invalid_scheme_xyz' as never,
        reason: 'r',
      } as never,
      mockContext() as never,
    )
    const data = (result as { data: { error?: string } }).data
    expect(data.error).toContain('Unknown auth_scheme')
  })
})
