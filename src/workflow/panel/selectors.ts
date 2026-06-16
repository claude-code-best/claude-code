import type { AgentProgress, RunProgress } from '../progress/store.js'
import type { PhaseStatus } from './status.js'

/** Title of the fixed "no filter" item (first row of the sidebar). */
export const ALL_PHASE = 'All'

/** Merged phase (including pending), with done/total counts of agents under that phase. */
export type MergedPhase = {
  title: string
  status: PhaseStatus
  done: number
  total: number
}

/**
 * Merge declaredPhases (declared by meta) and run.phases (actually running/done):
 * - Declared order takes priority; phases present in actual but not declared are appended at the end.
 * - No actual record -> pending; otherwise take the actual status.
 * - done/total = done under that phase / total agents under that phase.
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
 * Filter agents by the selected phase.
 * selectedPhase undefined or ALL_PHASE -> all.
 */
export function filterAgentsByPhase(
  agents: AgentProgress[],
  selectedPhase: string | undefined,
): AgentProgress[] {
  if (selectedPhase === undefined || selectedPhase === ALL_PHASE) return agents
  return agents.filter(a => a.phase === selectedPhase)
}

/** tab label: workflow name + `#` + last 4 chars of runId (disambiguates same-name runs). */
export function tabLabel(workflowName: string, runId: string): string {
  return `${workflowName}#${runId.slice(-4)}`
}

/** milliseconds -> compact duration (<60s -> `Ns`; <60m -> `MmSSs`; otherwise `HhMMm`). Used by the panel header. */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const ss = s % 60
  if (m < 60) return `${m}m${String(ss).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h${String(m % 60).padStart(2, '0')}m`
}
