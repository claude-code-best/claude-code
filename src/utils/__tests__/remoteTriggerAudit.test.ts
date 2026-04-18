import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  appendRemoteTriggerAuditRecord,
  formatRemoteTriggerAuditStatus,
  listRemoteTriggerAuditRecords,
} from '../remoteTriggerAudit'

let tempDir = ''

beforeEach(() => {
  tempDir = join(
    tmpdir(),
    `remote-trigger-audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('remote trigger audit', () => {
  test('records and formats local remote trigger audit events', async () => {
    await appendRemoteTriggerAuditRecord(
      { action: 'run', triggerId: 'abc', ok: true, status: 200, createdAt: 1 },
      tempDir,
    )
    await appendRemoteTriggerAuditRecord(
      { action: 'create', ok: false, error: 'bad request', createdAt: 2 },
      tempDir,
    )

    const records = await listRemoteTriggerAuditRecords(tempDir)
    expect(records).toHaveLength(2)
    expect(records[0].action).toBe('create')
    expect(formatRemoteTriggerAuditStatus(records)).toContain(
      'RemoteTrigger audit records: 2',
    )
    expect(formatRemoteTriggerAuditStatus(records)).toContain('Failures: 1')
  })
})
