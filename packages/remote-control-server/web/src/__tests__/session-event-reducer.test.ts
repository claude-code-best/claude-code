import { describe, expect, test } from 'bun:test'
import {
  createSessionEventState,
  reduceSessionEvent,
} from '../lib/session-event-reducer'
import type { SessionEvent } from '../types'

function event(
  seqNum: number,
  type: string,
  direction: SessionEvent['direction'],
  content: string,
  uuid?: string,
  id = `event-${seqNum}`,
): SessionEvent {
  return {
    id,
    sessionId: 'session-1',
    type,
    payload: {
      content,
      ...(uuid ? { uuid } : {}),
    },
    direction,
    seqNum,
    createdAt: 1_700_000_000_000 + seqNum,
  }
}

function eventWithPayload(
  seqNum: number,
  type: string,
  direction: SessionEvent['direction'],
  payload: SessionEvent['payload'],
  id = `event-${seqNum}`,
): SessionEvent {
  return {
    id,
    sessionId: 'session-1',
    type,
    payload,
    direction,
    seqNum,
    createdAt: 1_700_000_000_000 + seqNum,
  }
}

function userContents(events: SessionEvent[]): string[] {
  const state = events.reduce(reduceSessionEvent, createSessionEventState())
  return state.entries
    .filter(entry => entry.type === 'user_message')
    .map(entry => entry.content)
}

