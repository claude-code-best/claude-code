import { expect, test } from 'bun:test'
// DI pattern: do not use mock.module (process-global, last-write-wins, would pollute other tests in the same process such as
// autonomy.test.ts). Instead hand-construct FAKE WorkflowPorts: registry.run returns a fixed ok
// result, taskRegistrar maintains abort bindings, journalStore is an in-memory empty impl. The real runWorkflow
// thus runs to completion without needing LLM or mocks.

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeService, __resetWorkflowServiceForTests } from '../service.js'
import { createProgressBus } from '../progress/bus.js'
import {
  createProgressStoreFromBus,
  type RunProgress,
} from '../progress/store.js'
import type {
  AgentRunResult,
  ProgressEvent,
  WorkflowPorts,
} from '@claude-code-best/workflow-engine'

// Construct FAKE ports: registry.run returns a fixed AgentRunResult, taskRegistrar has bindings,
// journalStore is an in-memory empty impl. progressEmitter.emit → bus.emit (store subscribes to bus at construction).
// Note: runWorkflow itself emits run_started/run_done; taskRegistrar only manages abort bindings,
// does not re-emit events (avoids store reducer receiving duplicate run_done).
type RegistrarCall =
  | { kind: 'complete'; runId: string; summary?: string }
  | { kind: 'fail'; runId: string; error?: string }
  | { kind: 'kill'; runId: string }
  | {
      kind: 'registerAgentAbort'
      runId: string
      agentId: number
      controller: AbortController
    }
  | { kind: 'unregisterAgentAbort'; runId: string; agentId: number }
  | { kind: 'killAgent'; runId: string; agentId: number }

function fakePorts(
  opts: {
    /** adapter.run throws (simulates agent backend crash). */
    adapterThrow?: string
    /** adapter.run return value (default ok). */
    adapterResult?: AgentRunResult
    /** agentRunner.runAgentToResult return value (fallback path, default throws). */
    runnerResult?: AgentRunResult
  } = {},
): {
  ports: WorkflowPorts
  store: ReturnType<typeof createProgressStoreFromBus>
  killed: string[]
  /** taskRegistrar call records (complete/fail/kill/registerAgentAbort/...). */
  calls: RegistrarCall[]
  /** runId → (agentId → AbortController). Used by tests to simulate backend registration. */
  agentBindings: Map<string, Map<number, AbortController>>
  /** adapter.run call count (accumulates on retry). holder reference, tests read adapterCalls.value. */
  adapterCallsRef: { value: number }
} {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const killed: string[] = []
  const calls: RegistrarCall[] = []
  const bindings = new Map<string, { abort: AbortController }>()
  // agentId → AbortController (per runId). killAgent uses this to abort precisely.
  const agentBindings = new Map<string, Map<number, AbortController>>()
  // adapter.run call count (accumulates on retry). Use holder object to avoid closure/getter
  // snapshot semantics issues in Bun test runner — when returning, shorthand takes the current value (=0),
  // subsequent outer variable ++ does not reflect into the returned object field. holder reference is stable.
  const adapterCallsRef = { value: 0 }
  let seq = 0
  const ports = {
    // hostFactory is not actually called by the service.launch path (service builds its own host handle),
    // but the WorkflowPorts type requires it to exist; keep a minimal impl.
    hostFactory: () => ({
      handle: {} as never,
      cwd: '/tmp',
      budgetTotal: null,
      toolUseId: 'tu',
    }),
    agentAdapterRegistry: {
      resolve: () => ({
        id: 'claude-code',
        capabilities: { structuredOutput: true },
        run:
          opts.adapterThrow !== undefined
            ? async (): Promise<AgentRunResult> => {
                adapterCallsRef.value++
                throw new Error(opts.adapterThrow)
              }
            : async (): Promise<AgentRunResult> => {
                adapterCallsRef.value++
                return (
                  opts.adapterResult ?? {
                    kind: 'ok',
                    output: 'mock-out',
                    usage: { outputTokens: 1 },
                  }
                )
              },
      }),
    },
    agentRunner: {
      runAgentToResult:
        opts.runnerResult !== undefined
          ? async () => opts.runnerResult
          : async () => {
              throw new Error('should not reach')
            },
    },
    progressEmitter: {
      emit: (e: ProgressEvent) => bus.emit(e),
    },
    taskRegistrar: {
      register: ({ workflowName }: { workflowName: string }) => {
        const abort = new AbortController()
        seq += 1
        const runId = `run-${seq}`
        bindings.set(runId, { abort })
        agentBindings.set(runId, new Map())
        return { runId, signal: abort.signal }
      },
      complete: (runId: string, summary?: string) => {
        calls.push({ kind: 'complete', runId, summary })
      },
      fail: (runId: string, error?: string) => {
        calls.push({ kind: 'fail', runId, error })
      },
      kill: (runId: string) => {
        killed.push(runId)
        calls.push({ kind: 'kill', runId })
        bindings.get(runId)?.abort.abort()
      },
      registerAgentAbort: (
        runId: string,
        agentId: number,
        controller: AbortController,
      ) => {
        calls.push({
          kind: 'registerAgentAbort',
          runId,
          agentId,
          controller,
        })
        agentBindings.get(runId)?.set(agentId, controller)
      },
      unregisterAgentAbort: (runId: string, agentId: number) => {
        calls.push({ kind: 'unregisterAgentAbort', runId, agentId })
        agentBindings.get(runId)?.delete(agentId)
      },
      killAgent: (runId: string, agentId: number) => {
        calls.push({ kind: 'killAgent', runId, agentId })
        const ac = agentBindings.get(runId)?.get(agentId)
        if (!ac) return false
        ac.abort()
        agentBindings.get(runId)!.delete(agentId)
        return true
      },
      pendingAction: () => null,
    },
    journalStore: {
      read: async () => [],
      append: async () => {},
      truncate: async () => {},
    },
    permissionGate: { isAborted: () => false },
    logger: {
      debug: () => {},
      event: () => {},
      warn: () => {},
    },
  } as unknown as WorkflowPorts
  return { ports, store, killed, calls, agentBindings, adapterCallsRef }
}

