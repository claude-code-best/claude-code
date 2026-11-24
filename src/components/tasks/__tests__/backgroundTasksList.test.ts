import { describe, expect, test } from 'bun:test'
import type { DreamTaskState } from '../../../tasks/DreamTask/DreamTask.js'
import type { InProcessTeammateTaskState } from '../../../tasks/InProcessTeammateTask/types.js'
import type { LocalAgentTaskState } from '../../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { LocalShellTaskState } from '../../../tasks/LocalShellTask/guards.js'
import type { LocalWorkflowTaskState } from '../../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import type { MonitorMcpTaskState } from '../../../tasks/MonitorMcpTask/MonitorMcpTask.js'
import type { RemoteAgentTaskState } from '../../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import type { TaskState } from '../../../tasks/types.js'
import type { RecordedAgentEntry } from '../../../utils/sessionStorage.js'
import {
  ACTION_LABELS,
  ACTIONS_VIEW_HINTS,
  buildLeaderItem,
  buildListHints,
  buildSelfManagedGroup,
  buildSubagentHistoryItem,
  canForegroundItem,
  canStopItem,
  canViewItem,
  CONFIRM_STOP_HINTS,
  DETAIL_HINTS,
  getAvailableActions,
  isSelfManagedTask,
  isEmptyTaskList,
  LEADER_ITEM_ID,
  resolveActionIntent,
  resolveStopIntent,
  SELF_MANAGED_TASKS_ITEM_ID,
  shouldShowSubagentHistoryItem,
  sortListItems,
  SUBAGENT_HISTORY_HINTS,
  SUBAGENT_HISTORY_ITEM_ID,
  toListItem,
  toRecordedAgentItem,
  truncateTaskName,
  type ActionContext,
  type ListItem,
} from '../backgroundTasksList.js'

// ── Fixtures ────────────────────────────────────────────────────────────────

const base = {
  toolUseId: undefined,
  endTime: undefined,
  totalPausedMs: undefined,
  outputFile: '/tmp/output/x',
  outputOffset: 0,
  notified: false,
}

function bashTask(
  overrides: Partial<LocalShellTaskState> = {},
): LocalShellTaskState {
  return {
    ...base,
    id: 'bash-1',
    type: 'local_bash',
    status: 'running',
    description: 'run tests',
    startTime: 100,
    command: 'bun test',
    completionStatusSentInAttachment: false,
    shellCommand: null,
    lastReportedTotalLines: 0,
    isBackgrounded: true,
    ...overrides,
  }
}

function agentTask(
  overrides: Partial<LocalAgentTaskState> = {},
): LocalAgentTaskState {
  return {
    ...base,
    id: 'agent-1',
    type: 'local_agent',
    status: 'running',
    description: 'fix the bug',
    startTime: 100,
    agentId: 'agent-1',
    prompt: 'fix the bug',
    agentType: 'general-purpose',
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
    ...overrides,
  }
}

function teammateTask(
  overrides: Partial<InProcessTeammateTaskState> = {},
): InProcessTeammateTaskState {
  return {
    ...base,
    id: 'teammate-1',
    type: 'in_process_teammate',
    status: 'running',
    description: 'research stuff',
    startTime: 100,
    identity: {
      agentId: 'researcher@team',
      agentName: 'researcher',
      teamName: 'team',
      planModeRequired: false,
      parentSessionId: 'session-1',
    },
    prompt: 'research stuff',
    awaitingPlanApproval: false,
    permissionMode: 'plan',
    pendingUserMessages: [],
    isIdle: false,
    shutdownRequested: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    ...overrides,
  }
}

function remoteTask(
  overrides: Partial<RemoteAgentTaskState> = {},
): RemoteAgentTaskState {
  return {
    ...base,
    id: 'remote-1',
    type: 'remote_agent',
    status: 'running',
    description: 'remote review',
    startTime: 100,
    remoteTaskType: 'remote-agent',
    sessionId: 'session-remote',
    command: 'review pr 123',
    title: 'Review PR 123',
    todoList: [],
    log: [],
    pollStartedAt: 0,
    ...overrides,
  }
}

