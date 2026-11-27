import { afterEach, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'

// ─── Mocks ───

const noop = () => {}

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)

// sessionStorage: spread the REAL module (the createUserMessage import
// graph needs more exports, e.g. getProjectDir) and stub the fs-touching
// ones.
const realSessionStorage = await import('src/utils/sessionStorage.js')
mock.module('src/utils/sessionStorage.js', () => ({
  ...realSessionStorage,
  getAgentTranscriptPath: (id: string) => `/tmp/transcripts/${id}.jsonl`,
  recordSidechainTranscript: async () => {},
  recordQueueOperation: noop,
  writeAgentMetadata: async () => {},
}))

// diskOutput: spread the REAL module (the createUserMessage import graph
// needs more exports, e.g. DiskTaskOutput) and stub the side-effectful ones.
const realDiskOutput = await import('src/utils/task/diskOutput.js')
mock.module('src/utils/task/diskOutput.js', () => ({
  ...realDiskOutput,
  evictTaskOutput: noop,
  getTaskOutputPath: (id: string) => `/tmp/output/${id}`,
  initTaskOutputAsSymlink: async () => {},
  getTaskOutputDelta: async () => null,
}))

// Capture enqueuePendingNotification calls for verification. Spread the
// REAL module — the createUserMessage import graph needs its other exports
// (extractTextContent, isQueuedCommandEditable, ...) — and override only the
// capture point.
const enqueuedNotifications: string[] = []
const realMQM = await import('src/utils/messageQueueManager.js')
mock.module('src/utils/messageQueueManager.js', () => ({
  ...realMQM,
  enqueuePendingNotification: (cmd: any) => {
    enqueuedNotifications.push(cmd.value)
  },
}))

// bootstrap/state: spread the REAL module (importing src/utils/messages.js
// for createUserMessage pulls cwd.ts and friends, which need many more
// exports than a fixed mock list would provide) and override only what this
// test cares about.
const realBootstrapState = await import('src/bootstrap/state.js')
mock.module('src/bootstrap/state.js', () => ({
  ...realBootstrapState,
  getSdkAgentProgressSummariesEnabled: () => false,
  getSessionId: () => 'test-session-001',
  getProjectRoot: () => '/test/project',
  getIsNonInteractiveSession: () => false,
  addSlowOperation: noop,
}))

mock.module('src/services/PromptSuggestion/speculation.js', () => ({
  abortSpeculation: noop,
}))

const cleanupFns: (() => void)[] = []
mock.module('src/utils/cleanupRegistry.js', () => ({
  registerCleanup: () => noop,
}))

mock.module('src/utils/abortController.js', () => ({
  createAbortController: () => new AbortController(),
  createChildAbortController: (parent: AbortController) => {
    const ac = new AbortController()
    parent.signal.addEventListener('abort', () => ac.abort())
    return ac
  },
}))

mock.module('src/utils/task/sdkProgress.js', () => ({
  emitTaskProgress: noop,
}))

mock.module('src/utils/sdkEventQueue.js', () => ({
  enqueueSdkEvent: noop,
}))

mock.module('src/constants/xml.js', () => ({
  TASK_NOTIFICATION_TAG: 'task_notification',
  TASK_ID_TAG: 'task_id',
  TOOL_USE_ID_TAG: 'tool_use_id',
  OUTPUT_FILE_TAG: 'output_file',
  STATUS_TAG: 'status',
  SUMMARY_TAG: 'summary',
  WORKTREE_TAG: 'worktree',
  WORKTREE_PATH_TAG: 'worktree_path',
  WORKTREE_BRANCH_TAG: 'worktree_branch',
  TASK_TYPE_TAG: 'task_type',
}))

mock.module('src/services/analytics/index.js', () => ({
  logEvent: noop,
  logEventAsync: async () => {},
  stripProtoFields: (v: any) => v,
  attachAnalyticsSink: noop,
  _resetForTesting: noop,
  AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS: undefined,
}))

mock.module('src/utils/collapseReadSearch.js', () => ({
  getSearchExtraToolsOrReadInfo: () => undefined,
}))

// ─── Import after mocks ───

const {
  createProgressTracker,
  updateProgressFromMessage,
  getProgressUpdate,
  completeAgentTask,
  failAgentTask,
  killAsyncAgent,
  enqueueAgentNotification,
  registerAsyncAgent,
  updateAgentProgress,
  isLocalAgentTask,
  isPanelAgentTask,
  hasRunningPanelAgent,
  appendMessageToLocalAgent,
  queuePendingMessage,
  drainPendingMessages,
} = await import('../LocalAgentTask.js')
const { createUserMessage } = await import('src/utils/messages.js')

