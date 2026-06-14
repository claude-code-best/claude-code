import React, { useEffect, useState, useSyncExternalStore } from 'react';
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
 * 夹紧选中索引到有效区间（空列表→0；越界→末位；负/NaN→0）。
 * 抽成模块级纯函数：面板内调用 + 单测覆盖同一逻辑，避免行为漂移。
 */
export function clampSelected(selected: number, len: number): number {
  if (len === 0) return 0;
  const n = Math.trunc(selected);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.min(n, len - 1);
}

/**
 * /workflows 主面板：三区焦点模型（顶 tab + 左 phase 侧栏 + 右 agent 列表）。
 *
 * - useSyncExternalStore 订阅 WorkflowService（store 返回稳定快照，无变更不重渲染）。
 * - 焦点状态：activeRunId / focusColumn('phases'|'agents') / selectedPhaseIndex(0=All) / selectedAgentIndex。
 * - 键位：Tab 切 run · ←/→ 切焦点列 · ↑/↓ 列内移动 · x kill · r resume · q/Esc 退出。
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
  // kill 二次确认。null = 无弹窗；'workflow' = 杀整个 run；'agent' = 杀当前选中 agent。
  // 非 null 时键盘进入 confirm 模式（仅 y/Enter/n/Esc/q 响应）。
  const [confirmKill, setConfirmKill] = useState<null | 'agent' | 'workflow'>(null);

  // mount 时触发一次扫盘 hydrate 历史 run（service 内部 persistedLoaded flag 守护幂等）。
  // 重 mount/重渲染不会重复扫盘（flag 进程单例守护）。svc 引用稳定（getWorkflowService 单例）。
  useEffect(() => {
    void svc.loadPersistedRuns();
  }, [svc]);

  // runs 变化时：activeRunId 失效（被 kill / 首次）→ 夹紧到首个
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
  // 侧栏含 All 行：phases 数组前补一项 → 总行数 = phases.length + 1
  const phaseRowCount = phases.length + 1;
  const clampedPhase = clampSelected(selectedPhaseIndex, phaseRowCount);

  // 选中 phase title（0 = All = undefined）
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
      // 仅在 agents 列聚焦时弹 agent 确认（在 phases 列按 x 无目标，no-op）。
      // 选中 agent 由 visibleAgents[clampedAgent] 决定；保存到 confirmKill 后由
      // confirmYes 实际执行——避免在两次渲染间 visibleAgents 变化导致误杀。
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
      // confirm 模式下 q = 取消确认（routeWorkflowKey 已路由到 confirmNo）；
      // 非 confirm 模式才真退出面板。
      if (confirmKill !== null) {
        setConfirmKill(null);
        return;
      }
      onDone();
    },
    confirmYes: () => {
      if (confirmKill === 'workflow' && focused) {
        svc.kill(focused.runId);
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
  // 每秒刷新 header 耗时（共享 clock；订阅即触发重渲染，耗时走墙钟）。
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
