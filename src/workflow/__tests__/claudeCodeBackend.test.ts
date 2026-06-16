import { expect, test, mock } from 'bun:test'

// Note: mock specifier must resolve to the same module that impl actually imports (bun mock.module
// matches by resolved module). impl uses '@claude-code-best/builtin-tools/...' and 'src/*' alias
// path imports, so the same specifier is used here.
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
  // Return a shape that satisfies UserMessage consumers process-wide.
  // Bun's mock.module is process-global (last-write-wins), so an incomplete
  // mock here corrupts every later test that imports the real createUserMessage
  // (e.g. bridgeMessaging.test.ts's `type !== 'user'` early-exit, or
  // processSlashCommand.test.ts's `message.content` access). Mirror the real
  // shape from src/utils/messages.ts: type + message envelope + passthrough.
  createUserMessage: (
    o: {
      content: string
    } & Record<string, unknown>,
  ) => ({
    type: 'user' as const,
    message: { role: 'user', content: o.content },
    ...o,
  }),
  extractTextContent: () => 'agent-text',
}))
mock.module('src/utils/uuid.js', () => ({ createAgentId: () => 'agent-1' }))
mock.module('src/services/analytics/index.js', () => ({ logEvent: () => {} }))
mock.module('src/utils/debug.js', () => ({ logForDebugging: () => {} }))

// isolation:'worktree' tests: mock worktree trio (to avoid actually running git worktree add).
// Note mock.module is process-global; worktreeState is defined outside the factory for test reset.
// Do not mock cwd.js: runWithCwdOverride actually running AsyncLocalStorage is harmless to mocked runAgent,
// and avoids polluting other tests in the same process that depend on pwd/getCwd.
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
      // run() does not read parentMessage; use an empty object placeholder to satisfy the WorkflowHostBundle type.
      parentMessage: {} as never,
    }),
    signal: new AbortController().signal,
    runId: 'r1',
    agentId: 1,
  }
}

test('text agent → ok + token/tool/model accounting', async () => {
  const res = await claudeCodeBackend.run({ prompt: 'do it' }, ctx())
  expect(res.kind).toBe('ok')
  if (res.kind === 'ok') {
    expect(res.output).toBe('agent-text')
    expect(res.usage.outputTokens).toBe(42)
    // panel display fields: tokenCount(=totalTokens) / toolCount / model (fallback mainLoopModel 'm')
    expect(res.tokenCount).toBe(42)
    expect(res.toolCount).toBe(3)
    expect(res.model).toBe('m')
  }
})

test('isolation:worktree → create worktree + auto-cleanup on no changes; slug matches cleanup regex', async () => {
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
  // slug must match cleanupStaleAgentWorktrees cleanup regex ^wf_[0-9a-f]{8}-[0-9a-f]{3}-\d+$
  expect(worktreeState.created[0]).toMatch(/^wf_[0-9a-f]{8}-[0-9a-f]{3}-\d+$/)
  expect(worktreeState.changesCalls).toBe(1)
  expect(worktreeState.removed).toHaveLength(1) // no changes → auto-remove
})

test('isolation:worktree has changes → keep worktree (no remove)', async () => {
  worktreeState.hasChanges = true
  worktreeState.created = []
  worktreeState.removed = []
  worktreeState.changesCalls = 0
  const res = await claudeCodeBackend.run(
    { prompt: 'do', isolation: 'worktree' },
    ctx(),
  )
  expect(res.kind).toBe('ok')
  expect(worktreeState.removed).toHaveLength(0) // has changes → keep
  expect(worktreeState.changesCalls).toBe(1)
})

test('isolation:worktree creation fails → fail-closed returns dead (does not silently degrade to shared cwd)', async () => {
  worktreeState.shouldThrow = true
  const res = await claudeCodeBackend.run(
    { prompt: 'do', isolation: 'worktree' },
    ctx(),
  )
  expect(res.kind).toBe('dead')
  worktreeState.shouldThrow = false
})

test('no isolation → no worktree created', async () => {
  worktreeState.created = []
  const res = await claudeCodeBackend.run({ prompt: 'do' }, ctx())
  expect(res.kind).toBe('ok')
  expect(worktreeState.created).toHaveLength(0)
})

test('runAgent throws → dead', async () => {
  // override mock so runAgent throws (last-write-wins)
  mock.module(
    '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js',
    () => ({
      // biome-ignore lint/correctness/useYield: intentionally throws to test dead branch (no yield)
      runAgent: async function* () {
        throw new Error('boom')
      },
    }),
  )
  const res = await claudeCodeBackend.run({ prompt: 'fail' }, ctx())
  expect(res.kind).toBe('dead')
})

// The next three groups of tests cover the 'x' invalid fix: backend must bridge ctx.signal to runAgent.override
// .abortController, and recognize AbortError as abort (throw WorkflowAbortedError, not swallow as dead).
// Also verify registerAgentAbort injection so service.kill(runId, agentId) can precisely abort a single agent.

test('ctx.signal pre-abort → backend bridge: override.abortController.signal.aborted=true', async () => {
  // use capturedOverride to expose the agentAbort created by backend (the override.abortController received by mock)
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
  // mock does not throw → backend takes the normal return path; but the bridge `if (ctx.signal.aborted) agentAbort.abort()`
  // has already triggered synchronously, capturedController.signal.aborted must be true (root cause of kill bridge)
  await claudeCodeBackend.run(
    { prompt: 'pre-aborted' },
    { ...ctx(), signal: parentAbort.signal },
  )
  expect(capturedController?.signal.aborted).toBe(true)
})