// ─── Helpers ───

type AppStateLike = {
  tasks: Record<string, any>
  viewingAgentTaskId?: string
  viewSelectionMode?: string
}
type SetAppStateLike = (f: (prev: AppStateLike) => AppStateLike) => void

function createSetAppState(initial: AppStateLike = { tasks: {} }): {
  setAppState: SetAppStateLike
  getState: () => AppStateLike
} {
  let state = initial
  return {
    setAppState: f => {
      state = f(state)
    },
    getState: () => state,
  }
}

function makeRunningTask(overrides: Record<string, any> = {}): any {
  return {
    id: 'test-agent-001',
    type: 'local_agent',
    status: 'running',
    description: 'Test agent',
    agentId: 'test-agent-001',
    prompt: 'do something',
    agentType: 'general-purpose',
    abortController: new AbortController(),
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
    notified: false,
    startTime: Date.now(),
    outputFile: '/tmp/output/test-agent-001',
    outputOffset: 0,
    ...overrides,
  }
}

function makeAssistantMessage(usage: any, content: any[] = []): any {
  return {
    type: 'assistant',
    message: {
      usage,
      content,
    },
  }
}

afterEach(() => {
  enqueuedNotifications.length = 0
})

// ─── Tests ───

describe('createProgressTracker', () => {
  test('returns initial state with zero counts', () => {
    const tracker = createProgressTracker()
    expect(tracker.toolUseCount).toBe(0)
    expect(tracker.latestInputTokens).toBe(0)
    expect(tracker.cumulativeOutputTokens).toBe(0)
    expect(tracker.recentActivities).toEqual([])
  })
})

describe('updateProgressFromMessage', () => {
  test('skips non-assistant messages', () => {
    const tracker = createProgressTracker()
    updateProgressFromMessage(tracker, { type: 'user', message: {} } as any)
    expect(tracker.toolUseCount).toBe(0)
    expect(tracker.latestInputTokens).toBe(0)
  })

  test('updates token counts from assistant message usage', () => {
    const tracker = createProgressTracker()
    const msg = makeAssistantMessage({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 30,
    })
    updateProgressFromMessage(tracker, msg)
    expect(tracker.latestInputTokens).toBe(150) // 100 + 20 + 30
    expect(tracker.cumulativeOutputTokens).toBe(50)
  })

  test('counts tool_use blocks and tracks recent activities', () => {
    const tracker = createProgressTracker()
    const msg = makeAssistantMessage({ input_tokens: 0, output_tokens: 0 }, [
      { type: 'tool_use', name: 'Read', input: { file_path: '/foo.ts' } },
      { type: 'text', text: 'thinking...' },
      { type: 'tool_use', name: 'Write', input: { file_path: '/bar.ts' } },
    ])
    updateProgressFromMessage(tracker, msg)
    expect(tracker.toolUseCount).toBe(2)
    expect(tracker.recentActivities).toHaveLength(2)
    expect(tracker.recentActivities[0]!.toolName).toBe('Read')
    expect(tracker.recentActivities[1]!.toolName).toBe('Write')
  })

  test('caps recentActivities at 5', () => {
    const tracker = createProgressTracker()
    for (let i = 0; i < 7; i++) {
      const msg = makeAssistantMessage({ input_tokens: 0, output_tokens: 0 }, [
        { type: 'tool_use', name: `Tool${i}`, input: {} },
      ])
      updateProgressFromMessage(tracker, msg)
    }
    expect(tracker.recentActivities).toHaveLength(5)
  })

  test('skips without usage', () => {
    const tracker = createProgressTracker()
    const msg = makeAssistantMessage(null)
    updateProgressFromMessage(tracker, msg)
    expect(tracker.latestInputTokens).toBe(0)
  })
})

describe('getProgressUpdate', () => {
  test('returns correct progress snapshot', () => {
    const tracker = createProgressTracker()
    tracker.toolUseCount = 3
    tracker.latestInputTokens = 100
    tracker.cumulativeOutputTokens = 50
    tracker.recentActivities.push({ toolName: 'Read', input: {} })

    const progress = getProgressUpdate(tracker)
    expect(progress.toolUseCount).toBe(3)
    expect(progress.tokenCount).toBe(150)
    expect(progress.lastActivity).toBeDefined()
    expect(progress.lastActivity!.toolName).toBe('Read')
  })

  test('returns undefined lastActivity when no activities', () => {
    const tracker = createProgressTracker()
    const progress = getProgressUpdate(tracker)
    expect(progress.lastActivity).toBeUndefined()
  })
})

