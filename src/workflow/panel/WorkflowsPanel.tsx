import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Box, Dialog, Text, useAnimationFrame } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { getWorkflowService } from '../service.js';
import type { RunProgress } from '../progress/store.js';
import { AgentList } from './AgentList.js';
import { PhaseSidebar } from './PhaseSidebar.js';
import { TabsBar } from './TabsBar.js';
import { RUN_STATUS_COLOR, RUN_STATUS_TEXT } from './status.js';
import { type FocusColumn, type WorkflowKeyboardHandlers, useWorkflowKeyboard } from './useWorkflowKeyboard.js';
import { ALL_PHASE, filterAgentsByPhase, formatDuration, mergePhases } from './selectors.js';

/**
 * Clamp the selected index to a valid range (empty list -> 0; out of range -> last position; negative/NaN -> 0).
 * Extracted into a module-level pure function: called inside the panel + unit tested for the same logic, to avoid behavior drift.
 */
export function clampSelected(selected: number, len: number): number {
  if (len === 0) return 0;
  const n = Math.trunc(selected);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.min(n, len - 1);
}

/**
 * Determine whether the focused run completed the running -> terminal state transition (used for panel auto-exit).
 * Extracted into a pure function for easy unit testing; called directly inside the panel's useEffect.
 *
 * Trigger condition: prev and curr are the same runId, prev is running, curr is completed/failed/killed.
 * - Opening the history panel (prev=null): does not trigger
 * - Switching to an already completed tab (different runId): does not trigger
 * - Same run running -> terminal: triggers
 */
export function isRunTerminatedTransition(
  prev: { runId: string; status: RunProgress['status'] } | null,
  curr: { runId: string; status: RunProgress['status'] } | null,
): boolean {
  if (!prev || !curr) return false;
  if (prev.runId !== curr.runId) return false;
  if (prev.status !== 'running') return false;
  return curr.status === 'completed' || curr.status === 'failed' || curr.status === 'killed';
}

/**
 * /workflows main panel: three-region focus model (top tab + left phase sidebar + right agent list).
 *
 * - useSyncExternalStore subscribes to WorkflowService (the store returns stable snapshots, no re-render without change).
 * - Focus state: activeRunId / focusColumn('phases'|'agents') / selectedPhaseIndex(0=All) / selectedAgentIndex.
 * - Keybindings: Tab switch run · Left/Right switch focus column · Up/Down move within column · x kill · r resume · q/Esc quit.
 */
