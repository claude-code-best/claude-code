import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentCallKey, createFileJournalStore } from '../engine/journal.js'
import type { AgentRunParams } from '../types.js'

const base: AgentRunParams = { prompt: 'do something' }

test('agentCallKey stable for same prompt+params', () => {
  expect(agentCallKey('p', base)).toBe(agentCallKey('p', base))
})

test('agentCallKey varies with prompt', () => {
  expect(agentCallKey('p1', base)).not.toBe(agentCallKey('p2', base))
})

test('agentCallKey ignores display-only fields label/phase', () => {
  const a = agentCallKey('p', { ...base, label: 'A', phase: 'ph1' })
  const b = agentCallKey('p', { ...base, label: 'B', phase: 'ph2' })
  expect(a).toBe(b)
})

test('FileJournalStore append → read preserves order, truncate clears', async () => {
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

test('FileJournalStore read sorts by seq — resume stable when parallel completion order ≠ call order', async () => {
  // Concurrent completion order is non-deterministic: append-to-disk = completion order; on resume, key matching uses call order.
  // Without seq sorting → different runs have different key orders → nearly all keys mismatch →
  // everything re-runs, journal becomes useless. Fix: read() re-orders by ascending seq before returning.
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

test('agentCallKey varies with schema', () => {
  const k0 = agentCallKey('p', { prompt: 'p' })
  const k1 = agentCallKey('p', { prompt: 'p', schema: { type: 'object' } })
  const k2 = agentCallKey('p', { prompt: 'p', schema: { type: 'array' } })
  expect(k1).not.toBe(k0)
  expect(k1).not.toBe(k2)
})

test('agentCallKey varies with model', () => {
  expect(agentCallKey('p', { prompt: 'p', model: 'sonnet' })).not.toBe(
    agentCallKey('p', { prompt: 'p', model: 'opus' }),
  )
})

test('agentCallKey stable across params field order (canonical sort)', () => {
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

test('FileJournalStore read for non-existent run → []', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-journal-'))
  try {
    const store = createFileJournalStore(dir)
    expect(await store.read('never-existed')).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
