import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from 'src/bootstrap/state.js'
import { logMock } from '../../../../../../tests/mocks/log'
import { debugMock } from '../../../../../../tests/mocks/debug'

let requestStatus = 200

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

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
  fileSuffixForOauthConfig: () => '',
}))

mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: () => true,
}))

mock.module('src/services/policyLimits/index.js', () => ({
  isPolicyAllowed: () => true,
}))

mock.module('bun:bundle', () => ({
  feature: () => false,
}))

let cwd = ''
let previousCwd = ''
let auditRecords: Array<Record<string, unknown>> = []

mock.module('src/utils/remoteTriggerAudit.js', () => ({
  appendRemoteTriggerAuditRecord: async (record: Record<string, unknown>) => {
    const full = { ...record, auditId: record.auditId ?? 'test-audit-id', createdAt: Date.now() }
    auditRecords.push(full)
    return full
  },
  resolveRemoteTriggerAuditPath: () => join(cwd, '.claude', 'remote-trigger-audit.jsonl'),
}))

beforeEach(async () => {
  requestStatus = 200
  auditRecords = []
  previousCwd = process.cwd()
  cwd = join(tmpdir(), `remote-trigger-tool-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(cwd, { recursive: true })
  await mkdir(join(cwd, '.claude'), { recursive: true })
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
    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0].action).toBe('run')
    expect(auditRecords[0].triggerId).toBe('trigger-1')
    expect(auditRecords[0].ok).toBe(true)
  })

  test('writes an audit record before rethrowing validation failures', async () => {
    const { RemoteTriggerTool } = await import('../RemoteTriggerTool')

    await expect(
      RemoteTriggerTool.call(
        { action: 'run' },
        { abortController: new AbortController() } as any,
      ),
    ).rejects.toThrow('run requires trigger_id')

    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0].action).toBe('run')
    expect(auditRecords[0].ok).toBe(false)
    expect(auditRecords[0].error).toBe('run requires trigger_id')
  })
})
