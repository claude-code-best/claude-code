/**
 * registry 多后端路由演示（mock adapter，无需 API key）。
 *
 * 两个 adapter：strong（被 researcher 路由命中）+ fast（默认）。
 * 脚本里 agent({agentType:'researcher'}) → strong，其余 → fast。
 * 证明 agent 后端可通过 AgentAdapterRegistry 插拔 + 路由，引擎不关心实现。
 *
 * 用法：bun run packages/workflow-engine/examples/registry-demo.ts
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AgentAdapterRegistry,
  createFileJournalStore,
  createHostHandle,
  runWorkflow,
  type AgentAdapter,
  type AgentRunParams,
  type AgentRunResult,
  type WorkflowPorts,
} from '@claude-code-best/workflow-engine'

const strongAdapter: AgentAdapter = {
  id: 'strong',
  capabilities: { structuredOutput: true, tools: true },
  async run(p: AgentRunParams): Promise<AgentRunResult> {
    return {
      kind: 'ok',
      output: `[strong] ← ${p.prompt}`,
      usage: { outputTokens: 1 },
    }
  },
}

const fastAdapter: AgentAdapter = {
  id: 'fast',
  capabilities: { structuredOutput: false },
  async run(p: AgentRunParams): Promise<AgentRunResult> {
    return {
      kind: 'ok',
      output: `[fast] ← ${p.prompt}`,
      usage: { outputTokens: 1 },
    }
  },
}

const registry = new AgentAdapterRegistry()
  .register(strongAdapter)
  .register(fastAdapter)
  .route({ kind: 'agentType', agentType: 'researcher', adapter: 'strong' })
  .default('fast')

const SCRIPT = `
export const meta = { name: 'registry-demo', description: 'multi-adapter routing' }
phase('Route')
const research = await agent('深度调研任务', { agentType: 'researcher', label: 'research' })
const quick = await agent('快速小任务', { label: 'quick' })
return { research, quick }
`

function makePorts(runsDir: string): WorkflowPorts {
  return {
    // registry 优先，agentRunner 仅作形状占位（不会被调到）
    agentRunner: { runAgentToResult: async () => ({ kind: 'dead' }) },
    agentAdapterRegistry: registry,
    progressEmitter: {
      emit: e => {
        if (e.type === 'phase_started') console.log(`\n━ phase: ${e.phase}`)
        else if (e.type === 'agent_done') {
          const out =
            e.result.kind === 'ok'
              ? String(e.result.output)
              : `[${e.result.kind}]`
          console.log(`  ✓ ${e.label} → ${out}`)
        }
      },
    },
    taskRegistrar: {
      register: () => ({
        runId: 'demo',
        signal: new AbortController().signal,
      }),
      complete() {},
      fail() {},
      kill() {},
      pendingAction: () => null,
    },
    journalStore: createFileJournalStore(runsDir),
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({
      handle: createHostHandle(null),
      cwd: process.cwd(),
      budgetTotal: null,
    }),
  }
}

if (import.meta.main) {
  await registry.initializeAll()
  try {
    const result = await runWorkflow({
      script: SCRIPT,
      runId: `demo-${Date.now()}`,
      ports: makePorts(join(tmpdir(), 'wf-registry-demo')),
      host: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: process.cwd(),
      budgetTotal: null,
    })
    console.log(`\n■ ${result.status}`)
    if (result.status === 'completed') {
      const ret = result.returnValue as { research: string; quick: string }
      console.log(
        `research(agentType:researcher) → ${ret.research.startsWith('[strong]') ? 'strong adapter ✓' : '??'}`,
      )
      console.log(
        `quick(默认)               → ${ret.quick.startsWith('[fast]') ? 'fast adapter ✓' : '??'}`,
      )
    }
  } finally {
    await registry.disposeAll()
  }
}
