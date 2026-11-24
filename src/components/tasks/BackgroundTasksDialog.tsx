import { feature } from 'bun:bundle';
import figures from 'figures';
import { userInfo } from 'os';
import React, { type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { isCoordinatorMode } from 'src/coordinator/coordinatorMode.js';
import { useTerminalSize } from 'src/hooks/useTerminalSize.js';
import { useAppState, useSetAppState } from 'src/state/AppState.js';
import { enterTeammateView, exitTeammateView } from 'src/state/teammateViewHelpers.js';
import type { ToolUseContext } from 'src/Tool.js';
import { DreamTask } from 'src/tasks/DreamTask/DreamTask.js';
import { InProcessTeammateTask } from 'src/tasks/InProcessTeammateTask/InProcessTeammateTask.js';
import { LocalAgentTask } from 'src/tasks/LocalAgentTask/LocalAgentTask.js';
import { LocalShellTask } from 'src/tasks/LocalShellTask/LocalShellTask.js';
import { RemoteAgentTask } from 'src/tasks/RemoteAgentTask/RemoteAgentTask.js';
import { isBackgroundTask, type TaskState } from 'src/tasks/types.js';
import { intersperse } from 'src/utils/array.js';
import { listRecordedAgents, type RecordedAgentEntry } from 'src/utils/sessionStorage.js';
import { stopUltraplan } from '../../commands/ultraplan.js';
import type { CommandResultDisplay } from '../../commands.js';
import { useRegisterOverlay } from '../../context/overlayContext.js';
import type { ExitState } from '../../hooks/useExitOnCtrlCDWithKeybindings.js';
import { type KeyboardEvent, Box, Text } from '@anthropic/ink';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js';
import { count } from '../../utils/array.js';
import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink';
import { AsyncAgentDetailDialog } from './AsyncAgentDetailDialog.js';
import { BackgroundTask as BackgroundTaskComponent } from './BackgroundTask.js';
import { DreamDetailDialog } from './DreamDetailDialog.js';
import { InProcessTeammateDetailDialog } from './InProcessTeammateDetailDialog.js';
import { RecordedAgentDetailDialog, SubagentHistoryView } from './SubagentHistoryView.js';
import { RemoteSessionDetailDialog } from './RemoteSessionDetailDialog.js';
import { ShellDetailDialog } from './ShellDetailDialog.js';
import { ConfirmStopDialog, TaskActionsPanel } from './TaskActionsView.js';
import {
  buildLeaderItem,
  buildListHints,
  buildSelfManagedGroup,
  buildSubagentHistoryItem,
  getAvailableActions,
  isSelfManagedTask,
  isEmptyTaskList,
  resolveActionIntent,
  resolveStopIntent,
  shouldShowSubagentHistoryItem,
  sortListItems,
  SUBAGENT_HISTORY_HINTS,
  toListItem,
  toRecordedAgentItem,
  type ActionContext,
  type ActionIntent,
  type ListItem,
  type RecordedAgentItem,
  type SelfManagedTasksItem,
  type SubagentHistoryLoadState,
  type TaskAction,
} from './backgroundTasksList.js';

/**
 * The dialog's three view states (official 2.1.330, strings L937308):
 * `list` | `detail` | `confirmStop` — plus the Actions panel (Enter on a
 * selection) and the subagent-history sub-views. `isListSkipped` is tracked
 * by skippedListOnMount below.
 */
type ViewState =
  | { mode: 'list' }
  | { mode: 'detail'; itemId: string }
  | { mode: 'actions'; itemId: string }
  | { mode: 'confirmStop'; itemId: string; from: 'list' | 'actions' }
  | { mode: 'subagentHistory' }
  | { mode: 'recordedAgent'; agentId: string }
  | { mode: 'selfManagedTasks' };

type Props = {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
  toolUseContext: ToolUseContext;
  initialDetailTaskId?: string;
};

// WORKFLOW_SCRIPTS is ant-only (build_flags.yaml). Static imports would leak
// ~1.3K lines into external builds. Gate with feature() + require so the
// bundler can dead-code-eliminate the branch.
/* eslint-disable @typescript-eslint/no-require-imports */
// WorkflowDetailDialog 已移除：workflow 详情改由 /workflows 面板展示。
const workflowTaskModule = feature('WORKFLOW_SCRIPTS')
  ? (require('src/tasks/LocalWorkflowTask/LocalWorkflowTask.js') as typeof import('src/tasks/LocalWorkflowTask/LocalWorkflowTask.js'))
  : null;
const killWorkflowTask = workflowTaskModule?.killWorkflowTask ?? null;
// skipWorkflowAgent / retryWorkflowAgent 仅由 /workflows 面板调用（原详情对话框已移除）。
// Relative path, not `src/...` path-mapping — Bun's DCE can statically
// resolve + eliminate `./` requires, but path-mapped strings stay opaque
// and survive as dead literals in the bundle. Matches tasks.ts pattern.
const monitorMcpModule = feature('MONITOR_TOOL')
  ? (require('../../tasks/MonitorMcpTask/MonitorMcpTask.js') as typeof import('../../tasks/MonitorMcpTask/MonitorMcpTask.js'))
  : null;
const killMonitorMcp = monitorMcpModule?.killMonitorMcp ?? null;
const MonitorMcpDetailDialog = feature('MONITOR_TOOL')
  ? (require('./MonitorMcpDetailDialog.js') as typeof import('./MonitorMcpDetailDialog.js')).MonitorMcpDetailDialog
  : null;
/* eslint-enable @typescript-eslint/no-require-imports */

// Helper to get filtered background tasks (excludes foregrounded local_agent)
function getSelectableBackgroundTasks(
  tasks: Record<string, TaskState> | undefined,
  foregroundedTaskId: string | undefined,
): TaskState[] {
  const backgroundTasks = Object.values(tasks ?? {}).filter(isBackgroundTask);
  return backgroundTasks.filter(task => !(task.type === 'local_agent' && task.id === foregroundedTaskId));
}

export function BackgroundTasksDialog({ onDone, toolUseContext, initialDetailTaskId }: Props): React.ReactNode {
  const tasks = useAppState(s => s.tasks);
  const foregroundedTaskId = useAppState(s => s.foregroundedTaskId);
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId);
  const showSpinnerTree = useAppState(s => s.expandedView) === 'teammates';
  const setAppState = useSetAppState();
  const killAgentsShortcut = useShortcutDisplay('chat:killAgents', 'Chat', 'ctrl+x ctrl+k');
  const typedTasks = tasks as Record<string, TaskState> | undefined;

  // Official ②: the leader row is labeled `@${username}` (`cd`) when bash
  // tasks exist.
  const username = useMemo(() => userInfo().username, []);

  // Official ①: the __subagent_history__ group's recorded (ended) agents
  // load asynchronously (vn = Mve(L, ...): loaded / failed — failed renders
  // the size as "unreadable"). Reload only when the SET of active agents
  // changes (spawn/finish), not on every task-state tick.
  const activeAgentKey = useMemo(
    () =>
      Object.values(typedTasks ?? {})
        .filter(t => t.type === 'local_agent' && isBackgroundTask(t))
        .map(t => t.id)
        .sort()
        .join(','),
    [typedTasks],
  );
  const [subagentHistory, setSubagentHistory] = useState<{
    status: SubagentHistoryLoadState;
    agents: RecordedAgentEntry[];
  }>({ status: 'loading', agents: [] });
  useEffect(() => {
    let cancelled = false;
    const activeAgentIds = new Set(activeAgentKey ? activeAgentKey.split(',') : []);
    void listRecordedAgents(activeAgentIds).then(
      agents => {
        if (!cancelled) setSubagentHistory({ status: 'loaded', agents });
      },
      () => {
        if (!cancelled) setSubagentHistory({ status: 'failed', agents: [] });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeAgentKey]);

  // Transient in-dialog message (e.g. the history group's read-failure
  // notice — official: "提示读失败 return").
  const [notice, setNotice] = useState<string | null>(null);

  // Track if we skipped list view on mount (for back button behavior)
  const skippedListOnMount = useRef(false);

  // Compute initial view state - skip list if caller provided a specific task,
  // or if there's exactly one task
  const [viewState, setViewState] = useState<ViewState>(() => {
    if (initialDetailTaskId) {
      skippedListOnMount.current = true;
      return { mode: 'detail', itemId: initialDetailTaskId };
    }
    const allItems = getSelectableBackgroundTasks(typedTasks, foregroundedTaskId);
    if (allItems.length === 1) {
      skippedListOnMount.current = true;
      return { mode: 'detail', itemId: allItems[0]!.id };
    }
    return { mode: 'list' };
  });
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Register as modal overlay so parent Chat keybindings (up/down for history)
  // are deactivated while this dialog is open
  useRegisterOverlay('background-tasks-dialog');

  // Memoize the sorted and categorized items together to ensure stable references
  const {
    bashTasks,
    remoteSessions,
    agentTasks,
    teammateTasks,
    workflowTasks,
    mcpMonitors,
    dreamTasks,
    selfManaged,
    subagentHistoryItem,
    allSelectableItems,
  } = useMemo(() => {
    // Filter to only show running/pending background tasks, matching the status bar count
    const backgroundTasks = Object.values(typedTasks ?? {}).filter(isBackgroundTask);
    const allItems = backgroundTasks.map(toListItem);
    const sorted = sortListItems(allItems);
    // Official ① __self_managed_tasks__: Cr-marked tasks are pulled out of
    // their regular groups. isSelfManagedTask is constant-false until a
    // self-managed marker lands in TaskState (TODO).
    const selfManaged = buildSelfManagedGroup(sorted, item => 'task' in item && isSelfManagedTask(item.task), false);
    const regular = selfManaged.remaining;
    const bash = regular.filter(item => item.type === 'local_bash');
    const remote = regular.filter(item => item.type === 'remote_agent');
    // Exclude foregrounded task - it's being viewed in the main UI, not a background task
    const agent = regular.filter(item => item.type === 'local_agent' && item.id !== foregroundedTaskId);
    const workflows = regular.filter(item => item.type === 'local_workflow');
    const monitorMcp = regular.filter(item => item.type === 'monitor_mcp');
    const dreamTasks = regular.filter(item => item.type === 'dream');
    // In spinner-tree mode, exclude teammates from the dialog (they appear in the tree)
    const teammates = showSpinnerTree ? [] : regular.filter(item => item.type === 'in_process_teammate');
    // Official ②: the leader row also appears when bash tasks exist (labeled
    // `@${username}`); with teammates only it keeps the team-lead label so
    // users can still foreground back to the leader.
    const leaderItem = buildLeaderItem({
      teammateCount: teammates.length,
      bashCount: bash.length,
      username,
    });
    // Official ①: the __subagent_history__ group row is part of the flat
    // selectable list even while loading (that is what makes the official
    // empty-state check `Er.every(item => item.key === "subagent-history")`
    // meaningful); a fully-loaded empty history renders nothing.
    const historyItem = buildSubagentHistoryItem(subagentHistory.status, subagentHistory.agents.length);
    const showHistory = shouldShowSubagentHistoryItem(historyItem);
    // With the heading hidden the main list shows only the group-head row;
    // the System-tasks group view lists the marked items themselves.
    const selfManagedListItems: ListItem[] = selfManaged.head ? [selfManaged.head] : selfManaged.items;
    return {
      bashTasks: bash,
      remoteSessions: remote,
      agentTasks: agent,
      teammateTasks: [...leaderItem, ...teammates],
      workflowTasks: workflows,
      mcpMonitors: monitorMcp,
      dreamTasks,
      selfManaged: { head: selfManaged.head, items: selfManaged.items, listItems: selfManagedListItems },
      subagentHistoryItem: showHistory ? historyItem : null,
      // Order MUST match JSX render order (teammates → bash → monitorMcp →
      // remote → agent → workflows → dream → system tasks → earlier) so ↓/↑
      // navigation moves the cursor visually downward.
      allSelectableItems: [
        ...leaderItem,
        ...teammates,
        ...bash,
        ...monitorMcp,
        ...remote,
        ...agent,
        ...workflows,
        ...dreamTasks,
        ...selfManagedListItems,
        ...(showHistory ? [historyItem] : []),
      ],
    };
  }, [typedTasks, foregroundedTaskId, showSpinnerTree, subagentHistory, username]);

  const currentSelection = allSelectableItems[selectedIndex] ?? null;

  // Context for the official `Eu` action dispatch: the batch5 viewing state
  // (`CD(ad)`) and the history group's async load state.
  const actionContext = useMemo<ActionContext>(
    () => ({
      viewingAgentTaskId,
      historyLoadState: subagentHistory.status,
      historySize: subagentHistory.agents.length,
    }),
    [viewingAgentTaskId, subagentHistory],
  );

  // Use configurable keybindings for standard navigation and confirm/cancel.
  // confirm:no is handled by Dialog's onCancel prop.
  useKeybindings(
    {
      'confirm:previous': () => setSelectedIndex(prev => Math.max(0, prev - 1)),
      'confirm:next': () => setSelectedIndex(prev => Math.min(allSelectableItems.length - 1, prev + 1)),
      'confirm:yes': () => {
        const current = allSelectableItems[selectedIndex];
        if (current) {
          // Official ③: Enter on the selection opens the Actions panel
          // (`Actions for {name}`). Fall back to the detail view when no
          // action is available for the item.
          setNotice(null);
          const actions = getAvailableActions(current);
          setViewState(
            actions.length > 0 ? { mode: 'actions', itemId: current.id } : { mode: 'detail', itemId: current.id },
          );
        }
      },
    },
    { context: 'Confirmation', isActive: viewState.mode === 'list' },
  );

  /** Execute the resolved stop target for a task-backed item. */
  async function executeStop(item: ListItem): Promise<void> {
    switch (item.type) {
      case 'local_bash':
        await killShellTask(item.id);
        break;
      case 'local_agent':
        await killAgentTask(item.id);
        break;
      case 'in_process_teammate':
        await killTeammateTask(item.id);
        break;
      case 'local_workflow':
        if (killWorkflowTask) {
          killWorkflowTask(item.id, setAppState);
        }
        break;
      case 'monitor_mcp':
        if (killMonitorMcp) {
          killMonitorMcp(item.id, setAppState);
        }
        break;
      case 'dream':
        await killDreamTask(item.id);
        break;
      case 'remote_agent':
        await killRemoteAgentTask(item.id);
        break;
      default:
        break;
    }
  }

  /**
   * Official `Eu` — execute a resolved action intent. All side effects
   * (viewing state, system messages, stop) live here; the pure resolution
   * lives in backgroundTasksList.ts.
   */
  function executeIntent(item: ListItem, intent: ActionIntent): void {
    switch (intent.kind) {
      case 'view-detail':
        setViewState({ mode: 'detail', itemId: item.id });
        break;
      case 'view-leader':
      case 'foreground-leader':
        exitTeammateView(setAppState);
        onDone('Viewing leader', { display: 'system' });
        break;
      case 'view-subagent-history':
        // Enter the Earlier list (recorded agents).
        setViewState({ mode: 'subagentHistory' });
        break;
      case 'history-unreadable':
        // Official: size unreadable → notify the read failure and return.
        setNotice('Could not read earlier agents in this session');
        setViewState({ mode: 'list' });
        break;
      case 'view-recorded-agent':
        // `Wd(entry)`: view the recorded agent's transcript.
        setViewState({ mode: 'recordedAgent', agentId: intent.agentId });
        break;
      case 'view-self-managed':
        setViewState({ mode: 'selfManagedTasks' });
        break;
      case 'view-current-agent':
      case 'foreground-agent':
        // `bq(ad.id)`: enter the viewing state (batch5 viewingAgentTaskId).
        enterTeammateView(item.id, setAppState);
        onDone('Viewing agent', { display: 'system' });
        break;
      case 'foreground-teammate':
        // `bq(id)`: enter the viewing state + "Viewing teammate".
        enterTeammateView(item.id, setAppState);
        onDone('Viewing teammate', { display: 'system' });
        break;
      case 'stop-confirm':
        // The third view state: confirm before stopping.
        setViewState({ mode: 'confirmStop', itemId: item.id, from: 'actions' });
        break;
      case 'stop':
        void executeStop(item);
        setViewState({ mode: 'list' });
        break;
      case 'stop-ultraplan':
        // `mto`: stopUltraplan.
        void stopUltraplan(item.id, intent.sessionId, setAppState);
        setViewState({ mode: 'list' });
        break;
      case 'noop':
        break;
    }
  }

  /** Official `Eu` entry: resolve then execute an action on an item. */
  function executeAction(item: ListItem, action: TaskAction): void {
    executeIntent(item, resolveActionIntent(item, action, actionContext));
  }

  // Component-specific shortcuts (x=stop, f=foreground) shown in UI.
  // These are task-type and status dependent, not standard dialog keybindings.
  // They are the official `rowActions` — the inline shortcuts that coexist
  // with the Actions panel.
  const handleKeyDown = (e: KeyboardEvent) => {
    // Only handle input when in list mode
    if (viewState.mode !== 'list') return;

    if (e.key === 'left') {
      e.preventDefault();
      onDone('Background tasks dialog dismissed', { display: 'system' });
      return;
    }

    // Compute current selection at the time of the key press
    const currentSelection = allSelectableItems[selectedIndex];
    if (!currentSelection) return; // everything below requires a selection

    if (e.key === 'x') {
      e.preventDefault();
      // Official `nl`: tasks with a stop method go through the confirmStop
      // view; remote ultraplan stops via stopUltraplan; the rest stop
      // directly.
      const intent = resolveStopIntent(currentSelection);
      switch (intent.kind) {
        case 'stop-confirm':
          setViewState({ mode: 'confirmStop', itemId: currentSelection.id, from: 'list' });
          break;
        case 'stop':
          void executeStop(currentSelection);
          break;
        case 'stop-ultraplan':
          void stopUltraplan(currentSelection.id, intent.sessionId, setAppState);
          break;
        case 'noop':
          break;
      }
    }

    if (e.key === 'f') {
      // Official `Yl` inline: foreground = enter the viewing state.
      const intent = resolveActionIntent(currentSelection, 'foreground', actionContext);
      if (intent.kind !== 'noop') {
        e.preventDefault();
        executeIntent(currentSelection, intent);
      }
    }
  };

  async function killShellTask(taskId: string): Promise<void> {
    await LocalShellTask.kill(taskId, setAppState);
  }

  async function killAgentTask(taskId: string): Promise<void> {
    await LocalAgentTask.kill(taskId, setAppState);
  }

  async function killTeammateTask(taskId: string): Promise<void> {
    await InProcessTeammateTask.kill(taskId, setAppState);
  }

  async function killDreamTask(taskId: string): Promise<void> {
    await DreamTask.kill(taskId, setAppState);
  }

  async function killRemoteAgentTask(taskId: string): Promise<void> {
    await RemoteAgentTask.kill(taskId, setAppState);
  }

  // Wrap onDone in useEffectEvent to get a stable reference that always calls
  // the current onDone callback without causing the effect to re-fire.
  const onDoneEvent = useEffectEvent(onDone);

  useEffect(() => {
    if (viewState.mode === 'detail') {
      const task = (typedTasks ?? {})[viewState.itemId];
      // Workflow tasks get a grace: their detail view stays open through
      // completion so the user sees the final state before eviction.
      if (!task || (task.type !== 'local_workflow' && !isBackgroundTask(task))) {
        // Task was removed or is no longer a background task (e.g. killed).
        // If we skipped the list on mount, close the dialog entirely.
        if (skippedListOnMount.current) {
          onDoneEvent('Background tasks dialog dismissed', {
            display: 'system',
          });
        } else {
          setViewState({ mode: 'list' });
        }
      }
    } else if (viewState.mode === 'actions' || viewState.mode === 'confirmStop') {
      // The selected item must still exist in the list (a task, the leader
      // row, or the history group row) — otherwise fall back to the list.
      if (!allSelectableItems.some(item => item.id === viewState.itemId)) {
        setViewState({ mode: 'list' });
      }
    }

    const totalItems = allSelectableItems.length;
    if (selectedIndex >= totalItems && totalItems > 0) {
      setSelectedIndex(totalItems - 1);
    }
  }, [viewState, typedTasks, selectedIndex, allSelectableItems, onDoneEvent]);

  // Helper to go back to list view (or close dialog if we skipped list on
  // mount AND there's still only ≤1 item). Checking current count prevents
  // the stale-state trap: if you opened with 1 task (auto-skipped to detail),
  // then a second task started, 'back' should show the list — not close.
  const goBackToList = () => {
    if (skippedListOnMount.current && allSelectableItems.length <= 1) {
      onDone('Background tasks dialog dismissed', { display: 'system' });
    } else {
      skippedListOnMount.current = false;
      setViewState({ mode: 'list' });
    }
  };

  // Official ③: the Actions panel for the selected item (Enter on the
  // selection). Falls back to the list if the item disappeared.
  if (viewState.mode === 'actions') {
    const item = allSelectableItems.find(listItem => listItem.id === viewState.itemId);
    if (!item) return null;
    return (
      <TaskActionsPanel
        key={`actions-${item.id}`}
        item={item}
        onChoose={action => executeAction(item, action)}
        onBack={() => setViewState({ mode: 'list' })}
      />
    );
  }

  // Official ③ `nl`: the confirmStop view state — stopping a task with a
  // stop method asks for confirmation first.
  if (viewState.mode === 'confirmStop') {
    const item = allSelectableItems.find(listItem => listItem.id === viewState.itemId);
    if (!item) return null;
    return (
      <ConfirmStopDialog
        key={`confirm-stop-${item.id}`}
        item={item}
        onConfirm={() => {
          void executeStop(item);
          setViewState({ mode: 'list' });
        }}
        onBack={() =>
          setViewState(viewState.from === 'actions' ? { mode: 'actions', itemId: viewState.itemId } : { mode: 'list' })
        }
      />
    );
  }

  // Official ③ `jl`: the Earlier list — recorded (ended) agents loaded from
  // the session's subagent transcripts.
  if (viewState.mode === 'subagentHistory') {
    return (
      <SubagentHistoryView
        entries={subagentHistory.agents}
        loadState={subagentHistory.status}
        onSelect={item => setViewState({ mode: 'recordedAgent', agentId: item.agentId })}
        onBack={() => setViewState({ mode: 'list' })}
      />
    );
  }

  // Official ③ `jl`: `Wd(entry)` — view a recorded agent's transcript.
  if (viewState.mode === 'recordedAgent') {
    const entry = subagentHistory.agents.find(agent => agent.agentId === viewState.agentId);
    if (!entry) return null;
    return (
      <RecordedAgentDetailDialog
        key={`recorded-${entry.agentId}`}
        entry={toRecordedAgentItem(entry)}
        toolUseContext={toolUseContext}
        onDone={() => onDone('Background tasks dialog dismissed', { display: 'system' })}
        onBack={() => setViewState({ mode: 'subagentHistory' })}
      />
    );
  }

  // Official ③ `jl`: view on the __self_managed_tasks__ group head enters
  // the System tasks group view. The group is empty until isSelfManagedTask
  // grows a real marker (TODO) — minimal wiring, no selection yet.
  if (viewState.mode === 'selfManagedTasks') {
    return (
      <Dialog
        title="System tasks"
        subtitle={
          <Text dimColor>
            {selfManaged.items.length} {selfManaged.items.length === 1 ? 'task' : 'tasks'}
          </Text>
        }
        onCancel={() => setViewState({ mode: 'list' })}
        color="background"
        inputGuide={() => (
          <Byline>
            {SUBAGENT_HISTORY_HINTS.map(hint => (
              <KeyboardShortcutHint key={hint.shortcut + hint.action} shortcut={hint.shortcut} action={hint.action} />
            ))}
          </Byline>
        )}
      >
        <Box flexDirection="column">
          {selfManaged.items.length === 0 ? (
            <Text dimColor>No system tasks</Text>
          ) : (
            selfManaged.items.map(item => <Item key={item.id} item={item} isSelected={false} />)
          )}
        </Box>
      </Dialog>
    );
  }

  // If an item is selected, show the appropriate view
  if (viewState.mode === 'detail' && typedTasks) {
    const task = typedTasks[viewState.itemId];
    if (!task) {
      return null;
    }

    // Detail mode - show appropriate detail dialog
    switch (task.type) {
      case 'local_bash':
        return (
          <ShellDetailDialog
            shell={task}
            onDone={onDone}
            onKillShell={() => void killShellTask(task.id)}
            onBack={goBackToList}
            key={`shell-${task.id}`}
          />
        );
      case 'local_agent':
        return (
          <AsyncAgentDetailDialog
            agent={task}
            onDone={onDone}
            onKillAgent={() => void killAgentTask(task.id)}
            onBack={goBackToList}
            key={`agent-${task.id}`}
          />
        );
      case 'remote_agent':
        return (
          <RemoteSessionDetailDialog
            session={task}
            onDone={onDone}
            toolUseContext={toolUseContext}
            onBack={goBackToList}
            onKill={
              task.status !== 'running'
                ? undefined
                : task.isUltraplan
                  ? () => void stopUltraplan(task.id, task.sessionId, setAppState)
                  : () => void killRemoteAgentTask(task.id)
            }
            key={`session-${task.id}`}
          />
        );
      case 'in_process_teammate':
        return (
          <InProcessTeammateDetailDialog
            teammate={task}
            onDone={onDone}
            onKill={task.status === 'running' ? () => void killTeammateTask(task.id) : undefined}
            onBack={goBackToList}
            onForeground={
              task.status === 'running'
                ? () => {
                    enterTeammateView(task.id, setAppState);
                    onDone('Viewing teammate', { display: 'system' });
                  }
                : undefined
            }
            key={`teammate-${task.id}`}
          />
        );
      case 'local_workflow': {
        // shift+下/Enter 进入的 workflow 详情。原 WorkflowDetailDialog 已移除，
        // 详情改由 /workflows 面板展示，但此处仍需一个能退出的占位视图——
        // 否则用户进入后 Esc/←/q 全无效，卡死。照 MonitorMcpDetailDialog 模式：
        // ←/Esc 返回（goBackToList：单任务关闭、多任务回列表），x kill（running）。
        const onKill =
          task.status === 'running' && killWorkflowTask ? () => killWorkflowTask(task.id, setAppState) : undefined;
        return (
          <Box
            key={`workflow-${task.id}`}
            flexDirection="column"
            tabIndex={0}
            borderStyle="round"
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'left') {
                e.preventDefault();
                goBackToList();
              } else if (e.key === 'x' && onKill) {
                e.preventDefault();
                onKill();
              }
            }}
          >
            <Dialog
              title={task.workflowName}
              subtitle={
                <Text dimColor>
                  {task.status}
                  {task.summary ? ` · ${task.summary}` : ''}
                </Text>
              }
              onCancel={goBackToList}
              inputGuide={() => (
                <Byline>
                  <KeyboardShortcutHint shortcut="←" action="go back" />
                  <KeyboardShortcutHint shortcut="Esc" action="close" />
                  {onKill && <KeyboardShortcutHint shortcut="x" action="stop" />}
                </Byline>
              )}
            >
              {task.status === 'failed' && task.error ? (
                <Box flexDirection="column">
                  <Text color="error">失败原因：{task.error}</Text>
                  <Text color="subtle">用 /workflows 查看阶段与 agent 实时进度</Text>
                </Box>
              ) : (
                <Text color="subtle">用 /workflows 查看阶段与 agent 实时进度</Text>
              )}
            </Dialog>
          </Box>
        );
      }
      case 'monitor_mcp':
        if (!MonitorMcpDetailDialog) return null;
        return (
          <MonitorMcpDetailDialog
            task={task}
            onKill={
              task.status === 'running' && killMonitorMcp ? () => killMonitorMcp(task.id, setAppState) : undefined
            }
            onBack={goBackToList}
            key={`monitor-mcp-${task.id}`}
          />
        );
      case 'dream':
        return (
          <DreamDetailDialog
            task={task}
            onDone={() =>
              onDone('Background tasks dialog dismissed', {
                display: 'system',
              })
            }
            onBack={goBackToList}
            onKill={task.status === 'running' ? () => void killDreamTask(task.id) : undefined}
            key={`dream-${task.id}`}
          />
        );
    }
  }

  const runningBashCount = count(bashTasks, _ => _.status === 'running');
  const runningAgentCount =
    count(remoteSessions, _ => _.status === 'running' || _.status === 'pending') +
    count(agentTasks, _ => _.status === 'running');
  const runningTeammateCount = count(teammateTasks, _ => _.status === 'running');
  const subtitle = intersperse(
    [
      ...(runningTeammateCount > 0
        ? [
            <Text key="teammates">
              {runningTeammateCount} {runningTeammateCount !== 1 ? 'agents' : 'agent'}
            </Text>,
          ]
        : []),
      ...(runningBashCount > 0
        ? [
            <Text key="shells">
              {runningBashCount} {runningBashCount !== 1 ? 'active shells' : 'active shell'}
            </Text>,
          ]
        : []),
      ...(runningAgentCount > 0
        ? [
            <Text key="agents">
              {runningAgentCount} {runningAgentCount !== 1 ? 'active agents' : 'active agent'}
            </Text>,
          ]
        : []),
    ],
    index => <Text key={`separator-${index}`}> · </Text>,
  );

  // Official ④ (L940641) list-state hint row: `↑/↓ to select · Enter to
  // view · Esc to close`, plus the inline rowActions hints (f/x) and the
  // stop-all-agents chord while agents run.
  const actions = buildListHints({
    currentSelection: currentSelection ?? undefined,
    anyAgentRunning: agentTasks.some(t => t.status === 'running'),
    killAgentsShortcut,
  }).map(hint => (
    <KeyboardShortcutHint key={`${hint.shortcut}-${hint.action}`} shortcut={hint.shortcut} action={hint.action} />
  ));

  const handleCancel = () => onDone('Background tasks dialog dismissed', { display: 'system' });

  function renderInputGuide(exitState: ExitState): React.ReactNode {
    if (exitState.pending) {
      return <Text>Press {exitState.keyName} again to exit</Text>;
    }
    return <Byline>{actions}</Byline>;
  }

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Dialog
        title="Background tasks"
        subtitle={<>{subtitle}</>}
        onCancel={handleCancel}
        color="background"
        inputGuide={renderInputGuide}
      >
        {notice && <Text color="error">{notice}</Text>}
        {/* Official ④: only the subagent-history group also counts as "no
         * tasks" — the empty check is about running tasks. The history
         * group row still renders below so Earlier stays reachable. */}
        {isEmptyTaskList(allSelectableItems) ? (
          <Text dimColor>No tasks currently running</Text>
        ) : (
          <Box flexDirection="column">
            {teammateTasks.length > 0 && (
              <Box flexDirection="column">
                {(bashTasks.length > 0 || remoteSessions.length > 0 || agentTasks.length > 0) && (
                  <Text dimColor>
                    <Text bold>{'  '}Agents</Text> ({count(teammateTasks, i => i.type !== 'leader')})
                  </Text>
                )}
                <Box flexDirection="column">
                  <TeammateTaskGroups teammateTasks={teammateTasks} currentSelectionId={currentSelection?.id} />
                </Box>
              </Box>
            )}

            {bashTasks.length > 0 && (
              <Box flexDirection="column" marginTop={teammateTasks.length > 0 ? 1 : 0}>
                {(teammateTasks.length > 0 || remoteSessions.length > 0 || agentTasks.length > 0) && (
                  <Text dimColor>
                    <Text bold>{'  '}Shells</Text> ({bashTasks.length})
                  </Text>
                )}
                <Box flexDirection="column">
                  {bashTasks.map(item => (
                    <Item key={item.id} item={item} isSelected={item.id === currentSelection?.id} />
                  ))}
                </Box>
              </Box>
            )}

            {mcpMonitors.length > 0 && (
              <Box flexDirection="column" marginTop={teammateTasks.length > 0 || bashTasks.length > 0 ? 1 : 0}>
                <Text dimColor>
                  <Text bold>{'  '}Monitors</Text> ({mcpMonitors.length})
                </Text>
                <Box flexDirection="column">
                  {mcpMonitors.map(item => (
                    <Item key={item.id} item={item} isSelected={item.id === currentSelection?.id} />
                  ))}
                </Box>
              </Box>
            )}

            {remoteSessions.length > 0 && (
              <Box
                flexDirection="column"
                marginTop={teammateTasks.length > 0 || bashTasks.length > 0 || mcpMonitors.length > 0 ? 1 : 0}
              >
                <Text dimColor>
                  <Text bold>{'  '}Remote agents</Text> ({remoteSessions.length})
                </Text>
                <Box flexDirection="column">
                  {remoteSessions.map(item => (
                    <Item key={item.id} item={item} isSelected={item.id === currentSelection?.id} />
                  ))}
                </Box>
              </Box>
            )}

            {agentTasks.length > 0 && (
              <Box
                flexDirection="column"
                marginTop={
                  teammateTasks.length > 0 ||
                  bashTasks.length > 0 ||
                  mcpMonitors.length > 0 ||
                  remoteSessions.length > 0
                    ? 1
                    : 0
                }
              >
                <Text dimColor>
                  <Text bold>{'  '}Local agents</Text> ({agentTasks.length})
                </Text>
                <Box flexDirection="column">
                  {agentTasks.map(item => (
                    <Item key={item.id} item={item} isSelected={item.id === currentSelection?.id} />
                  ))}
                </Box>
              </Box>
            )}

            {workflowTasks.length > 0 && (
              <Box
                flexDirection="column"
                marginTop={
                  teammateTasks.length > 0 ||
                  bashTasks.length > 0 ||
                  mcpMonitors.length > 0 ||
                  remoteSessions.length > 0 ||
                  agentTasks.length > 0
                    ? 1
                    : 0
                }
              >
                <Text dimColor>
                  <Text bold>{'  '}Workflows</Text> ({workflowTasks.length})
                </Text>
                <Box flexDirection="column">
                  {workflowTasks.map(item => (
                    <Item key={item.id} item={item} isSelected={item.id === currentSelection?.id} />
                  ))}
                </Box>
              </Box>
            )}

            {dreamTasks.length > 0 && (
              <Box
                flexDirection="column"
                marginTop={
                  teammateTasks.length > 0 ||
                  bashTasks.length > 0 ||
                  mcpMonitors.length > 0 ||
                  remoteSessions.length > 0 ||
                  agentTasks.length > 0 ||
                  workflowTasks.length > 0
                    ? 1
                    : 0
                }
              >
                <Box flexDirection="column">
                  {dreamTasks.map(item => (
                    <Item key={item.id} item={item} isSelected={item.id === currentSelection?.id} />
                  ))}
                </Box>
              </Box>
            )}

            {/* Official ① __self_managed_tasks__: Cr-marked tasks. With the
             * heading hidden (head form) only the group-head row renders;
             * with the heading shown the marked items render under it. */}
            {selfManaged.listItems.length > 0 && (
              <Box
                flexDirection="column"
                marginTop={
                  teammateTasks.length > 0 ||
                  bashTasks.length > 0 ||
                  mcpMonitors.length > 0 ||
                  remoteSessions.length > 0 ||
                  agentTasks.length > 0 ||
                  workflowTasks.length > 0 ||
                  dreamTasks.length > 0
                    ? 1
                    : 0
                }
              >
                {selfManaged.head === null && (
                  <Text dimColor>
                    <Text bold>{'  '}System tasks</Text> ({selfManaged.items.length})
                  </Text>
                )}
                <Box flexDirection="column">
                  {selfManaged.listItems.map(item => (
                    <Item key={item.id} item={item} isSelected={item.id === currentSelection?.id} />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* Official ① __subagent_history__: the Earlier group row — always
         * rendered when present (even in the empty state above) so the
         * recorded-agent history stays reachable with no running tasks. */}
        {subagentHistoryItem && (
          <Box flexDirection="column" marginTop={allSelectableItems.length > 1 ? 1 : 0}>
            <Box flexDirection="column">
              <Item
                key={subagentHistoryItem.id}
                item={subagentHistoryItem}
                isSelected={subagentHistoryItem.id === currentSelection?.id}
              />
            </Box>
          </Box>
        )}
      </Dialog>
    </Box>
  );
}

function Item({ item, isSelected }: { item: ListItem; isSelected: boolean }): ReactNode {
  const { columns } = useTerminalSize();
  // Dialog border (2) + padding (2) + pointer prefix (2) + name/status overhead (~20)
  const maxActivityWidth = Math.max(30, columns - 26);
  // In coordinator mode, use grey pointer instead of blue
  const useGreyPointer = isCoordinatorMode();

  return (
    <Box flexDirection="row">
      <Text dimColor={useGreyPointer && isSelected}>{isSelected ? figures.pointer + ' ' : '  '}</Text>
      <Text color={isSelected && !useGreyPointer ? 'suggestion' : undefined}>
        {renderItemLabel(item, maxActivityWidth)}
      </Text>
    </Box>
  );
}

/**
 * Row content per item type: task-backed rows render the BackgroundTask
 * component; the leader row renders its label (official ②: `@${username}`
 * when bash tasks exist, else the team-lead name); the group rows render
 * their label + size (official ①: `${n9} (${ts.length})`, failed →
 * "unreadable"); recorded agents render label + agent type.
 */
function renderItemLabel(item: ListItem, maxActivityWidth: number): ReactNode {
  switch (item.type) {
    case 'leader':
      return <Text>{item.label}</Text>;
    case 'subagent_history': {
      const sizeText =
        item.loadState === 'failed' ? 'unreadable' : item.loadState === 'loading' ? '…' : String(item.size);
      return (
        <Text>
          {item.label} <Text dimColor>({sizeText})</Text>
        </Text>
      );
    }
    case 'self_managed_tasks':
      return (
        <Text>
          {item.label} <Text dimColor>({item.size})</Text>
        </Text>
      );
    case 'recorded_agent':
      return (
        <Text>
          {item.label} <Text dimColor>{item.agentType}</Text>
        </Text>
      );
    default:
      return <BackgroundTaskComponent task={item.task} maxActivityWidth={maxActivityWidth} />;
  }
}

function TeammateTaskGroups({
  teammateTasks,
  currentSelectionId,
}: {
  teammateTasks: ListItem[];
  currentSelectionId: string | undefined;
}): ReactNode {
  // Separate leader from teammates, group teammates by team
  const leaderItems = teammateTasks.filter(i => i.type === 'leader');
  const teammateItems = teammateTasks.filter(i => i.type === 'in_process_teammate');
  const teams = new Map<string, typeof teammateItems>();
  for (const item of teammateItems) {
    const teamName = item.task.identity.teamName;
    const group = teams.get(teamName);
    if (group) {
      group.push(item);
    } else {
      teams.set(teamName, [item]);
    }
  }
  const teamEntries = [...teams.entries()];
  return (
    <>
      {teamEntries.map(([teamName, items]) => {
        const memberCount = items.length + leaderItems.length;
        return (
          <Box key={teamName} flexDirection="column">
            <Text dimColor>
              {'  '}Team: {teamName} ({memberCount})
            </Text>
            {/* Render leader first within each team */}
            {leaderItems.map(item => (
              <Item key={`${item.id}-${teamName}`} item={item} isSelected={item.id === currentSelectionId} />
            ))}
            {items.map(item => (
              <Item key={item.id} item={item} isSelected={item.id === currentSelectionId} />
            ))}
          </Box>
        );
      })}
    </>
  );
}
