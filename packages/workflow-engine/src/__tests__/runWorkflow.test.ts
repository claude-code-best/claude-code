import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runWorkflow } from '../engine/runWorkflow.js'
import { agentCallKey, createFileJournalStore } from '../engine/journal.js'
import { createHostHandle, type WorkflowPorts } from '../ports.js'
import type { AgentRunParams, AgentRunResult, ProgressEvent } from '../types.js'

function portsWith(
  runsDir: string,
  results: Map<string, AgentRunResult>,
): WorkflowPorts {
  return {
    agentRunner: {
      runAgentToResult: async (p: AgentRunParams) =>
        results.get(p.prompt) ?? { kind: 'dead' },
    },
    progressEmitter: { emit: () => {} },
    taskRegistrar: {
      register: () => ({ runId: 'r', signal: new AbortController().signal }),
      complete: () => {},
      fail: () => {},
      kill: () => {},
      pendingAction: () => null,
    },
    journalStore: createFileJournalStore(runsDir),
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({
      handle: createHostHandle(null),
      cwd: runsDir,
      budgetTotal: null,
    }),
  }
}

function portsWithEvents(
  runsDir: string,
  results: Map<string, AgentRunResult>,
): { ports: WorkflowPorts; events: ProgressEvent[] } {
  const events: ProgressEvent[] = []
  return {
    events,
    ports: {
      agentRunner: {
        runAgentToResult: async (p: AgentRunParams) =>
          results.get(p.prompt) ?? { kind: 'dead' },
      },
      progressEmitter: { emit: e => void events.push(e) },
      taskRegistrar: {
        register: () => ({
          runId: 'r',
          signal: new AbortController().signal,
        }),
        complete: () => {},
        fail: () => {},
        kill: () => {},
        pendingAction: () => null,
      },
      journalStore: createFileJournalStore(runsDir),
      permissionGate: { isAborted: () => false },
      logger: { debug: () => {}, event: () => {} },
      hostFactory: () => ({
        handle: createHostHandle(null),
        cwd: runsDir,
        budgetTotal: null,
      }),
    },
  }
}

