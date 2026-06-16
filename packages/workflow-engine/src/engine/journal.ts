import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { JournalStore } from '../ports.js'
import type { AgentRunParams, JournalEntry } from '../types.js'

/** Canonical parameter string after removing display-only fields. */
function canonicalParams(params: AgentRunParams): string {
  const { label: _label, phase: _phase, ...rest } = params
  const keys = Object.keys(rest).sort()
  const sorted: Record<string, unknown> = {}
  for (const k of keys) sorted[k] = rest[k as keyof typeof rest]
  return JSON.stringify(sorted)
}

/** Determinism key for an agent() call (sha256 of prompt + canonical params). */
export function agentCallKey(prompt: string, params: AgentRunParams): string {
  return createHash('sha256')
    .update(prompt + '\n' + canonicalParams(params))
    .digest('hex')
}

/** File-based JournalStore (jsonl, one directory per run). Pure fs, no core dependencies. */
export function createFileJournalStore(runsDir: string): JournalStore {
  const pathOf = (runId: string) => join(runsDir, runId, 'journal.jsonl')

  return {
    async read(runId): Promise<JournalEntry[]> {
      try {
        const raw = await readFile(pathOf(runId), 'utf-8')
        const entries = raw
          .split('\n')
          .filter(line => line.trim().length > 0)
          .map(line => JSON.parse(line) as JournalEntry)
        // parallel completion order ≠ call order; re-sort by seq so the key index is stable during resume.
        // Old entries missing seq are treated as 0 (forward compatibility; worst case degrades to file order).
        return entries.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      } catch {
        return []
      }
    },
    async append(runId, entry) {
      await mkdir(join(runsDir, runId), { recursive: true })
      await appendFile(pathOf(runId), JSON.stringify(entry) + '\n', 'utf-8')
    },
    async truncate(runId) {
      await rm(join(runsDir, runId), { recursive: true, force: true })
    },
  }
}
