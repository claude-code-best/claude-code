import type { AgentProgress, RunProgress } from '../progress/store.js'

/** run 状态 → 圆点字符（顶部 tab 用）。 */
export const STATUS_DOT: Record<RunProgress['status'], string> = {
  running: '●',
  completed: '✓',
  failed: '✗',
  killed: '■',
}

/** run 状态 → ink theme 颜色 token（沿用现有 WorkflowList 配色）。 */
export const RUN_STATUS_COLOR: Record<RunProgress['status'], string> = {
  running: 'warning',
  completed: 'success',
  failed: 'error',
  killed: 'subtle',
}

/** run 状态 → 展示文字（header 用；对齐参考图 done/running）。 */
export const RUN_STATUS_TEXT: Record<RunProgress['status'], string> = {
  running: 'running',
  completed: 'done',
  failed: 'failed',
  killed: 'killed',
}

/** phase 在侧栏的合并状态（含 pending：meta 声明但未启动）。 */
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

/** agent 行的视觉：标记字符 + 颜色（running 由 UI 用 spinner 动画覆盖 mark）。 */
export type AgentVisual = { mark: string; color: string }

/**
 * agent 状态 → 视觉。
 * - running → ● warning（UI 用 spinner 动画覆盖 mark）
 * - done·dead → ✗ error
 * - done·ok → ✓ success
 */
export function agentVisual(a: AgentProgress): AgentVisual {
  if (a.status === 'running') return { mark: '●', color: 'warning' }
  if (a.resultKind === 'dead') return { mark: '✗', color: 'error' }
  return { mark: '✓', color: 'success' }
}

/** token 数 → 展示字符串（<1000 原值；否则保留 1 位小数 + k）。 */
export function formatTokenCount(n: number | undefined): string {
  if (!n) return '0'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/**
 * agent 行右侧统计文本：`model · Nk tok · N tool`。
 * 无 model 时省略前段；running 中 token/tool 由 agent_progress 实时刷新。
 */
export function agentMetaText(a: AgentProgress): string {
  const parts: string[] = []
  if (a.model) parts.push(a.model)
  parts.push(`${formatTokenCount(a.tokenCount)} tok`)
  parts.push(`${a.toolCount ?? 0} tool`)
  return parts.join(' · ')
}
