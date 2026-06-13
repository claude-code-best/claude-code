/**
 * 集成测试：用忠实 mock adapter 跑「规范 workflow 脚本」（来自 Workflow 工具定义的
 * canonical 模式：pipeline 无屏障 + parallel 屏障 + agent(schema) + phase）。
 * 验证引擎与真实 workflow 脚本语义兼容。
 */
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runWorkflow } from '../engine/runWorkflow.js'
import { createFileJournalStore } from '../engine/journal.js'
import { createHostHandle, type WorkflowPorts } from '../ports.js'
import { createBufferingEmitter } from '../progress/events.js'
import type { AgentRunParams, AgentRunResult, ProgressEvent } from '../types.js'

function canonicalPorts(runsDir: string): {
  ports: WorkflowPorts
  events: ProgressEvent[]
  agentCalls: AgentRunParams[]
} {
  const { emitter, events } = createBufferingEmitter()
  const agentCalls: AgentRunParams[] = []
  const ports: WorkflowPorts = {
    agentRunner: {
      runAgentToResult: async (
        params: AgentRunParams,
      ): Promise<AgentRunResult> => {
        agentCalls.push(params)
        const p = params.prompt
        if (p.startsWith('review-')) {
          return {
            kind: 'ok',
            output: { findings: [{ title: `${p}-finding`, file: 'a.ts' }] },
            usage: { outputTokens: 5 },
          }
        }
        if (p.startsWith('verify')) {
          return {
            kind: 'ok',
            output: { isReal: true },
            usage: { outputTokens: 2 },
          }
        }
        return { kind: 'dead' }
      },
    },
    progressEmitter: emitter,
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
  return { ports, events, agentCalls }
}

// 规范 review 模式（pipeline→parallel→verify→synthesize），逐字采用 Workflow 工具定义的写法。
const CANONICAL_REVIEW_SCRIPT = `
export const meta = {
  name: 'review-changes',
  description: 'Review changed files across dimensions, verify each finding',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
}
const DIMENSIONS = [
  { key: 'bugs', prompt: 'review-bugs' },
  { key: 'perf', prompt: 'review-perf' },
]
const FINDINGS_SCHEMA = { type: 'object' }
const VERDICT_SCHEMA = { type: 'object' }

phase('Review')
const results = await pipeline(
  DIMENSIONS,
  d => agent(d.prompt, { label: 'review:' + d.key, phase: 'Review', schema: FINDINGS_SCHEMA }),
  review => parallel(
    review.findings.map(f => () =>
      agent('verify: ' + f.title, { label: 'verify:' + f.file, phase: 'Verify', schema: VERDICT_SCHEMA })
        .then(v => ({ ...f, verdict: v }))
    )
  )
)
const all = results.flat().filter(Boolean)
const confirmed = all.filter(f => f.verdict && f.verdict.isReal)
return { confirmed, total: all.length }
`

test('canonical review 脚本端到端兼容', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-int-'))
  try {
    const { ports, events, agentCalls } = canonicalPorts(dir)
    const result = await runWorkflow({
      script: CANONICAL_REVIEW_SCRIPT,
      runId: 'int-1',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })

    expect(result.status).toBe('completed')
    const ret = result.returnValue as { confirmed: unknown[]; total: number }
    // 2 维度 × 1 finding，全部 isReal=true → confirmed=2, total=2
    expect(ret.total).toBe(2)
    expect(ret.confirmed).toHaveLength(2)
    // 2 个 review agent + 2 个 verify agent = 4
    expect(agentCalls).toHaveLength(4)
    expect(agentCalls.filter(c => c.prompt.startsWith('review-'))).toHaveLength(
      2,
    )
    expect(agentCalls.filter(c => c.prompt.startsWith('verify'))).toHaveLength(
      2,
    )
    // 进度事件：run_started/done + phase Review/Verify + agent started/done
    expect(
      events.some(
        e => e.type === 'run_started' && e.workflowName === 'review-changes',
      ),
    ).toBe(true)
    expect(
      events.some(e => e.type === 'run_done' && e.status === 'completed'),
    ).toBe(true)
    // 脚本显式调用一次 phase('Review')；verify agent 的 phase:'Verify' 是展示标签，不发 phase_started
    expect(
      events.filter(e => e.type === 'phase_started' && e.phase === 'Review'),
    ).toHaveLength(1)
    expect(events.filter(e => e.type === 'agent_started')).toHaveLength(4)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('loop-until-dry 模式：连续两轮无新发现即收敛', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-int-'))
  try {
    let round = 0
    const { emitter, events } = createBufferingEmitter()
    const ports: WorkflowPorts = {
      agentRunner: {
        runAgentToResult: async (
          p: AgentRunParams,
        ): Promise<AgentRunResult> => {
          round++
          // 第 1-2 轮返回发现，第 3 轮起返回空 → 收敛
          const found = round <= 2 ? [{ b: round }] : []
          return {
            kind: 'ok',
            output: { bugs: found },
            usage: { outputTokens: 1 },
          }
        },
      },
      progressEmitter: emitter,
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
    const script = `
      const seen = []
      const confirmed = []
      let dry = 0
      while (dry < 2) {
        const found = (await agent('find bugs')).bugs
        const fresh = found.filter(b => !seen.includes(b.b))
        if (fresh.length === 0) { dry++; continue }
        dry = 0
        for (const b of fresh) seen.push(b.b)
        confirmed.push(...fresh)
      }
      return { confirmed }
    `
    const result = await runWorkflow({
      script,
      runId: 'int-2',
      ports,
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(result.status).toBe('completed')
    const ret = result.returnValue as { confirmed: { b: number }[] }
    // 第1轮发现{b:1}，第2轮发现{b:2}（fresh，因 seen=[1]），第3轮 found{b:3}?
    // mock 按 round 计数：round1→{b:1}, round2→{b:2}, round3→[]（found空）
    // 但 round2 found=[{b:2}], seen=[1], fresh=[{b:2}] → confirmed=[{b:1},{b:2}], dry=0
    // round3 found=[] → fresh=[] → dry=1; round4 found=[] → dry=2 → 退出
    expect(ret.confirmed).toHaveLength(2)
    expect(
      events.some(e => e.type === 'run_done' && e.status === 'completed'),
    ).toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('resume 兼容：二次运行 journal 命中，agent 不重跑', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-int-'))
  try {
    let calls = 0
    const makePorts = (): WorkflowPorts => ({
      agentRunner: {
        runAgentToResult: async () => {
          calls++
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
    })
    const script = `
      phase('A')
      const a = await agent('do-a')
      const b = await agent('do-b')
      return { a, b }
    `
    // 第一次运行：2 个 agent 现场跑
    const first = await runWorkflow({
      script,
      runId: 'int-3',
      ports: makePorts(),
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
    })
    expect(first.status).toBe('completed')
    expect(calls).toBe(2)

    // resume 同 runId：journal 命中，不重跑
    calls = 0
    const resumed = await runWorkflow({
      script,
      runId: 'int-3',
      ports: makePorts(),
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: dir,
      budgetTotal: null,
      resume: true,
    })
    expect(resumed.status).toBe('completed')
    expect(calls).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
