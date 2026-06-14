import { expect, test } from 'bun:test'

// Directly construct type shapes to verify JSON round-trip (core requirement for resume persistence).
test('AgentRunResult ok branch can JSON round-trip', () => {
  const result = {
    kind: 'ok' as const,
    output: { confirmed: true },
    usage: { outputTokens: 42 },
  }
  const round = JSON.parse(JSON.stringify(result))
  expect(round).toEqual(result)
  expect(round.kind).toBe('ok')
})

test('AgentRunResult skipped/dead branch can JSON round-trip', () => {
  for (const kind of ['skipped', 'dead'] as const) {
    const round = JSON.parse(JSON.stringify({ kind }))
    expect(round.kind).toBe(kind)
  }
})

// dead carries optional reason/detail: journal persistence preserves cause of death for post-hoc audit / panel display.
test('AgentRunResult dead with reason/detail can JSON round-trip', () => {
  const dead = {
    kind: 'dead' as const,
    reason: 'no-structured-output' as const,
    detail: 'finalize content has no StructuredOutput tool_use or JSON text',
  }
  const round = JSON.parse(JSON.stringify(dead))
  expect(round).toEqual(dead)
  expect(round.kind).toBe('dead')
  expect(round.reason).toBe('no-structured-output')
})

// Backward compatible with old journals: reason/detail both optional, missing is still valid dead.
test('AgentRunResult dead without reason is still valid (backward compatible with old journal)', () => {
  const legacy = { kind: 'dead' as const }
  const round = JSON.parse(JSON.stringify(legacy))
  expect(round.kind).toBe('dead')
  expect(round.reason).toBeUndefined()
  expect(round.detail).toBeUndefined()
})

test('JournalEntry shape is stable', () => {
  const entry = {
    key: 'abc123',
    result: { kind: 'ok', output: 'text', usage: { outputTokens: 1 } },
  }
  const round = JSON.parse(JSON.stringify(entry))
  expect(round.key).toBe('abc123')
  expect(round.result.kind).toBe('ok')
})
