/**
 * Pure list/action logic for the /tasks Background panel
 * (BackgroundTasksDialog), reverse-aligned with official 2.1.330
 * (strings L937308).
 *
 * Everything in this module is side-effect free so it can be unit-tested
 * without mounting Ink components (same pattern as
 * components/agentsView/agentsViewList.ts). The dialog owns all state and
 * side effects; these functions only compute the next value.
 */

import type { DreamTaskState } from 'src/tasks/DreamTask/DreamTask.js'
import type { InProcessTeammateTaskState } from 'src/tasks/InProcessTeammateTask/types.js'
import type { LocalAgentTaskState } from 'src/tasks/LocalAgentTask/LocalAgentTask.js'
import type { LocalShellTaskState } from 'src/tasks/LocalShellTask/guards.js'
import type { LocalWorkflowTaskState } from 'src/tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import type { MonitorMcpTaskState } from 'src/tasks/MonitorMcpTask/MonitorMcpTask.js'
import type { RemoteAgentTaskState } from 'src/tasks/RemoteAgentTask/RemoteAgentTask.js'
import type { TaskState } from 'src/tasks/types.js'
import type { DeepImmutable } from 'src/types/utils.js'
import type { RecordedAgentEntry } from 'src/utils/sessionStorage.js'
import { TEAM_LEAD_NAME } from 'src/utils/swarm/constants.js'

// ── Item ids (official group key constants, strings L937308) ───────────────

export const LEADER_ITEM_ID = '__leader__'
export const SUBAGENT_HISTORY_ITEM_ID = '__subagent_history__'
export const SELF_MANAGED_TASKS_ITEM_ID = '__self_managed_tasks__'

/** Official `Rot` — task-name truncation length in the Actions title. */
export const ACTION_LABEL_MAX_LENGTH = 16

/** Official label table `Ant` for the Actions panel rows. */
export const ACTION_LABELS = {
  view: 'View',
  foreground: 'Foreground',
  stop: 'Stop',
} as const

export type TaskAction = keyof typeof ACTION_LABELS

// ── List items ──────────────────────────────────────────────────────────────

/**
 * History-group async load state — the official `vn = Mve(L, ...)` state
 * machine (`loaded` / `failed`; `failed` renders the size as "unreadable").
 */
export type SubagentHistoryLoadState = 'loading' | 'loaded' | 'failed'

export type SubagentHistoryItem = {
  id: typeof SUBAGENT_HISTORY_ITEM_ID
  type: 'subagent_history'
  label: string
  status: 'running'
  loadState: SubagentHistoryLoadState
  size: number
}

export type RecordedAgentItem = {
  id: string
  type: 'recorded_agent'
  label: string
  status: 'completed' | 'stopped'
  agentId: string
  agentType: string
  description?: string
  stoppedByUser: boolean
  lastActivityAt: number
}

export type SelfManagedTasksItem = {
  id: typeof SELF_MANAGED_TASKS_ITEM_ID
  type: 'self_managed_tasks'
  label: 'System tasks'
  status: 'running'
  size: number
  firstTaskId?: string
}

export type ListItem =
  | {
      id: string
      type: 'local_bash'
      label: string
      status: string
      task: DeepImmutable<LocalShellTaskState>
    }
  | {
      id: string
      type: 'remote_agent'
      label: string
      status: string
      task: DeepImmutable<RemoteAgentTaskState>
    }
  | {
      id: string
      type: 'local_agent'
      label: string
      status: string
      task: DeepImmutable<LocalAgentTaskState>
    }
  | {
      id: string
      type: 'in_process_teammate'
      label: string
      status: string
      task: DeepImmutable<InProcessTeammateTaskState>
    }
  | {
      id: string
      type: 'local_workflow'
      label: string
      status: string
      task: DeepImmutable<LocalWorkflowTaskState>
    }
  | {
      id: string
      type: 'monitor_mcp'
      label: string
      status: string
      task: DeepImmutable<MonitorMcpTaskState>
    }
  | {
      id: string
      type: 'dream'
      label: string
      status: string
      task: DeepImmutable<DreamTaskState>
    }
  | {
      id: typeof LEADER_ITEM_ID
      type: 'leader'
      label: string
      status: 'running'
    }
  | SubagentHistoryItem
  | RecordedAgentItem
  | SelfManagedTasksItem

// ── Task → item mapping ─────────────────────────────────────────────────────