test('runAgent throws AbortError → backend throws WorkflowAbortedError (not swallowed as dead)', async () => {
  mock.module(
    '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js',
    () => ({
      // biome-ignore lint/correctness/useYield: intentionally throws AbortError to test recognition branch
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

test('registerAgentAbort/unregisterAgentAbort injection: key=ctx.agentId (number), controller from bridge', async () => {
  // restore default mock (previous test changed it to throw AbortError)
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
  expect(registered[0]?.id).toBe(42) // engine numeric agentId (not coreAgentId string)
  expect(registered[0]?.controller).toBeInstanceOf(AbortController)
  expect(unregistered).toEqual([42]) // finally cleanup idempotent
})

test('id and capabilities shape', () => {
  expect(claudeCodeBackend.id).toBe('claude-code')
  expect(claudeCodeBackend.capabilities.structuredOutput).toBe(true)
  expect(claudeCodeBackend.capabilities.tools).toBe(true)
})

test('resolveAgentDefinition: no agentType → WORKFLOW_AGENT fallback', () => {
  const tuc = {
    options: { agentDefinitions: { activeAgents: [] } },
  } as never
  expect(resolveAgentDefinition(undefined, tuc)).toBe(WORKFLOW_AGENT)
})

test('resolveAgentDefinition: hits activeAgents', () => {
  const fake = { agentType: 'Explore', permissionMode: 'plan' } as never
  const tuc = {
    options: { agentDefinitions: { activeAgents: [fake] } },
  } as never
  expect(resolveAgentDefinition('Explore', tuc)).toBe(fake)
  // miss still falls back
  expect(resolveAgentDefinition('Nope', tuc)).toBe(WORKFLOW_AGENT)
})

test('mapWorkflowModel passthrough', () => {
  expect(mapWorkflowModel(undefined)).toBeUndefined()
  expect(mapWorkflowModel('claude-haiku-*')).toBe('claude-haiku-*')
})

test('extractStructuredOutput: valid JSON extracted; invalid returns null', () => {
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

test('extractStructuredOutput: fenced code block (strip fence + strip language tag)', () => {
  expect(
    extractStructuredOutput([
      {
        type: 'text',
        text: 'Here are the findings:\n```json\n{"findings":[{"title":"x"}]}\n```\nDone.',
      },
    ]),
  ).toEqual({ findings: [{ title: 'x' }] })
  // no language tag
  expect(
    extractStructuredOutput([{ type: 'text', text: '```\n{"a":1}\n```' }]),
  ).toEqual({ a: 1 })
})

test('extractStructuredOutput: nested object (bracket-balanced scan; legacy indexOf/lastIndexOf would cross-block concat)', () => {
  const text = 'Result: {"outer":{"inner":{"deep":true}},"n":3} trailing'
  expect(extractStructuredOutput([{ type: 'text', text }])).toEqual({
    outer: { inner: { deep: true } },
    n: 3,
  })
})

test('extractStructuredOutput: brackets inside strings are not counted as pairing', () => {
  // } inside a string does not zero out depth, scan can skip to the real pairing }
  const text = '{"note":"this } char is in a string","ok":true}'
  expect(extractStructuredOutput([{ type: 'text', text }])).toEqual({
    note: 'this } char is in a string',
    ok: true,
  })
})

test('extractStructuredOutput: escaped quotes do not break string boundary', () => {
  const text = '{"escaped":"he said \\"hi\\"","n":1}'
  expect(extractStructuredOutput([{ type: 'text', text }])).toEqual({
    escaped: 'he said "hi"',
    n: 1,
  })
})

test('extractStructuredOutput: multiple JSON blocks → return first parse success', () => {
  // first one unbalanced (no pairing }), skip to the second
  const text = 'broken { stuff\n{"real":1}\n{"ignored":2}'
  expect(extractStructuredOutput([{ type: 'text', text }])).toEqual({ real: 1 })
})

test('extractStructuredOutput: array / number / string / null do not count as object', () => {
  expect(
    extractStructuredOutput([{ type: 'text', text: '[1,2,3]' }]),
  ).toBeNull()
  expect(extractStructuredOutput([{ type: 'text', text: '42' }])).toBeNull()
  expect(
    extractStructuredOutput([{ type: 'text', text: '"raw string"' }]),
  ).toBeNull()
  expect(extractStructuredOutput([{ type: 'text', text: 'null' }])).toBeNull()
})

test('extractStructuredOutput: multiple text blocks → cross-block find first success', () => {
  expect(
    extractStructuredOutput([
      { type: 'text', text: 'no json' },
      { type: 'text', text: '```json\n{"k":"v"}\n```' },
    ]),
  ).toEqual({ k: 'v' })
})

test('extractStructuredOutput: broken JSON returns null (does not throw)', () => {
  expect(
    extractStructuredOutput([
      { type: 'text', text: '{broken: missing quotes}' },
    ]),
  ).toBeNull()
  expect(
    extractStructuredOutput([{ type: 'text', text: '{"a":1,}' }]), // trailing comma — no syntax repair
  ).toBeNull()
})