test('end-to-end: script returns agent result, status completed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const ports = portsWith(
      dir,
      new Map([
        ['compute', { kind: 'ok', output: '42', usage: { outputTokens: 3 } }],
      ]),
    )
    const result = await runWorkflow({
      script: `export const meta = { name: 't', description: 'd' }\nreturn agent('compute')`,
      runId: 'run-1',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(result.status).toBe('completed')
    expect(result.returnValue).toBe('42')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('script syntax error → failed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const ports = portsWith(dir, new Map())
    const result = await runWorkflow({
      script: `export const meta = { name: 't', description: 'd' }\nreturn ((`,
      runId: 'run-2',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(result.status).toBe('failed')
    expect(result.error).toBeTruthy()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('resume: journal hit skips runner call', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    let called = 0
    const ports: WorkflowPorts = {
      agentRunner: {
        runAgentToResult: async () => {
          called++
          return { kind: 'ok', output: 'live', usage: { outputTokens: 1 } }
        },
      },
      progressEmitter: { emit: () => {} },
      taskRegistrar: {
        register: () => ({ runId: 'r', signal: new AbortController().signal }),
        complete: () => {},
        fail: () => {},
        kill: () => {},
        pendingAction: () => null,
      },
      journalStore: createFileJournalStore(dir),
      permissionGate: { isAborted: () => false },
      logger: { debug: () => {}, event: () => {} },
      hostFactory: () => ({
        handle: createHostHandle(null),
        cwd: dir,
        budgetTotal: null,
      }),
    }
    const key = agentCallKey('compute', { prompt: 'compute' })
    await ports.journalStore.append('run-3', {
      key,
      seq: 0,
      result: { kind: 'ok', output: 'cached', usage: { outputTokens: 1 } },
    })

    const result = await runWorkflow({
      script: `return agent('compute')`,
      runId: 'run-3',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
      resume: true,
    })
    expect(result.status).toBe('completed')
    expect(result.returnValue).toBe('cached')
    expect(called).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('abort → killed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const ports = portsWith(
      dir,
      new Map([['x', { kind: 'ok', output: '1', usage: { outputTokens: 1 } }]]),
    )
    const ac = new AbortController()
    ac.abort()
    const result = await runWorkflow({
      script: `return agent('x')`,
      runId: 'run-4',
      ports,
      host: createHostHandle(null),
      signal: ac.signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(result.status).toBe('killed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('workflow() nesting (one level) shares counts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    await mkdir(join(dir, '.claude', 'workflows'), { recursive: true })
    await writeFile(
      join(dir, '.claude', 'workflows', 'child.ts'),
      `return agent('child')\n// child workflow`,
    )
    const ports = portsWith(
      dir,
      new Map([
        [
          'child',
          { kind: 'ok', output: 'child-out', usage: { outputTokens: 1 } },
        ],
      ]),
    )
    const result = await runWorkflow({
      script: `return workflow('child')`,
      runId: 'run-5',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(result.status).toBe('completed')
    expect(result.returnValue).toBe('child-out')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// ---- boundary and events ----

test('scriptChanged=true → truncate journal and run all live', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    let called = 0
    const ports: WorkflowPorts = {
      agentRunner: {
        runAgentToResult: async () => {
          called++
          return { kind: 'ok', output: 'live', usage: { outputTokens: 1 } }
        },
      },
      progressEmitter: { emit: () => {} },
      taskRegistrar: {
        register: () => ({ runId: 'r', signal: new AbortController().signal }),
        complete: () => {},
        fail: () => {},
        kill: () => {},
        pendingAction: () => null,
      },
      journalStore: createFileJournalStore(dir),
      permissionGate: { isAborted: () => false },
      logger: { debug: () => {}, event: () => {} },
      hostFactory: () => ({
        handle: createHostHandle(null),
        cwd: dir,
        budgetTotal: null,
      }),
    }
    const key = agentCallKey('compute', { prompt: 'compute' })
    await ports.journalStore.append('run-chg', {
      key,
      seq: 0,
      result: { kind: 'ok', output: 'cached', usage: { outputTokens: 1 } },
    })
    const result = await runWorkflow({
      script: `return agent('compute')`,
      runId: 'run-chg',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
      resume: true,
      scriptChanged: true,
    })
    expect(result.status).toBe('completed')
    expect(result.returnValue).toBe('live')
    expect(called).toBe(1)
    // truncate cleared the old cached journal, live agent appends a new entry
    const final = await ports.journalStore.read('run-chg')
    expect(final).toHaveLength(1)
    expect((final[0]!.result as { output: string }).output).toBe('live')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('script runtime throw (non-syntax error) → failed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const ports = portsWith(dir, new Map())
    const result = await runWorkflow({
      script: `throw new Error('boom at runtime')`,
      runId: 'run-throw',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(result.status).toBe('failed')
    expect(result.error).toMatch(/boom/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('emits run_started (with workflowName) and run_done events', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const { ports, events } = portsWithEvents(
      dir,
      new Map([['x', { kind: 'ok', output: '1', usage: { outputTokens: 1 } }]]),
    )
    await runWorkflow({
      script: `return agent('x')`,
      runId: 'run-ev',
      workflowName: 'my-wf',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(
      events.some(e => e.type === 'run_started' && e.workflowName === 'my-wf'),
    ).toBe(true)
    expect(
      events.some(e => e.type === 'run_done' && e.status === 'completed'),
    ).toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// Emit phase_done for currentPhase before terminal state: hook.phase only emits the previous phase's done on switch,
// the last phase has no subsequent switch → the UI left panel would show running forever. Verify all three paths re-emit.
test('re-emit phase_done for currentPhase before terminal state (completed path)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const { ports, events } = portsWithEvents(
      dir,
      new Map([['x', { kind: 'ok', output: '1', usage: { outputTokens: 1 } }]]),
    )
    await runWorkflow({
      script: `phase('Review')\nreturn agent('x')`,
      runId: 'run-phase-done',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    // Both phase_started and phase_done for Review should be present (done from re-emit before terminal)
    expect(
      events.some(e => e.type === 'phase_started' && e.phase === 'Review'),
    ).toBe(true)
    expect(
      events.some(e => e.type === 'phase_done' && e.phase === 'Review'),
    ).toBe(true)
    // Order: phase_done must precede run_done (reducer is order-independent, but the event stream is clearer this way)
    const lastPhaseDone = Math.max(
      0,
      ...events.map((e, i) => (e.type === 'phase_done' ? i : -1)),
    )
    const runDoneIdx = events.findIndex(e => e.type === 'run_done')
    expect(runDoneIdx).toBeGreaterThan(0)
    expect(lastPhaseDone).toBeLessThan(runDoneIdx)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('re-emit phase_done for currentPhase before terminal state (killed path)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const { ports, events } = portsWithEvents(
      dir,
      new Map([['x', { kind: 'ok', output: '1', usage: { outputTokens: 1 } }]]),
    )
    const ac = new AbortController()
    ac.abort()
    await runWorkflow({
      script: `phase('Run')\nreturn agent('x')`,
      runId: 'run-kill-phase',
      ports,
      host: createHostHandle(null),
      signal: ac.signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(events.some(e => e.type === 'phase_done' && e.phase === 'Run')).toBe(
      true,
    )
    expect(
      events.some(e => e.type === 'run_done' && e.status === 'killed'),
    ).toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('no phase() call → terminal does not re-emit phase_done (currentPhase is null)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const { ports, events } = portsWithEvents(
      dir,
      new Map([['x', { kind: 'ok', output: '1', usage: { outputTokens: 1 } }]]),
    )
    await runWorkflow({
      script: `return agent('x')`,
      runId: 'run-no-phase',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    // No phase() → currentPhase is null → terminal does not re-emit phase_done
    expect(events.some(e => e.type === 'phase_done')).toBe(false)
    expect(events.some(e => e.type === 'phase_started')).toBe(false)
    expect(
      events.some(e => e.type === 'run_done' && e.status === 'completed'),
    ).toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('derives workflowName from meta.name when not passed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const { ports, events } = portsWithEvents(dir, new Map())
    await runWorkflow({
      script: `export const meta = { name: 'from-meta', description: 'd' }\nreturn 1`,
      runId: 'run-meta',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(
      events.some(
        e => e.type === 'run_started' && e.workflowName === 'from-meta',
      ),
    ).toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('budgetTotal exhausted → failed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const ports = portsWith(
      dir,
      new Map([
        ['a', { kind: 'ok', output: '1', usage: { outputTokens: 5 } }],
        ['b', { kind: 'ok', output: '2', usage: { outputTokens: 5 } }],
      ]),
    )
    const result = await runWorkflow({
      script: `await agent('a')\nreturn agent('b')`,
      runId: 'run-budget',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: 5,
    })
    expect(result.status).toBe('failed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('maxConcurrency passthrough: parallel agents bounded by run-level concurrency slots', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    let active = 0
    let peak = 0
    const ports: WorkflowPorts = {
      agentRunner: {
        runAgentToResult: async () => {
          active++
          peak = Math.max(peak, active)
          await new Promise(r => {
            setTimeout(r, 8)
          })
          active--
          return { kind: 'ok', output: 'x', usage: { outputTokens: 1 } }
        },
      },
      progressEmitter: { emit: () => {} },
      taskRegistrar: {
        register: () => ({ runId: 'r', signal: new AbortController().signal }),
        complete: () => {},
        fail: () => {},
        kill: () => {},
        pendingAction: () => null,
      },
      journalStore: createFileJournalStore(dir),
      permissionGate: { isAborted: () => false },
      logger: { debug: () => {}, event: () => {} },
      hostFactory: () => ({
        handle: createHostHandle(null),
        cwd: dir,
        budgetTotal: null,
      }),
    }
    const result = await runWorkflow({
      script: `return parallel(Array.from({length: 8}, () => () => agent('p')))`,
      runId: 'run-mc',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
      maxConcurrency: 2,
    })
    expect(result.status).toBe('completed')
    expect(peak).toBeLessThanOrEqual(2)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('workflow() references a syntactically broken sub-script → failed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    await mkdir(join(dir, '.claude', 'workflows'), { recursive: true })
    await writeFile(join(dir, '.claude', 'workflows', 'broken.ts'), `return ((`)
    const ports = portsWith(dir, new Map())
    const result = await runWorkflow({
      script: `return workflow('broken')`,
      runId: 'run-sub-err',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(result.status).toBe('failed')
    expect(result.error).toMatch(/Sub-workflow|script error/i)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('workflow() references a non-existent name → failed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const ports = portsWith(dir, new Map())
    const result = await runWorkflow({
      script: `return workflow('ghost')`,
      runId: 'run-sub-missing',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(result.status).toBe('failed')
    expect(result.error).toMatch(/Sub-workflow|not found/i)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
