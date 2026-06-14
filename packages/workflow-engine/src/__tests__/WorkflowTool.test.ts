import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkflowTool } from '../tool/WorkflowTool.js'
import { createHostHandle, type WorkflowPorts } from '../ports.js'
import type { AgentRunParams, AgentRunResult, ProgressEvent } from '../types.js'

function mockPorts(
  runsDir: string,
  results: Map<string, AgentRunResult>,
): {
  ports: WorkflowPorts
  events: ProgressEvent[]
  runStatus: Map<string, string>
} {
  const events: ProgressEvent[] = []
  const runStatus = new Map<string, string>()
  const ports: WorkflowPorts = {
    agentRunner: {
      runAgentToResult: async (p: AgentRunParams) =>
        results.get(p.prompt) ?? { kind: 'dead' },
    },
    progressEmitter: { emit: e => void events.push(e) },
    taskRegistrar: {
      register: () => ({
        runId: 'run-x',
        signal: new AbortController().signal,
      }),
      complete: id => void runStatus.set(id, 'completed'),
      fail: id => void runStatus.set(id, 'failed'),
      kill: id => void runStatus.set(id, 'killed'),
      pendingAction: () => null,
    },
    journalStore: {
      read: async () => [],
      append: async () => {},
      truncate: async () => {},
    },
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({
      handle: createHostHandle(null),
      cwd: runsDir,
      budgetTotal: null,
    }),
  }
  return { ports, events, runStatus }
}