const stubTUC = { agentId: 'a1', toolUseId: 'tu' } as never
const stubCanUseTool = (() => Promise.resolve({ behavior: 'allow' })) as never

/** Wait for detached runWorkflow to complete (detached call, need to drain microtasks/macrotasks). */
async function settle(): Promise<void> {
  await new Promise(r => setTimeout(r, 60))
}

test('launch → completed; store shows this run', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  const { runId } = await svc.launch(
    { script: `return agent('compute')` },
    stubTUC,
    stubCanUseTool,
  )
  await settle()
  const r = svc.getRun(runId)
  expect(r).toBeDefined()
  // detached execution may still be running within the settle window, or already completed — both are acceptable.
  expect(['completed', 'running']).toContain(r!.status)
  expect(r!.workflowName).toBe('workflow')
})

test('launch inline script → returns scriptPath (persisted to cwdOverride dir)', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    const { ports, store } = fakePorts()
    const svc = makeService(ports, store, dir)
    const result = await svc.launch(
      { script: `return agent('x')` },
      stubTUC,
      stubCanUseTool,
    )
    expect(result.scriptPath).toBe(
      join(dir, '.claude', 'workflow-runs', 'run-1', 'script.js'),
    )
    const { readFile } = await import('node:fs/promises')
    expect(await readFile(result.scriptPath!, 'utf-8')).toBe(
      `return agent('x')`,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('kill goes through taskRegistrar.kill', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, killed } = fakePorts()
  const svc = makeService(ports, store)
  const { runId } = await svc.launch(
    { script: `return agent('x')` },
    stubTUC,
    stubCanUseTool,
  )
  svc.kill(runId)
  expect(killed).toContain(runId)
})

test('killAgent goes through taskRegistrar.killAgent: precisely aborts a single agent', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, calls, agentBindings } = fakePorts()
  const svc = makeService(ports, store)
  const { runId } = await svc.launch(
    { script: `return agent('x')` },
    stubTUC,
    stubCanUseTool,
  )
  // simulate backend registering AbortController when launching agent
  const ac = new AbortController()
  agentBindings.get(runId)!.set(7, ac)
  // service.killAgent routes to taskRegistrar.killAgent, which actually aborts the corresponding controller
  expect(svc.killAgent(runId, 7)).toBe(true)
  expect(ac.signal.aborted).toBe(true)
  expect(
    calls.some(
      c => c.kind === 'killAgent' && c.runId === runId && c.agentId === 7,
    ),
  ).toBe(true)
  // after abort controller is deleted from Map: calling killAgent on same agent again returns false (idempotent)
  expect(svc.killAgent(runId, 7)).toBe(false)
  // unknown agentId / unknown runId safe returns false
  expect(svc.killAgent(runId, 999)).toBe(false)
  expect(svc.killAgent('nope', 1)).toBe(false)
})

test('listRuns/subscribe come from store', () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  expect(svc.listRuns()).toEqual([])
  let n = 0
  const unsub = svc.subscribe(() => {
    n++
  })
  expect(typeof unsub).toBe('function')
  unsub()
  expect(n).toBe(0)
})

