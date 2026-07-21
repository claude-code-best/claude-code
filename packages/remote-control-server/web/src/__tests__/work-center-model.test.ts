import { describe, expect, test } from 'bun:test'
import type { SessionRuntimeState, ThreadEntry } from '../lib/types'
import {
  deriveMarkdownDocs,
  deriveReviewFiles,
  deriveRuntimeSnapshot,
  derivePublishedArtifacts,
} from '../lib/work-center-model'

function user(content = 'Implement the feature'): ThreadEntry {
  return { type: 'user_message', id: `user-${content}`, content }
}

function tool(
  id: string,
  title: string,
  status: 'running' | 'complete' | 'error' | 'waiting_for_confirmation',
  rawInput: Record<string, unknown>,
): ThreadEntry {
  return {
    type: 'tool_call',
    toolCall: { id, title, status, rawInput },
  }
}

function runtimeState(
  overrides: Partial<SessionRuntimeState> = {},
): SessionRuntimeState {
  return {
    turnState: 'running',
    turnStateSource: 'sdk',
    workerStatus: 'running',
    tasks: {},
    taskLists: {},
    toolProgress: {},
    goal: null,
    workflowRuns: {},
    namedWorkflows: [],
    workflowRunsDirectory: null,
    ...overrides,
  }
}

describe('deriveRuntimeSnapshot', () => {
  test('uses live tool events for phase, subagents, commands, and todos', () => {
    const entries: ThreadEntry[] = [
      user(),
      tool('todo', 'TodoWrite', 'complete', {
        todos: [
          {
            content: 'Inspect runtime events',
            activeForm: 'Inspecting runtime events',
            status: 'completed',
          },
          {
            content: 'Build work center',
            activeForm: 'Building work center',
            status: 'in_progress',
          },
        ],
      }),
      tool('bash', 'Bash', 'complete', { command: 'bun test' }),
      tool('agent', 'Agent', 'running', {
        name: 'runtime-audit',
        description: 'Audit runtime data',
        subagent_type: 'Explore',
        run_in_background: true,
      }),
    ]

    const runtime = deriveRuntimeSnapshot(
      entries,
      'active',
      runtimeState({
        tasks: {
          'task-agent': {
            id: 'task-agent',
            toolUseId: 'agent',
            description: 'Audit runtime data',
            taskType: 'local_agent',
            status: 'running',
            updatedAt: 100,
          },
        },
      }),
    )

    expect(runtime.phase).toBe('running_tool')
    expect(runtime.phaseLabel).toContain('Agent')
    expect(runtime.agents).toEqual([
      expect.objectContaining({
        name: 'runtime-audit',
        agentType: 'Explore',
        background: true,
        status: 'running',
      }),
    ])
    expect(runtime.commands[0]).toEqual(
      expect.objectContaining({ command: 'bun test', status: 'complete' }),
    )
    expect(runtime.plan.map(item => item.status)).toEqual([
      'completed',
      'in_progress',
    ])
  })

  test('offline session state takes precedence over historical running tools', () => {
    const runtime = deriveRuntimeSnapshot(
      [tool('agent', 'Agent', 'running', { description: 'old work' })],
      'inactive',
      runtimeState(),
    )
    expect(runtime.phase).toBe('offline')
  })

  test('uses the reported worker connection state instead of an idle session label', () => {
    const runtime = deriveRuntimeSnapshot(
      [],
      'idle',
      runtimeState({ workerStatus: 'offline', turnState: 'idle' }),
    )

    expect(runtime.phase).toBe('offline')
    expect(runtime.phaseLabel).toContain('运行端离线')
    expect(runtime.activeTools).toHaveLength(0)
  })

  test('does not report an unclosed historical tool as active after the turn is idle', () => {
    const runtime = deriveRuntimeSnapshot(
      [user(), tool('stale', 'Bash', 'running', { command: 'old command' })],
      'idle',
      runtimeState({ workerStatus: 'idle', turnState: 'idle' }),
    )

    expect(runtime.phase).toBe('idle')
    expect(runtime.activeTools).toHaveLength(0)
  })

  test('prefers the latest reported task list and does not leak a prior-turn TodoWrite plan', () => {
    const entries: ThreadEntry[] = [
      user('old turn'),
      tool('old-plan', 'TodoWrite', 'complete', {
        todos: [{ content: 'Old task', status: 'in_progress' }],
      }),
      user('new turn'),
    ]
    const withoutTaskState = deriveRuntimeSnapshot(
      entries,
      'running',
      runtimeState(),
    )
    expect(withoutTaskState.plan).toEqual([])

    const withTaskState = deriveRuntimeSnapshot(
      entries,
      'running',
      runtimeState({
        taskLists: {
          current: {
            id: 'current',
            updatedAt: 20,
            tasks: [
              {
                id: 'task-1',
                subject: 'Current task',
                activeForm: 'Working on current task',
                status: 'in_progress',
                blocks: [],
                blockedBy: [],
              },
            ],
          },
        },
      }),
    )
    expect(withTaskState.plan).toEqual([
      expect.objectContaining({
        content: 'Working on current task',
        status: 'in_progress',
      }),
    ])
  })

  test('does not label a reported foreground agent as a background task', () => {
    const entries: ThreadEntry[] = [
      user(),
      tool('agent', 'Agent', 'running', {
        description: 'Inspect foreground state',
        run_in_background: false,
      }),
    ]
    const snapshot = deriveRuntimeSnapshot(
      entries,
      'running',
      runtimeState({
        tasks: {
          foreground: {
            id: 'foreground',
            toolUseId: 'agent',
            description: 'Inspect foreground state',
            taskType: 'local_agent',
            status: 'running',
            updatedAt: 30,
          },
        },
      }),
    )

    expect(snapshot.agents[0]?.background).toBe(false)
  })
})

