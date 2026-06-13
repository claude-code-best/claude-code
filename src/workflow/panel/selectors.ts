import type { AgentProgress, RunProgress } from '../progress/store.js'
import type { PhaseStatus } from './status.js'

/** 「不筛选」固定项的 title（侧栏第一行）。 */
export const ALL_PHASE = 'All'

/** 合并后的 phase（含 pending），带该 phase 下 agent 的 done/total 计数。 */
export type MergedPhase = {
  title: string
  status: PhaseStatus
  done: number
  total: number
}

/**
 * 合并 declaredPhases（meta 声明）与 run.phases（实际 running/done）：
 * - 声明顺序优先；未在 declared 但实际出现的 phase 追加末尾。
 * - 实际无记录 → pending；否则取实际 status。
 * - done/total = 该 phase 下 done / 全部 agent 数。
 */
export function mergePhases(
  run: Pick<RunProgress, 'declaredPhases' | 'phases' | 'agents'>,
): MergedPhase[] {
  const actualByTitle = new Map(run.phases.map(p => [p.title, p]))
  const seen = new Set<string>()
  const out: MergedPhase[] = []
  const push = (title: string): void => {
    if (seen.has(title)) return
    seen.add(title)
    const actual = actualByTitle.get(title)
    const status: PhaseStatus = !actual ? 'pending' : actual.status
    const inPhase = run.agents.filter(a => a.phase === title)
    out.push({
      title,
      status,
      done: inPhase.filter(a => a.status === 'done').length,
      total: inPhase.length,
    })
  }
  for (const t of run.declaredPhases) push(t)
  for (const p of run.phases) push(p.title)
  return out
}

/**
 * 按选中 phase 筛选 agent。
 * selectedPhase 为 undefined 或 ALL_PHASE → 全部。
 */
export function filterAgentsByPhase(
  agents: AgentProgress[],
  selectedPhase: string | undefined,
): AgentProgress[] {
  if (selectedPhase === undefined || selectedPhase === ALL_PHASE) return agents
  return agents.filter(a => a.phase === selectedPhase)
}

/** tab 标签：workflow 名 + `#` + runId 末 4 位（同名 run 消歧）。 */
export function tabLabel(workflowName: string, runId: string): string {
  return `${workflowName}#${runId.slice(-4)}`
}