describe('completeAgentTask', () => {
  test('transitions running task to completed', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask() },
    })

    completeAgentTask(
      {
        agentId: 'test-agent-001',
        content: [],
        totalToolUseCount: 0,
        totalDurationMs: 100,
      } as any,
      setAppState as any,
    )

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('completed')
    expect(task.endTime).toBeDefined()
    expect(task.evictAfter).toBeDefined()
  })

  test('no-op if task not running', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ status: 'completed' }) },
    })

    completeAgentTask(
      {
        agentId: 'test-agent-001',
        content: [],
        totalToolUseCount: 0,
        totalDurationMs: 100,
      } as any,
      setAppState as any,
    )

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('completed')
  })
})

describe('failAgentTask', () => {
  test('transitions running task to failed with error message', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask() },
    })

    failAgentTask('test-agent-001', 'Stream idle timeout', setAppState as any)

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('failed')
    expect(task.error).toBe('Stream idle timeout')
    expect(task.endTime).toBeDefined()
  })

  test('no-op if task not running', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ status: 'killed' }) },
    })

    failAgentTask('test-agent-001', 'error', setAppState as any)

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('killed')
    expect(task.error).toBeUndefined()
  })
})

describe('killAsyncAgent', () => {
  test('transitions running task to killed', () => {
    const ac = new AbortController()
    const cleanup = mock(() => {})
    const { setAppState, getState } = createSetAppState({
      tasks: {
        'test-agent-001': makeRunningTask({
          abortController: ac,
          unregisterCleanup: cleanup,
        }),
      },
    })

    killAsyncAgent('test-agent-001', setAppState as any)

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('killed')
    expect(ac.signal.aborted).toBe(true)
    expect(cleanup).toHaveBeenCalled()
    expect(task.abortController).toBeUndefined()
  })

  test('no-op if task not running', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ status: 'completed' }) },
    })

    killAsyncAgent('test-agent-001', setAppState as any)

    const task = getState().tasks['test-agent-001']
    expect(task.status).toBe('completed')
  })
})

describe('enqueueAgentNotification', () => {
  test('enqueues completed notification with correct XML format', () => {
    const { setAppState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ notified: false }) },
    })

    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'refactor auth',
      status: 'completed',
      setAppState: setAppState as any,
      finalMessage: 'Done!',
      usage: { totalTokens: 5000, toolUses: 3, durationMs: 10000 },
    })

    expect(enqueuedNotifications).toHaveLength(1)
    expect(enqueuedNotifications[0]).toContain('<task_notification>')
    expect(enqueuedNotifications[0]).toContain(
      '<task_id>test-agent-001</task_id>',
    )
    expect(enqueuedNotifications[0]).toContain('<status>completed</status>')
    // Official 2.1.330 (m60): completion notice renders as
    // `⏺ Agent "<task>" finished · 3s` — UserAgentNotificationMessage
    // prefixes the ⏺, so the summary carries "finished" + run duration.
    expect(enqueuedNotifications[0]).toContain(
      'Agent "refactor auth" finished · 10s',
    )
    expect(enqueuedNotifications[0]).toContain('<result>Done!</result>')
    expect(enqueuedNotifications[0]).toContain(
      '<total_tokens>5000</total_tokens>',
    )
  })

  test('enqueues failed notification with error', () => {
    const { setAppState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ notified: false }) },
    })

    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'failed',
      error: 'Stream idle timeout',
      setAppState: setAppState as any,
    })

    expect(enqueuedNotifications).toHaveLength(1)
    expect(enqueuedNotifications[0]).toContain('<status>failed</status>')
    expect(enqueuedNotifications[0]).toContain(
      'Agent "test" failed: Stream idle timeout',
    )
  })

  test('enqueues killed notification', () => {
    const { setAppState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ notified: false }) },
    })

    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'killed',
      setAppState: setAppState as any,
    })

    expect(enqueuedNotifications).toHaveLength(1)
    expect(enqueuedNotifications[0]).toContain('<status>killed</status>')
    expect(enqueuedNotifications[0]).toContain('Agent "test" was stopped')
  })

  test('prevents duplicate notifications', () => {
    const { setAppState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ notified: false }) },
    })

    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'completed',
      setAppState: setAppState as any,
    })

    // Second call — notified flag already set by first call
    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'completed',
      setAppState: setAppState as any,
    })

    expect(enqueuedNotifications).toHaveLength(1)
  })

  test('skips if task already notified', () => {
    const { setAppState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ notified: true }) },
    })

    enqueueAgentNotification({
      taskId: 'test-agent-001',
      description: 'test',
      status: 'completed',
      setAppState: setAppState as any,
    })

    expect(enqueuedNotifications).toHaveLength(0)
  })
})

