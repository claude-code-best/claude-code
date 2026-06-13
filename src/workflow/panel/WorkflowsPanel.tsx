import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Box, Text, useAnimationFrame } from '@anthropic/ink';
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
    killFocused: () => {
      if (focused) svc.kill(focused.runId);
    },
    resumeFocused: () => {
      if (!focused) return;
      const canUseTool = context.canUseTool;
      if (!canUseTool) {
        onDone('resume 需要 canUseTool 上下文，请在主会话中用 /<name> resume 重试。');
        return;
      }
      void svc
        .launch({ resumeFromRunId: focused.runId, name: focused.workflowName }, context, canUseTool)
        .catch(e => onDone(`resume 失败：${(e as Error).message}`));
    },
    newRun: () => onDone('Tip: 用 /<name> 启动命名 workflow，或通过 Workflow 工具带 name 参数。'),
    quit: () => onDone(),
  };
  useWorkflowKeyboard(handlers);

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
        <Text color="subtle">Tab 切 run · ←/→ 切焦点 · ↑/↓ 移动 · x kill · r resume · q quit</Text>
      </Box>
    </Box>
  );
}
