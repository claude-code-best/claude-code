import { expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import React from 'react';
import { wrappedRender as render } from '@anthropic/ink';
import { SentryErrorBoundary } from '../../components/SentryErrorBoundary.js';
import type { RunProgress } from '../progress/store.js';
import { call as panelCall } from '../panel/panelCall.js';
import { clampSelected, isRunTerminatedTransition, WorkflowsPanel } from '../panel/WorkflowsPanel.js';
import { truncateLabel } from '../panel/AgentList.js';
import { STATUS_DOT } from '../panel/status.js';
import { __resetWorkflowServiceForTests, getWorkflowService } from '../service.js';

// Pure function: clamp selection to valid range (same source as clampSelected inside the panel).
test('clampSelected: empty list → 0; out of bounds → last; negative/NaN → 0; normal → original', () => {
  expect(clampSelected(5, 0)).toBe(0);
  expect(clampSelected(5, 3)).toBe(2);
  expect(clampSelected(-3, 3)).toBe(0);
  expect(clampSelected(1, 3)).toBe(1);
  expect(clampSelected(0, 1)).toBe(0);
  // NaN (e.g. uninitialized state) safely falls back to 0
  expect(clampSelected(Number.NaN, 3)).toBe(0);
});

// truncateLabel: short label as-is; with `#number` suffix keep suffix, truncate prefix + ellipsis;
// without suffix, cut from the right. Lets audit workflow's verify:${dim}#${idx} multi-finding still be distinguishable.
test('truncateLabel: short label as-is; with #number suffix keep suffix and truncate prefix; without suffix cut from right', () => {
  // short label as-is
  expect(truncateLabel('agent-1', 18)).toBe('agent-1');
  expect(truncateLabel('review:bugs', 18)).toBe('review:bugs');
  // exactly max length (boundary)
  expect(truncateLabel('review:correctness', 18)).toBe('review:correctness');
  // over max + with #number suffix: keep suffix, truncate prefix + ellipsis
  expect(truncateLabel('verify:correctness#0', 18)).toBe('verify:correctn…#0');
  expect(truncateLabel('verify:architecture#15', 18)).toBe('verify:archite…#15');
  // multi-digit #idx also distinguishable
  expect(truncateLabel('verify:correctness#2', 18)).toBe('verify:correctn…#2');
  // without #number suffix: cut from right (legacy behavior)
  expect(truncateLabel('a-very-long-label-no-suffix', 18)).toBe('a-very-long-label-');
});

// STATUS_DOT covers four states, all visible dot characters.
test('STATUS_DOT covers running/completed/failed/killed and is non-empty character', () => {
  const statuses = ['running', 'completed', 'failed', 'killed'] as const;
  for (const s of statuses) {
    expect(STATUS_DOT[s]).toBeTruthy();
    expect(STATUS_DOT[s].length).toBeGreaterThan(0);
  }
});

// Progress data shape contract: fields read by the panel exist/are readable on a typical RunProgress,
// preventing silent panel render breakage from store.ts structural drift.
test('RunProgress field contract: keys read by panel all exist', () => {
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
  // paths read by panel WorkflowList/Detail
  expect(run.status).toBe('running');
  expect(STATUS_DOT[run.status]).toBe('●');
  expect(run.currentPhase).toBe('Review');
  expect(run.agents.length).toBe(run.agentCount);
  expect(run.phases[0]?.title).toBe('Find');
  expect(run.phases[0]?.status).toBe('done');
  expect(run.agents[0]?.label).toBe('review:api');
});

// Completed/failed shape: returnValue / error only shown when not running.
test('RunProgress completed/failed shape: returnValue/error optional', () => {
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

// Fix M: useSyncExternalStore / listNamed / child component throwing should not break through REPL.
// panelCall must wrap WorkflowsPanel in SentryErrorBoundary.
test('panelCall wraps WorkflowsPanel in SentryErrorBoundary (fix M regression)', async () => {
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

// ---- Task 6: panel mount triggers loadPersistedRuns once ----
// Verify that WorkflowsPanel mount calls svc.loadPersistedRuns() exactly once.
// The persistedLoaded flag inside service guards idempotency; re-render / re-mount does not repeat the call.
// Use a spy to replace the singleton's loadPersistedRuns, render to a PassThrough stream, wait for useEffect to trigger.

test('WorkflowsPanel mount triggers loadPersistedRuns once', async () => {
  __resetWorkflowServiceForTests();
  const svc = getWorkflowService();
  let calls = 0;
  const orig = svc.loadPersistedRuns.bind(svc);
  svc.loadPersistedRuns = async () => {
    calls++;
  };

  const stdout = new PassThrough();
  // consume data to avoid buffer overflow (render writes multiple frames)
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
    // after mount useEffect triggers asynchronously; wait a tick for React commit + effect to complete
    await new Promise(r => setTimeout(r, 30));

    expect(calls).toBe(1);
  } finally {
    instance?.unmount();
    svc.loadPersistedRuns = orig;
    __resetWorkflowServiceForTests();
  }
});

// When the focused run transitions from running to terminal, the panel auto onDone() (800ms delay lets the user see the terminal state).
// Only same-runId state transitions trigger: switching to a completed tab does not exit; opening history panel does not exit either.
// Transition detection logic is extracted into the isRunTerminatedTransition pure function for offline unit testing (Ink test mode does not
// auto-pump concurrent state updates, integration tests are unreliable).
test('isRunTerminatedTransition: same runId running → terminal triggers; other cases do not trigger', () => {
  const running = { runId: 'r1', status: 'running' as const };
  const completed = { runId: 'r1', status: 'completed' as const };
  const failed = { runId: 'r1', status: 'failed' as const };
  const killed = { runId: 'r1', status: 'killed' as const };

  // same run running → terminal: all three terminal states trigger
  expect(isRunTerminatedTransition(running, completed)).toBe(true);
  expect(isRunTerminatedTransition(running, failed)).toBe(true);
  expect(isRunTerminatedTransition(running, killed)).toBe(true);

  // prev=null (open history panel): does not trigger
  expect(isRunTerminatedTransition(null, completed)).toBe(false);
  // curr=null (runs cleared): does not trigger
  expect(isRunTerminatedTransition(running, null)).toBe(false);

  // different runId (switch tab): does not trigger
  expect(isRunTerminatedTransition({ runId: 'r1', status: 'running' }, { runId: 'r2', status: 'completed' })).toBe(
    false,
  );

  // same run but prev not running (already terminal and re-rendered): does not trigger
  expect(isRunTerminatedTransition(completed, completed)).toBe(false);
  expect(isRunTerminatedTransition(killed, completed)).toBe(false);

  // same run running → running (no change): does not trigger
  expect(isRunTerminatedTransition(running, running)).toBe(false);
});
