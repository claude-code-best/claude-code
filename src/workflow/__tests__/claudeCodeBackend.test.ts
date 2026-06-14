import { expect, test, mock } from 'bun:test'

// 注意：mock specifier 必须解析到 impl 实际 import 的同一模块（bun mock.module
// 按解析后模块匹配）。impl 用 '@claude-code-best/builtin-tools/...' 与 'src/*' 别名
// 路径导入，此处用相同 specifier。
mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js',
  () => ({
    runAgent: async function* () {
      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'agent-text' }] },
      }
    },
  }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/agentToolUtils.js',
  () => ({
    finalizeAgentTool: () => ({
      content: [{ type: 'text', text: 'agent-text' }],
      usage: { output_tokens: 42 },
      totalTokens: 42,
      totalToolUseCount: 3,
    }),
  }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js',
  () => ({
    isBuiltInAgent: () => true,
  }),
)
mock.module('src/tools.js', () => ({ assembleToolPool: () => ({ tools: [] }) }))
mock.module('src/utils/messages.js', () => ({
  createUserMessage: (o: { content: string }) => ({
    role: 'user',
    content: o.content,
  }),
  extractTextContent: () => 'agent-text',
}))
mock.module('src/utils/uuid.js', () => ({ createAgentId: () => 'agent-1' }))
mock.module('src/services/analytics/index.js', () => ({ logEvent: () => {} }))
mock.module('src/utils/debug.js', () => ({ logForDebugging: () => {} }))

// isolation:'worktree' 测试用：mock worktree 三件套（避免真跑 git worktree add）。
// 注意 mock.module 是 process-global；worktreeState 在工厂外定义供测试重置。
// 不 mock cwd.js：runWithCwdOverride 真跑 AsyncLocalStorage 对 mock runAgent 无害，
// 且避免污染同进程其他依赖 pwd/getCwd 的测试。
const worktreeState = {
  shouldThrow: false,
  hasChanges: false,
  created: [] as string[],
  removed: [] as string[],
  changesCalls: 0,
}
mock.module('src/utils/worktree.js', () => ({
  createAgentWorktree: async (slug: string) => {
    if (worktreeState.shouldThrow) throw new Error('wt boom')
    worktreeState.created.push(slug)
    return {
      worktreePath: '/fake/wt',
      worktreeBranch: 'wt-branch',
      headCommit: 'abc123',
      gitRoot: '/fake',
      hookBased: false,
    }
  },
  hasWorktreeChanges: async () => {
    worktreeState.changesCalls++
    return worktreeState.hasChanges
  },
  removeAgentWorktree: async (path: string) => {
    worktreeState.removed.push(path)
    return true
  },
}))

import { WorkflowAbortedError } from '@claude-code-best/workflow-engine'
import {
  claudeCodeBackend,
  resolveAgentDefinition,
  mapWorkflowModel,
  extractStructuredOutput,
  WORKFLOW_AGENT,
} from '../backends/claudeCodeBackend.js'
import { makeHostHandle } from '../hostHandle.js'

function ctx() {
  return {
    host: makeHostHandle({
      toolUseContext: {
        options: {
          agentDefinitions: { activeAgents: [] },
          querySource: 'workflow',
          mainLoopModel: 'm',
        },
        getAppState: () => ({
          toolPermissionContext: {
            mode: 'acceptEdits',
            alwaysAllowRules: {},
          },
          mcp: { tools: [] },
        }),
      } as never,
      canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
      // run() 不读 parentMessage；用空对象占位满足 WorkflowHostBundle 类型。
      parentMessage: {} as never,
    }),
    signal: new AbortController().signal,
    runId: 'r1',
    agentId: 1,
  }
}

test('文本 agent → ok + token/tool/model 计量', async () => {
  const res = await claudeCodeBackend.run({ prompt: 'do it' }, ctx())
  expect(res.kind).toBe('ok')
  if (res.kind === 'ok') {
    expect(res.output).toBe('agent-text')
    expect(res.usage.outputTokens).toBe(42)
    // 面板展示字段：tokenCount(=totalTokens) / toolCount / model(fallback mainLoopModel 'm')
    expect(res.tokenCount).toBe(42)
    expect(res.toolCount).toBe(3)
    expect(res.model).toBe('m')
  }
})

test('isolation:worktree → 创建 worktree + 无变更自动清理；slug 匹配清理正则', async () => {
  worktreeState.shouldThrow = false
  worktreeState.hasChanges = false
  worktreeState.created = []
  worktreeState.removed = []
  worktreeState.changesCalls = 0
  const res = await claudeCodeBackend.run(
    { prompt: 'do', isolation: 'worktree' },
    ctx(),
  )
  expect(res.kind).toBe('ok')
  expect(worktreeState.created).toHaveLength(1)
  // slug 必须匹配 cleanupStaleAgentWorktrees 的清理正则 ^wf_[0-9a-f]{8}-[0-9a-f]{3}-\d+$
  expect(worktreeState.created[0]).toMatch(/^wf_[0-9a-f]{8}-[0-9a-f]{3}-\d+$/)
  expect(worktreeState.changesCalls).toBe(1)
  expect(worktreeState.removed).toHaveLength(1) // 无变更 → auto-remove
})

test('isolation:worktree 有变更 → 保留 worktree（不 remove）', async () => {
  worktreeState.hasChanges = true
  worktreeState.created = []
  worktreeState.removed = []
  worktreeState.changesCalls = 0
  const res = await claudeCodeBackend.run(
    { prompt: 'do', isolation: 'worktree' },
    ctx(),
  )
  expect(res.kind).toBe('ok')
  expect(worktreeState.removed).toHaveLength(0) // 有变更 → 保留
  expect(worktreeState.changesCalls).toBe(1)
})

