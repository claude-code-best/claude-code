import { expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import React from 'react';
import { wrappedRender as render } from '@anthropic/ink';
import { SentryErrorBoundary } from '../../components/SentryErrorBoundary.js';
import type { RunProgress } from '../progress/store.js';
import { call as panelCall } from '../panel/panelCall.js';
import { clampSelected, WorkflowsPanel } from '../panel/WorkflowsPanel.js';
import { truncateLabel } from '../panel/AgentList.js';
import { STATUS_DOT } from '../panel/status.js';
import { __resetWorkflowServiceForTests, getWorkflowService } from '../service.js';

// 纯函数：选中夹紧到有效区间（与面板内 clampSelected 同源）。
test('clampSelected：空列表→0；越界→末位；负/NaN→0；正常→原值', () => {
  expect(clampSelected(5, 0)).toBe(0);
  expect(clampSelected(5, 3)).toBe(2);
  expect(clampSelected(-3, 3)).toBe(0);
  expect(clampSelected(1, 3)).toBe(1);
  expect(clampSelected(0, 1)).toBe(0);
  // NaN（如未初始化状态）安全回落到 0
  expect(clampSelected(Number.NaN, 3)).toBe(0);
});

// truncateLabel：短 label 原样；含 `#数字` 后缀时保留后缀，前缀截断 + 省略号；
// 无后缀则从右切。让 audit workflow 的 verify:${dim}#${idx} 多 finding 仍可区分。
test('truncateLabel：短 label 原样；含 #数字 后缀保留后缀前缀截断；无后缀从右切', () => {
  // 短 label 原样
  expect(truncateLabel('agent-1', 18)).toBe('agent-1');
  expect(truncateLabel('review:bugs', 18)).toBe('review:bugs');
  // 刚好 max 长度（边界）
  expect(truncateLabel('review:correctness', 18)).toBe('review:correctness');
  // 超 max + 含 #数字 后缀：保留后缀，前缀截断 + 省略号
  expect(truncateLabel('verify:correctness#0', 18)).toBe('verify:correctn…#0');
  expect(truncateLabel('verify:architecture#15', 18)).toBe('verify:archite…#15');
  // 多位 #idx 也能区分
  expect(truncateLabel('verify:correctness#2', 18)).toBe('verify:correctn…#2');
  // 无 #数字 后缀：从右切（旧行为）
  expect(truncateLabel('a-very-long-label-no-suffix', 18)).toBe('a-very-long-label-');
});

// STATUS_DOT 覆盖四种状态，且均为可见圆点字符。
test('STATUS_DOT 覆盖 running/completed/failed/killed 且为非空字符', () => {
  const statuses = ['running', 'completed', 'failed', 'killed'] as const;
  for (const s of statuses) {
    expect(STATUS_DOT[s]).toBeTruthy();
    expect(STATUS_DOT[s].length).toBeGreaterThan(0);
  }
});

// 进度数据形态契约：面板读取的字段在典型 RunProgress 上存在/可读，
// 防止 store.ts 结构漂移悄悄破坏面板渲染。
test('RunProgress 字段契约：面板读取的 key 均存在', () => {
  const run: RunProgress = {
    runId: 'r1',
    workflowName: 'review',
    status: 'running',
    phases: [{ title: 'Find', status: 'done' }],
    declaredPhases: ['Find', 'Review'],
    currentPhase: 'Review',
    agents: [{ id: 1, label: 'review:api', phase: 'Review', status: 'running' }],
    agentCount: 1,
    startedAt: 1,
    updatedAt: 1,
  };
  // 面板 WorkflowList/Detail 读取的路径
  expect(run.status).toBe('running');
  expect(STATUS_DOT[run.status]).toBe('●');
  expect(run.currentPhase).toBe('Review');
  expect(run.agents.length).toBe(run.agentCount);
  expect(run.phases[0]?.title).toBe('Find');
  expect(run.phases[0]?.status).toBe('done');
  expect(run.agents[0]?.label).toBe('review:api');
});

// 完成/失败形态：returnValue / error 在非 running 时才显示。
test('RunProgress 完成/失败形态：returnValue/error 可选', () => {
  const completed: RunProgress = {
    runId: 'r2',
    workflowName: 'w',
    status: 'completed',
    phases: [],
    declaredPhases: [],
    currentPhase: null,
    agents: [],
    agentCount: 0,
    returnValue: 'ok',
    startedAt: 2,
    updatedAt: 2,
  };
  const failed: RunProgress = {
    runId: 'r3',
    workflowName: 'w',
    status: 'failed',
    phases: [],
    declaredPhases: [],
    currentPhase: null,
    agents: [],
    agentCount: 0,
    error: 'boom',
    startedAt: 3,
    updatedAt: 3,
  };
  expect(completed.returnValue).toBe('ok');
  expect(completed.error).toBeUndefined();
  expect(failed.error).toBe('boom');
  expect(failed.returnValue).toBeUndefined();
  expect(STATUS_DOT['completed']).toBe('✓');
  expect(STATUS_DOT['failed']).toBe('✗');
});

// 修复 M：useSyncExternalStore / listNamed / 子组件抛错时不应击穿 REPL。
// panelCall 必须把 WorkflowsPanel 包在 SentryErrorBoundary 里。
test('panelCall 用 SentryErrorBoundary 包裹 WorkflowsPanel（修复 M 回归）', async () => {
  const element = (await (panelCall as unknown as (a: unknown, b: unknown, c: unknown) => Promise<React.ReactNode>)(
    () => {},
    { canUseTool: undefined },
    '',
  )) as React.ReactElement<{ name?: string; children: React.ReactNode }>;
  expect(element.type).toBe(SentryErrorBoundary);
  expect(element.props.name).toBe('WorkflowsPanel');
  const child = element.props.children as React.ReactElement<{
    onDone: () => void;
  }>;
  expect(child.type).toBe(WorkflowsPanel);
  expect(React.isValidElement(child)).toBe(true);
  expect(typeof child.props.onDone).toBe('function');
});

// ---- Task 6: 面板 mount 触发一次 loadPersistedRuns ----
// 验证 WorkflowsPanel mount 时调 svc.loadPersistedRuns() 恰好一次。
// service 内部 persistedLoaded flag 守护幂等；重渲染/重 mount 不重复调用。
// 用 spy 替换单例的 loadPersistedRuns，渲染到 PassThrough 流，等 useEffect 触发。

test('WorkflowsPanel mount 触发一次 loadPersistedRuns', async () => {
  __resetWorkflowServiceForTests();
  const svc = getWorkflowService();
  let calls = 0;
  const orig = svc.loadPersistedRuns.bind(svc);
  svc.loadPersistedRuns = async () => {
    calls++;
  };

  const stdout = new PassThrough();
  // 消费 data 避免 buffer 撑爆（render 会写多帧）
  stdout.on('data', () => {});
  let instance: { unmount: () => void; waitUntilExit: () => Promise<void> } | undefined;
  try {
    instance = await render(
      React.createElement(WorkflowsPanel, {
        onDone: () => {},
        context: { canUseTool: undefined } as never,
      }),
      { stdout: stdout as unknown as NodeJS.WriteStream, patchConsole: false },
    );
    // mount 后 useEffect 异步触发；等 tick 让 React commit + effect 跑完
    await new Promise(r => setTimeout(r, 30));

    expect(calls).toBe(1);
  } finally {
    instance?.unmount();
    svc.loadPersistedRuns = orig;
    __resetWorkflowServiceForTests();
  }
});