function workflowTask(
  overrides: Partial<LocalWorkflowTaskState> = {},
): LocalWorkflowTaskState {
  return {
    ...base,
    id: 'workflow-1',
    type: 'local_workflow',
    status: 'running',
    description: 'spec workflow',
    startTime: 100,
    workflowName: 'spec',
    workflowFile: '/repo/spec.ts',
    ...overrides,
  }
}

function monitorTask(
  overrides: Partial<MonitorMcpTaskState> = {},
): MonitorMcpTaskState {
  return {
    ...base,
    id: 'monitor-1',
    type: 'monitor_mcp',
    status: 'running',
    description: 'watch logs',
    startTime: 100,
    serverName: 'logs',
    resourceUri: 'file:///var/log/app',
    ...overrides,
  }
}

function dreamTask(overrides: Partial<DreamTaskState> = {}): DreamTaskState {
  return {
    ...base,
    id: 'dream-1',
    type: 'dream',
    status: 'running',
    description: 'dream review',
    startTime: 100,
    phase: 'starting',
    sessionsReviewing: 1,
    filesTouched: [],
    turns: [],
    priorMtime: 0,
    ...overrides,
  }
}

function item(task: TaskState): ListItem {
  return toListItem(task)
}

function leaderItem(label = '@team-lead'): ListItem {
  return { id: LEADER_ITEM_ID, type: 'leader', label, status: 'running' }
}

function historyItem(
  loadState: 'loading' | 'loaded' | 'failed' = 'loaded',
  size = 0,
): ListItem {
  return buildSubagentHistoryItem(loadState, size)
}

function recordedEntry(
  overrides: Partial<RecordedAgentEntry> = {},
): RecordedAgentEntry {
  return {
    agentId: 'ended-1',
    agentType: 'general-purpose',
    description: 'did a thing',
    stoppedByUser: false,
    lastActivityAt: 1000,
    ...overrides,
  }
}

const ctx = (overrides: Partial<ActionContext> = {}): ActionContext => ({
  viewingAgentTaskId: undefined,
  historyLoadState: 'loaded',
  historySize: 2,
  ...overrides,
})

// ── ② Leader row rules ──────────────────────────────────────────────────────

describe('buildLeaderItem', () => {
  test('no teammates and no bash tasks → no leader row', () => {
    expect(
      buildLeaderItem({ teammateCount: 0, bashCount: 0, username: 'alice' }),
    ).toEqual([])
  })

  test('teammates only → leader with the team-lead label', () => {
    const items = buildLeaderItem({
      teammateCount: 2,
      bashCount: 0,
      username: 'alice',
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      id: LEADER_ITEM_ID,
      type: 'leader',
      label: '@team-lead',
      status: 'running',
    })
  })

  test('bash tasks only → leader also appears, labeled @username', () => {
    const items = buildLeaderItem({
      teammateCount: 0,
      bashCount: 3,
      username: 'alice',
    })
    expect(items).toHaveLength(1)
    expect(items[0]!.label).toBe('@alice')
  })

  test('teammates and bash tasks → @username wins', () => {
    const items = buildLeaderItem({
      teammateCount: 1,
      bashCount: 1,
      username: 'alice',
    })
    expect(items[0]!.label).toBe('@alice')
  })

  test('custom team lead name is honored', () => {
    const items = buildLeaderItem({
      teammateCount: 1,
      bashCount: 0,
      username: 'alice',
      teamLeadName: 'lead',
    })
    expect(items[0]!.label).toBe('@lead')
  })
})

// ── ① Subagent history group ────────────────────────────────────────────────

