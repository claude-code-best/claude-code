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

test('call returns launch message and completes in background', async () => {
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

test('inline script persists to run directory, returns real scriptPath', async () => {
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

test('missing script/name/scriptPath → returns error (does not enter background)', async () => {
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

test('script syntax error → returns validation error (does not enter background)', async () => {
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
    expect(res.data.output).toMatch(/validation failed|Error/i)
    expect(runStatus.size).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('name resolves to .claude/workflows/<name>.ts', async () => {
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

test('scriptPath resolves to file content and runs in background', async () => {
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

test('script runtime failure → onFinish routes to fail', async () => {
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

test('metadata methods: description/prompt/renderToolUseMessage', async () => {
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

test('prompt includes default concurrency 3 + AskUserQuestion guidance', async () => {
  const { ports } = mockPorts('/tmp', new Map())
  const tool = createWorkflowTool(ports)
  const p = await tool.prompt()
  expect(p).toMatch(/default is 3/i)
  expect(p).toMatch(/maxConcurrency/i)
  expect(p).toMatch(/AskUserQuestion/i)
})

test('name does not exist → returns error (does not enter background)', async () => {
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

test('workflow aborted → onFinish routes to kill', async () => {
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

test('args defensively parses when a JSON-stringified object (backward compatible with old z.string() contract)', async () => {
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
        // simulate stringified JSON sent by model under old contract
        args: '{"commit":"abc123"}',
      },
      undefined,
      undefined,
      undefined,
    )
    await new Promise(r => {
      setTimeout(r, 50)
    })
    // if args not normalized: args.commit === undefined (string has no commit property)
    // if args normalized: args.commit === 'abc123'
    expect(capturedPrompts).toContain('abc123')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('args keeps original value for non-legal JSON string without throwing', async () => {
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
        // script uses args as a string: agent(args) → agent('hello')
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
    // 'hello' is not valid JSON, should be kept as a string
    expect(capturedPrompts).toContain('hello')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('scriptPath out of bounds (resolved outside cwd) → rejected with error (prevents arbitrary file read)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const subDir = join(dir, 'sub')
    await mkdir(subDir, { recursive: true })
    // place a script outside subDir (inside dir)
    const outsideScript = join(dir, 'outside.ts')
    await writeFile(outsideScript, `return agent('x')`)
    // host.cwd = subDir, scriptPath is an absolute path outside subDir
    const { ports, runStatus } = mockPorts(subDir, new Map())
    const tool = createWorkflowTool(ports)
    const res = await tool.call(
      { scriptPath: outsideScript },
      undefined,
      undefined,
      undefined,
    )
    expect(res.data.output).toMatch(/^Error:/)
    expect(res.data.output).toMatch(/out of bounds|outside|not within/i)
    expect(runStatus.size).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('name contains ".." path segment → rejected (prevents path traversal escaping workflowDir)', async () => {
  const outer = await mkdtemp(join(tmpdir(), 'wf-outer-'))
  try {
    // place evil.ts at outer root (outside .claude/workflows)
    await writeFile(join(outer, 'evil.ts'), `return agent('x')`)
    await mkdir(join(outer, '.claude', 'workflows'), { recursive: true })
    const { ports, runStatus } = mockPorts(outer, new Map())
    const tool = createWorkflowTool(ports)
    // name = '../../evil' → after join escapes the workflows directory to outer/evil.ts
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

test('name contains path separators or is absolute → rejected', async () => {
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

test('returnValue is an object → complete (formatValue takes JSON branch)', async () => {
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