describe('hasRunningPanelAgent / isPanelAgentTask', () => {
  test('isPanelAgentTask excludes main-session agents', () => {
    expect(isPanelAgentTask(makeRunningTask())).toBe(true)
    expect(
      isPanelAgentTask(makeRunningTask({ agentType: 'main-session' })),
    ).toBe(false)
  })

  test('true only while a panel agent is running (gates the attention switcher)', () => {
    expect(hasRunningPanelAgent({})).toBe(false)
    expect(hasRunningPanelAgent({ a: makeRunningTask() })).toBe(true)
    // Completed agents do not gate the switcher — ↓ penetrates to history
    expect(
      hasRunningPanelAgent({ a: makeRunningTask({ status: 'completed' }) }),
    ).toBe(false)
    // main-session agents are not panel agents
    expect(
      hasRunningPanelAgent({
        a: makeRunningTask({ agentType: 'main-session' }),
      }),
    ).toBe(false)
    // Non-local_agent task types don't count
    expect(
      hasRunningPanelAgent({
        a: { type: 'local_bash', status: 'running' } as any,
      }),
    ).toBe(false)
  })
})

describe('viewing-agent message routing (onAgentSubmit local-agent branch)', () => {
  // Mirrors REPL.tsx onAgentSubmit: submitting while viewing a local agent
  // appends a fromMain-marked user message to the agent's own transcript
  // (appears in the viewed transcript with a `› From main` divider) and
  // queues the prompt — the agent processes it after the current tool round,
  // never interrupting mid-turn.
  function submitWhileViewing(
    state: { tasks: Record<string, any>; viewingAgentTaskId?: string },
    input: string,
  ): void {
    const taskId = state.viewingAgentTaskId!
    const task = state.tasks[taskId]
    if (task.status === 'running') {
      queuePendingMessage(taskId, input, (f: (prev: any) => any) => {
        Object.assign(state, f(state))
      })
    }
    appendMessageToLocalAgent(
      taskId,
      createUserMessage({ content: input, fromMain: true }) as any,
      (f: (prev: any) => any) => {
        Object.assign(state, f(state))
      },
    )
  }

  test('submit while viewing appends a fromMain user message to the agent transcript', () => {
    const state = {
      tasks: { 'test-agent-001': makeRunningTask() },
      viewingAgentTaskId: 'test-agent-001',
    }

    submitWhileViewing(state, 'focus on the second paragraph')

    const task = state.tasks['test-agent-001']
    expect(task.messages).toHaveLength(1)
    expect(task.messages[0].type).toBe('user')
    // fromMain marker — renders as `› From main` in the viewed transcript
    expect(task.messages[0].fromMain).toBe(true)
    // createUserMessage keeps string content as-is
    expect(task.messages[0].message.content).toBe(
      'focus on the second paragraph',
    )
  })

  test('running agent: prompt is queued and drained at the tool-round boundary', () => {
    const state = {
      tasks: { 'test-agent-001': makeRunningTask() },
      viewingAgentTaskId: 'test-agent-001',
    }

    submitWhileViewing(state, 'focus on the second paragraph')

    const task = state.tasks['test-agent-001']
    // Queued, not interrupting: agent processes it after the current tool round
    expect(task.pendingMessages).toEqual(['focus on the second paragraph'])

    // drainPendingMessages drains the queue exactly once at the boundary
    const drained = drainPendingMessages(
      'test-agent-001',
      () => state as any,
      (f: (prev: any) => any) => {
        Object.assign(state, f(state))
      },
    )
    expect(drained).toEqual(['focus on the second paragraph'])
    expect(state.tasks['test-agent-001'].pendingMessages).toEqual([])
  })

  test('the message stays in the agent transcript — main transcript untouched', () => {
    const state = {
      tasks: { 'test-agent-001': makeRunningTask() },
      viewingAgentTaskId: 'test-agent-001',
      mainMessages: [{ type: 'user', message: { content: 'original' } }],
    }
    const mainBefore = state.mainMessages.slice()

    submitWhileViewing(state, 'steer the agent')

    // Routed into the agent's own message flow, not the main transcript
    expect(state.tasks['test-agent-001'].messages).toHaveLength(1)
    expect(state.mainMessages).toEqual(mainBefore)
  })
})