describe('subagent history group', () => {
  test('buildSubagentHistoryItem carries the official group key and label', () => {
    const group = buildSubagentHistoryItem('loaded', 3)
    expect(group.id).toBe(SUBAGENT_HISTORY_ITEM_ID)
    expect(group.type).toBe('subagent_history')
    expect(group.label).toBe('Earlier in this session')
    expect(group.status).toBe('running')
    expect(group.size).toBe(3)
  })

  test('shown while loading or failed, hidden when loaded and empty', () => {
    expect(
      shouldShowSubagentHistoryItem(buildSubagentHistoryItem('loading', 0)),
    ).toBe(true)
    expect(
      shouldShowSubagentHistoryItem(buildSubagentHistoryItem('failed', 0)),
    ).toBe(true)
    expect(
      shouldShowSubagentHistoryItem(buildSubagentHistoryItem('loaded', 0)),
    ).toBe(false)
    expect(
      shouldShowSubagentHistoryItem(buildSubagentHistoryItem('loaded', 2)),
    ).toBe(true)
  })

  test('toRecordedAgentItem maps the entry fields', () => {
    const recorded = toRecordedAgentItem(recordedEntry())
    expect(recorded.type).toBe('recorded_agent')
    expect(recorded.agentId).toBe('ended-1')
    expect(recorded.agentType).toBe('general-purpose')
    expect(recorded.label).toBe('did a thing')
    expect(recorded.status).toBe('completed')
    expect(recorded.id).toContain('ended-1')
    // id is prefixed so a recorded agent can never collide with a live task id
    expect(recorded.id.startsWith('recorded:')).toBe(true)
  })

  test('toRecordedAgentItem: no description → agent type as label', () => {
    const recorded = toRecordedAgentItem(
      recordedEntry({ description: undefined, agentType: 'explore' }),
    )
    expect(recorded.label).toBe('explore')
  })

  test('toRecordedAgentItem: stoppedByUser → stopped status', () => {
    const recorded = toRecordedAgentItem(recordedEntry({ stoppedByUser: true }))
    expect(recorded.status).toBe('stopped')
  })
})

// ── ① System tasks group ────────────────────────────────────────────────────

describe('buildSelfManagedGroup', () => {
  const items: ListItem[] = [
    item(bashTask()),
    item(agentTask()),
    item(remoteTask()),
  ]

  test('isSelfManagedTask is constant-false until a marker lands (TODO)', () => {
    expect(
      items.some(
        listItem => 'task' in listItem && isSelfManagedTask(listItem.task),
      ),
    ).toBe(false)
  })

  test('nothing marked → no head, no items, everything remains', () => {
    const group = buildSelfManagedGroup(items, () => false, false)
    expect(group.head).toBeNull()
    expect(group.items).toEqual([])
    expect(group.remaining).toEqual(items)
  })

  test('heading shown → marked items listed, no head row', () => {
    const group = buildSelfManagedGroup(
      items,
      listItem => listItem.type === 'local_agent',
      true,
    )
    expect(group.head).toBeNull()
    expect(group.items.map(listItem => listItem.type)).toEqual(['local_agent'])
    expect(group.remaining.map(listItem => listItem.type)).toEqual([
      'local_bash',
      'remote_agent',
    ])
  })

  test('heading hidden → first task promoted to a single group-head row', () => {
    const group = buildSelfManagedGroup(
      [item(agentTask()), item(bashTask()), item(remoteTask())],
      listItem => listItem.type !== 'remote_agent',
      false,
    )
    expect(group.head).toEqual({
      id: SELF_MANAGED_TASKS_ITEM_ID,
      type: 'self_managed_tasks',
      label: 'System tasks',
      status: 'running',
      size: 2,
      firstTaskId: 'agent-1',
    })
    // items still carries every marked task for the group view
    expect(group.items.map(listItem => listItem.type)).toEqual([
      'local_agent',
      'local_bash',
    ])
    expect(group.remaining.map(listItem => listItem.type)).toEqual([
      'remote_agent',
    ])
  })
})

// ── ③ I9: action condition table ────────────────────────────────────────────

