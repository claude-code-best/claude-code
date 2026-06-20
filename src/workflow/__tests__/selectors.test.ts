import { expect, test } from 'bun:test'
import type { AgentProgress, RunProgress } from '../progress/store.js'
import {
  ALL_PHASE,
  capTabsForDisplay,
  filterActiveRuns,
  mergePhases,
  filterAgentsByPhase,
  tabLabel,
} from '../panel/selectors.js'

function run(partial: Partial<RunProgress>): RunProgress {
  return {
    runId: 'r1',
    workflowName: 'w',
    status: 'running',
    phases: [],
    declaredPhases: [],
    currentPhase: null,
    agents: [],
    agentCount: 0,
    startedAt: 1,
    updatedAt: 1,
    ...partial,
  }
}

test('mergePhases: declared order first, actual phases append undeclared ones, counts done/total', () => {
  const r = run({
    declaredPhases: ['Find', 'Review', 'Verify'],
    phases: [
      { title: 'Find', status: 'done' },
      { title: 'Review', status: 'running' },
    ],
    agents: [
      {
        id: 1,
        phase: 'Find',
        status: 'done',
        resultKind: 'ok',
        outputShape: 'text',
      },
      { id: 2, phase: 'Find', status: 'done', resultKind: 'dead' },
      { id: 3, phase: 'Review', status: 'running' },
    ],
  })
  expect(mergePhases(r)).toEqual([
    { title: 'Find', status: 'done', done: 2, total: 2 },
    { title: 'Review', status: 'running', done: 0, total: 1 },
    { title: 'Verify', status: 'pending', done: 0, total: 0 },
  ])
})

test('mergePhases: actual but undeclared phase appended to the end', () => {
  const r = run({
    declaredPhases: ['Find'],
    phases: [
      { title: 'Find', status: 'done' },
      { title: 'Adhoc', status: 'running' },
    ],
    agents: [],
  })
  expect(mergePhases(r).map(p => p.title)).toEqual(['Find', 'Adhoc'])
})

test('filterAgentsByPhase: All / undefined → all; specified → only that phase', () => {
  const agents: AgentProgress[] = [
    { id: 1, phase: 'A', status: 'running' },
    {
      id: 2,
      phase: 'B',
      status: 'done',
      resultKind: 'ok',
      outputShape: 'text',
    },
  ]
  expect(filterAgentsByPhase(agents, undefined)).toHaveLength(2)
  expect(filterAgentsByPhase(agents, ALL_PHASE)).toHaveLength(2)
  expect(filterAgentsByPhase(agents, 'A')).toEqual([agents[0]])
})

test('tabLabel: workflow name + last 4 chars short code of runId', () => {
  expect(tabLabel('review-changes', 'wf_abc123def')).toBe('review-changes#3def')
})

// filterActiveRuns: only running runs reach the panel's tab row. Done/killed/completed are hidden
// so opening /workflows no longer floods the tab row with months of historical runs (caused
// tab overflow → garbled render when total width exceeded the terminal).
test('filterActiveRuns: only status === "running" survives; completed/failed/killed dropped', () => {
  const r1 = run({ runId: 'r1', status: 'running' })
  const r2 = run({ runId: 'r2', status: 'running' })
  const r3 = run({ runId: 'r3', status: 'completed' })
  const r4 = run({ runId: 'r4', status: 'failed' })
  const r5 = run({ runId: 'r5', status: 'killed' })
  expect(filterActiveRuns([r1, r2, r3, r4, r5])).toEqual([r1, r2])
})

test('filterActiveRuns: empty input -> empty output', () => {
  expect(filterActiveRuns([])).toEqual([])
})

test('filterActiveRuns: all terminal -> empty (panel falls back to "(no active runs)")', () => {
  expect(
    filterActiveRuns([run({ status: 'completed' }), run({ status: 'killed' })]),
  ).toEqual([])
})

test('filterActiveRuns: preserves input order (no re-sort)', () => {
  const a = run({ runId: 'a', status: 'running', startedAt: 5 })
  const b = run({ runId: 'b', status: 'running', startedAt: 1 })
  expect(filterActiveRuns([a, b]).map(r => r.runId)).toEqual(['a', 'b'])
})

// capTabsForDisplay: even if active runs somehow accumulate (long-lived sessions, runaway launcher),
// the tab row must never overflow the terminal — cap at maxTabs, fold the remainder into a +N marker.
test('capTabsForDisplay: under cap -> as-is', () => {
  const runs = [
    run({ runId: 'r1', status: 'running' }),
    run({ runId: 'r2', status: 'running' }),
  ]
  expect(capTabsForDisplay(runs, 8)).toEqual({ runs, overflow: 0 })
})

test('capTabsForDisplay: over cap -> first maxTabs runs + overflow count', () => {
  const runs = Array.from({ length: 10 }, (_, i) =>
    run({ runId: `r${i}`, status: 'running' }),
  )
  const capped = capTabsForDisplay(runs, 8)
  expect(capped.runs).toHaveLength(8)
  expect(capped.runs.map(r => r.runId)).toEqual([
    'r0',
    'r1',
    'r2',
    'r3',
    'r4',
    'r5',
    'r6',
    'r7',
  ])
  expect(capped.overflow).toBe(2)
})

test('capTabsForDisplay: exactly at cap -> no overflow', () => {
  const runs = Array.from({ length: 8 }, (_, i) =>
    run({ runId: `r${i}`, status: 'running' }),
  )
  const capped = capTabsForDisplay(runs, 8)
  expect(capped.runs).toHaveLength(8)
  expect(capped.overflow).toBe(0)
})

test('capTabsForDisplay: maxTabs=0 -> all folded into overflow (degenerate but defined)', () => {
  const runs = [run({ runId: 'r1', status: 'running' })]
  const capped = capTabsForDisplay(runs, 0)
  expect(capped.runs).toEqual([])
  expect(capped.overflow).toBe(1)
})