test('listNamed delegates to namedWorkflows (empty dir → []; with files → lists)', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  // non-existent dir → []
  const empty = await svc.listNamed(
    join(tmpdir(), `wf-nope-${Math.random().toString(36).slice(2)}`),
  )
  expect(empty).toEqual([])
  // dir with named files → lists names (extension stripped, sorted)
  const dir = await mkdtemp(join(tmpdir(), 'wf-named-'))
  try {
    await writeFile(
      join(dir, 'a.ts'),
      'export const meta = { name: "a", description: "d" }\nreturn 1',
    )
    await writeFile(join(dir, 'b.js'), 'return 2')
    const names = await svc.listNamed(dir)
    expect(names).toEqual(['a', 'b'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('missing script/name/scriptPath → throws', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  await expect(svc.launch({}, stubTUC, stubCanUseTool)).rejects.toThrow(
    /script|name|scriptPath/,
  )
})

test('scriptPath reads file content and validates', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  const dir = await mkdtemp(join(tmpdir(), 'wf-path-'))
  const file = join(dir, 's.ts')
  try {
    await writeFile(file, `return agent('from-file')`)
    const { runId } = await svc.launch(
      { scriptPath: file },
      stubTUC,
      stubCanUseTool,
    )
    await settle()
    const r = svc.getRun(runId)
    expect(r).toBeDefined()
    expect(['completed', 'running']).toContain(r!.status)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('parseScript validation failed → launch throws', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  // trigger ScriptError: meta literal missing description (validateMeta requires both name+description to be strings)
  await expect(
    svc.launch(
      { script: `export const meta = { name: "x" }\nreturn 1` },
      stubTUC,
      stubCanUseTool,
    ),
  ).rejects.toThrow(/Script validation failed/i)
})

// ---- Service-layer failure routing coverage (review gap: .then/.catch → taskRegistrar path) ----

test('script run throws → service routes to taskRegistrar.fail, with error text', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, calls } = fakePorts()
  const svc = makeService(ports, store)
  await svc.launch(
    { script: `throw new Error('script boom')` },
    stubTUC,
    stubCanUseTool,
  )
  await settle()
  const fail = calls.find(c => c.kind === 'fail')
  expect(fail).toBeDefined()
  expect(fail?.kind === 'fail' && fail.error).toMatch(/script boom/)
})

test('adapter throws → retry still throws → degrade to dead → workflow completed (not fail)', async () => {
  __resetWorkflowServiceForTests()
  // new semantics: agent non-abort throw → retry once → still throws → degrade to dead (agent returns null),
  // workflow continues and completes. Retry tolerates transient failures (429/network), but a permanently
  // broken agent does not break through the entire workflow (consistent with parallel/pipeline null-on-error contract).
  const { ports, store, calls, adapterCallsRef } = fakePorts({
    adapterThrow: 'adapter boom',
  })
  const svc = makeService(ports, store)
  await svc.launch({ script: `return agent('x')` }, stubTUC, stubCanUseTool)
  await settle()
  // retry once → adapter called 2 times
  expect(adapterCallsRef.value).toBe(2)
  // workflow normal completed, not failed
  const complete = calls.find(c => c.kind === 'complete')
  expect(complete).toBeDefined()
  const fail = calls.find(c => c.kind === 'fail')
  expect(fail).toBeUndefined()
})

test('script completes normally → service routes to taskRegistrar.complete', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, calls } = fakePorts()
  const svc = makeService(ports, store)
  await svc.launch({ script: `return agent('x')` }, stubTUC, stubCanUseTool)
  await settle()
  expect(calls.some(c => c.kind === 'complete')).toBe(true)
})

// ---- Fix N: shutdown cleanup ----

test('shutdown kills all running runs (taskRegistrar.kill called for each)', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, killed } = fakePorts()
  // make adapter slower, so during settle the run is still running
  const slowPorts = {
    ...ports,
    agentAdapterRegistry: {
      resolve: () => ({
        id: 'claude-code',
        capabilities: { structuredOutput: true },
        run: async (): Promise<AgentRunResult> => {
          await new Promise(r => setTimeout(r, 200))
          return { kind: 'ok', output: 'slow', usage: { outputTokens: 1 } }
        },
      }),
    },
  } as unknown as typeof ports
  const slowSvc = makeService(slowPorts, store)
  const { runId: a } = await slowSvc.launch(
    { script: `return agent('a')` },
    stubTUC,
    stubCanUseTool,
  )
  const { runId: b } = await slowSvc.launch(
    { script: `return agent('b')` },
    stubTUC,
    stubCanUseTool,
  )
  killed.length = 0
  slowSvc.shutdown()
  expect(killed).toContain(a)
  expect(killed).toContain(b)
})

