import { randomUUID } from 'crypto'
import { mkdir, readFile, appendFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getProjectRoot } from '../bootstrap/state.js'

const REMOTE_TRIGGER_AUDIT_REL = join('.claude', 'remote-trigger-audit.jsonl')
const MAX_AUDIT_RECORDS = 200

export type RemoteTriggerAuditRecord = {
  auditId: string
  action: string
  triggerId?: string
  ok: boolean
  status?: number
  error?: string
  createdAt: number
}

export function resolveRemoteTriggerAuditPath(
  rootDir: string = getProjectRoot(),
): string {
  return join(rootDir, REMOTE_TRIGGER_AUDIT_REL)
}

export async function appendRemoteTriggerAuditRecord(
  record: Omit<RemoteTriggerAuditRecord, 'auditId' | 'createdAt'> & {
    auditId?: string
    createdAt?: number
  },
  rootDir: string = getProjectRoot(),
): Promise<RemoteTriggerAuditRecord> {
  const fullRecord: RemoteTriggerAuditRecord = {
    auditId: record.auditId ?? randomUUID(),
    action: record.action,
    ...(record.triggerId ? { triggerId: record.triggerId } : {}),
    ok: record.ok,
    ...(record.status !== undefined ? { status: record.status } : {}),
    ...(record.error ? { error: record.error } : {}),
    createdAt: record.createdAt ?? Date.now(),
  }
  const path = resolveRemoteTriggerAuditPath(rootDir)
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify(fullRecord)}\n`, 'utf-8')
  return fullRecord
}

export async function listRemoteTriggerAuditRecords(
  rootDir: string = getProjectRoot(),
): Promise<RemoteTriggerAuditRecord[]> {
  let raw: string
  try {
    raw = await readFile(resolveRemoteTriggerAuditPath(rootDir), 'utf-8')
  } catch {
    return []
  }
  const records: RemoteTriggerAuditRecord[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as Partial<RemoteTriggerAuditRecord>
      if (
        parsed &&
        typeof parsed.auditId === 'string' &&
        typeof parsed.action === 'string' &&
        typeof parsed.ok === 'boolean' &&
        typeof parsed.createdAt === 'number'
      ) {
        records.push(parsed as RemoteTriggerAuditRecord)
      }
    } catch {
      // Ignore malformed historical lines.
    }
  }
  return records
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_AUDIT_RECORDS)
}

export function formatRemoteTriggerAuditStatus(
  records: RemoteTriggerAuditRecord[],
): string {
  const failures = records.filter(r => !r.ok)
  const latest = records[0]
  return [
    `RemoteTrigger audit records: ${records.length}`,
    `Failures: ${failures.length}`,
    latest
      ? `Latest: ${latest.action}${latest.triggerId ? ` ${latest.triggerId}` : ''} ${latest.ok ? 'ok' : 'failed'} (${new Date(latest.createdAt).toLocaleString()})`
      : 'Latest: none',
  ].join('\n')
}