test('call 返回 launch 消息并在后台完成', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const { ports, runStatus } = mockPorts(
      dir,
      new Map([
        ['compute', { kind: 'ok', output: '42', usage: { outputTokens: 1 } }],
      ]),
    )
    const tool = createWorkflowTool(ports)
    const res = await tool.call(
      { script: `return agent('compute')` },
      undefined,
      undefined,
      undefined,
    )
    expect(res.data.output).toContain('run_id: run-x')
    await new Promise(r => {
      setTimeout(r, 50)
    })
    expect(runStatus.get('run-x')).toBe('completed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('inline script 持久化到 run 目录，返回真实 scriptPath', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const { ports } = mockPorts(
      dir,
      new Map([['x', { kind: 'ok', output: 'x', usage: { outputTokens: 1 } }]]),
    )
    const tool = createWorkflowTool(ports)
    const res = await tool.call(
      { script: `return agent('x')` },
      undefined,
      undefined,
      undefined,
    )
    const expectedPath = join(
      dir,
      '.claude',
      'workflow-runs',
      'run-x',
      'script.js',
    )
    expect(res.data.output).toContain(expectedPath)
    expect(await readFile(expectedPath, 'utf-8')).toBe(`return agent('x')`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('缺少 script/name/scriptPath → 返回错误（不进后台）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const { ports, runStatus } = mockPorts(dir, new Map())
    const tool = createWorkflowTool(ports)
    const res = await tool.call({}, undefined, undefined, undefined)
    expect(res.data.output).toMatch(/^Error:/)
    expect(runStatus.size).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('脚本语法错 → 返回校验错误（不进后台）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const { ports, runStatus } = mockPorts(dir, new Map())
    const tool = createWorkflowTool(ports)
    const res = await tool.call(
      { script: `return ((` },
      undefined,
      undefined,
      undefined,
    )
    expect(res.data.output).toMatch(/校验失败|Error/)
    expect(runStatus.size).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('name 解析到 .claude/workflows/<name>.ts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    await mkdir(join(dir, '.claude', 'workflows'), { recursive: true })
    await writeFile(
      join(dir, '.claude', 'workflows', 'release.ts'),
      `return agent('compute')`,
    )
    const { ports, runStatus } = mockPorts(
      dir,
      new Map([
        ['compute', { kind: 'ok', output: 'done', usage: { outputTokens: 1 } }],
      ]),
    )
    const tool = createWorkflowTool(ports)
    const res = await tool.call(
      { name: 'release' },
      undefined,
      undefined,
      undefined,
    )
    expect(res.data.output).toContain('run_id')
    await new Promise(r => {
      setTimeout(r, 50)
    })
    expect(runStatus.get('run-x')).toBe('completed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('renderToolUseMessage / mapToolResultToToolResultBlockParam', () => {
  const dir = '/tmp'
  const { ports } = mockPorts(dir, new Map())
  const tool = createWorkflowTool(ports)
  expect(tool.renderToolUseMessage({ name: 'release' })).toBe(
    'Workflow: release',
  )
  const block = tool.mapToolResultToToolResultBlockParam(
    { output: 'hi' },
    'tu-1',
  )
  expect(block.tool_use_id).toBe('tu-1')
  expect(block.type).toBe('tool_result')
  expect(block.content[0]!.text).toBe('hi')
})

test('scriptPath 解析到文件内容并后台执行', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const scriptFile = join(dir, 'external.ts')
    await writeFile(scriptFile, `return agent('compute')`)
    const { ports, runStatus } = mockPorts(
      dir,
      new Map([
        ['compute', { kind: 'ok', output: 'done', usage: { outputTokens: 1 } }],
      ]),
    )
    const tool = createWorkflowTool(ports)
    const res = await tool.call(
      { scriptPath: scriptFile },
      undefined,
      undefined,
      undefined,
    )
    expect(res.data.output).toContain('run_id')
    expect(res.data.output).toContain('external.ts')
    await new Promise(r => {
      setTimeout(r, 50)
    })
    expect(runStatus.get('run-x')).toBe('completed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('脚本运行时失败 → onFinish 路由到 fail', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const { ports, runStatus } = mockPorts(dir, new Map())
    const tool = createWorkflowTool(ports)
    await tool.call(
      { script: `throw new Error('boom')` },
      undefined,
      undefined,
      undefined,
    )
    await new Promise(r => {
      setTimeout(r, 50)
    })
    expect(runStatus.get('run-x')).toBe('failed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('元数据方法：description/prompt/renderToolUseMessage', async () => {
  const { ports } = mockPorts('/tmp', new Map())
  const tool = createWorkflowTool(ports)
  expect(tool.isEnabled()).toBe(true)
  expect(tool.isReadOnly({})).toBe(false)
  expect(await tool.description()).toBeTruthy()
  expect(await tool.prompt()).toContain('Workflow')
  expect(tool.renderToolUseMessage({})).toBe('Workflow: unknown')
  expect(tool.renderToolUseMessage({ resumeFromRunId: 'r1' })).toBe(
    'Workflow resume: r1',
  )
})

test('prompt 包含默认并发 3 + AskUserQuestion 指引', async () => {
  const { ports } = mockPorts('/tmp', new Map())
  const tool = createWorkflowTool(ports)
  const p = await tool.prompt()
  expect(p).toMatch(/default is 3/i)
  expect(p).toMatch(/maxConcurrency/i)
  expect(p).toMatch(/AskUserQuestion/i)
})

test('name 不存在 → 返回错误（不进后台）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    await mkdir(join(dir, '.claude', 'workflows'), { recursive: true })
    const { ports, runStatus } = mockPorts(dir, new Map())
    const tool = createWorkflowTool(ports)
    const res = await tool.call(
      { name: 'nope' },
      undefined,
      undefined,
      undefined,
    )
    expect(res.data.output).toMatch(/^Error:/)
    expect(runStatus.size).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('workflow 被 abort → onFinish 路由 kill', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const runStatus = new Map<string, string>()
    const ac = new AbortController()
    const ports: WorkflowPorts = {
      agentRunner: {
        runAgentToResult: async () => ({
          kind: 'ok',
          output: 'x',
          usage: { outputTokens: 1 },
        }),
      },
      progressEmitter: { emit: () => {} },
      taskRegistrar: {
        register: () => ({ runId: 'run-x', signal: ac.signal }),
        complete: id => void runStatus.set(id, 'completed'),
        fail: id => void runStatus.set(id, 'failed'),
        kill: id => void runStatus.set(id, 'killed'),
        pendingAction: () => null,
      },
      journalStore: {
        read: async () => [],
        append: async () => {},
        truncate: async () => {},
      },
      permissionGate: { isAborted: () => false },
      logger: { debug: () => {}, event: () => {} },
      hostFactory: () => ({
        handle: createHostHandle(null),
        cwd: dir,
        budgetTotal: null,
      }),
    }
    ac.abort()
    const tool = createWorkflowTool(ports)
    await tool.call(
      { script: `return agent('x')` },
      undefined,
      undefined,
      undefined,
    )
    await new Promise(r => {
      setTimeout(r, 50)
    })
    expect(runStatus.get('run-x')).toBe('killed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('args 为 JSON 字符串化的对象时防御性 parse（向后兼容旧 z.string() 契约）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const capturedPrompts: unknown[] = []
    const ports: WorkflowPorts = {
      agentRunner: {
        runAgentToResult: async (p: AgentRunParams) => {
          capturedPrompts.push(p.prompt)
          return { kind: 'ok', output: 'done', usage: { outputTokens: 1 } }
        },
      },
      progressEmitter: { emit: () => {} },
      taskRegistrar: {
        register: () => ({
          runId: 'run-x',
          signal: new AbortController().signal,
        }),
        complete: () => {},
        fail: () => {},
        kill: () => {},
        pendingAction: () => null,
      },
      journalStore: {
        read: async () => [],
        append: async () => {},
        truncate: async () => {},
      },
      permissionGate: { isAborted: () => false },
      logger: { debug: () => {}, event: () => {} },
      hostFactory: () => ({
        handle: createHostHandle(null),
        cwd: dir,
        budgetTotal: null,
      }),
    }
    const tool = createWorkflowTool(ports)
    await tool.call(
      {
        script: `return agent(args.commit)`,
        // 模拟旧契约下模型发送的字符串化 JSON
        args: '{"commit":"abc123"}',
      },
      undefined,
      undefined,
      undefined,
    )
    await new Promise(r => {
      setTimeout(r, 50)
    })
    // 若 args 未归一化：args.commit === undefined（string 上无 commit 属性）
    // 若 args 归一化：args.commit === 'abc123'
    expect(capturedPrompts).toContain('abc123')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('args 为非合法 JSON 字符串时保持原值不抛', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const capturedPrompts: unknown[] = []
    const ports: WorkflowPorts = {
      agentRunner: {
        runAgentToResult: async (p: AgentRunParams) => {
          capturedPrompts.push(p.prompt)
          return { kind: 'ok', output: 'ok', usage: { outputTokens: 1 } }
        },
      },
      progressEmitter: { emit: () => {} },
      taskRegistrar: {
        register: () => ({
          runId: 'run-x',
          signal: new AbortController().signal,
        }),
        complete: () => {},
        fail: () => {},
        kill: () => {},
        pendingAction: () => null,
      },
      journalStore: {
        read: async () => [],
        append: async () => {},
        truncate: async () => {},
      },
      permissionGate: { isAborted: () => false },
      logger: { debug: () => {}, event: () => {} },
      hostFactory: () => ({
        handle: createHostHandle(null),
        cwd: dir,
        budgetTotal: null,
      }),
    }
    const tool = createWorkflowTool(ports)
    await tool.call(
      {
        // 脚本把 args 当字符串用：agent(args) → agent('hello')
        script: `return agent(args)`,
        args: 'hello',
      },
      undefined,
      undefined,
      undefined,
    )
    await new Promise(r => {
      setTimeout(r, 50)
    })
    // 'hello' 不是合法 JSON，应保持为字符串
    expect(capturedPrompts).toContain('hello')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('scriptPath 越界（resolve 后在 cwd 之外）→ 拒绝并报错（防任意文件读）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const subDir = join(dir, 'sub')
    await mkdir(subDir, { recursive: true })
    // 在 subDir 之外（dir 内）放置一个脚本
    const outsideScript = join(dir, 'outside.ts')
    await writeFile(outsideScript, `return agent('x')`)
    // host.cwd = subDir，scriptPath 是 subDir 外的绝对路径
    const { ports, runStatus } = mockPorts(subDir, new Map())
    const tool = createWorkflowTool(ports)
    const res = await tool.call(
      { scriptPath: outsideScript },
      undefined,
      undefined,
      undefined,
    )
    expect(res.data.output).toMatch(/^Error:/)
    expect(res.data.output).toMatch(/越界|外|outside|contain/i)
    expect(runStatus.size).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('name 含 ".." 路径段 → 拒绝（防路径遍历逃出 workflowDir）', async () => {
  const outer = await mkdtemp(join(tmpdir(), 'wf-outer-'))
  try {
    // 在 outer 根下放置 evil.ts（在 .claude/workflows 之外）
    await writeFile(join(outer, 'evil.ts'), `return agent('x')`)
    await mkdir(join(outer, '.claude', 'workflows'), { recursive: true })
    const { ports, runStatus } = mockPorts(outer, new Map())
    const tool = createWorkflowTool(ports)
    // name = '../../evil' → join 后逃离 workflows 目录到 outer/evil.ts
    const res = await tool.call(
      { name: '../../evil' },
      undefined,
      undefined,
      undefined,
    )
    expect(res.data.output).toMatch(/^Error:/)
    expect(runStatus.size).toBe(0)
  } finally {
    await rm(outer, { recursive: true, force: true })
  }
})

test('name 含路径分隔符或为绝对路径 → 拒绝', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    await mkdir(join(dir, '.claude', 'workflows'), { recursive: true })
    const { ports } = mockPorts(dir, new Map())
    const tool = createWorkflowTool(ports)
    for (const badName of ['foo/bar', '/etc/passwd', '..', '.']) {
      const res = await tool.call(
        { name: badName },
        undefined,
        undefined,
        undefined,
      )
      expect(res.data.output).toMatch(/^Error:/)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('returnValue 为对象 → complete（formatValue 走 JSON 分支）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const { ports, runStatus } = mockPorts(
      dir,
      new Map([['x', { kind: 'ok', output: 'x', usage: { outputTokens: 1 } }]]),
    )
    const tool = createWorkflowTool(ports)
    await tool.call(
      {
        script: `await agent('x')\nreturn { ok: true, n: 1 }`,
      },
      undefined,
      undefined,
      undefined,
    )
    await new Promise(r => {
      setTimeout(r, 50)
    })
    expect(runStatus.get('run-x')).toBe('completed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
