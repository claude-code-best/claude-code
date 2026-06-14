import { expect, test } from 'bun:test'
import type { AgentProgress, RunProgress } from '../progress/store.js'
import {
  ALL_PHASE,
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