export function WorkflowsPanel({
  onDone,
  context,
}: {
  onDone: LocalJSXCommandOnDone;
  context: LocalJSXCommandContext;
}): React.ReactNode {
  const svc = getWorkflowService();
  const runs = useSyncExternalStore(
    svc.subscribe,
    () => svc.listRuns(),
    () => [],
  );

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [focusColumn, setFocusColumn] = useState<FocusColumn>('phases');
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
  // kill secondary confirmation. null = no dialog; 'workflow' = kill the whole run; 'agent' = kill the currently selected agent.
  // When non-null the keyboard enters confirm mode (only y/Enter/n/Esc/q respond).
  const [confirmKill, setConfirmKill] = useState<null | 'agent' | 'workflow'>(null);

  // On mount, trigger a single disk scan to hydrate historical runs (the service's internal persistedLoaded flag guards idempotency).
  // Re-mount / re-render does not scan again (guarded by the process-singleton flag). The svc reference is stable (getWorkflowService singleton).
  useEffect(() => {
    void svc.loadPersistedRuns();
  }, [svc]);

  // On runs change: activeRunId invalidated (killed / first time) -> clamp to the first one
  useEffect(() => {
    if (runs.length === 0) {
      if (activeRunId !== null) setActiveRunId(null);
      return;
    }
    if (!runs.some(r => r.runId === activeRunId)) {
      setActiveRunId(runs[0]!.runId);
    }
  }, [runs, activeRunId]);

  const focused: RunProgress | undefined = runs.find(r => r.runId === activeRunId);
  const phases = focused ? mergePhases(focused) : [];
  // The sidebar includes the All row: prepend one item to the phases array -> total rows = phases.length + 1
  const phaseRowCount = phases.length + 1;
  const clampedPhase = clampSelected(selectedPhaseIndex, phaseRowCount);

  // Auto-exit the panel when the focused run transitions from running to terminal (800ms delay so the user sees the ✓/✗ terminal state).
  // Only triggered by a state transition on the same runId: switching to an already completed tab (prev was a different run) does not exit; opening the history panel
  // (prev=null) does not exit either. Otherwise the agent is blocked by the panel while waiting for the Workflow tool result, and the user must press q manually.
  const prevFocusedRef = useRef<{ runId: string; status: RunProgress['status'] } | null>(null);
  useEffect(() => {
    const curr = focused ? { runId: focused.runId, status: focused.status } : null;
    const prev = prevFocusedRef.current;
    prevFocusedRef.current = curr;
    if (!isRunTerminatedTransition(prev, curr)) return;
    const timer = setTimeout(() => onDone(), 800);
    return (): void => {
      clearTimeout(timer);
    };
  }, [focused?.runId, focused?.status, onDone]);

  // Selected phase title (0 = All = undefined)
  const selectedPhaseTitle = clampedPhase === 0 ? undefined : phases[clampedPhase - 1]?.title;

  const visibleAgents = focused ? filterAgentsByPhase(focused.agents, selectedPhaseTitle) : [];
  const clampedAgent = clampSelected(selectedAgentIndex, visibleAgents.length);

  const switchTab = (runId: string): void => {
    setActiveRunId(runId);
    setFocusColumn('phases');
    setSelectedPhaseIndex(0);
    setSelectedAgentIndex(0);
  };

  const nextTab = (): void => {
    if (runs.length === 0) return;
    const idx = runs.findIndex(r => r.runId === activeRunId);
    const next = runs[(idx + 1) % runs.length]!;
    switchTab(next.runId);
  };
  const prevTab = (): void => {
    if (runs.length === 0) return;
    const idx = runs.findIndex(r => r.runId === activeRunId);
    const next = runs[(idx - 1 + runs.length) % runs.length]!;
    switchTab(next.runId);
  };

  const handlers: WorkflowKeyboardHandlers = {
    nextTab,
    prevTab,
    focusLeft: () => setFocusColumn('phases'),
    focusRight: () => setFocusColumn('agents'),
    moveUp: () => {
      if (focusColumn === 'phases') setSelectedPhaseIndex(s => clampSelected(s - 1, phaseRowCount));
      else setSelectedAgentIndex(s => clampSelected(s - 1, visibleAgents.length));
    },
    moveDown: () => {
      if (focusColumn === 'phases') setSelectedPhaseIndex(s => clampSelected(s + 1, phaseRowCount));
      else setSelectedAgentIndex(s => clampSelected(s + 1, visibleAgents.length));
    },
    killAgent: () => {
      // Only pop the agent confirmation when the agents column is focused (pressing x in the phases column has no target, no-op).
      // The selected agent is decided by visibleAgents[clampedAgent]; saved into confirmKill and then
      // actually executed by confirmYes - to avoid mis-killing caused by visibleAgents changing between two renders.
      if (focusColumn !== 'agents' || !focused) return;
      const agent = visibleAgents[clampedAgent];
      if (!agent) return;
      setConfirmKill('agent');
    },
    killWorkflow: () => {
      if (!focused) return;
      setConfirmKill('workflow');
    },
    resumeFocused: () => {
      if (!focused) return;
      const canUseTool = context.canUseTool;
      if (!canUseTool) {
        onDone('resume needs canUseTool context; run /<name> resume from the main session.');
        return;
      }
      void svc
        .launch({ resumeFromRunId: focused.runId, name: focused.workflowName }, context, canUseTool)
        .catch(e => onDone(`resume failed: ${(e as Error).message}`));
    },
    newRun: () => onDone('Tip: start a named workflow with /<name>, or pass name via the Workflow tool.'),
    quit: () => {
      // In confirm mode q = cancel confirmation (routeWorkflowKey already routed to confirmNo);
      // only in non-confirm mode does it really exit the panel.
      if (confirmKill !== null) {
        setConfirmKill(null);
        return;
      }
      onDone();
    },
    confirmYes: () => {
      if (confirmKill === 'workflow' && focused) {
        svc.kill(focused.runId);
        // After killing the entire workflow, immediately return to the main chat: the run_done event -> the store reducer changes the status to
        // killed -> notifications.ts bridges enqueuePendingNotification, and the main chat shows
        // `Workflow "<name>" was stopped`. Staying on the panel would instead make the user miss the "stopped" feedback.
        setConfirmKill(null);
        onDone();
        return;
      } else if (confirmKill === 'agent' && focused) {
        const agent = visibleAgents[clampedAgent];
        if (agent) svc.killAgent(focused.runId, agent.id);
      }
      setConfirmKill(null);
    },
    confirmNo: () => setConfirmKill(null),
  };
  useWorkflowKeyboard(handlers, confirmKill !== null ? 'confirm' : 'normal');

  const running = runs.filter(r => r.status === 'running').length;
  const done = runs.length - running;
  const phaseHeader = selectedPhaseTitle ?? ALL_PHASE;
  const agentDone = focused ? focused.agents.filter(a => a.status === 'done').length : 0;
  // Refresh the header duration every second (shared clock; subscribing triggers re-render, duration follows wall clock).
  const [clockRef] = useAnimationFrame(1000);
  const elapsed = focused ? Date.now() - focused.startedAt : 0;

  return (
    <Box ref={clockRef} flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold>{focused?.workflowName ?? 'Workflows'}</Text>
        {focused ? (
          <Text color="subtle">
            {agentDone}/{focused.agentCount} agents · {formatDuration(elapsed)} ·{' '}
            <Text color={RUN_STATUS_COLOR[focused.status] as keyof Theme}>{RUN_STATUS_TEXT[focused.status]}</Text>
          </Text>
        ) : (
          <Text color="subtle">
            {running} running · {done} done
          </Text>
        )}
      </Box>
      {focused?.description ? <Text color="subtle">{focused.description}</Text> : null}

      {runs.length > 1 ? (
        <Box marginTop={1}>
          <TabsBar runs={runs} activeRunId={activeRunId} />
        </Box>
      ) : null}

      <Box flexDirection="row" marginTop={1}>
        <Box width="25%" flexDirection="column">
          <Text color={focusColumn === 'phases' ? 'claude' : 'subtle'} bold>
            Phases
          </Text>
          <PhaseSidebar
            phases={phases}
            agents={focused?.agents ?? []}
            selectedIndex={clampedPhase}
            focused={focusColumn === 'phases'}
          />
        </Box>
        <Text color="subtle">│</Text>
        <Box flexGrow={1} flexDirection="column">
          <Text color={focusColumn === 'agents' ? 'claude' : 'subtle'} bold>
            {phaseHeader} · {visibleAgents.length} agents
          </Text>
          <AgentList agents={visibleAgents} selectedIndex={clampedAgent} focused={focusColumn === 'agents'} />
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="subtle">
          {confirmKill !== null
            ? 'Confirm: y kill · n/Esc cancel'
            : 'Tab switch run · ←/→ focus · ↑/↓ move · x kill agent · K kill workflow · r resume · q quit'}
        </Text>
      </Box>

      {confirmKill !== null ? (
        <Dialog
          title={
            confirmKill === 'workflow'
              ? `Kill workflow "${focused?.workflowName ?? ''}"?`
              : `Kill agent "${visibleAgents[clampedAgent]?.label ?? ''}"?`
          }
          subtitle={
            confirmKill === 'workflow'
              ? 'All in-flight agents will be aborted. Resume will replay from journal.'
              : 'Only this agent aborts; other agents in the workflow keep running.'
          }
          onCancel={() => setConfirmKill(null)}
          color="warning"
        >
          <Text color="subtle">Press y to confirm, or n/Esc to cancel.</Text>
        </Dialog>
      ) : null}
    </Box>
  );
}