describe('getAvailableActions', () => {
  test('running local_bash → view + stop (no foreground)', () => {
    expect(getAvailableActions(item(bashTask()))).toEqual(['view', 'stop'])
  })

  test('running local_agent → view + foreground + stop', () => {
    expect(getAvailableActions(item(agentTask()))).toEqual([
      'view',
      'foreground',
      'stop',
    ])
  })

  test('completed local_agent → view + foreground, no stop', () => {
    expect(
      getAvailableActions(item(agentTask({ status: 'completed' }))),
    ).toEqual(['view', 'foreground'])
  })

  test('failed local_agent → view only', () => {
    expect(getAvailableActions(item(agentTask({ status: 'failed' })))).toEqual([
      'view',
    ])
  })

  test('killed local_agent → view only', () => {
    expect(getAvailableActions(item(agentTask({ status: 'killed' })))).toEqual([
      'view',
    ])
  })

  test('running in_process_teammate → view + foreground + stop', () => {
    expect(getAvailableActions(item(teammateTask()))).toEqual([
      'view',
      'foreground',
      'stop',
    ])
  })

  test('completed in_process_teammate → view only', () => {
    expect(
      getAvailableActions(item(teammateTask({ status: 'completed' }))),
    ).toEqual(['view'])
  })

  test('running remote_agent → view + stop', () => {
    expect(getAvailableActions(item(remoteTask()))).toEqual(['view', 'stop'])
  })

  test('pending remote_agent → view only (stop needs running)', () => {
    expect(
      getAvailableActions(item(remoteTask({ status: 'pending' }))),
    ).toEqual(['view'])
  })

  test('leader → view + foreground', () => {
    expect(getAvailableActions(leaderItem())).toEqual(['view', 'foreground'])
  })

  test('subagent_history group row → view only', () => {
    expect(getAvailableActions(historyItem())).toEqual(['view'])
  })

  test('recorded_agent → view only', () => {
    expect(getAvailableActions(toRecordedAgentItem(recordedEntry()))).toEqual([
      'view',
    ])
  })

  test('self_managed_tasks head → view', () => {
    const group = buildSelfManagedGroup([item(bashTask())], () => true, false)
    expect(getAvailableActions(group.head!)).toEqual(['view'])
  })

  test('ACTION_LABELS matches the official label table', () => {
    expect(ACTION_LABELS).toEqual({
      view: 'View',
      foreground: 'Foreground',
      stop: 'Stop',
    })
  })
})

// ── ③ Eu → jl: the view dispatch ────────────────────────────────────────────

describe('resolveActionIntent — view (jl)', () => {
  test('plain displayable types → detail view', () => {
    expect(resolveActionIntent(item(bashTask()), 'view', ctx())).toEqual({
      kind: 'view-detail',
    })
    expect(resolveActionIntent(item(remoteTask()), 'view', ctx())).toEqual({
      kind: 'view-detail',
    })
  })

  test('leader → exitTeammateView + Viewing leader', () => {
    expect(resolveActionIntent(leaderItem(), 'view', ctx())).toEqual({
      kind: 'view-leader',
    })
  })

  test('subagent_history loaded with size > 0 → enter the Earlier list', () => {
    expect(
      resolveActionIntent(
        historyItem('loaded', 2),
        'view',
        ctx({ historySize: 2 }),
      ),
    ).toEqual({
      kind: 'view-subagent-history',
    })
  })

  test('subagent_history size 0 → return (noop)', () => {
    expect(
      resolveActionIntent(
        historyItem('loaded', 0),
        'view',
        ctx({ historySize: 0 }),
      ),
    ).toEqual({
      kind: 'noop',
    })
  })

  test('subagent_history unreadable → notify read failure and return', () => {
    expect(
      resolveActionIntent(
        historyItem('failed'),
        'view',
        ctx({ historyLoadState: 'failed' }),
      ),
    ).toEqual({
      kind: 'history-unreadable',
    })
  })

  test('recorded_agent → view its transcript (Wd(entry))', () => {
    expect(
      resolveActionIntent(toRecordedAgentItem(recordedEntry()), 'view', ctx()),
    ).toEqual({ kind: 'view-recorded-agent', agentId: 'ended-1' })
  })

  test('self_managed_tasks → enter the System tasks group view', () => {
    const group = buildSelfManagedGroup([item(bashTask())], () => true, false)
    expect(resolveActionIntent(group.head!, 'view', ctx())).toEqual({
      kind: 'view-self-managed',
    })
  })

  test('local_agent not currently viewed → detail view', () => {
    expect(resolveActionIntent(item(agentTask()), 'view', ctx())).toEqual({
      kind: 'view-detail',
    })
  })

  test('local_agent currently viewed (CD(ad)) → re-enter viewing + Viewing agent', () => {
    expect(
      resolveActionIntent(
        item(agentTask()),
        'view',
        ctx({ viewingAgentTaskId: 'agent-1' }),
      ),
    ).toEqual({ kind: 'view-current-agent' })
  })
})

