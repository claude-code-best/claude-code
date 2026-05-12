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
import { authMock } from '../../../../../../tests/mocks/auth'
import { setupAxiosMock } from '../../../../../../tests/mocks/axios'

let requestStatus = 200
const auditRecords: Record<string, unknown>[] = []

const axiosHandle = setupAxiosMock()
axiosHandle.stubs.request = async () => ({
  status: requestStatus,
  data: { ok: requestStatus >= 200 && requestStatus < 300 },
})

beforeAll(() => {
  axiosHandle.useStubs = true
})
afterAll(() => {
  axiosHandle.useStubs = false
})

mock.module('src/utils/auth.js', authMock)

mock.module('src/services/oauth/client.js', () => ({
  getOrganizationUUID: async () => 'org',
}))

mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: () => true,
}))

mock.module('src/services/policyLimits/index.js', () => ({
  isPolicyAllowed: () => true,
}))

// Narrow mock for the side-effectful entries in `src/constants/oauth.js`.
// Pure data exports (ALL_OAUTH_SCOPES, CLAUDE_AI_*_SCOPE, etc.) come from
// the real module and are not mocked, per the test policy that constants
// modules without side effects should not be replaced wholesale.
mock.module('src/constants/oauth.js', () => {
  const actual = require('../../../../../../src/constants/oauth.js')
  return {
    ...actual,
    fileSuffixForOauthConfig: () => '',
    getOauthConfig: () => ({ BASE_API_URL: 'https://example.test' }),
    MCP_CLIENT_METADATA_URL: 'https://example.test/oauth/metadata',
  }
})

mock.module('src/utils/remoteTriggerAudit.js', () => ({
  appendRemoteTriggerAuditRecord: async (record: Record<string, unknown>) => {
    const fullRecord = {
      auditId: `audit-${auditRecords.length + 1}`,
      createdAt: Date.now(),
      ...record,
    }
    auditRecords.push(fullRecord)
    return fullRecord
  },
}))

beforeEach(() => {
  requestStatus = 200
  auditRecords.length = 0
})

afterEach(() => {
  auditRecords.length = 0
})

describe('RemoteTriggerTool audit', () => {
  test('writes an audit record for successful remote calls', async () => {
    const { RemoteTriggerTool } = await import('../RemoteTriggerTool')
    const result = await RemoteTriggerTool.call(
      { action: 'run', trigger_id: 'trigger-1' },
      { abortController: new AbortController() } as any,
    )

    expect(result.data.audit_id).toBeString()
    expect(result.data.audit_id).toBe('audit-1')
    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0]).toMatchObject({
      action: 'run',
      triggerId: 'trigger-1',
      ok: true,
      status: 200,
    })
  })

  test('writes an audit record before rethrowing validation failures', async () => {
    const { RemoteTriggerTool } = await import('../RemoteTriggerTool')

    await expect(
      RemoteTriggerTool.call({ action: 'run' }, {
        abortController: new AbortController(),
      } as any),
    ).rejects.toThrow('run requires trigger_id')

    expect(auditRecords).toHaveLength(1)
    expect(auditRecords[0]).toMatchObject({
      action: 'run',
      ok: false,
      error: 'run requires trigger_id',
    })
  })
})