export function toListItem(task: TaskState): ListItem {
  switch (task.type) {
    case 'local_bash':
      return {
        id: task.id,
        type: 'local_bash',
        label: task.kind === 'monitor' ? task.description : task.command,
        status: task.status,
        task,
      }
    case 'remote_agent':
      return {
        id: task.id,
        type: 'remote_agent',
        label: task.title,
        status: task.status,
        task,
      }
    case 'local_agent':
      return {
        id: task.id,
        type: 'local_agent',
        label: task.description,
        status: task.status,
        task,
      }
    case 'in_process_teammate':
      return {
        id: task.id,
        type: 'in_process_teammate',
        label: `@${task.identity.agentName}`,
        status: task.status,
        task,
      }
    case 'local_workflow':
      return {
        id: task.id,
        type: 'local_workflow',
        label: task.summary ?? task.description,
        status: task.status,
        task,
      }
    case 'monitor_mcp':
      return {
        id: task.id,
        type: 'monitor_mcp',
        label: task.description,
        status: task.status,
        task,
      }
    case 'dream':
      return {
        id: task.id,
        type: 'dream',
        label: task.description,
        status: task.status,
        task,
      }
  }
}

/** Sort running-first, then newest-started first (dialog list order). */
export function sortListItems(items: ListItem[]): ListItem[] {
  return items.sort((a, b) => {
    const aStatus = a.status
    const bStatus = b.status
    if (aStatus === 'running' && bStatus !== 'running') return -1
    if (aStatus !== 'running' && bStatus === 'running') return 1
    const aTime = 'task' in a ? a.task.startTime : 0
    const bTime = 'task' in b ? b.task.startTime : 0
    return bTime - aTime
  })
}

// ── Leader row (official ②, `Cs`) ───────────────────────────────────────────

/**
 * Official 2.1.330: `Cs = is.length>0 ? [{id:"__leader__", type:"leader",
 * label: is.length>0 ? \`@${cd}\` : "main", status:"running"}] : []` where
 * `is` is the local_bash group and `cd` the username — the leader row also
 * appears when bash tasks exist, labeled `@${username}` (the `"main"` arm is
 * unreachable there: `is.length>0` is the outer condition).
 *
 * Repo alignment: the leader also represents the team lead when teammates
 * exist without bash tasks (the pre-existing behavior), so the row shows
 * when EITHER teammates or bash tasks exist; the label is `@${username}`
 * when bash tasks exist, otherwise the repo's leader identity
 * (`TEAM_LEAD_NAME`).
 */
export function buildLeaderItem(options: {
  teammateCount: number
  bashCount: number
  username: string
  teamLeadName?: string
}): ListItem[] {
  const { teammateCount, bashCount, username } = options
  if (teammateCount <= 0 && bashCount <= 0) {
    return []
  }
  const label =
    bashCount > 0
      ? `@${username}`
      : `@${options.teamLeadName ?? TEAM_LEAD_NAME}`
  return [{ id: LEADER_ITEM_ID, type: 'leader', label, status: 'running' }]
}

// ── Earlier in this session (official ①, `__subagent_history__`) ────────────

/** Official heading label `n9` for the ended-subagent history group. */
export const SUBAGENT_HISTORY_LABEL = 'Earlier in this session'

export function buildSubagentHistoryItem(
  loadState: SubagentHistoryLoadState,
  size: number,
): SubagentHistoryItem {
  return {
    id: SUBAGENT_HISTORY_ITEM_ID,
    type: 'subagent_history',
    label: SUBAGENT_HISTORY_LABEL,
    status: 'running',
    loadState,
    size,
  }
}

/**
 * The group row is part of the flat selectable list (`Er`) even while
 * loading — that is what makes the official empty-state check
 * `Er.every(item => item.key === "subagent-history")` meaningful — but a
 * fully-loaded empty history renders nothing.
 */
export function shouldShowSubagentHistoryItem(
  item: SubagentHistoryItem,
): boolean {
  return item.loadState !== 'loaded' || item.size > 0
}

/** Map a recorded (ended) agent entry to its list row. */
export function toRecordedAgentItem(
  entry: RecordedAgentEntry,
): RecordedAgentItem {
  return {
    // Prefixed so a recorded agent can never collide with a live task id
    // (local_agent task ids ARE agent ids).
    id: `recorded:${entry.agentId}`,
    type: 'recorded_agent',
    label: entry.description ?? entry.agentType,
    status: entry.stoppedByUser ? 'stopped' : 'completed',
    agentId: entry.agentId,
    agentType: entry.agentType,
    description: entry.description,
    stoppedByUser: entry.stoppedByUser,
    lastActivityAt: entry.lastActivityAt,
  }
}

