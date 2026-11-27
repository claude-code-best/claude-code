import type { AppState } from '../../state/AppState.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import {
  hasRunningPanelAgent,
  isPanelAgentTask,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { TaskState } from '../../tasks/types.js'

/**
 * Attention switcher state (official 2.1.330, m60-verified).
 *
 * Pressing ↓ while a panel agent is running opens the focus switcher below
 * the status bar: `↑/↓ to select` + `◯ main` + one row per running agent
 * (`⏺ {agentType}  {description}  {time} · ↑ {tokens}`). ↑/↓ move the `❯`
 * selection, Enter enters the selected transcript (main = exit viewing),
 * esc closes. All state transitions live here as pure functions on AppState
 * so the penetration rules are unit-testable without React.
 */

/** One selectable row: `main` or a running panel agent. */
export type AttentionRow =
  | { kind: 'main'; key: 'main' }
  | { kind: 'agent'; key: string; task: LocalAgentTaskState }

/**
 * Build the switcher rows: `main` first, then every running panel agent
 * sorted by start time (same ordering as useBackgroundAgentTasks, so the
 * switcher and the persistent selector below the input agree).
 */
export function buildAttentionRows(
  tasks: Record<string, TaskState>,
): AttentionRow[] {
  const agents = Object.values(tasks)
    .filter(
      (t): t is LocalAgentTaskState =>
        isPanelAgentTask(t) && t.status === 'running',
    )
    .sort((a, b) => a.startTime - b.startTime)
  return [
    { kind: 'main', key: 'main' },
    ...agents.map(
      task => ({ kind: 'agent', key: task.agentId, task }) as AttentionRow,
    ),
  ]
}

/**
 * Penetration rule for chat:attentionDown (official 2.1.330, m60): ↓ opens
 * the switcher ONLY when nothing else owns the key —
 *  - the switcher is already open (its own useInput owns ↑/↓),
 *  - the suggestion/completion list is showing (autocomplete owns ↑/↓),
 *  - the footer navigator is focused (footer:next/previous own ↑/↓),
 *  - no panel agent is running (↓ penetrates to history/footer navigation).
 *
 * attentionUp mirrors this but never opens — m60 only shows ↓ opening the
 * switcher, so ↑ keeps navigating history while agents run.
 */
export function shouldOpenAttentionSwitcher(state: {
  tasks: Record<string, TaskState>
  attentionSwitcher?: { selectedIndex: number }
}): boolean {
  return (
    state.attentionSwitcher === undefined && hasRunningPanelAgent(state.tasks)
  )
}

/** Open the switcher with `main` selected (↓ was pressed from main). */
export function openAttentionSwitch(prev: AppState): AppState {
  return { ...prev, attentionSwitcher: { selectedIndex: 0 } }
}

/** Close the switcher, leaving everything else untouched. */
export function closeAttentionSwitcher(prev: AppState): AppState {
  if (prev.attentionSwitcher === undefined) return prev
  return { ...prev, attentionSwitcher: undefined }
}

/**
 * Move the `❯` selection by delta, wrapping across main(-th) and the running
 * agents. Clamps when rows disappear mid-flight (agent finished while the
 * switcher was open) so the selection always lands on an existing row.
 */
export function moveAttentionSelection(
  prev: AppState,
  delta: 1 | -1,
  rowCount: number,
): AppState {
  const current = prev.attentionSwitcher
  if (current === undefined || rowCount <= 0) return prev
  const selectedIndex =
    (((current.selectedIndex + delta) % rowCount) + rowCount) % rowCount
  return { ...prev, attentionSwitcher: { selectedIndex } }
}
