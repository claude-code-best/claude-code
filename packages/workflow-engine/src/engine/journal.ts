import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { JournalStore } from '../ports.js'
import type { AgentRunParams, JournalEntry } from '../types.js'

/** 去掉纯展示字段后的规范化参数字符串。 */
function canonicalParams(params: AgentRunParams): string {
  const { label: _label, phase: _phase, ...rest } = params
  const keys = Object.keys(rest).sort()
  const sorted: Record<string, unknown> = {}
  for (const k of keys) sorted[k] = rest[k as keyof typeof rest]
  return JSON.stringify(sorted)
}

/** agent() 调用的确定性 key（prompt + 规范化 params 的 sha256）。 */
export function agentCallKey(prompt: string, params: AgentRunParams): string {
  return createHash('sha256')
    .update(prompt + '\n' + canonicalParams(params))
    .digest('hex')
}

/** 文件式 JournalStore（jsonl，每个 run 一个目录）。纯 fs，无核心依赖。 */
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
        // parallel 完成顺序 ≠ 调用顺序；按 seq 重排，使 resume 期间 key 索引稳定。
        // 缺 seq 的旧 entry 视为 0（保持向前兼容，最坏情况下退化为文件顺序）。
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
