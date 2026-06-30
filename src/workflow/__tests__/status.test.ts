import { expect, test } from 'bun:test'
import type { AgentProgress, RunProgress } from '../progress/store.js'
import {
  STATUS_DOT,
  RUN_STATUS_COLOR,
  RUN_STATUS_TEXT,
  PHASE_MARK,
  PHASE_COLOR,
  agentVisual,
  formatTokenCount,
  agentMetaText,
} from '../panel/status.js'

test('STATUS_DOT / RUN_STATUS_COLOR / RUN_STATUS_TEXT cover four run states', () => {
  const statuses: RunProgress['status'][] = [
    'running',
    'completed',
    'failed',
    'killed',
  ]
  for (const s of statuses) {
    expect(STATUS_DOT[s].length).toBeGreaterThan(0)
    expect(RUN_STATUS_COLOR[s]).toBeTruthy()
    expect(RUN_STATUS_TEXT[s].length).toBeGreaterThan(0)
  }
  expect(STATUS_DOT.running).toBe('●')
  expect(STATUS_DOT.completed).toBe('✓')
  expect(STATUS_DOT.failed).toBe('✗')
  expect(STATUS_DOT.killed).toBe('■')
  expect(RUN_STATUS_TEXT.completed).toBe('done')
  expect(RUN_STATUS_TEXT.running).toBe('running')
})

test('PHASE_MARK / PHASE_COLOR cover running/done/pending', () => {
  expect(PHASE_MARK.running).toBe('●')
  expect(PHASE_MARK.done).toBe('✓')
  expect(PHASE_MARK.pending).toBe('○')
  expect(PHASE_COLOR.pending).toBe('subtle')
})

test('agentVisual: running → ● warning', () => {
  const a: AgentProgress = { id: 1, status: 'running' }
  expect(agentVisual(a)).toEqual({ mark: '●', color: 'warning' })
})

test('agentVisual: done·ok → ✓ success (no longer carries outputShape suffix)', () => {
  const a: AgentProgress = {
    id: 1,
    status: 'done',
    resultKind: 'ok',
    outputShape: 'object',
  }
  expect(agentVisual(a)).toEqual({ mark: '✓', color: 'success' })
})

test('agentVisual: dead → ✗ error', () => {
  const a: AgentProgress = { id: 1, status: 'done', resultKind: 'dead' }
  expect(agentVisual(a)).toEqual({ mark: '✗', color: 'error' })
})

test('formatTokenCount: <1000 original value, ≥1000 keeps 1 decimal + k', () => {
  expect(formatTokenCount(undefined)).toBe('0')
  expect(formatTokenCount(0)).toBe('0')
  expect(formatTokenCount(42)).toBe('42')
  expect(formatTokenCount(1000)).toBe('1.0k')
  expect(formatTokenCount(22900)).toBe('22.9k')
})

test('agentMetaText: model · Nk tok · N tool', () => {
  const a: AgentProgress = {
    id: 1,
    status: 'done',
    model: 'glm-5.2',
    tokenCount: 22900,
    toolCount: 1,
  }
  expect(agentMetaText(a)).toBe('glm-5.2 · 22.9k tok · 1 tool')
})

test('agentMetaText: omits prefix when no model', () => {
  const a: AgentProgress = {
    id: 1,
    status: 'running',
    tokenCount: 500,
    toolCount: 2,
  }
  expect(agentMetaText(a)).toBe('500 tok · 2 tool')
})
