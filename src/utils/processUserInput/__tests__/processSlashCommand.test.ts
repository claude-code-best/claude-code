import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { QueuedCommand } from '../../../types/textInputTypes'
import {
  resetStateForTests,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from '../../../bootstrap/state'
import {
  createAutonomyQueuedPrompt,
  getAutonomyRunById,
  listAutonomyRuns,
  markAutonomyRunRunning,
} from '../../autonomyRuns'
import { resetAutonomyAuthorityForTests } from '../../autonomyAuthority'
import { createScheduledTaskQueuedCommand } from '../../../hooks/useScheduledTasks'
import {
  cleanupTempDir,
  createTempDir,
} from '../../../../tests/mocks/file-system'

let runAgentBlocker: Promise<void> | null = null
let releaseRunAgentBlocker: (() => void) | null = null
let runAgentStartCount = 0
let originalNodeEnv: string | undefined
let originalAnthropicApiKey: string | undefined
const commandQueue: QueuedCommand[] = []

function enqueue(command: QueuedCommand): void {
  commandQueue.push({ ...command, priority: command.priority ?? 'next' })
}

function enqueuePendingNotification(command: QueuedCommand): void {
  commandQueue.push({ ...command, priority: command.priority ?? 'later' })
}

function getCommandQueue(): QueuedCommand[] {
  return [...commandQueue]
}

function hasCommandsInQueue(): boolean {
  return commandQueue.length > 0
}

function resetCommandQueue(): void {
  commandQueue.length = 0
}

function createMessageQueueManagerMock() {
  return {
    enqueue,
    enqueuePendingNotification,
    getCommandQueue,
    hasCommandsInQueue,
    resetCommandQueue,
  }
}

function holdRunAgent(): void {
  runAgentBlocker = new Promise(resolve => {
    releaseRunAgentBlocker = resolve
  })
}

function releaseRunAgent(): void {
  releaseRunAgentBlocker?.()
  runAgentBlocker = null
  releaseRunAgentBlocker = null
}

mock.module('bun:bundle', () => ({
  feature: (name: string) => name === 'KAIROS',
}))

mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js',
  () => ({
    runAgent: async function* () {
      runAgentStartCount += 1
      if (runAgentBlocker) {
        await runAgentBlocker
      }
      yield {
        type: 'assistant',
        uuid: 'assistant-1',
        timestamp: new Date().toISOString(),
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'test-model',
          content: [{ type: 'text', text: 'forked command done' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        },
      }
    },
  }),
)

mock.module('@claude-code-best/builtin-tools/tools/AgentTool/UI.js', () => ({
  AgentPromptDisplay: () => null,
  AgentResponseDisplay: () => null,
  extractLastToolInfo: () => null,
  renderGroupedAgentToolUse: () => null,
  renderToolResultMessage: () => null,
  renderToolUseErrorMessage: () => null,
  renderToolUseMessage: () => null,
  renderToolUseProgressMessage: () => null,
  renderToolUseRejectedMessage: () => null,
  renderToolUseTag: () => null,
  userFacingName: () => 'Agent',
  userFacingNameBackgroundColor: () => 'gray',
}))

mock.module('../../messageQueueManager', createMessageQueueManagerMock)
mock.module('../../messageQueueManager.js', createMessageQueueManagerMock)

const { processSlashCommand } = await import('../processSlashCommand')

let tempDir = ''

function createScheduledTaskQueuedCommandForTest(task: {
  id: string
  prompt: string
}) {
  return createScheduledTaskQueuedCommand(task, {
    rootDir: tempDir,
    currentDir: tempDir,
  })
}

async function waitForRunStatus(
  runId: string,
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const run = await getAutonomyRunById(runId, tempDir)
    if (run?.status === status) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  const run = await getAutonomyRunById(runId, tempDir)
  throw new Error(`Expected ${runId} to be ${status}, got ${run?.status}`)
}

async function waitForRunAgentStarts(expected: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (runAgentStartCount >= expected) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(
    `Expected runAgent to start ${expected} time(s), got ${runAgentStartCount}`,
  )
}

async function waitForCommandQueueLength(expected: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (getCommandQueue().length === expected) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(
    `Expected command queue length ${expected}, got ${getCommandQueue().length}`,
  )
}

beforeEach(async () => {
  tempDir = await createTempDir('process-slash-command-')
  originalNodeEnv = process.env.NODE_ENV
  originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY
  process.env.NODE_ENV = 'test'
  process.env.ANTHROPIC_API_KEY = 'test-key'
  runAgentBlocker = null
  releaseRunAgentBlocker = null
  runAgentStartCount = 0
  resetStateForTests()
  resetAutonomyAuthorityForTests()
  resetCommandQueue()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
  setCwdState(tempDir)
})

afterEach(async () => {
  releaseRunAgent()
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = originalNodeEnv
  }
  if (originalAnthropicApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey
  }
  resetStateForTests()
  resetAutonomyAuthorityForTests()
  resetCommandQueue()
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
  mock.restore()
})

