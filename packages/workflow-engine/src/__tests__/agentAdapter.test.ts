import { expect, test } from 'bun:test'
import {
  AgentAdapterRegistry,
  AdapterNotFoundError,
  type AgentAdapter,
} from '../agentAdapter.js'
import { createHostHandle } from '../ports.js'
import type { AgentRunParams, AgentRunResult } from '../types.js'

function makeAdapter(
  id: string,
  result: AgentRunResult = {
    kind: 'ok',
    output: `out-${id}`,
    usage: { outputTokens: 1 },
  },
): AgentAdapter {
  return {
    id,
    capabilities: { structuredOutput: true },
    async run() {
      return result
    },
  }
}

const P = (over: Partial<AgentRunParams> = {}): AgentRunParams => ({
  prompt: 'p',
  ...over,
})

const CTX = {
  host: createHostHandle(null),
  signal: new AbortController().signal,
  runId: 'r',
  agentId: 1,
}

test('resolve goes to default adapter, run returns result', async () => {
  const reg = new AgentAdapterRegistry()
    .register(makeAdapter('a'))
    .register(makeAdapter('b'))
    .default('a')
  expect(reg.resolve(P()).id).toBe('a')
  const r = await reg.resolve(P()).run(P(), CTX)
  expect(r.kind).toBe('ok')
})

test('route agentType hit takes priority over default', () => {
  const reg = new AgentAdapterRegistry()
    .register(makeAdapter('default'))
    .register(makeAdapter('research'))
    .route({ kind: 'agentType', agentType: 'researcher', adapter: 'research' })
    .default('default')
  expect(reg.resolve(P({ agentType: 'researcher' })).id).toBe('research')
  expect(reg.resolve(P({ agentType: 'other' })).id).toBe('default')
})

test('route model prefix match', () => {
  const reg = new AgentAdapterRegistry()
    .register(makeAdapter('cheap'))
    .register(makeAdapter('strong'))
    .route({ kind: 'model', pattern: 'claude-opus', adapter: 'strong' })
    .default('cheap')
  expect(reg.resolve(P({ model: 'claude-opus-4' })).id).toBe('strong')
  expect(reg.resolve(P({ model: 'claude-sonnet-4' })).id).toBe('cheap')
  expect(reg.resolve(P()).id).toBe('cheap') // no model → default
})

test('route custom predicate', () => {
  const reg = new AgentAdapterRegistry()
    .register(makeAdapter('main'))
    .register(makeAdapter('special'))
    .route({
      kind: 'custom',
      match: p => p.prompt.includes('VIP'),
      adapter: 'special',
    })
    .default('main')
  expect(reg.resolve(P({ prompt: 'handle VIP case' })).id).toBe('special')
  expect(reg.resolve(P({ prompt: 'normal' })).id).toBe('main')
})

test('rules match in order (first hit wins)', () => {
  const reg = new AgentAdapterRegistry()
    .register(makeAdapter('a'))
    .register(makeAdapter('b'))
    .route({ kind: 'agentType', agentType: 'x', adapter: 'a' })
    .route({ kind: 'agentType', agentType: 'x', adapter: 'b' })
  expect(reg.resolve(P({ agentType: 'x' })).id).toBe('a')
})

test('rule-matched adapter not registered → skip that rule and continue matching', () => {
  const reg = new AgentAdapterRegistry()
    .register(makeAdapter('real'))
    .route({ kind: 'agentType', agentType: 'x', adapter: 'ghost' })
    .route({ kind: 'agentType', agentType: 'x', adapter: 'real' })
  expect(reg.resolve(P({ agentType: 'x' })).id).toBe('real')
})

test('no match and no default → AdapterNotFoundError', () => {
  const reg = new AgentAdapterRegistry().register(makeAdapter('a'))
  expect(() => reg.resolve(P())).toThrow(AdapterNotFoundError)
})

test('default points to an unregistered adapter → still throws (no silent fallback)', () => {
  const reg = new AgentAdapterRegistry()
    .register(makeAdapter('a'))
    .default('missing')
  expect(() => reg.resolve(P())).toThrow(AdapterNotFoundError)
})

test('has / get', () => {
  const reg = new AgentAdapterRegistry().register(makeAdapter('a'))
  expect(reg.has('a')).toBe(true)
  expect(reg.has('b')).toBe(false)
  expect(reg.get('a')?.id).toBe('a')
  expect(reg.get('b')).toBeUndefined()
})

test('initializeAll / disposeAll triggers lifecycle (skips unimplemented)', async () => {
  const events: string[] = []
  const withLifecycle: AgentAdapter = {
    id: 'a',
    capabilities: { structuredOutput: false },
    async run() {
      return { kind: 'ok', output: 'x', usage: { outputTokens: 1 } }
    },
    async initialize() {
      events.push('init-a')
    },
    async dispose() {
      events.push('dispose-a')
    },
  }
  const noLifecycle = makeAdapter('b') // no initialize/dispose
  const reg = new AgentAdapterRegistry()
    .register(withLifecycle)
    .register(noLifecycle)
  await reg.initializeAll()
  await reg.disposeAll()
  expect(events).toEqual(['init-a', 'dispose-a'])
})

test('capabilities declaration is readable', () => {
  const adapter: AgentAdapter = {
    id: 'a',
    capabilities: { structuredOutput: true, tools: true, stream: false },
    async run() {
      return { kind: 'ok', output: 'x', usage: { outputTokens: 1 } }
    },
  }
  expect(adapter.capabilities.structuredOutput).toBe(true)
  expect(adapter.capabilities.tools).toBe(true)
  expect(adapter.capabilities.stream).toBe(false)
})