describe('session event reducer', () => {
  test('creates an empty deterministic state', () => {
    const first = createSessionEventState()
    const second = createSessionEventState()

    expect(first.entries).toEqual([])
    expect([...first.seenEventIds]).toEqual([])
    expect([...first.seenMessageKeys]).toEqual([])
    expect(first.highWaterSeq).toBe(0)
    expect(first.entries).not.toBe(second.entries)
    expect(first.seenEventIds).not.toBe(second.seenEventIds)
    expect(first.seenMessageKeys).not.toBe(second.seenMessageKeys)
  })

  test('folds outbound and inbound user echo per UUID without dropping unmatched users', () => {
    const events = [
      event(1, 'user', 'outbound', 'A', 'user-a'),
      event(2, 'user', 'inbound', 'A', 'user-a'),
      event(3, 'user', 'inbound', 'A', 'user-a'),
      event(4, 'user', 'outbound', 'B', 'user-b'),
    ]

    expect(userContents(events)).toEqual(['A', 'B'])
  })

  test('folds a user echo when inbound arrives before outbound', () => {
    const events = [
      event(1, 'user', 'inbound', 'A', 'user-a'),
      event(2, 'user', 'outbound', 'A', 'user-a'),
      event(3, 'user', 'inbound', 'A', 'user-a'),
    ]

    expect(userContents(events)).toEqual(['A'])
  })

  test('keeps identical text with distinct UUIDs', () => {
    const events = [
      event(1, 'user', 'outbound', 'same', 'user-a'),
      event(2, 'user', 'outbound', 'same', 'user-b'),
    ]

    expect(userContents(events)).toEqual(['same', 'same'])
  })

  test('keeps identical text without UUIDs and never creates text retry keys', () => {
    const events = [
      event(1, 'user', 'outbound', 'same'),
      event(2, 'user', 'outbound', 'same'),
    ]
    const state = events.reduce(reduceSessionEvent, createSessionEventState())

    expect(
      state.entries.filter(entry => entry.type === 'user_message'),
    ).toHaveLength(2)
    expect([...state.seenMessageKeys]).toEqual([])
  })

  test('records fresh server IDs for assistant retries without appending text twice', () => {
    const reply = event(1, 'assistant', 'inbound', 'answer', 'assistant-a')
    const state = [
      reply,
      reply,
      { ...reply, id: 'retry-event', seqNum: 2 },
    ].reduce(reduceSessionEvent, createSessionEventState())
    const assistant = state.entries.filter(
      entry => entry.type === 'assistant_message',
    )

    expect(assistant).toHaveLength(1)
    expect(assistant[0]?.chunks).toEqual([{ type: 'message', text: 'answer' }])
    expect([...state.seenEventIds]).toEqual(['event-1', 'retry-event'])
    expect([...state.seenMessageKeys]).toContain(
      'inbound:assistant:assistant-a',
    )
    expect(state.highWaterSeq).toBe(2)
  })

  test('merges legitimate assistant chunks with distinct identities', () => {
    const state = [
      event(1, 'assistant', 'inbound', 'hello ', 'assistant-chunk-1'),
      event(2, 'assistant', 'inbound', 'world', 'assistant-chunk-2'),
    ].reduce(reduceSessionEvent, createSessionEventState())
    const assistant = state.entries[state.entries.length - 1]

    expect(assistant?.type).toBe('assistant_message')
    expect(
      assistant?.type === 'assistant_message' ? assistant.id : undefined,
    ).toBe('assistant-chunk-1')
    expect(
      assistant?.type === 'assistant_message' ? assistant.chunks : [],
    ).toEqual([{ type: 'message', text: 'hello world' }])
  })

  test('accepts an unseen lower-sequence identity without lowering high water', () => {
    const state = [
      event(10, 'user', 'outbound', 'ten', 'user-ten'),
      event(4, 'user', 'outbound', 'four', 'user-four'),
    ].reduce(reduceSessionEvent, createSessionEventState())

    expect(
      state.entries
        .filter(entry => entry.type === 'user_message')
        .map(entry => entry.content),
    ).toEqual(['ten', 'four'])
    expect(state.highWaterSeq).toBe(10)
    expect([...state.seenEventIds]).toEqual(['event-10', 'event-4'])
  })

  test('does not mutate retained assistant snapshots while merging chunks', () => {
    const first = reduceSessionEvent(
      createSessionEventState(),
      event(1, 'assistant', 'inbound', 'hello ', 'assistant-1'),
    )
    const firstEntries = first.entries
    const firstEntry = first.entries[0]
    const firstEventIds = [...first.seenEventIds]
    const firstMessageKeys = [...first.seenMessageKeys]

    const second = reduceSessionEvent(
      first,
      event(2, 'assistant', 'inbound', 'world', 'assistant-2'),
    )

    expect(first.entries).toBe(firstEntries)
    expect(firstEntry?.type).toBe('assistant_message')
    expect(
      firstEntry?.type === 'assistant_message' ? firstEntry.chunks : [],
    ).toEqual([{ type: 'message', text: 'hello ' }])
    expect([...first.seenEventIds]).toEqual(firstEventIds)
    expect([...first.seenMessageKeys]).toEqual(firstMessageKeys)
    expect(second.entries).not.toBe(first.entries)
    expect(second.seenEventIds).not.toBe(first.seenEventIds)
    expect(second.seenMessageKeys).not.toBe(first.seenMessageKeys)
  })

  test('does not merge assistant text across user or tool boundaries', () => {
    const state = [
      event(1, 'assistant', 'inbound', 'first', 'assistant-1'),
      event(2, 'user', 'inbound', 'question', 'user-1'),
      event(3, 'assistant', 'inbound', 'second', 'assistant-2'),
      eventWithPayload(4, 'tool_use', 'inbound', {
        tool_call_id: 'call-1',
        tool_name: 'Read',
        tool_input: { path: '/tmp/example' },
      }),
      event(5, 'assistant', 'inbound', 'third', 'assistant-3'),
    ].reduce(reduceSessionEvent, createSessionEventState())

    expect(
      state.entries
        .filter(entry => entry.type === 'assistant_message')
        .map(entry => entry.chunks),
    ).toEqual([
      [{ type: 'message', text: 'first' }],
      [{ type: 'message', text: 'second' }],
      [{ type: 'message', text: 'third' }],
    ])
  })

  test('deduplicates embedded and standalone tool use and result phases', () => {
    const embeddedUse = eventWithPayload(1, 'assistant', 'inbound', {
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'Read',
            input: { path: '/tmp/example' },
          },
        ],
      },
    })
    const standaloneUseRetry = eventWithPayload(2, 'tool_use', 'inbound', {
      tool_call_id: 'call-1',
      tool_name: 'Read',
      tool_input: { path: '/tmp/example' },
    })
    const standaloneResult = eventWithPayload(3, 'tool_result', 'inbound', {
      raw: { tool_call_id: 'call-1', output: 'contents' },
    })
    const embeddedResultRetry = eventWithPayload(4, 'user', 'inbound', {
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call-1',
            content: 'contents',
          },
        ],
      },
    })

    const state = [
      embeddedUse,
      standaloneUseRetry,
      standaloneResult,
      embeddedResultRetry,
    ].reduce(reduceSessionEvent, createSessionEventState())
    const tools = state.entries.filter(entry => entry.type === 'tool_call')

    expect(tools).toHaveLength(1)
    expect(tools[0]?.toolCall).toEqual({
      id: 'call-1',
      title: 'Read',
      status: 'complete',
      rawInput: { path: '/tmp/example' },
      rawOutput: { output: 'contents' },
    })
    expect([...state.seenMessageKeys]).toContain('tool_use:call-1')
    expect([...state.seenMessageKeys]).toContain('tool_result:call-1')
    expect([...state.seenEventIds]).toEqual([
      'event-1',
      'event-2',
      'event-3',
      'event-4',
    ])
  })

  test('maps embedded tool result errors and leaves the prior tool snapshot immutable', () => {
    const running = reduceSessionEvent(
      createSessionEventState(),
      eventWithPayload(1, 'tool_use', 'inbound', {
        raw: {
          tool_call_id: 'call-error',
          tool_name: 'Shell',
          tool_input: { command: 'false' },
        },
      }),
    )
    const runningEntry = running.entries[0]

    const failed = reduceSessionEvent(
      running,
      eventWithPayload(2, 'user', 'inbound', {
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call-error',
              content: 'exit 1',
              is_error: true,
            },
          ],
        },
      }),
    )

    expect(runningEntry?.type).toBe('tool_call')
    expect(
      runningEntry?.type === 'tool_call' ? runningEntry.toolCall : null,
    ).toEqual({
      id: 'call-error',
      title: 'Shell',
      status: 'running',
      rawInput: { command: 'false' },
    })
    expect(failed.entries[0]?.type).toBe('tool_call')
    expect(
      failed.entries[0]?.type === 'tool_call'
        ? failed.entries[0].toolCall
        : null,
    ).toEqual({
      id: 'call-error',
      title: 'Shell',
      status: 'error',
      rawInput: { command: 'false' },
      rawOutput: { output: 'exit 1' },
    })
    expect(failed.entries).not.toBe(running.entries)
    expect(
      failed.entries[0]?.type === 'tool_call'
        ? failed.entries[0].toolCall
        : null,
    ).not.toBe(
      runningEntry?.type === 'tool_call' ? runningEntry.toolCall : null,
    )
  })

  test('ignores orphan tool results without creating a visible entry', () => {
    const state = reduceSessionEvent(
      createSessionEventState(),
      eventWithPayload(1, 'tool_result', 'inbound', {
        tool_call_id: 'missing-call',
        output: 'unused',
      }),
    )

    expect(state.entries).toEqual([])
    expect([...state.seenMessageKeys]).toContain('tool_result:missing-call')
  })

  test('ignores partial assistant events until delta semantics are defined', () => {
    const state = reduceSessionEvent(
      createSessionEventState(),
      event(1, 'partial_assistant', 'inbound', 'snapshot', 'partial-1'),
    )

    expect(state.entries).toEqual([])
    expect(state.highWaterSeq).toBe(1)
    expect([...state.seenEventIds]).toEqual(['event-1'])
  })

  test('uses the canonical event ID when a UUID is absent', () => {
    const state = [
      event(1, 'user', 'outbound', 'hello'),
      event(2, 'assistant', 'inbound', 'answer'),
    ].reduce(reduceSessionEvent, createSessionEventState())

    const user = state.entries[0]
    const assistant = state.entries[1]
    expect(user?.type === 'user_message' ? user.id : undefined).toBe('event-1')
    expect(
      assistant?.type === 'assistant_message' ? assistant.id : undefined,
    ).toBe('event-2')
  })

  test('uses sequence only as an exact-event fallback when server ID is absent', () => {
    const first = event(7, 'user', 'outbound', 'first', undefined, '')
    const replay = event(7, 'user', 'outbound', 'changed', undefined, '')
    const state = [first, replay].reduce(
      reduceSessionEvent,
      createSessionEventState(),
    )

    expect(
      state.entries.filter(entry => entry.type === 'user_message'),
    ).toHaveLength(1)
    expect([...state.seenEventIds]).toEqual(['seq:7'])
  })

  test('captures session metadata from system/init events', () => {
    const state = reduceSessionEvent(
      createSessionEventState(),
      eventWithPayload(1, 'system', 'inbound', {
        subtype: 'init',
        uuid: 'init-1',
        cwd: '/workspace/project',
        model: 'claude-sonnet-5',
        permissionMode: 'acceptEdits',
        slash_commands: ['compact', 'cost'],
        tools: ['Read', 'Edit', 'Terminal', 'TerminalRead'],
        agents: ['Explore'],
        skills: ['verify'],
        output_style: 'normal',
        claude_code_version: '2.2.1',
      }),
    )

    expect(state.sessionInfo).toEqual({
      cwd: '/workspace/project',
      model: 'claude-sonnet-5',
      permissionMode: 'acceptEdits',
      slashCommands: ['compact', 'cost'],
      tools: ['Read', 'Edit', 'Terminal', 'TerminalRead'],
      agents: ['Explore'],
      skills: ['verify'],
      outputStyle: 'normal',
      version: '2.2.1',
    })
    expect(state.entries).toEqual([])
  })

  test('parses mcp_servers and plugins from system/init events', () => {
    const state = reduceSessionEvent(
      createSessionEventState(),
      eventWithPayload(1, 'system', 'inbound', {
        subtype: 'init',
        uuid: 'init-1',
        mcp_servers: [
          { name: 'lark', status: 'connected' },
          { name: 'broken', status: 'failed' },
          { status: 'connected' }, // no name — dropped
        ],
        plugins: [
          { name: 'my-plugin', path: '/plugins/my-plugin', source: 'user' },
          { path: '/plugins/anonymous' }, // no name — dropped
        ],
      }),
    )

    expect(state.sessionInfo?.mcpServers).toEqual([
      { name: 'lark', status: 'connected' },
      { name: 'broken', status: 'failed' },
    ])
    expect(state.sessionInfo?.plugins).toEqual([
      { name: 'my-plugin', path: '/plugins/my-plugin', source: 'user' },
    ])
  })

  test('omits mcpServers and plugins when init carries none', () => {
    const state = reduceSessionEvent(
      createSessionEventState(),
      eventWithPayload(1, 'system', 'inbound', {
        subtype: 'init',
        uuid: 'init-1',
        cwd: '/workspace/project',
        mcp_servers: [],
      }),
    )

    expect(state.sessionInfo?.mcpServers).toBeUndefined()
    expect(state.sessionInfo?.plugins).toBeUndefined()
  })

  test('merges later system/init updates without dropping earlier fields', () => {
    const state = [
      eventWithPayload(1, 'system', 'inbound', {
        subtype: 'init',
        uuid: 'init-1',
        cwd: '/workspace/project',
        model: 'claude-sonnet-5',
        tools: ['Read', 'Terminal'],
      }),
      eventWithPayload(2, 'system', 'inbound', {
        subtype: 'init',
        uuid: 'init-2',
        permissionMode: 'plan',
        tools: [],
      }),
    ].reduce(reduceSessionEvent, createSessionEventState())

    expect(state.sessionInfo?.cwd).toBe('/workspace/project')
    expect(state.sessionInfo?.permissionMode).toBe('plan')
    expect(state.sessionInfo?.tools).toEqual([])
  })

  test('ignores non-init system events for session metadata', () => {
    const state = reduceSessionEvent(
      createSessionEventState(),
      eventWithPayload(1, 'system', 'inbound', {
        subtype: 'local_command',
        uuid: 'sys-1',
        content: 'ran /compact',
      }),
    )
    expect(state.sessionInfo).toBeNull()
  })

  test('folds normalized SDK task lifecycle events into runtime state', () => {
    const state = [
      eventWithPayload(1, 'system', 'inbound', {
        subtype: 'task_started',
        uuid: 'task-start',
        raw: {
          type: 'system',
          subtype: 'task_started',
          task_id: 'task-1',
          tool_use_id: 'tool-agent-1',
          description: 'Audit runtime data',
          task_type: 'local_agent',
          prompt: 'Inspect the runtime event path',
        },
      }),
      eventWithPayload(2, 'system', 'inbound', {
        subtype: 'task_progress',
        uuid: 'task-progress',
        raw: {
          type: 'system',
          subtype: 'task_progress',
          task_id: 'task-1',
          description: 'Audit runtime data',
          usage: {
            total_tokens: 1200,
            tool_uses: 4,
            duration_ms: 9500,
          },
          last_tool_name: 'Read',
          summary: 'Inspecting bridge events',
        },
      }),
      eventWithPayload(3, 'system', 'inbound', {
        subtype: 'task_notification',
        status: 'completed',
        uuid: 'task-complete',
        raw: {
          type: 'system',
          subtype: 'task_notification',
          task_id: 'task-1',
          status: 'completed',
          output_file: '/tmp/task-1.output',
          summary: 'Runtime audit complete',
        },
      }),
    ].reduce(reduceSessionEvent, createSessionEventState())

    expect(state.runtime.tasks['task-1']).toEqual({
      id: 'task-1',
      toolUseId: 'tool-agent-1',
      description: 'Audit runtime data',
      taskType: 'local_agent',
      prompt: 'Inspect the runtime event path',
      status: 'completed',
      usage: { totalTokens: 1200, toolUses: 4, durationMs: 9500 },
      lastToolName: 'Read',
      summary: 'Runtime audit complete',
      outputFile: '/tmp/task-1.output',
      workflowName: undefined,
      workflowProgress: undefined,
      startedAt: 1_700_000_000_001,
      updatedAt: 1_700_000_000_003,
    })
  })

  test('uses authoritative and durable fallback events for the main turn state', () => {
    const running = reduceSessionEvent(
      createSessionEventState(),
      event(1, 'user', 'outbound', 'start', 'user-start'),
    )
    expect(running.runtime.turnState).toBe('running')
    expect(running.runtime.turnStateSource).toBe('event_fallback')

    const requiresAction = reduceSessionEvent(
      running,
      eventWithPayload(2, 'control_request', 'inbound', {
        request_id: 'permission-1',
        request: { subtype: 'can_use_tool', tool_name: 'Bash' },
      }),
    )
    expect(requiresAction.runtime.turnState).toBe('requires_action')

    const idle = reduceSessionEvent(
      requiresAction,
      eventWithPayload(3, 'result', 'inbound', { subtype: 'success' }),
    )
    expect(idle.runtime.turnState).toBe('idle')

    const sdkRunning = reduceSessionEvent(
      idle,
      eventWithPayload(4, 'system', 'inbound', {
        subtype: 'session_state_changed',
        uuid: 'state-running',
        raw: {
          type: 'system',
          subtype: 'session_state_changed',
          state: 'running',
        },
      }),
    )
    expect(sdkRunning.runtime.turnState).toBe('running')
    expect(sdkRunning.runtime.turnStateSource).toBe('sdk')

    const workerIdle = reduceSessionEvent(
      sdkRunning,
      eventWithPayload(5, 'session_status', 'inbound', { status: 'idle' }),
    )
    expect(workerIdle.runtime.turnState).toBe('idle')
    expect(workerIdle.runtime.workerStatus).toBe('idle')

    const workerOffline = reduceSessionEvent(
      workerIdle,
      eventWithPayload(6, 'worker_status', 'inbound', { status: 'offline' }),
    )
    expect(workerOffline.runtime.turnState).toBe('idle')
    expect(workerOffline.runtime.workerStatus).toBe('offline')
  })

  test('restores and resolves pending permission requests from durable history', () => {
    const waiting = [
      eventWithPayload(1, 'tool_use', 'inbound', {
        tool_call_id: 'tool-1',
        tool_name: 'Bash',
        tool_input: { command: 'bun test' },
      }),
      eventWithPayload(2, 'control_request', 'inbound', {
        request_id: 'permission-1',
        request: {
          subtype: 'can_use_tool',
          tool_use_id: 'tool-1',
          tool_name: 'Bash',
          input: { command: 'bun test' },
        },
      }),
    ].reduce(reduceSessionEvent, createSessionEventState())

    expect(waiting.pendingPermissions['permission-1']).toEqual(
      expect.objectContaining({ toolName: 'Bash' }),
    )
    expect(waiting.entries.find(entry => entry.type === 'tool_call')).toEqual(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          status: 'waiting_for_confirmation',
        }),
      }),
    )

    const rejected = reduceSessionEvent(
      waiting,
      eventWithPayload(3, 'permission_response', 'outbound', {
        request_id: 'permission-1',
        approved: false,
      }),
    )
    expect(rejected.pendingPermissions).toEqual({})
    expect(rejected.entries.find(entry => entry.type === 'tool_call')).toEqual(
      expect.objectContaining({
        toolCall: expect.objectContaining({ status: 'rejected' }),
      }),
    )
  })

  test('captures tool progress and task-list snapshots from normalized payloads', () => {
    const state = [
      eventWithPayload(1, 'tool_progress', 'inbound', {
        uuid: 'tool-progress-1',
        tool_name: 'Bash',
        raw: {
          type: 'tool_progress',
          tool_use_id: 'tool-1',
          parent_tool_use_id: 'agent-1',
          elapsed_time_seconds: 31,
          task_id: 'task-1',
        },
      }),
      eventWithPayload(2, 'task_state', 'inbound', {
        task_list_id: 'team-list',
        tasks: [
          {
            id: '1',
            subject: 'Implement work center',
            activeForm: 'Implementing work center',
            status: 'in_progress',
            owner: 'ui-agent',
            blocks: [],
            blockedBy: [],
          },
        ],
      }),
    ].reduce(reduceSessionEvent, createSessionEventState())

    expect(state.runtime.toolProgress['agent-1']).toEqual({
      toolUseId: 'tool-1',
      toolName: 'Bash',
      parentToolUseId: 'agent-1',
      elapsedSeconds: 31,
      taskId: 'task-1',
      updatedAt: 1_700_000_000_001,
    })
    expect(state.runtime.taskLists['team-list']?.tasks[0]).toEqual(
      expect.objectContaining({
        subject: 'Implement work center',
        status: 'in_progress',
        owner: 'ui-agent',
      }),
    )
  })

  test('captures authoritative Goal and Workflow snapshots', () => {
    const state = [
      eventWithPayload(1, 'system', 'inbound', {
        subtype: 'goal_state',
        goal: {
          objective: 'Ship the runtime center',
          status: 'active',
          token_budget: 50000,
          tokens_used: 1200,
          turns_executed: 4,
          active_elapsed_ms: 30000,
          start_time: 1_700_000_000_000,
          paused_at: null,
          accumulated_active_ms: 10000,
          blocked_attempts: 0,
          last_block_reason: null,
          updated_at: 1_700_000_000_000,
        },
      }),
      eventWithPayload(2, 'system', 'inbound', {
        subtype: 'workflow_state',
        named_workflows: ['release'],
        runs_directory: '/repo/.claude/workflow-runs',
        runs: [
          {
            runId: 'run-1',
            workflowName: 'release',
            status: 'running',
            phases: [{ title: 'Test', status: 'running' }],
            declaredPhases: ['Test', 'Publish'],
            currentPhase: 'Test',
            agents: [
              {
                id: 1,
                label: 'tester',
                phase: 'Test',
                status: 'running',
                tokenCount: 20,
                toolCount: 2,
              },
            ],
            agentCount: 1,
            startedAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_001,
          },
        ],
      }),
    ].reduce(reduceSessionEvent, createSessionEventState())

    expect(state.runtime.goal).toEqual(
      expect.objectContaining({
        objective: 'Ship the runtime center',
        tokensUsed: 1200,
        turnsExecuted: 4,
      }),
    )
    expect(state.runtime.namedWorkflows).toEqual(['release'])
    expect(state.runtime.workflowRuns['run-1']).toEqual(
      expect.objectContaining({
        currentPhase: 'Test',
        agentCount: 1,
      }),
    )
  })

  test('aggregates token usage from assistant events, deduped by API message id', () => {
    const usagePayload = (uuid: string, messageId: string) => ({
      uuid,
      message: {
        id: messageId,
        model: 'claude-sonnet-5',
        content: [{ type: 'text', text: 'chunk' }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 30,
          cache_creation_input_tokens: 10,
        },
      },
    })
    const state = [
      eventWithPayload(1, 'assistant', 'inbound', usagePayload('a1', 'msg-1')),
      // Same API message split into a second event — usage must not double-count
      eventWithPayload(2, 'assistant', 'inbound', usagePayload('a2', 'msg-1')),
      eventWithPayload(3, 'assistant', 'inbound', usagePayload('a3', 'msg-2')),
    ].reduce(reduceSessionEvent, createSessionEventState())

    expect(state.usage).toEqual({
      inputTokens: 200,
      outputTokens: 100,
      cacheReadInputTokens: 60,
      cacheCreationInputTokens: 20,
      apiCalls: 2,
    })
    expect(state.lastAssistantModel).toBe('claude-sonnet-5')
  })

  test('extracts thinking blocks as thought chunks alongside text', () => {
    const state = reduceSessionEvent(
      createSessionEventState(),
      eventWithPayload(1, 'assistant', 'inbound', {
        uuid: 'a1',
        message: {
          content: [
            { type: 'thinking', thinking: 'let me reason' },
            { type: 'text', text: 'the answer' },
          ],
        },
      }),
    )

    const assistant = state.entries[0]
    expect(assistant?.type).toBe('assistant_message')
    if (assistant?.type !== 'assistant_message') return
    expect(assistant.chunks).toEqual([
      { type: 'thought', text: 'let me reason' },
      { type: 'message', text: 'the answer' },
    ])
  })
})