// ── System tasks (official ①, `__self_managed_tasks__`) ─────────────────────

/**
 * Official `Cr`-set membership: tasks marked self-managed are pulled out of
 * their regular groups into the "System tasks" group.
 *
 * TODO(official 2.1.330): TaskState has no self-managed / Cr marker yet, so
 * this predicate is constant-false and the group never renders. The grouping
 * logic below is complete and covered by tests (with an injected predicate)
 * so landing the marker only requires flipping this function.
 */
export function isSelfManagedTask(_task: TaskState): boolean {
  return false
}

/**
 * Official grouping: `bn` = Cr-marked tasks, `hn` = heading shown,
 * `$n` = first marked task.
 * `hn || $n === void 0 ? bn : [{ id, label: "System tasks", status:
 * "running", size: bn.length, firstTaskId: $n.id }]` — with the heading
 * shown the marked items are listed under it; without it the first task is
 * promoted to a single group-head row (size + firstTaskId) that represents
 * the whole group in the main list (`items` still carries every marked
 * task for the group view).
 */
export function buildSelfManagedGroup<T extends { id: string }>(
  items: T[],
  isSelfManaged: (item: T) => boolean,
  showHeading: boolean,
): { head: SelfManagedTasksItem | null; items: T[]; remaining: T[] } {
  const marked = items.filter(item => isSelfManaged(item))
  if (marked.length === 0) {
    return { head: null, items: [], remaining: items }
  }
  const remaining = items.filter(item => !isSelfManaged(item))
  if (showHeading) {
    return { head: null, items: marked, remaining }
  }
  const first = marked[0]
  if (!first) {
    return { head: null, items: marked, remaining }
  }
  // `items` keeps ALL marked tasks — the main list renders only the head
  // row (see the dialog), while the System-tasks group view (view on the
  // head) lists them.
  return {
    head: {
      id: SELF_MANAGED_TASKS_ITEM_ID,
      type: 'self_managed_tasks',
      label: 'System tasks',
      status: 'running',
      size: marked.length,
      firstTaskId: first.id,
    },
    items: marked,
    remaining,
  }
}

// ── Actions (official ③, `I9` condition table) ──────────────────────────────

/**
 * `uCe` (view): displayable types, or a recorded agent with a known agent
 * type. The official `$1(h.type)` excludes monitor_ws / post_turn_memory /
 * scheduled / goal / fork / self_managed — every type this dialog lists is
 * displayable here, and `self_managed_tasks` gets its own view branch (the
 * official group-head row is likewise enterable). The official
 * `!isRefused` guard has no persisted counterpart for recorded agents yet
 * (TODO), so it is treated as false.
 */
export function canViewItem(item: ListItem): boolean {
  switch (item.type) {
    case 'recorded_agent':
      return item.agentType !== undefined
    default:
      return true
  }
}

/**
 * `Q1` (foreground): a running in-process teammate, or a local agent that
 * can still be viewed (status not failed/killed), or the leader row.
 */
export function canForegroundItem(item: ListItem): boolean {
  switch (item.type) {
    case 'in_process_teammate':
      return item.status === 'running'
    case 'local_agent':
      return item.status !== 'failed' && item.status !== 'killed'
    case 'leader':
      return true
    default:
      return false
  }
}

/**
 * `vR` (stop): a stoppable local agent, or any running task-backed item
 * (official: `running && ("task" in h || "stop" in h)`).
 */
export function canStopItem(item: ListItem): boolean {
  return 'task' in item && item.status === 'running'
}

/** Official `I9(h)`: `[...uCe(h) ? ["view"] : [], ...Q1(h) ? ["foreground"] : [], ...vR(h) ? ["stop"] : []]`. */
export function getAvailableActions(item: ListItem): TaskAction[] {
  return [
    ...(canViewItem(item) ? (['view'] as const) : []),
    ...(canForegroundItem(item) ? (['foreground'] as const) : []),
    ...(canStopItem(item) ? (['stop'] as const) : []),
  ]
}

/** Official `Rot` truncation for the Actions title: `Actions for {name}`. */
export function truncateTaskName(
  name: string,
  maxLength = ACTION_LABEL_MAX_LENGTH,
): string {
  return name.length > maxLength ? `${name.slice(0, maxLength - 1)}…` : name
}

