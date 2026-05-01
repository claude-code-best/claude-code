import { describe, expect, test } from 'bun:test'
import { collapseHookSummaries } from '../collapseHookSummaries'

function makeHookSummary(
  overrides: Partial<{
    hookLabel: string
    hookCount: number
    hookInfos: any[]
    hookErrors: any[]
    preventedContinuation: boolean
    hasOutput: boolean
    totalDurationMs: number
  }> = {},
): any {
  return {
    type: 'system',
    subtype: 'stop_hook_summary',
    hookLabel: overrides.hookLabel ?? 'PostToolUse',
    hookCount: overrides.hookCount ?? 1,
    hookInfos: overrides.hookInfos ?? [],
    hookErrors: overrides.hookErrors ?? [],
    preventedContinuation: overrides.preventedContinuation ?? false,
    hasOutput: overrides.hasOutput ?? false,
    totalDurationMs: overrides.totalDurationMs ?? 10,
  }
}

function makeNonHookMessage(): any {
  return { type: 'user', message: { content: 'hello' } }
}

describe('collapseHookSummaries', () => {
  test('returns same messages when no hook summaries', () => {
    const messages = [makeNonHookMessage(), makeNonHookMessage()]
    expect(collapseHookSummaries(messages)).toEqual(messages)
  })

  test('collapses consecutive messages with same hookLabel', () => {
    const messages = [
      makeHookSummary({ hookLabel: 'PostToolUse', hookCount: 1 }),
      makeHookSummary({ hookLabel: 'PostToolUse', hookCount: 2 }),
    ]
    const result = collapseHookSummaries(messages)
    expect(result).toHaveLength(1)
    expect(result[0].hookCount).toBe(3)
  })

  test('does not collapse messages with different hookLabels', () => {
    const messages = [
      makeHookSummary({ hookLabel: 'PostToolUse' }),
      makeHookSummary({ hookLabel: 'PreToolUse' }),
    ]
    const result = collapseHookSummaries(messages)
    expect(result).toHaveLength(2)
  })

  test('aggregates hookCount across collapsed messages', () => {
    const messages = [
      makeHookSummary({ hookLabel: 'A', hookCount: 3 }),
      makeHookSummary({ hookLabel: 'A', hookCount: 5 }),
    ]
    const result = collapseHookSummaries(messages)
    expect(result[0].hookCount).toBe(8)
  })

  test('merges hookInfos arrays', () => {
    const info1 = { tool: 'Read' }
    const info2 = { tool: 'Write' }
    const messages = [
      makeHookSummary({ hookLabel: 'A', hookInfos: [info1] }),
      makeHookSummary({ hookLabel: 'A', hookInfos: [info2] }),
    ]
    const result = collapseHookSummaries(messages)
    expect(result[0].hookInfos).toEqual([info1, info2])
  })

  test('merges hookErrors arrays', () => {
    const err1 = new Error('e1')
    const err2 = new Error('e2')
    const messages = [
      makeHookSummary({ hookLabel: 'A', hookErrors: [err1] }),
      makeHookSummary({ hookLabel: 'A', hookErrors: [err2] }),
    ]
    const result = collapseHookSummaries(messages)
    expect(result[0].hookErrors).toHaveLength(2)
  })

  test('takes max totalDurationMs', () => {
    const messages = [
      makeHookSummary({ hookLabel: 'A', totalDurationMs: 50 }),
      makeHookSummary({ hookLabel: 'A', totalDurationMs: 100 }),
      makeHookSummary({ hookLabel: 'A', totalDurationMs: 75 }),
    ]
    const result = collapseHookSummaries(messages)
    expect(result[0].totalDurationMs).toBe(100)
  })

  test('takes any truthy preventContinuation', () => {
    const messages = [
      makeHookSummary({ hookLabel: 'A', preventedContinuation: false }),
      makeHookSummary({ hookLabel: 'A', preventedContinuation: true }),
    ]
    const result = collapseHookSummaries(messages)
    expect(result[0].preventedContinuation).toBe(true)
  })

  test('leaves single hook summary unchanged', () => {
    const msg = makeHookSummary({ hookLabel: 'PostToolUse', hookCount: 5 })
    const result = collapseHookSummaries([msg])
    expect(result).toHaveLength(1)
    expect(result[0].hookCount).toBe(5)
  })

  test('handles three consecutive same-label summaries', () => {
    const messages = [
      makeHookSummary({ hookLabel: 'X', hookCount: 1 }),
      makeHookSummary({ hookLabel: 'X', hookCount: 1 }),
      makeHookSummary({ hookLabel: 'X', hookCount: 1 }),
    ]
    const result = collapseHookSummaries(messages)
    expect(result).toHaveLength(1)
    expect(result[0].hookCount).toBe(3)
  })

  test('preserves non-hook messages in between', () => {
    const messages = [
      makeHookSummary({ hookLabel: 'A' }),
      makeNonHookMessage(),
      makeHookSummary({ hookLabel: 'A' }),
    ]
    const result = collapseHookSummaries(messages)
    expect(result).toHaveLength(3)
  })

  test('returns empty array for empty input', () => {
    expect(collapseHookSummaries([])).toEqual([])
  })
})
