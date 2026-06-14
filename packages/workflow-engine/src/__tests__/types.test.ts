import { expect, test } from 'bun:test'

// 直接构造类型形状，验证 JSON 往返（resume 持久化的核心要求）。
test('AgentRunResult ok 分支可 JSON 往返', () => {
  const result = {
    kind: 'ok' as const,
    output: { confirmed: true },
    usage: { outputTokens: 42 },
  }
  const round = JSON.parse(JSON.stringify(result))
  expect(round).toEqual(result)
  expect(round.kind).toBe('ok')
})

test('AgentRunResult skipped/dead 分支可 JSON 往返', () => {
  for (const kind of ['skipped', 'dead'] as const) {
    const round = JSON.parse(JSON.stringify({ kind }))
    expect(round.kind).toBe(kind)
  }
})

// dead 携带可选 reason/detail：journal 持久化后能保留死因，事后审计/面板展示用。
test('AgentRunResult dead 带 reason/detail 可 JSON 往返', () => {
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

// 兼容旧 journal：reason/detail 都可选，缺失时仍是合法 dead。
test('AgentRunResult dead 无 reason 仍合法（兼容旧 journal）', () => {
  const legacy = { kind: 'dead' as const }
  const round = JSON.parse(JSON.stringify(legacy))
  expect(round.kind).toBe('dead')
  expect(round.reason).toBeUndefined()
  expect(round.detail).toBeUndefined()
})

test('JournalEntry 形状稳定', () => {
  const entry = {
    key: 'abc123',
    result: { kind: 'ok', output: 'text', usage: { outputTokens: 1 } },
  }
  const round = JSON.parse(JSON.stringify(entry))
  expect(round.key).toBe('abc123')
  expect(round.result.kind).toBe('ok')
})
