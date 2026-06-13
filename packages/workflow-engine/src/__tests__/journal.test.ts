import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentCallKey, createFileJournalStore } from '../engine/journal.js'
import type { AgentRunParams } from '../types.js'

const base: AgentRunParams = { prompt: 'do something' }

test('agentCallKey 对相同 prompt+params 稳定', () => {
  expect(agentCallKey('p', base)).toBe(agentCallKey('p', base))
})

test('agentCallKey 随 prompt 变化', () => {
  expect(agentCallKey('p1', base)).not.toBe(agentCallKey('p2', base))
})

test('agentCallKey 忽略纯展示字段 label/phase', () => {
  const a = agentCallKey('p', { ...base, label: 'A', phase: 'ph1' })
  const b = agentCallKey('p', { ...base, label: 'B', phase: 'ph2' })
  expect(a).toBe(b)
})

test('FileJournalStore append → read 保序，truncate 清空', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-journal-'))
  try {
    const store = createFileJournalStore(dir)
    const e1 = {
      key: 'k1',
      seq: 0,
      result: { kind: 'ok' as const, output: 'x', usage: { outputTokens: 1 } },
    }
    const e2 = { key: 'k2', seq: 1, result: { kind: 'dead' as const } }
    await store.append('run-1', e1)
    await store.append('run-1', e2)
    const got = await store.read('run-1')
    expect(got).toHaveLength(2)
    expect(got[0]!.key).toBe('k1')
    expect(got[1]!.result.kind).toBe('dead')
    await store.truncate('run-1')
    expect(await store.read('run-1')).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('FileJournalStore read 按 seq 排序——parallel 完成顺序≠调用顺序时 resume 稳定', async () => {
  // 并发完成顺序不确定：append 落盘 = completion 顺序；resume 时按调用顺序
  // 匹配 key。无 seq 排序 → 不同 run 的 key 顺序不同 → 几乎所有 key mismatch →
  // 全重跑，journal 失效。修复：read() 按 seq 升序整理后再返回。
  const dir = await mkdtemp(join(tmpdir(), 'wf-journal-sort-'))
  try {
    const store = createFileJournalStore(dir)
    await store.append('r1', {
      key: 'late',
      seq: 2,
      result: { kind: 'ok', output: 'late', usage: { outputTokens: 1 } },
    })
    await store.append('r1', {
      key: 'first',
      seq: 0,
      result: { kind: 'ok', output: 'first', usage: { outputTokens: 1 } },
    })
    await store.append('r1', {
      key: 'mid',
      seq: 1,
      result: { kind: 'ok', output: 'mid', usage: { outputTokens: 1 } },
    })
    const got = await store.read('r1')
    expect(got.map(e => e.key)).toEqual(['first', 'mid', 'late'])
    expect(got.map(e => e.seq)).toEqual([0, 1, 2])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('agentCallKey 随 schema 变化', () => {
  const k0 = agentCallKey('p', { prompt: 'p' })
  const k1 = agentCallKey('p', { prompt: 'p', schema: { type: 'object' } })
  const k2 = agentCallKey('p', { prompt: 'p', schema: { type: 'array' } })
  expect(k1).not.toBe(k0)
  expect(k1).not.toBe(k2)
})

test('agentCallKey 随 model 变化', () => {
  expect(agentCallKey('p', { prompt: 'p', model: 'sonnet' })).not.toBe(
    agentCallKey('p', { prompt: 'p', model: 'opus' }),
  )
})

test('agentCallKey 对 params 字段顺序稳定（canonical 排序）', () => {
  const a = agentCallKey('p', {
    prompt: 'p',
    model: 'm',
    schema: { type: 'object' },
  })
  const b = agentCallKey('p', {
    schema: { type: 'object' },
    prompt: 'p',
    model: 'm',
  })
  expect(a).toBe(b)
})

test('FileJournalStore read 不存在的 run → []', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-journal-'))
  try {
    const store = createFileJournalStore(dir)
    expect(await store.read('never-existed')).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
