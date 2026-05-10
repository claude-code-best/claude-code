/**
 * Tests for launchSkillStore.tsx
 *
 * Strategy per feedback_mock_dependency_not_subject:
 * - DO NOT mock skillsApi.ts itself (would pollute api.test.ts)
 * - Mock axios (the underlying HTTP layer) to control API responses
 * - Mock fs/promises for install filesystem operations
 * - Let real skillsApi functions run real code paths
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
  getClaudeAIOAuthTokens: () => ({ accessToken: 'test-token' }),
}))
mock.module('src/services/oauth/client.js', () => ({
  getOrganizationUUID: async () => 'org-uuid',
}))
mock.module('src/constants/oauth.js', () => ({
  getOauthConfig: () => ({ BASE_API_URL: 'https://api.anthropic.com' }),
}))
// Spread real teleport/api so any export not explicitly stubbed (like
// prepareWorkspaceApiRequest, axiosGetWithRetry, type guards, schemas)
// remains available to transitive importers.
const realTeleportApi = await import('src/utils/teleport/api.js')
mock.module('src/utils/teleport/api.js', () => ({
  ...realTeleportApi,
  getOAuthHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }),
  prepareWorkspaceApiRequest: async () => ({
    apiKey: 'test-workspace-key',
  }),
}))

// ── envUtils config dir injection ────────────────────────────────────────────
// Don't mock the envUtils module — that's process-level and leaks to other
// tests' getClaudeConfigHomeDir consumers (see feedback_mock_dependency_not_subject).
// Instead inject CLAUDE_CONFIG_DIR via process.env and clear the lodash memoize
// cache around each test so the real getClaudeConfigHomeDir reads our value.
const mockConfigDir = '/tmp/test-claude-config'

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

// ── fs/promises mock ─────────────────────────────────────────────────────────
// Bun's mock.module is global per-process and last-write-wins. Replacing
// node:fs/promises with only mkdir + writeFile breaks every other test in
// the same `bun test` run that imports readFile / readdir / unlink / chmod /
// etc. (notably src/services/localVault/__tests__/store.test.ts).
//
// Use require() INSIDE the factory (same trick as SessionMemory/prompts.test)
// so we get the truly-real module bypassing the mock registry. Gate our two
// stubs behind useSkillStoreFsStubs (default off; beforeAll flips on; afterAll
// flips off).
const mkdirMock = mock(async (..._args: unknown[]) => undefined)
const writeFileMock = mock(async (..._args: unknown[]) => undefined)
let useSkillStoreFsStubs = false
mock.module('node:fs/promises', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const real = require('node:fs/promises') as Record<string, unknown>
  return {
    ...real,
    default: real,
    mkdir: (...args: unknown[]) =>
      useSkillStoreFsStubs
        ? mkdirMock(...args)
        : (real.mkdir as (...a: unknown[]) => Promise<unknown>)(...args),
    writeFile: (...args: unknown[]) =>
      useSkillStoreFsStubs
        ? writeFileMock(...args)
        : (real.writeFile as (...a: unknown[]) => Promise<unknown>)(...args),
  }
})

// ── Lazy imports ─────────────────────────────────────────────────────────────
let callSkillStore: typeof import('../launchSkillStore.js').callSkillStore
let getClaudeConfigHomeDir: typeof import('../../../utils/envUtils.js').getClaudeConfigHomeDir
let origConfigDir: string | undefined

beforeAll(async () => {
  axiosHandle.useStubs = true
  const mod = await import('../launchSkillStore.js')
  callSkillStore = mod.callSkillStore
  const envMod = await import('../../../utils/envUtils.js')
  getClaudeConfigHomeDir = envMod.getClaudeConfigHomeDir
  origConfigDir = process.env.CLAUDE_CONFIG_DIR
  useSkillStoreFsStubs = true
})

// Flip the stub flag off after this suite so localVault/store and other
// fs-dependent tests in the same process see real readFile/readdir/etc.
afterAll(() => {
  axiosHandle.useStubs = false
  useSkillStoreFsStubs = false
})

beforeEach(() => {
  axiosGetMock.mockClear()
  axiosPostMock.mockClear()
  axiosDeleteMock.mockClear()
  mkdirMock.mockClear()
  writeFileMock.mockClear()
  logEventMock.mockClear()
  // Inject our mock config dir + bust lodash memoize so real
  // getClaudeConfigHomeDir reads the freshly-set env var.
  process.env.CLAUDE_CONFIG_DIR = mockConfigDir
  getClaudeConfigHomeDir.cache?.clear?.()
})

afterEach(() => {
  // Restore env so we don't leak mockConfigDir into other test files.
  if (origConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = origConfigDir
  }
  getClaudeConfigHomeDir.cache?.clear?.()
})

// ── Helper ────────────────────────────────────────────────────────────────────
function makeOnDone() {
  const calls: [string | undefined, unknown][] = []
  const onDone = (msg?: string, opts?: unknown) => calls.push([msg, opts])
  return { onDone, calls }
}

// ── list ──────────────────────────────────────────────────────────────────────
describe('list action', () => {
  test('calls listSkills and returns element on success', async () => {
    const skills = [
      { skill_id: 'sk_1', name: 'skill-a', owner: 'alice', deprecated: false },
    ]
    axiosGetMock.mockResolvedValueOnce({ data: { data: skills }, status: 200 })
    const { onDone } = makeOnDone()
    const result = await callSkillStore(onDone, {} as never, 'list')
    expect(result).not.toBeNull()
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
  })

  test('empty list returns element', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { data: [] }, status: 200 })
    const { onDone, calls } = makeOnDone()
    await callSkillStore(onDone, {} as never, 'list')
    expect(calls[0]?.[0]).toContain('No skills')
  })

  test('API error reports failure', async () => {
    axiosGetMock.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401 },
      message: 'Unauthorized',
    })
    const { onDone, calls } = makeOnDone()
    await callSkillStore(onDone, {} as never, 'list')
    expect(calls[0]?.[0]).toContain('Failed')
  })
})

// ── get ───────────────────────────────────────────────────────────────────────
describe('get action', () => {
  test('fetches and returns skill detail', async () => {
    const skill = {
      skill_id: 'sk_1',
      name: 'my-skill',
      owner: 'user',
      deprecated: false,
    }
    axiosGetMock.mockResolvedValueOnce({ data: skill, status: 200 })
    const { onDone } = makeOnDone()
    const result = await callSkillStore(onDone, {} as never, 'get sk_1')
    expect(result).not.toBeNull()
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
  })

  test('API 404 reports failure', async () => {
    axiosGetMock.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404 },
      message: 'Not found',
    })
    const { onDone, calls } = makeOnDone()
    await callSkillStore(onDone, {} as never, 'get missing_id')
    expect(calls[0]?.[0]).toContain('Failed')
  })
})

// ── versions ──────────────────────────────────────────────────────────────────
describe('versions action', () => {
  test('fetches and returns versions', async () => {
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
    const { onDone } = makeOnDone()
    const result = await callSkillStore(onDone, {} as never, 'versions sk_1')
    expect(result).not.toBeNull()
  })
})

// ── version ───────────────────────────────────────────────────────────────────
describe('version action', () => {
  test('fetches specific version', async () => {
    const ver = {
      version: 'v2',
      skill_id: 'sk_1',
      body: '# v2',
      created_at: '2024-02-01',
    }
    axiosGetMock.mockResolvedValueOnce({ data: ver, status: 200 })
    const { onDone } = makeOnDone()
    const result = await callSkillStore(onDone, {} as never, 'version sk_1 v2')
    expect(result).not.toBeNull()
    expect(axiosGetMock).toHaveBeenCalledTimes(1)
  })
})

// ── create ────────────────────────────────────────────────────────────────────
describe('create action', () => {
  test('creates skill and returns result', async () => {
    const skill = {
      skill_id: 'sk_new',
      name: 'new-skill',
      owner: 'user',
      deprecated: false,
    }
    axiosPostMock.mockResolvedValueOnce({ data: skill, status: 201 })
    const { onDone } = makeOnDone()
    const result = await callSkillStore(
      onDone,
      {} as never,
      'create new-skill # Skill Content',
    )
    expect(result).not.toBeNull()
    expect(axiosPostMock).toHaveBeenCalledTimes(1)
  })
})

// ── delete ────────────────────────────────────────────────────────────────────
describe('delete action', () => {
  test('deletes skill and confirms', async () => {
    axiosDeleteMock.mockResolvedValueOnce({ data: {}, status: 204 })
    const { onDone, calls } = makeOnDone()
    const result = await callSkillStore(onDone, {} as never, 'delete sk_del')
    expect(result).not.toBeNull()
    expect(calls[0]?.[0]).toContain('deleted')
  })
})

// ── install ───────────────────────────────────────────────────────────────────
describe('install action', () => {
  test('install <id> fetches skill + versions, writes SKILL.md', async () => {
    const skill = {
      skill_id: 'sk_1',
      name: 'my-skill',
      owner: 'user',
      deprecated: false,
    }
    const versions = [
      {
        version: 'v1',
        skill_id: 'sk_1',
        body: '# My Skill Content',
        created_at: '2024-01-01',
      },
    ]
    // First call: getSkill, Second call: getSkillVersions
    axiosGetMock
      .mockResolvedValueOnce({ data: skill, status: 200 })
      .mockResolvedValueOnce({ data: { data: versions }, status: 200 })

    const { onDone, calls } = makeOnDone()
    const result = await callSkillStore(onDone, {} as never, 'install sk_1')
    expect(result).not.toBeNull()
    expect(mkdirMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock).toHaveBeenCalledTimes(1)
    const writeCall = writeFileMock.mock.calls[0] as unknown as [
      string,
      string,
      string,
    ]
    expect(writeCall[0]).toContain('SKILL.md')
    expect(writeCall[0]).toContain('my-skill')
    expect(writeCall[1]).toBe('# My Skill Content')
    expect(calls[0]?.[0]).toContain('installed')
  })

  test('install <id>@<version> fetches specific version and writes SKILL.md', async () => {
    const ver = {
      version: 'v2',
      skill_id: 'sk_1',
      body: '# v2 Content',
      created_at: '2024-02-01',
    }
    axiosGetMock.mockResolvedValueOnce({ data: ver, status: 200 })

    const { onDone, calls } = makeOnDone()
    const result = await callSkillStore(onDone, {} as never, 'install sk_1@v2')
    expect(result).not.toBeNull()
    expect(writeFileMock).toHaveBeenCalledTimes(1)
    const writeCall = writeFileMock.mock.calls[0] as unknown as [
      string,
      string,
      string,
    ]
    expect(writeCall[1]).toBe('# v2 Content')
    expect(calls[0]?.[0]).toContain('installed')
  })

  test('install skill with no versions shows error', async () => {
    const skill = {
      skill_id: 'sk_nover',
      name: 'no-ver-skill',
      owner: 'user',
      deprecated: false,
    }
    axiosGetMock
      .mockResolvedValueOnce({ data: skill, status: 200 })
      .mockResolvedValueOnce({ data: { data: [] }, status: 200 })

    const { onDone, calls } = makeOnDone()
    const result = await callSkillStore(onDone, {} as never, 'install sk_nover')
    expect(result).not.toBeNull()
    expect(calls[0]?.[0]).toContain('no published versions')
    expect(writeFileMock).not.toHaveBeenCalled()
  })

  test('install writes to ~/.claude/skills/<name>/SKILL.md path', async () => {
    const skill = {
      skill_id: 'sk_path',
      name: 'path-test',
      owner: 'user',
      deprecated: false,
    }
    const versions = [
      {
        version: 'v1',
        skill_id: 'sk_path',
        body: '# Path Test',
        created_at: '2024-01-01',
      },
    ]
    axiosGetMock
      .mockResolvedValueOnce({ data: skill, status: 200 })
      .mockResolvedValueOnce({ data: { data: versions }, status: 200 })

    const { onDone } = makeOnDone()
    await callSkillStore(onDone, {} as never, 'install sk_path')

    const mkdirCall = mkdirMock.mock.calls[0] as unknown as [
      string,
      { recursive: boolean },
    ]
    expect(mkdirCall[0]).toContain('skills')
    expect(mkdirCall[0]).toContain('path-test')

    const writeCall = writeFileMock.mock.calls[0] as unknown as [
      string,
      string,
      string,
    ]
    expect(writeCall[0]).toContain('SKILL.md')
  })
})

// ── invalid args ──────────────────────────────────────────────────────────────
describe('invalid args', () => {
  test('invalid subcommand returns null and calls onDone with usage', async () => {
    const { onDone, calls } = makeOnDone()
    const result = await callSkillStore(onDone, {} as never, 'unknowncmd')
    expect(result).toBeNull()
    expect(calls[0]?.[0]).toContain('Usage')
  })
})
