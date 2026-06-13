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

/** agent 行的视觉三件套：标记字符 + 颜色 + 行尾文字后缀。 */
export type AgentVisual = { mark: string; color: string; suffix: string }

/**
 * agent 状态 → 视觉。
 * - running → ● warning
 * - done·dead → ✗ error
 * - done·ok：outputShape='object' → object；否则 text
 */
export function agentVisual(a: AgentProgress): AgentVisual {
  if (a.status === 'running')
    return { mark: '●', color: 'warning', suffix: 'running' }
  if (a.resultKind === 'dead')
    return { mark: '✗', color: 'error', suffix: 'dead' }
  return {
    mark: '✓',
    color: 'success',
    suffix: a.outputShape === 'object' ? 'object' : 'text',
  }
}