// ── Action execution intents (official ③, `Eu` → `jl` / `Yl` / `nl`) ────────

export type ActionIntent =
  /** `jl` other displayable types → detail view. */
  | { kind: 'view-detail' }
  /** `jl` leader → exitTeammateView + "Viewing leader". */
  | { kind: 'view-leader' }
  /** `jl` subagent_history → enter the Earlier list. */
  | { kind: 'view-subagent-history' }
  /** `jl` subagent_history with unreadable size → notify read failure, return. */
  | { kind: 'history-unreadable' }
  /** `jl` recorded_agent → `Wd(entry)`: view the agent's transcript. */
  | { kind: 'view-recorded-agent'; agentId: string }
  /** `jl` self_managed_tasks → enter the System tasks group view. */
  | { kind: 'view-self-managed' }
  /** `jl` currently-viewed agent → `bq(ad.id)` + "Viewing agent". */
  | { kind: 'view-current-agent' }
  /** `Yl` running in-process teammate → `bq(id)` + "Viewing teammate". */
  | { kind: 'foreground-teammate' }
  /** `Yl` viewable local agent → `bq(id)` + "Viewing agent". */
  | { kind: 'foreground-agent' }
  /** `Yl` leader → exitTeammateView + "Viewing leader". */
  | { kind: 'foreground-leader' }
  /** `nl` task with a stop method → confirmStop view. */
  | { kind: 'stop-confirm' }
  /** `nl` non-remote → stop directly. */
  | { kind: 'stop' }
  /** `nl` remote ultraplan → `mto` (stopUltraplan). */
  | { kind: 'stop-ultraplan'; sessionId: string }
  /** Nothing to do (e.g. history group still empty). */
  | { kind: 'noop' }

export type ActionContext = {
  /** batch5 viewing state — `CD(ad)`: is this the agent being viewed? */
  viewingAgentTaskId?: string
  historyLoadState: SubagentHistoryLoadState
  historySize: number
}

/**
 * Official `jl` — the view action's dispatch. Order matters: the special
 * group/agent branches come before the generic detail-view fallback.
 */
function resolveViewIntent(item: ListItem, ctx: ActionContext): ActionIntent {
  switch (item.type) {
    case 'self_managed_tasks':
      return { kind: 'view-self-managed' }
    case 'subagent_history':
      // size unreadable → notify read failure and return; size 0 → return.
      if (ctx.historyLoadState === 'failed') {
        return { kind: 'history-unreadable' }
      }
      if (ctx.historySize === 0) {
        return { kind: 'noop' }
      }
      return { kind: 'view-subagent-history' }
    case 'recorded_agent':
      return { kind: 'view-recorded-agent', agentId: item.agentId }
    case 'leader':
      return { kind: 'view-leader' }
    case 'local_agent':
      // `CD(ad)`: the agent currently being viewed → `bq(ad.id)` re-enters
      // the viewing state (batch5 viewingAgentTaskId) + "Viewing agent".
      if (ctx.viewingAgentTaskId === item.id) {
        return { kind: 'view-current-agent' }
      }
      return { kind: 'view-detail' }
    default:
      return { kind: 'view-detail' }
  }
}

/** Official `Yl` — the foreground action's dispatch (foreground = enter viewing). */
function resolveForegroundIntent(item: ListItem): ActionIntent {
  switch (item.type) {
    case 'in_process_teammate':
      return item.status === 'running'
        ? { kind: 'foreground-teammate' }
        : { kind: 'noop' }
    case 'local_agent':
      return item.status !== 'failed' && item.status !== 'killed'
        ? { kind: 'foreground-agent' }
        : { kind: 'noop' }
    case 'leader':
      return { kind: 'foreground-leader' }
    default:
      return { kind: 'noop' }
  }
}

/**
 * Official `nl` — the stop action's dispatch:
 * 1. not stoppable → no-op (official detaches a local agent via `Ecr`;
 *    no detach concept exists here yet — TODO),
 * 2. task with a stop method → confirmStop (the third view state),
 * 3. non-remote → stop directly,
 * 4. remote ultraplan → `mto` (stopUltraplan),
 * 5. remote review → confirmStop,
 * 6. otherwise → stop directly.
 */
