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

test('JournalEntry 形状稳定', () => {
  const entry = {
    key: 'abc123',
    result: { kind: 'ok', output: 'text', usage: { outputTokens: 1 } },
  }
  const round = JSON.parse(JSON.stringify(entry))
  expect(round.key).toBe('abc123')
  expect(round.result.kind).toBe('ok')
})