describe('processSlashCommand', () => {
  const forkedCommand = {
    type: 'prompt',
    name: 'forked',
    description: 'test forked command',
    progressMessage: 'forking',
    contentLength: 0,
    source: 'builtin',
    context: 'fork',
    getPromptForCommand: async () => [
      { type: 'text', text: 'review from fork' },
    ],
  } as const

  function createContext() {
    return {
      getAppState: () => ({
        kairosEnabled: true,
        mcp: { clients: [] },
        toolPermissionContext: {
          mode: 'default',
          alwaysAllowRules: {},
        },
      }),
      options: {
        commands: [forkedCommand],
        allowBackgroundForkedSlashCommands: true,
        tools: [],
        refreshTools: () => [],
        agentDefinitions: {
          activeAgents: [{ agentType: 'general-purpose' }],
        },
      },
      setResponseLength: mock((_updater: (length: number) => number) => {}),
    } as any
  }

  test('defers autonomy completion until a KAIROS background forked command completes', async () => {
    const queued = await createAutonomyQueuedPrompt({
      basePrompt: '/forked review',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceId: 'cron-1',
    })
    expect(queued).not.toBeNull()
    const runId = queued!.autonomy!.runId
    await markAutonomyRunRunning(runId, tempDir, 100)

    const result = await processSlashCommand(
      '/forked review',
      [],
      [],
      [],
      createContext(),
      mock(() => {}),
      undefined,
      false,
      async () => ({ behavior: 'allow', updatedInput: {} }) as any,
      queued!.autonomy,
    )

    expect(result).toMatchObject({
      messages: [],
      shouldQuery: false,
      deferAutonomyCompletion: true,
    })

    await waitForRunStatus(runId, 'completed')
    await waitForCommandQueueLength(1)
    expect(getCommandQueue()).toEqual([
      expect.objectContaining({
        mode: 'prompt',
        isMeta: true,
        skipSlashCommands: true,
        value: expect.stringContaining(
          '<scheduled-task-result command="/forked">',
        ),
      }),
    ])
  })

  test('keeps repeated /loop scheduled fires bounded while a background fork is running', async () => {
    const task = {
      id: 'cron-loop',
      prompt: '/forked review',
    }
    const first = await createScheduledTaskQueuedCommandForTest(task)
    expect(first?.autonomy?.runId).toBeDefined()
    const runId = first!.autonomy!.runId
    await markAutonomyRunRunning(runId, tempDir, 100)

    holdRunAgent()
    const result = await processSlashCommand(
      '/forked review',
      [],
      [],
      [],
      createContext(),
      mock(() => {}),
      undefined,
      false,
      async () => ({ behavior: 'allow', updatedInput: {} }) as any,
      first!.autonomy,
    )

    expect(result.deferAutonomyCompletion).toBe(true)
    await waitForRunAgentStarts(1)

    const repeatedFires = await Promise.all(
      Array.from({ length: 200 }, () =>
        createScheduledTaskQueuedCommandForTest(task),
      ),
    )
    expect(repeatedFires.every(command => command === null)).toBe(true)
    expect(
      (await listAutonomyRuns(tempDir)).filter(
        run => run.sourceId === 'cron-loop',
      ),
    ).toHaveLength(1)
    expect(getCommandQueue()).toHaveLength(0)

    releaseRunAgent()
    await waitForRunStatus(runId, 'completed')
    await waitForCommandQueueLength(1)
    expect(getCommandQueue()).toHaveLength(1)

    const next = await createScheduledTaskQueuedCommandForTest(task)
    expect(next?.autonomy?.runId).toBeDefined()
    expect(
      (await listAutonomyRuns(tempDir)).filter(
        run => run.sourceId === 'cron-loop',
      ),
    ).toHaveLength(2)
  })

  test('rejects the background fork test override outside test runtime', async () => {
    process.env.NODE_ENV = 'production'

    const result = await processSlashCommand(
      '/forked review',
      [],
      [],
      [],
      createContext(),
      mock(() => {}),
      undefined,
      false,
      async () => ({ behavior: 'allow', updatedInput: {} }) as any,
    )

    expect(result.shouldQuery).toBe(false)
    expect(
      result.messages.some(message =>
        JSON.stringify(message).includes(
          'allowBackgroundForkedSlashCommands is test-only',
        ),
      ),
    ).toBe(true)
    expect(runAgentStartCount).toBe(0)
  })
})