export function resolveStopIntent(item: ListItem): ActionIntent {
  if (!canStopItem(item)) {
    return { kind: 'noop' }
  }
  // "Has a stop method": agent-like tasks whose stop is destructive enough
  // to warrant confirmation. Bash kills are immediate; remote agents have
  // their own bespoke branches below.
  if (
    item.type === 'local_agent' ||
    item.type === 'in_process_teammate' ||
    item.type === 'local_workflow' ||
    item.type === 'dream'
  ) {
    return { kind: 'stop-confirm' }
  }
  if (item.type === 'remote_agent') {
    if (item.task.isUltraplan) {
      return { kind: 'stop-ultraplan', sessionId: item.task.sessionId }
    }
    if (item.task.isRemoteReview) {
      return { kind: 'stop-confirm' }
    }
    return { kind: 'stop' }
  }
  return { kind: 'stop' }
}

/** Official `Eu` — dispatch an action on an item to its execution intent. */
export function resolveActionIntent(
  item: ListItem,
  action: TaskAction,
  ctx: ActionContext,
): ActionIntent {
  switch (action) {
    case 'view':
      return resolveViewIntent(item, ctx)
    case 'foreground':
      return resolveForegroundIntent(item)
    case 'stop':
      return resolveStopIntent(item)
  }
}

// ── Empty state (official ④) ────────────────────────────────────────────────

/**
 * Official: `Er.every(item => item.key === "subagent-history")` → show
 * "No tasks currently running". A list containing only the subagent-history
 * group still counts as "no tasks" — the empty check is about *running*
 * tasks. (An empty list matches too — `every` on `[]` is true.)
 */
export function isEmptyTaskList(items: ListItem[]): boolean {
  return items.every(item => item.type === 'subagent_history')
}

// ── Key hint rows (official ④, L940641) ─────────────────────────────────────

export type HintDescriptor = { shortcut: string; action: string }

/**
 * List state: `↑/↓ to select · Enter to view · Esc to close`, plus the
 * row-level inline shortcuts (`rowActions`) that coexist with the Actions
 * panel — f=foreground (when the selection is foregroundable) and x=stop
 * (when stoppable), and the stop-all-agents chord while agents run.
 */
export function buildListHints(options: {
  currentSelection?: ListItem
  anyAgentRunning: boolean
  killAgentsShortcut: string
}): HintDescriptor[] {
  const hints: HintDescriptor[] = [
    { shortcut: '↑/↓', action: 'select' },
    { shortcut: 'Enter', action: 'view' },
  ]
  if (options.currentSelection && canForegroundItem(options.currentSelection)) {
    hints.push({ shortcut: 'f', action: 'foreground' })
  }
  if (options.currentSelection && canStopItem(options.currentSelection)) {
    hints.push({ shortcut: 'x', action: 'stop' })
  }
  if (options.anyAgentRunning) {
    hints.push({
      shortcut: options.killAgentsShortcut,
      action: 'stop all agents',
    })
  }
  hints.push({ shortcut: '←/Esc', action: 'close' })
  return hints
}

/** Actions panel: `↑/↓ to select · Enter to choose · Esc to go back`. */
export const ACTIONS_VIEW_HINTS: HintDescriptor[] = [
  { shortcut: '↑/↓', action: 'select' },
  { shortcut: 'Enter', action: 'choose' },
  { shortcut: 'Esc', action: 'go back' },
]

/** Confirm-stop dialog: `Enter to stop · Esc to go back`. */
export const CONFIRM_STOP_HINTS: HintDescriptor[] = [
  { shortcut: 'Enter', action: 'stop' },
  { shortcut: 'Esc', action: 'go back' },
]

/** Earlier-in-this-session list: `↑/↓ to select · Enter to view · Esc to go back`. */
export const SUBAGENT_HISTORY_HINTS: HintDescriptor[] = [
  { shortcut: '↑/↓', action: 'select' },
  { shortcut: 'Enter', action: 'view' },
  { shortcut: 'Esc', action: 'go back' },
]

/**
 * Detail state: `↑/↓ to scroll · Enter to send · Esc to back`. Enter sends
 * the typed message (official 2.1.330 L1555: reopen a recorded agent and
 * message it); with an empty input box it goes back.
 */
export const DETAIL_HINTS: HintDescriptor[] = [
  { shortcut: '↑/↓', action: 'scroll' },
  { shortcut: 'Enter', action: 'send' },
  { shortcut: 'Esc', action: 'back' },
]