describe('runtime agent detail fields', () => {
  test('carries prompt, usage, and final report through to the agent entry', () => {
    const entries: ThreadEntry[] = [
      user(),
      {
        type: 'tool_call',
        toolCall: {
          id: 'agent-tool',
          title: 'Agent',
          status: 'complete',
          rawInput: {
            description: 'Audit runtime data',
            prompt: 'Explore the repo and report back.',
            subagent_type: 'Explore',
            model: 'haiku',
          },
          rawOutput: { output: '## 结论\n一切正常。' },
        },
      },
    ]

    const snapshot = deriveRuntimeSnapshot(
      entries,
      'running',
      runtimeState({
        tasks: {
          'task-1': {
            id: 'task-1',
            toolUseId: 'agent-tool',
            description: 'Audit runtime data',
            taskType: 'local_agent',
            status: 'completed',
            usage: { totalTokens: 1234, toolUses: 7, durationMs: 65000 },
            lastToolName: 'Grep',
            summary: 'Audited runtime data paths',
            startedAt: 10,
            updatedAt: 99,
          },
        },
      }),
    )

    expect(snapshot.agents[0]).toEqual(
      expect.objectContaining({
        toolUseId: 'agent-tool',
        prompt: 'Explore the repo and report back.',
        outputText: '## 结论\n一切正常。',
        usage: { totalTokens: 1234, toolUses: 7, durationMs: 65000 },
        lastToolName: 'Grep',
        summary: 'Audited runtime data paths',
        status: 'complete',
      }),
    )
  })

  test('keeps prompt and output on unreported live Agent tool calls', () => {
    const snapshot = deriveRuntimeSnapshot(
      [
        user(),
        tool('agent-live', 'Agent', 'running', {
          description: 'live agent',
          prompt: 'do the thing',
        }),
      ],
      'running',
      runtimeState(),
    )

    expect(snapshot.agents[0]).toEqual(
      expect.objectContaining({
        toolUseId: 'agent-live',
        prompt: 'do the thing',
        status: 'running',
      }),
    )
  })
})