// ── ③ Eu → Yl: the foreground dispatch ──────────────────────────────────────

describe('resolveActionIntent — foreground (Yl)', () => {
  test('running in_process_teammate → bq(id) + Viewing teammate', () => {
    expect(
      resolveActionIntent(item(teammateTask()), 'foreground', ctx()),
    ).toEqual({
      kind: 'foreground-teammate',
    })
  })

  test('completed in_process_teammate → noop', () => {
    expect(
      resolveActionIntent(
        item(teammateTask({ status: 'completed' })),
        'foreground',
        ctx(),
      ),
    ).toEqual({ kind: 'noop' })
  })

  test('viewable local_agent → bq(id) + Viewing agent', () => {
    expect(resolveActionIntent(item(agentTask()), 'foreground', ctx())).toEqual(
      {
        kind: 'foreground-agent',
      },
    )
    expect(
      resolveActionIntent(
        item(agentTask({ status: 'completed' })),
        'foreground',
        ctx(),
      ),
    ).toEqual({
      kind: 'foreground-agent',
    })
  })

  test('failed/killed local_agent → noop', () => {
    expect(
      resolveActionIntent(
        item(agentTask({ status: 'failed' })),
        'foreground',
        ctx(),
      ),
    ).toEqual({
      kind: 'noop',
    })
    expect(
      resolveActionIntent(
        item(agentTask({ status: 'killed' })),
        'foreground',
        ctx(),
      ),
    ).toEqual({
      kind: 'noop',
    })
  })

  test('leader → exitTeammateView + Viewing leader', () => {
    expect(resolveActionIntent(leaderItem(), 'foreground', ctx())).toEqual({
      kind: 'foreground-leader',
    })
  })

  test('local_bash → noop (not foregroundable)', () => {
    expect(resolveActionIntent(item(bashTask()), 'foreground', ctx())).toEqual({
      kind: 'noop',
    })
  })
})

// ── ③ Eu → nl: the stop dispatch ────────────────────────────────────────────

describe('resolveStopIntent (nl)', () => {
  test('running local_bash → direct stop', () => {
    expect(resolveStopIntent(item(bashTask()))).toEqual({ kind: 'stop' })
  })

  test('running local_agent / teammate / workflow / dream have a stop method → confirmStop', () => {
    expect(resolveStopIntent(item(agentTask()))).toEqual({
      kind: 'stop-confirm',
    })
    expect(resolveStopIntent(item(teammateTask()))).toEqual({
      kind: 'stop-confirm',
    })
    expect(resolveStopIntent(item(workflowTask()))).toEqual({
      kind: 'stop-confirm',
    })
    expect(resolveStopIntent(item(dreamTask()))).toEqual({
      kind: 'stop-confirm',
    })
  })

  test('running monitor_mcp → direct stop', () => {
    expect(resolveStopIntent(item(monitorTask()))).toEqual({ kind: 'stop' })
  })

  test('running plain remote_agent → direct stop', () => {
    expect(resolveStopIntent(item(remoteTask()))).toEqual({ kind: 'stop' })
  })

  test('running remote ultraplan → stopUltraplan (mto) with the session id', () => {
    expect(resolveStopIntent(item(remoteTask({ isUltraplan: true })))).toEqual({
      kind: 'stop-ultraplan',
      sessionId: 'session-remote',
    })
  })

  test('running remote review → confirmStop', () => {
    expect(
      resolveStopIntent(item(remoteTask({ isRemoteReview: true }))),
    ).toEqual({
      kind: 'stop-confirm',
    })
  })

  test('not running → noop (no detach concept yet)', () => {
    expect(resolveStopIntent(item(bashTask({ status: 'completed' })))).toEqual({
      kind: 'noop',
    })
    expect(resolveStopIntent(item(agentTask({ status: 'completed' })))).toEqual(
      { kind: 'noop' },
    )
    expect(resolveStopIntent(item(remoteTask({ status: 'pending' })))).toEqual({
      kind: 'noop',
    })
  })

  test('non-task rows → noop', () => {
    expect(resolveStopIntent(leaderItem())).toEqual({ kind: 'noop' })
    expect(resolveStopIntent(historyItem())).toEqual({ kind: 'noop' })
    expect(resolveStopIntent(toRecordedAgentItem(recordedEntry()))).toEqual({
      kind: 'noop',
    })
  })
})