describe('viewing auto-exit when the viewed agent ends (official 2.1.330 L931040)', () => {
  test('completeAgentTask clears viewingAgentTaskId and releases the task', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: {
        'test-agent-001': makeRunningTask({
          retain: true,
          messages: [{ type: 'user' }],
        }),
      },
      viewingAgentTaskId: 'test-agent-001',
      viewSelectionMode: 'viewing-agent',
    } as any)

    completeAgentTask(
      {
        agentId: 'test-agent-001',
        content: [],
        totalToolUseCount: 0,
        totalDurationMs: 100,
      } as any,
      setAppState as any,
    )

    // Back to the main session
    expect(getState().viewingAgentTaskId).toBeUndefined()
    expect(getState().viewSelectionMode).toBe('none')
    // Task released back to stub form: retain dropped, messages cleared,
    // panel eviction scheduled
    const task = getState().tasks['test-agent-001'] as any
    expect(task.retain).toBe(false)
    expect(task.messages).toBeUndefined()
    expect(task.evictAfter).toBeDefined()
  })

  test('failAgentTask clears viewingAgentTaskId too', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: { 'test-agent-001': makeRunningTask({ retain: true }) },
      viewingAgentTaskId: 'test-agent-001',
      viewSelectionMode: 'viewing-agent',
    } as any)

    failAgentTask('test-agent-001', 'boom', setAppState as any)

    expect(getState().viewingAgentTaskId).toBeUndefined()
    expect(getState().viewSelectionMode).toBe('none')
    expect((getState().tasks['test-agent-001'] as any).retain).toBe(false)
  })

  test('a DIFFERENT agent ending does not steal the view', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: {
        'test-agent-001': makeRunningTask({ retain: true }),
        'other-agent': makeRunningTask({
          agentId: 'other-agent',
          id: 'other-agent',
        }),
      },
      viewingAgentTaskId: 'test-agent-001',
      viewSelectionMode: 'viewing-agent',
    } as any)

    completeAgentTask(
      {
        agentId: 'other-agent',
        content: [],
        totalToolUseCount: 0,
        totalDurationMs: 100,
      } as any,
      setAppState as any,
    )

    expect(getState().viewingAgentTaskId).toBe('test-agent-001')
    expect(getState().viewSelectionMode).toBe('viewing-agent')
  })
})

describe('isLocalAgentTask', () => {
  test('returns true for local_agent type', () => {
    expect(isLocalAgentTask(makeRunningTask())).toBe(true)
  })

  test('returns false for other types', () => {
    expect(isLocalAgentTask({ type: 'local_bash' })).toBe(false)
  })

  test('returns false for null/undefined', () => {
    expect(isLocalAgentTask(null)).toBe(false)
    expect(isLocalAgentTask(undefined)).toBe(false)
  })
})

describe('updateAgentProgress', () => {
  test('updates progress while preserving summary', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: {
        'test-agent-001': makeRunningTask({
          progress: { summary: 'Working on auth' },
        }),
      },
    })

    updateAgentProgress(
      'test-agent-001',
      {
        toolUseCount: 5,
        tokenCount: 1000,
        lastActivity: { toolName: 'Write', input: {} },
      },
      setAppState as any,
    )

    const task = getState().tasks['test-agent-001']
    expect(task.progress.toolUseCount).toBe(5)
    expect(task.progress.tokenCount).toBe(1000)
    expect(task.progress.summary).toBe('Working on auth')
  })

  test('no-op if task not running', () => {
    const { setAppState, getState } = createSetAppState({
      tasks: {
        'test-agent-001': makeRunningTask({
          status: 'completed',
          progress: {},
        }),
      },
    })

    updateAgentProgress(
      'test-agent-001',
      { toolUseCount: 5, tokenCount: 1000 },
      setAppState as any,
    )

    const task = getState().tasks['test-agent-001']
    expect(task.progress.toolUseCount).toBeUndefined()
  })
})