describe('deriveMarkdownDocs', () => {
  test('captures full content from Write and marks later Edits as stale', () => {
    const entries: ThreadEntry[] = [
      tool('write-plan', 'Write', 'complete', {
        file_path: '/repo/docs/plan.md',
        content: '# 方案\n\n第一版内容',
      }),
      tool('write-notes', 'Write', 'complete', {
        file_path: '/repo/notes.markdown',
        content: '- note',
      }),
      tool('edit-plan', 'Edit', 'complete', {
        file_path: '/repo/docs/plan.md',
        old_string: '第一版内容',
        new_string: '第二版内容',
      }),
      tool('write-code', 'Write', 'complete', {
        file_path: '/repo/src/index.ts',
        content: 'export {}',
      }),
      tool('write-failed', 'Write', 'error', {
        file_path: '/repo/failed.md',
        content: 'never landed',
      }),
    ]

    const docs = deriveMarkdownDocs(entries)
    expect(docs.map(doc => doc.path)).toEqual([
      '/repo/docs/plan.md',
      '/repo/notes.markdown',
    ])
    expect(docs[0]).toEqual(
      expect.objectContaining({
        basename: 'plan.md',
        content: '# 方案\n\n第一版内容',
        stale: true,
      }),
    )
    expect(docs[1]).toEqual(
      expect.objectContaining({ basename: 'notes.markdown', stale: false }),
    )
  })

  test('registers an Edit-only markdown file with empty content', () => {
    const docs = deriveMarkdownDocs([
      tool('edit-only', 'Edit', 'complete', {
        file_path: '/repo/README.md',
        old_string: 'a',
        new_string: 'b',
      }),
    ])

    expect(docs).toEqual([
      expect.objectContaining({
        path: '/repo/README.md',
        content: '',
        stale: true,
      }),
    ])
  })

  test('a later Write replaces stale content and clears the stale flag', () => {
    const docs = deriveMarkdownDocs([
      tool('write-1', 'Write', 'complete', {
        file_path: '/repo/doc.md',
        content: 'v1',
      }),
      tool('edit-1', 'Edit', 'complete', {
        file_path: '/repo/doc.md',
        old_string: 'v1',
        new_string: 'v1.5',
      }),
      tool('write-2', 'Write', 'complete', {
        file_path: '/repo/doc.md',
        content: 'v2',
      }),
    ])

    expect(docs).toEqual([
      expect.objectContaining({ content: 'v2', stale: false }),
    ])
  })
})

describe('deriveReviewFiles', () => {
  test('groups real Edit and Write inputs by file and calculates known line changes', () => {
    const entries: ThreadEntry[] = [
      tool('edit-1', 'Edit', 'complete', {
        file_path: '/repo/src/app.ts',
        old_string: 'const oldValue = 1',
        new_string: 'const newValue = 1\nexport { newValue }',
      }),
      tool('edit-2', 'Edit', 'running', {
        file_path: '/repo/src/app.ts',
        old_string: 'export { newValue }',
        new_string: 'export default newValue',
      }),
      tool('write', 'Write', 'complete', {
        file_path: '/repo/src/new.ts',
        content: 'export const ready = true\n',
      }),
      tool('read', 'Read', 'complete', { file_path: '/repo/src/ignored.ts' }),
    ]

    const files = deriveReviewFiles(entries)
    const app = files.find(file => file.path.endsWith('/app.ts'))
    const created = files.find(file => file.path.endsWith('/new.ts'))

    expect(files).toHaveLength(2)
    expect(app).toEqual(
      expect.objectContaining({
        additions: 2,
        deletions: 1,
        status: 'complete',
      }),
    )
    expect(app?.hunks).toHaveLength(1)
    expect(created).toEqual(
      expect.objectContaining({ additions: 2, deletions: 0 }),
    )
  })
})

describe('derivePublishedArtifacts', () => {
  test('extracts the durable URL, id, expiry, and republish inputs from Artifact tool output', () => {
    const entries: ThreadEntry[] = [
      {
        type: 'tool_call',
        toolCall: {
          id: 'artifact-1',
          title: 'Artifact',
          status: 'complete',
          rawInput: {
            file_path: '/repo/report.html',
            hash: 'stable-hash',
            ttl: 30,
          },
          rawOutput: {
            output:
              'Artifact uploaded: https://artifacts.example/report (id: art-1, expires: 2026-08-11)',
          },
        },
      },
    ]

    expect(derivePublishedArtifacts(entries)).toEqual([
      expect.objectContaining({
        basename: 'report.html',
        hash: 'stable-hash',
        ttlDays: 30,
        url: 'https://artifacts.example/report',
        artifactId: 'art-1',
        expiresAt: '2026-08-11',
      }),
    ])
  })
})
