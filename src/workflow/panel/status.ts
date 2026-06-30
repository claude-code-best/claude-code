import type { AgentProgress, RunProgress } from '../progress/store.js'

/** run status -> dot character (used by top tab). */
export const STATUS_DOT: Record<RunProgress['status'], string> = {
  running: '●',
  completed: '✓',
  failed: '✗',
  killed: '■',
}

/** run status -> ink theme color token (follows existing WorkflowList palette). */
export const RUN_STATUS_COLOR: Record<RunProgress['status'], string> = {
  running: 'warning',
  completed: 'success',
  failed: 'error',
  killed: 'subtle',
}

/** run status -> display text (used by header; aligns with reference image done/running). */
export const RUN_STATUS_TEXT: Record<RunProgress['status'], string> = {
  running: 'running',
  completed: 'done',
  failed: 'failed',
  killed: 'killed',
}

/** merged phase status in the sidebar (includes pending: declared by meta but not started). */
export type PhaseStatus = 'running' | 'done' | 'pending'

export const PHASE_MARK: Record<PhaseStatus, string> = {
  running: '●',
  done: '✓',
  pending: '○',
}

export const PHASE_COLOR: Record<PhaseStatus, string> = {
  running: 'warning',
  done: 'success',
  pending: 'subtle',
}

/** visual for an agent row: mark character + color (running has the mark overridden by a spinner animation in UI). */
export type AgentVisual = { mark: string; color: string }

/**
 * agent status -> visual.
 * - running -> ● warning (UI overrides mark with spinner animation)
 * - done·dead -> ✗ error
 * - done·ok -> ✓ success
 */
export function agentVisual(a: AgentProgress): AgentVisual {
  if (a.status === 'running') return { mark: '●', color: 'warning' }
  if (a.resultKind === 'dead') return { mark: '✗', color: 'error' }
  return { mark: '✓', color: 'success' }
}

/** token count -> display string (<1000 keeps the raw value; otherwise keeps 1 decimal + k). */
export function formatTokenCount(n: number | undefined): string {
  if (!n) return '0'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/**
 * right-side stats text for an agent row: `model · Nk tok · N tool`.
 * Omits the prefix when there is no model; token/tool refresh in real time via agent_progress while running.
 */
export function agentMetaText(a: AgentProgress): string {
  const parts: string[] = []
  if (a.model) parts.push(a.model)
  parts.push(`${formatTokenCount(a.tokenCount)} tok`)
  parts.push(`${a.toolCount ?? 0} tool`)
  return parts.join(' · ')
}