// ── ④ Empty state ───────────────────────────────────────────────────────────

describe('isEmptyTaskList', () => {
  test('empty list → no tasks', () => {
    expect(isEmptyTaskList([])).toBe(true)
  })

  test('only the subagent-history group → still "no tasks"', () => {
    expect(isEmptyTaskList([historyItem()])).toBe(true)
    expect(isEmptyTaskList([historyItem('loading', 0)])).toBe(true)
  })

  test('history group plus a running task → not empty', () => {
    expect(isEmptyTaskList([historyItem(), item(bashTask())])).toBe(false)
  })

  test('running task only → not empty', () => {
    expect(isEmptyTaskList([item(bashTask())])).toBe(false)
  })
})

// ── ④ Key hint rows ─────────────────────────────────────────────────────────

describe('buildListHints', () => {
  test('no selection → select · view · close', () => {
    expect(
      buildListHints({
        currentSelection: undefined,
        anyAgentRunning: false,
        killAgentsShortcut: 'x',
      }),
    ).toEqual([
      { shortcut: '↑/↓', action: 'select' },
      { shortcut: 'Enter', action: 'view' },
      { shortcut: '←/Esc', action: 'close' },
    ])
  })

  test('running teammate selection → f foreground + x stop rowActions', () => {
    const hints = buildListHints({
      currentSelection: item(teammateTask()),
      anyAgentRunning: false,
      killAgentsShortcut: 'x',
    })
    expect(hints).toEqual([
      { shortcut: '↑/↓', action: 'select' },
      { shortcut: 'Enter', action: 'view' },
      { shortcut: 'f', action: 'foreground' },
      { shortcut: 'x', action: 'stop' },
      { shortcut: '←/Esc', action: 'close' },
    ])
  })

  test('completed local_agent → f shown, x hidden', () => {
    const hints = buildListHints({
      currentSelection: item(agentTask({ status: 'completed' })),
      anyAgentRunning: false,
      killAgentsShortcut: 'x',
    })
    expect(hints.some(hint => hint.action === 'foreground')).toBe(true)
    expect(hints.some(hint => hint.action === 'stop')).toBe(false)
  })

  test('leader selection → f shown, x hidden', () => {
    const hints = buildListHints({
      currentSelection: leaderItem(),
      anyAgentRunning: false,
      killAgentsShortcut: 'x',
    })
    expect(hints.some(hint => hint.action === 'foreground')).toBe(true)
    expect(hints.some(hint => hint.action === 'stop')).toBe(false)
  })

  test('running agents → stop-all-agents chord hint', () => {
    const hints = buildListHints({
      currentSelection: undefined,
      anyAgentRunning: true,
      killAgentsShortcut: 'ctrl+x ctrl+k',
    })
    expect(hints).toContainEqual({
      shortcut: 'ctrl+x ctrl+k',
      action: 'stop all agents',
    })
  })
})

describe('hint constants (official L940641)', () => {
  test('ACTIONS_VIEW_HINTS: select · choose · go back', () => {
    expect(ACTIONS_VIEW_HINTS).toEqual([
      { shortcut: '↑/↓', action: 'select' },
      { shortcut: 'Enter', action: 'choose' },
      { shortcut: 'Esc', action: 'go back' },
    ])
  })

  test('CONFIRM_STOP_HINTS: stop · go back', () => {
    expect(CONFIRM_STOP_HINTS).toEqual([
      { shortcut: 'Enter', action: 'stop' },
      { shortcut: 'Esc', action: 'go back' },
    ])
  })

  test('SUBAGENT_HISTORY_HINTS: select · view · go back', () => {
    expect(SUBAGENT_HISTORY_HINTS).toEqual([
      { shortcut: '↑/↓', action: 'select' },
      { shortcut: 'Enter', action: 'view' },
      { shortcut: 'Esc', action: 'go back' },
    ])
  })

  test('DETAIL_HINTS: scroll · send · back (L1555: reopen + message)', () => {
    expect(DETAIL_HINTS).toEqual([
      { shortcut: '↑/↓', action: 'scroll' },
      { shortcut: 'Enter', action: 'send' },
      { shortcut: 'Esc', action: 'back' },
    ])
  })
})

