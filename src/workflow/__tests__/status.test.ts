import { expect, test } from 'bun:test'
import type { AgentProgress, RunProgress } from '../progress/store.js'
import {
  STATUS_DOT,
  RUN_STATUS_COLOR,
  PHASE_MARK,
  PHASE_COLOR,
  agentVisual,
} from '../panel/status.js'

test('STATUS_DOT / RUN_STATUS_COLOR 覆盖四种 run 状态且为非空字符', () => {
  const statuses: RunProgress['status'][] = [
    'running',
    'completed',
    'failed',
    'killed',
  ]
  for (const s of statuses) {
    expect(STATUS_DOT[s].length).toBeGreaterThan(0)
    expect(RUN_STATUS_COLOR[s]).toBeTruthy()
  }
  expect(STATUS_DOT.running).toBe('●')
  expect(STATUS_DOT.completed).toBe('✓')
  expect(STATUS_DOT.failed).toBe('✗')
  expect(STATUS_DOT.killed).toBe('■')
})

test('PHASE_MARK / PHASE_COLOR 覆盖 running/done/pending', () => {
  expect(PHASE_MARK.running).toBe('●')
  expect(PHASE_MARK.done).toBe('✓')
  expect(PHASE_MARK.pending).toBe('○')
  expect(PHASE_COLOR.pending).toBe('subtle')
})

test('agentVisual：running → ● warning running', () => {
  const a: AgentProgress = { id: 1, status: 'running' }
  expect(agentVisual(a)).toEqual({
    mark: '●',
    color: 'warning',
    suffix: 'running',
  })
})

test('agentVisual：done·object → ✓ success object', () => {
  const a: AgentProgress = {
    id: 1,
    status: 'done',
    resultKind: 'ok',
    outputShape: 'object',
  }
  expect(agentVisual(a)).toEqual({
    mark: '✓',
    color: 'success',
    suffix: 'object',
  })
})

test('agentVisual：done·text → ✓ success text', () => {
  const a: AgentProgress = {
    id: 1,
    status: 'done',
    resultKind: 'ok',
    outputShape: 'text',
  }
  expect(agentVisual(a)).toEqual({
    mark: '✓',
    color: 'success',
    suffix: 'text',
  })
})

test('agentVisual：dead → ✗ error dead', () => {
  const a: AgentProgress = { id: 1, status: 'done', resultKind: 'dead' }
  expect(agentVisual(a)).toEqual({ mark: '✗', color: 'error', suffix: 'dead' })
})
