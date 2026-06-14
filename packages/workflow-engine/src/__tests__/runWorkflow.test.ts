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

test('端到端：脚本返回 agent 结果，状态 completed', async () => {
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

test('脚本语法错误 → failed', async () => {
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

test('resume：journal 命中则不调用 runner', async () => {
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

test('workflow() 嵌套（一层）共享计数', async () => {
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

// ---- 边界与事件 ----

test('scriptChanged=true → truncate journal 并全量现场跑', async () => {
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
    // truncate 清空了旧 cached journal，现场 agent append 新 entry（live）
    const final = await ports.journalStore.read('run-chg')
    expect(final).toHaveLength(1)
    expect((final[0]!.result as { output: string }).output).toBe('live')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('脚本运行时抛错（非语法错）→ failed', async () => {
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

test('发射 run_started（含 workflowName）与 run_done 事件', async () => {
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

// 终态前补发当前 phase 的 phase_done：hook.phase 只在切换时 emit 上一个的 done，
// 最后一个 phase 无后续切换 → UI 左栏会永远显示 running。验证三路径都补发。
test('终态前补发 currentPhase 的 phase_done（completed 路径）', async () => {
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
    // Review 的 phase_started + phase_done 都应存在（done 来自终态前补发）
    expect(
      events.some(e => e.type === 'phase_started' && e.phase === 'Review'),
    ).toBe(true)
    expect(
      events.some(e => e.type === 'phase_done' && e.phase === 'Review'),
    ).toBe(true)
    // 顺序：phase_done 必须在 run_done 之前（reducer 不依赖顺序，但事件流语义清晰）
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

test('终态前补发 currentPhase 的 phase_done（killed 路径）', async () => {
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

test('无 phase() 调用 → 终态不补发 phase_done（currentPhase 为 null）', async () => {
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
    // 没有 phase() → currentPhase 为 null → 终态不补发 phase_done
    expect(events.some(e => e.type === 'phase_done')).toBe(false)
    expect(events.some(e => e.type === 'phase_started')).toBe(false)
    expect(
      events.some(e => e.type === 'run_done' && e.status === 'completed'),
    ).toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('未传 workflowName 时从 meta.name 推导', async () => {
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

test('budgetTotal 耗尽 → failed', async () => {
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

test('maxConcurrency 透传：并行 agent 受 run 级并发槽位限制', async () => {
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

test('workflow() 引用语法错的子脚本 → failed', async () => {
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
    expect(result.error).toMatch(/子 workflow|脚本错误/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('workflow() 引用不存在的 name → failed', async () => {
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
    expect(result.error).toMatch(/子 workflow|未找到/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
