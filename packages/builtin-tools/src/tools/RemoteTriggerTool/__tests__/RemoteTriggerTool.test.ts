import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from 'src/bootstrap/state.js'

let requestStatus = 200

mock.module('axios', () => ({
  default: {
    request: async () => ({
      status: requestStatus,
      data: { ok: requestStatus >= 200 && requestStatus < 300 },
    }),
  },
}))

mock.module('src/utils/auth.js', () => ({
  checkAndRefreshOAuthTokenIfNeeded: async () => {},
  getClaudeAIOAuthTokens: () => ({ accessToken: 'token' }),
}))

mock.module('src/services/oauth/client.js', () => ({
  getOrganizationUUID: async () => 'org',
}))

mock.module('src/constants/oauth.js', () => ({
  getOauthConfig: () => ({ BASE_API_URL: 'https://example.test' }),
}))

let cwd = ''
let previousCwd = ''

beforeEach(async () => {
  requestStatus = 200
  previousCwd = process.cwd()
  cwd = join(tmpdir(), `remote-trigger-tool-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(cwd, { recursive: true })
  process.chdir(cwd)
  resetStateForTests()
  setOriginalCwd(cwd)
  setProjectRoot(cwd)
})

afterEach(async () => {
  resetStateForTests()
  process.chdir(previousCwd)
  await rm(cwd, { recursive: true, force: true })
})

describe('RemoteTriggerTool audit', () => {
  test('writes an audit record for successful remote calls', async () => {
    const { RemoteTriggerTool } = await import('../RemoteTriggerTool')
    const result = await RemoteTriggerTool.call(
      { action: 'run', trigger_id: 'trigger-1' },
      { abortController: new AbortController() } as any,
    )

    expect(result.data.audit_id).toBeString()
    const raw = await readFile(
      join(cwd, '.claude', 'remote-trigger-audit.jsonl'),
      'utf-8',
    )
    expect(raw).toContain('"action":"run"')
    expect(raw).toContain('"triggerId":"trigger-1"')
    expect(raw).toContain('"ok":true')
  })

  test('writes an audit record before rethrowing validation failures', async () => {
    const { RemoteTriggerTool } = await import('../RemoteTriggerTool')

    await expect(
      RemoteTriggerTool.call(
        { action: 'run' },
        { abortController: new AbortController() } as any,
      ),
    ).rejects.toThrow('run requires trigger_id')

    const raw = await readFile(
      join(cwd, '.claude', 'remote-trigger-audit.jsonl'),
      'utf-8',
    )
    expect(raw).toContain('"action":"run"')
    expect(raw).toContain('"ok":false')
    expect(raw).toContain('run requires trigger_id')
  })
})