test('isolation:worktree 创建失败 → fail-closed 返 dead（不静默退化共享 cwd）', async () => {
  worktreeState.shouldThrow = true
  const res = await claudeCodeBackend.run(
    { prompt: 'do', isolation: 'worktree' },
    ctx(),
  )
  expect(res.kind).toBe('dead')
  worktreeState.shouldThrow = false
})

test('无 isolation → 不创建 worktree', async () => {
  worktreeState.created = []
  const res = await claudeCodeBackend.run({ prompt: 'do' }, ctx())
  expect(res.kind).toBe('ok')
  expect(worktreeState.created).toHaveLength(0)
})

test('runAgent 抛错 → dead', async () => {
  // 覆盖 mock 让 runAgent 抛（last-write-wins）
  mock.module(
    '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js',
    () => ({
      // biome-ignore lint/correctness/useYield: 故意抛错以测试 dead 分支（不 yield）
      runAgent: async function* () {
        throw new Error('boom')
      },
    }),
  )
  const res = await claudeCodeBackend.run({ prompt: 'fail' }, ctx())
  expect(res.kind).toBe('dead')
})

// 下面三组测试覆盖 'x' 无效修复：backend 必须把 ctx.signal 桥接到 runAgent.override
// .abortController，并把 AbortError 识别为 abort（throw WorkflowAbortedError，而非吞成 dead）。
// 还要验证 registerAgentAbort 注入，让 service.kill(runId, agentId) 能精确中断单个 agent。

test('ctx.signal 预 abort → backend 桥接：override.abortController.signal.aborted=true', async () => {
  // 用 capturedOverride 暴露 backend 创建的 agentAbort（mock 收到的 override.abortController）
  let capturedController: AbortController | undefined
  mock.module(
    '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js',
    () => ({
      runAgent: async function* (opts: {
        override?: { abortController?: AbortController }
      }) {
        capturedController = opts.override?.abortController
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'x' }] },
        }
      },
    }),
  )
  const parentAbort = new AbortController()
  parentAbort.abort()
  // mock 不抛 → backend 走正常返回路径；但桥接 `if (ctx.signal.aborted) agentAbort.abort()`
  // 已同步触发，capturedController.signal.aborted 必为 true（kill 桥接根因）
  await claudeCodeBackend.run(
    { prompt: 'pre-aborted' },
    { ...ctx(), signal: parentAbort.signal },
  )
  expect(capturedController?.signal.aborted).toBe(true)
})

test('runAgent 抛 AbortError → backend throw WorkflowAbortedError（不吞成 dead）', async () => {
  mock.module(
    '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js',
    () => ({
      // biome-ignore lint/correctness/useYield: 故意抛 AbortError 测识别分支
      runAgent: async function* () {
        const e = new Error('aborted by parent')
        e.name = 'AbortError'
        throw e
      },
    }),
  )
  await expect(
    claudeCodeBackend.run({ prompt: 'abort' }, ctx()),
  ).rejects.toBeInstanceOf(WorkflowAbortedError)
})

test('registerAgentAbort/unregisterAgentAbort 注入：key=ctx.agentId（数字），controller 来自桥接', async () => {
  // 恢复默认 mock（上一个测试把它改成抛 AbortError 了）
  mock.module(
    '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js',
    () => ({
      runAgent: async function* () {
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'agent-text' }] },
        }
      },
    }),
  )
  const registered: Array<{ id: number; controller: AbortController }> = []
  const unregistered: number[] = []
  await claudeCodeBackend.run(
    { prompt: 'wiring' },
    {
      ...ctx(),
      agentId: 42,
      registerAgentAbort: (id, ac) => registered.push({ id, controller: ac }),
      unregisterAgentAbort: id => unregistered.push(id),
    },
  )
  expect(registered).toHaveLength(1)
  expect(registered[0]?.id).toBe(42) // 引擎数字 agentId（非 coreAgentId 字符串）
  expect(registered[0]?.controller).toBeInstanceOf(AbortController)
  expect(unregistered).toEqual([42]) // finally 清理幂等
})

test('id 与 capabilities 形状', () => {
  expect(claudeCodeBackend.id).toBe('claude-code')
  expect(claudeCodeBackend.capabilities.structuredOutput).toBe(true)
  expect(claudeCodeBackend.capabilities.tools).toBe(true)
})

test('resolveAgentDefinition：无 agentType → WORKFLOW_AGENT 兜底', () => {
  const tuc = {
    options: { agentDefinitions: { activeAgents: [] } },
  } as never
  expect(resolveAgentDefinition(undefined, tuc)).toBe(WORKFLOW_AGENT)
})

test('resolveAgentDefinition：命中 activeAgents', () => {
  const fake = { agentType: 'Explore', permissionMode: 'plan' } as never
  const tuc = {
    options: { agentDefinitions: { activeAgents: [fake] } },
  } as never
  expect(resolveAgentDefinition('Explore', tuc)).toBe(fake)
  // 未命中仍兜底
  expect(resolveAgentDefinition('Nope', tuc)).toBe(WORKFLOW_AGENT)
})

test('mapWorkflowModel 直传', () => {
  expect(mapWorkflowModel(undefined)).toBeUndefined()
  expect(mapWorkflowModel('claude-haiku-*')).toBe('claude-haiku-*')
})

test('extractStructuredOutput：合法 JSON 提取；非法返回 null', () => {
  expect(
    extractStructuredOutput([
      { type: 'text', text: 'prefix {"a":1,"b":2} suffix' },
    ]),
  ).toEqual({ a: 1, b: 2 })
  expect(
    extractStructuredOutput([{ type: 'text', text: 'no json here' }]),
  ).toBeNull()
  expect(extractStructuredOutput([])).toBeNull()
})
