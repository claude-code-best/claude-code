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
  }
}

test('文本 agent → ok + token 计量', async () => {
  const res = await claudeCodeBackend.run({ prompt: 'do it' }, ctx())
  expect(res.kind).toBe('ok')
  if (res.kind === 'ok') {
    expect(res.output).toBe('agent-text')
    expect(res.usage.outputTokens).toBe(42)
  }
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