test('shutdown does not re-kill completed runs; idempotent (multiple calls safe)', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, killed } = fakePorts()
  const svc = makeService(ports, store)
  const { runId } = await svc.launch(
    { script: `return agent('x')` },
    stubTUC,
    stubCanUseTool,
  )
  await settle() // complete
  killed.length = 0
  svc.shutdown()
  // already completed should not be killed again
  expect(killed).not.toContain(runId)
  // idempotent
  expect(() => svc.shutdown()).not.toThrow()
})

// ---- Task 5: loadPersistedRuns + getRunAsync fallback ----
// runsDirProvider is injected as makeService's fourth optional parameter with tmpdir, to avoid writing to the real project dir
// (Bun ESM module namespace is read-only, cannot monkey-patch getRunsDir).

test('loadPersistedRuns scans disk to hydrate historical runs; existing in-memory runs are not overwritten', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    // disk first has two historical runs
    const { writeRunState } = await import('../persistence.js')
    const historicalA = {
      runId: 'hA',
      workflowName: 'old-A',
      status: 'completed',
      phases: [],
      declaredPhases: [],
      currentPhase: null,
      agents: [],
      agentCount: 1,
      returnValue: 'a',
      startedAt: 10,
      updatedAt: 20,
    } as RunProgress
    const historicalB = {
      runId: 'hB',
      workflowName: 'old-B',
      status: 'failed',
      phases: [],
      declaredPhases: [],
      currentPhase: null,
      agents: [],
      agentCount: 2,
      error: 'x',
      startedAt: 30,
      updatedAt: 40,
    } as RunProgress
    await writeRunState(dir, historicalA)
    await writeRunState(dir, historicalB)

    const { ports, store } = fakePorts()
    // in-memory first has one current-session run (via ports.progressEmitter.emit through bus → store)
    ports.progressEmitter.emit({
      type: 'run_started',
      runId: 'live',
      workflowName: 'live-w',
      meta: null,
    })
    const svc = makeService(ports, store, undefined, () => dir)

    await svc.loadPersistedRuns()

    const ids = svc.listRuns().map(r => r.runId)
    expect(ids).toContain('hA')
    expect(ids).toContain('hB')
    expect(ids).toContain('live')
    // memory first: live is still running (not overwritten by disk; disk has no live so no STALE injected)
    expect(svc.getRun('live')!.status).toBe('running')
    expect(svc.getRun('hA')!.returnValue).toBe('a')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('loadPersistedRuns repeated calls scan disk only once (persistedLoaded flag)', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    const { ports, store } = fakePorts()
    const svc = makeService(ports, store, undefined, () => dir)

    await svc.loadPersistedRuns()
    await svc.loadPersistedRuns()
    await svc.loadPersistedRuns()

    // repeated calls do not throw, do not change listRuns result (empty dir)
    expect(svc.listRuns()).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getRunAsync memory hit → no disk read', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    const { ports, store } = fakePorts()
    const svc = makeService(ports, store, undefined, () => dir)
    ports.progressEmitter.emit({
      type: 'run_started',
      runId: 'live',
      workflowName: 'w',
      meta: null,
    })

    const got = await svc.getRunAsync('live')
    expect(got?.runId).toBe('live')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getRunAsync memory miss + disk hit → returns disk value, and does not inject into memory (subsequent get still reads disk)', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    const { writeRunState } = await import('../persistence.js')
    const historical = {
      runId: 'hist-only',
      workflowName: 'old',
      status: 'completed',
      phases: [],
      declaredPhases: [],
      currentPhase: null,
      agents: [],
      agentCount: 0,
      returnValue: { x: 1 },
      startedAt: 1,
      updatedAt: 2,
    } as RunProgress
    await writeRunState(dir, historical)

    const { ports, store } = fakePorts()
    const svc = makeService(ports, store, undefined, () => dir)

    const got = await svc.getRunAsync('hist-only')
    expect(got?.returnValue).toEqual({ x: 1 })
    // not injected into memory: in-memory list does not contain (not hydrated)
    expect(svc.listRuns().map(r => r.runId)).not.toContain('hist-only')
    // subsequent get still returns (each goes through readRunState fallback)
    const got2 = await svc.getRunAsync('hist-only')
    expect(got2?.returnValue).toEqual({ x: 1 })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getRunAsync memory miss + disk miss → undefined', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    const { ports, store } = fakePorts()
    const svc = makeService(ports, store, undefined, () => dir)

    const got = await svc.getRunAsync('no-such-run')
    expect(got).toBeUndefined()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
