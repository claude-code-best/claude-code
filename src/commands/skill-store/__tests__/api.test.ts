/**
 * Regression tests for skillsApi.ts
 *
 * Key invariants under test:
 *   - Every request MUST include ?beta=true query parameter
 *   - listSkills: GET /v1/skills?beta=true
 *   - getSkill:   GET /v1/skills/{id}?beta=true
 *   - getSkillVersions: GET /v1/skills/{id}/versions?beta=true
 *   - getSkillVersion:  GET /v1/skills/{id}/versions/{v}?beta=true
 *   - createSkill: POST /v1/skills?beta=true
 *   - deleteSkill: DELETE /v1/skills/{id}?beta=true
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
const mockApiKey = 'sk-ant-api03-test-skill-store-key'

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
axiosHandle.stubs.delete = axiosDeleteMock
axiosHandle.stubs.isAxiosError = axiosIsAxiosError

// ── Lazy import after mocks ─────────────────────────────────────────────────
let listSkills: typeof import('../skillsApi.js').listSkills
let getSkill: typeof import('../skillsApi.js').getSkill
let getSkillVersions: typeof import('../skillsApi.js').getSkillVersions
let getSkillVersion: typeof import('../skillsApi.js').getSkillVersion
let createSkill: typeof import('../skillsApi.js').createSkill
let deleteSkill: typeof import('../skillsApi.js').deleteSkill

beforeAll(async () => {
  axiosHandle.useStubs = true
  const mod = await import('../skillsApi.js')
  listSkills = mod.listSkills
  getSkill = mod.getSkill
  getSkillVersions = mod.getSkillVersions
  getSkillVersion = mod.getSkillVersion
  createSkill = mod.createSkill
  deleteSkill = mod.deleteSkill
})

afterAll(() => {
  axiosHandle.useStubs = false
})

beforeEach(() => {
  axiosGetMock.mockClear()
  axiosPostMock.mockClear()
  axiosDeleteMock.mockClear()
  prepareWorkspaceApiRequestMock.mockClear()
  process.env['ANTHROPIC_API_KEY'] = mockApiKey
})

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY']
})

// ── REGRESSION: All endpoints MUST include ?beta=true ─────────────────────
describe('beta=true query invariant', () => {
  test('listSkills includes ?beta=true in URL', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listSkills()
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('beta=true')
    expect(url).toContain('/v1/skills')
  })

  test('getSkill includes ?beta=true in URL', async () => {
    const skill = {
      skill_id: 'sk_1',
      name: 'my-skill',
      owner: 'user',
      deprecated: false,
    }
    axiosGetMock.mockResolvedValueOnce({ data: skill, status: 200 })
    await getSkill('sk_1')
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('beta=true')
    expect(url).toContain('sk_1')
    expect(url).toContain('/v1/skills/')
  })

  test('getSkillVersions includes ?beta=true in URL', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await getSkillVersions('sk_1')
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('beta=true')
    expect(url).toContain('sk_1')
    expect(url).toContain('/versions')
  })

  test('getSkillVersion includes ?beta=true in URL', async () => {
    const ver = {
      version: 'v1',
      skill_id: 'sk_1',
      body: '# Skill',
      created_at: '2024-01-01',
    }
    axiosGetMock.mockResolvedValueOnce({ data: ver, status: 200 })
    await getSkillVersion('sk_1', 'v1')
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('beta=true')
    expect(url).toContain('sk_1')
    expect(url).toContain('v1')
    expect(url).toContain('/versions/')
  })

  test('createSkill includes ?beta=true in URL', async () => {
    const skill = {
      skill_id: 'sk_new',
      name: 'new-skill',
      owner: 'user',
      deprecated: false,
    }
    axiosPostMock.mockResolvedValueOnce({ data: skill, status: 201 })
    await createSkill('new-skill', '# New Skill\nContent')
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      unknown,
      unknown,
    ][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('beta=true')
    expect(url).toContain('/v1/skills')
  })

  test('deleteSkill includes ?beta=true in URL', async () => {
    axiosDeleteMock.mockResolvedValueOnce({ data: {}, status: 204 })
    await deleteSkill('sk_1')
    const calls = axiosDeleteMock.mock.calls as unknown as [string, unknown][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('beta=true')
    expect(url).toContain('sk_1')
    expect(url).toContain('/v1/skills/')
  })
})

// ── Happy path tests ────────────────────────────────────────────────────────
describe('listSkills', () => {
  test('returns empty array on empty data', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    const result = await listSkills()
    expect(result).toEqual([])
  })

  test('returns skills list', async () => {
    const skills = [
      { skill_id: 'sk_1', name: 'skill-a', owner: 'alice', deprecated: false },
      { skill_id: 'sk_2', name: 'skill-b', owner: 'bob', deprecated: true },
    ]
    axiosGetMock.mockResolvedValueOnce({ data: { data: skills }, status: 200 })
    const result = await listSkills()
    expect(result).toHaveLength(2)
    expect(result[0]?.skill_id).toBe('sk_1')
  })
})

describe('getSkill', () => {
  test('returns skill detail', async () => {
    const skill = {
      skill_id: 'sk_1',
      name: 'my-skill',
      owner: 'user',
      deprecated: false,
    }
    axiosGetMock.mockResolvedValueOnce({ data: skill, status: 200 })
    const result = await getSkill('sk_1')
    expect(result.skill_id).toBe('sk_1')
    expect(result.name).toBe('my-skill')
  })
})

describe('getSkillVersions', () => {
  test('returns versions list', async () => {
    const versions = [
      {
        version: 'v1',
        skill_id: 'sk_1',
        body: '# v1',
        created_at: '2024-01-01',
      },
    ]
    axiosGetMock.mockResolvedValueOnce({
      data: { data: versions },
      status: 200,
    })
    const result = await getSkillVersions('sk_1')
    expect(result).toHaveLength(1)
    expect(result[0]?.version).toBe('v1')
  })
})

describe('getSkillVersion', () => {
  test('returns specific version', async () => {
    const ver = {
      version: 'v2',
      skill_id: 'sk_1',
      body: '# v2',
      created_at: '2024-02-01',
    }
    axiosGetMock.mockResolvedValueOnce({ data: ver, status: 200 })
    const result = await getSkillVersion('sk_1', 'v2')
    expect(result.version).toBe('v2')
    expect(result.body).toBe('# v2')
  })
})

describe('createSkill', () => {
  test('creates and returns skill', async () => {
    const skill = {
      skill_id: 'sk_new',
      name: 'new-skill',
      owner: 'user',
      deprecated: false,
    }
    axiosPostMock.mockResolvedValueOnce({ data: skill, status: 201 })
    const result = await createSkill('new-skill', '# New Skill\nContent')
    expect(result.skill_id).toBe('sk_new')
    // Verify body contains name and markdown
    const calls = axiosPostMock.mock.calls as unknown as [
      string,
      unknown,
      unknown,
    ][]
    const body = calls[0]?.[1] as { name: string; body: string }
    expect(body.name).toBe('new-skill')
    expect(body.body).toBe('# New Skill\nContent')
  })
})

describe('deleteSkill', () => {
  test('calls DELETE on skill id', async () => {
    axiosDeleteMock.mockResolvedValueOnce({ data: {}, status: 204 })
    await deleteSkill('sk_del')
    expect(axiosDeleteMock).toHaveBeenCalledTimes(1)
    const calls = axiosDeleteMock.mock.calls as unknown as [string, unknown][]
    const url = calls[0]?.[0] as string
    expect(url).toContain('sk_del')
  })
})

// ── Error classification tests ──────────────────────────────────────────────
describe('error classification', () => {
  function makeAxiosError(
    status: number,
    message?: string,
    retryAfter?: string,
  ) {
    return {
      isAxiosError: true,
      response: {
        status,
        data: message ? { error: { message } } : {},
        headers: retryAfter ? { 'retry-after': retryAfter } : {},
      },
      message: message ?? `HTTP ${status}`,
    }
  }

  test('401 gives auth error message', async () => {
    axiosGetMock.mockRejectedValueOnce(makeAxiosError(401))
    await expect(listSkills()).rejects.toThrow(
      /[Aa]uthentication failed|Not authenticated/,
    )
  })

  test('403 gives subscription required message', async () => {
    axiosGetMock.mockRejectedValueOnce(makeAxiosError(403))
    await expect(listSkills()).rejects.toThrow(/[Ss]ubscription/)
  })

  test('404 gives not found message', async () => {
    axiosGetMock.mockRejectedValueOnce(makeAxiosError(404))
    await expect(getSkill('missing')).rejects.toThrow(/not found/)
  })

  test('429 includes retry-after in message', async () => {
    axiosGetMock.mockRejectedValueOnce(makeAxiosError(429, undefined, '30'))
    await expect(listSkills()).rejects.toThrow(/[Rr]ate limit|30/)
  })

  test('5xx retries up to 3 times before throwing', async () => {
    const err = makeAxiosError(500)
    axiosGetMock
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
    await expect(listSkills()).rejects.toThrow()
    expect(axiosGetMock).toHaveBeenCalledTimes(3)
  })

  test('4xx (non-401/403/404/429) does NOT retry', async () => {
    axiosGetMock.mockRejectedValueOnce(makeAxiosError(400, 'Bad request'))
    await expect(listSkills()).rejects.toThrow()
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
  })
})

// ── Invariant: buildHeaders must return x-api-key, not Authorization ─────────
describe('invariant: x-api-key present, no Authorization, no x-organization-uuid', () => {
  test('buildHeaders returns x-api-key header (workspace key)', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listSkills()
    const calls = axiosGetMock.mock.calls as unknown as [
      string,
      { headers: Record<string, string> },
    ][]
    const headers = calls[0]?.[1]?.headers ?? {}
    expect(headers['x-api-key']).toBe(mockApiKey)
  })

  test('buildHeaders does NOT include Authorization header', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listSkills()
    const calls = axiosGetMock.mock.calls as unknown as [
      string,
      { headers: Record<string, string> },
    ][]
    const headers = calls[0]?.[1]?.headers ?? {}
    expect(headers['Authorization']).toBeUndefined()
  })

  test('buildHeaders does NOT include x-organization-uuid header', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listSkills()
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
    await listSkills()
    expect(prepareWorkspaceApiRequestMock).toHaveBeenCalledTimes(1)
  })

  test('request goes to api.anthropic.com (host guard passes for correct host)', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    await listSkills()
    const calls = axiosGetMock.mock.calls as unknown as [string, unknown][]
    expect(calls[0]?.[0]).toContain('api.anthropic.com')
  })
})