// ── Actions title truncation (official Rot = 16) ────────────────────────────

describe('truncateTaskName', () => {
  test('short names are untouched', () => {
    expect(truncateTaskName('fix the bug')).toBe('fix the bug')
  })

  test('exactly 16 chars are untouched', () => {
    expect(truncateTaskName('a'.repeat(16))).toBe('a'.repeat(16))
  })

  test('17 chars → 15 chars + ellipsis (16 total)', () => {
    expect(truncateTaskName('a'.repeat(17))).toBe(`${'a'.repeat(15)}…`)
  })

  test('custom max length', () => {
    expect(truncateTaskName('abcdef', 3)).toBe('ab…')
  })
})

// ── Task → item mapping and list ordering ───────────────────────────────────

describe('toListItem', () => {
  test('local_bash label is the command (description for monitors)', () => {
    expect(item(bashTask()).label).toBe('bun test')
    expect(item(bashTask({ kind: 'monitor' })).label).toBe('run tests')
  })

  test('remote_agent label is the title', () => {
    expect(item(remoteTask()).label).toBe('Review PR 123')
  })

  test('in_process_teammate label is @agentName', () => {
    expect(item(teammateTask()).label).toBe('@researcher')
  })

  test('local_workflow label prefers the summary', () => {
    expect(item(workflowTask({ summary: 'sum' })).label).toBe('sum')
    expect(item(workflowTask({ summary: undefined })).label).toBe(
      'spec workflow',
    )
  })
})

describe('sortListItems', () => {
  test('running first, then newest start time first', () => {
    const sorted = sortListItems([
      item(bashTask({ id: 'a', status: 'completed', startTime: 300 })),
      item(bashTask({ id: 'b', status: 'running', startTime: 100 })),
      item(bashTask({ id: 'c', status: 'running', startTime: 200 })),
    ])
    expect(sorted.map(listItem => listItem.id)).toEqual(['c', 'b', 'a'])
  })
})

// ── Condition helpers (direct coverage of uCe / Q1 / vR) ────────────────────

describe('action condition helpers', () => {
  test('canViewItem is true for every listed type', () => {
    const items: ListItem[] = [
      item(bashTask()),
      item(remoteTask()),
      item(agentTask()),
      item(teammateTask()),
      item(workflowTask()),
      item(monitorTask()),
      item(dreamTask()),
      leaderItem(),
      historyItem(),
      toRecordedAgentItem(recordedEntry()),
    ]
    expect(items.every(canViewItem)).toBe(true)
  })

  test('canForegroundItem: only teammates, local agents and the leader', () => {
    expect(canForegroundItem(item(teammateTask()))).toBe(true)
    expect(canForegroundItem(item(agentTask()))).toBe(true)
    expect(canForegroundItem(leaderItem())).toBe(true)
    expect(canForegroundItem(item(bashTask()))).toBe(false)
    expect(canForegroundItem(item(remoteTask()))).toBe(false)
    expect(canForegroundItem(item(monitorTask()))).toBe(false)
    expect(canForegroundItem(item(dreamTask()))).toBe(false)
    expect(canForegroundItem(item(workflowTask()))).toBe(false)
  })

  test('canStopItem: task-backed rows only while running', () => {
    expect(canStopItem(item(bashTask()))).toBe(true)
    expect(canStopItem(item(bashTask({ status: 'completed' })))).toBe(false)
    expect(canStopItem(item(agentTask()))).toBe(true)
    expect(canStopItem(item(remoteTask({ status: 'pending' })))).toBe(false)
    expect(canStopItem(leaderItem())).toBe(false)
    expect(canStopItem(historyItem())).toBe(false)
    expect(canStopItem(toRecordedAgentItem(recordedEntry()))).toBe(false)
  })
})
