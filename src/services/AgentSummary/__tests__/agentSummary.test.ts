import { beforeEach, describe, expect, test } from 'bun:test'
import { asAgentId } from '../../../types/ids.js'
import type { Message } from '../../../types/message.js'
import type {
  CacheSafeParams,
  ForkedAgentResult,
} from '../../../utils/forkedAgent.js'
import {
  type AgentSummaryDependencies,
  startAgentSummarization,
} from '../agentSummary.js'

const transcriptMessages = [
  { type: 'user', message: { content: 'start' }, uuid: 'u1' },
  {
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'working' }] },
    uuid: 'a1',
  },
  { type: 'user', message: { content: 'continue' }, uuid: 'u2' },
] as unknown as Message[]

type ForkCall = {
  cacheSafeParams: CacheSafeParams
}

describe('startAgentSummarization', () => {
  let scheduled: (() => void | Promise<void>) | undefined
  let handle: { stop: () => void } | undefined
  let forkCalls: ForkCall[]
  let updateCalls: Array<{ taskId: string; summary: string }>
  let transcriptMessagesForTest: Message[]
  let debugLogs: string[]
  let loggedErrors: Error[]
  let clearedHandles: unknown[]
  let scheduledCount: number
  let lastTimerHandle: unknown

  function startTestSummarization(
    dependencies: AgentSummaryDependencies = {},
  ): { stop: () => void } {
    return startAgentSummarization(
      'task-1',
      asAgentId('a0000000000000000'),
      {
        forkContextMessages: [
          { type: 'user', message: { content: 'stale' }, uuid: 'old' },
        ],
        model: 'claude-test',
      } as unknown as CacheSafeParams,
      () => undefined,
      {
        clearTimeout: ((timeoutId: unknown) => {
          clearedHandles.push(timeoutId)
        }) as typeof clearTimeout,
        getAgentTranscript: async () => ({
          messages: transcriptMessagesForTest,
          contentReplacements: [],
        }),
        isPoorModeActive: () => false,
        logError: error => {
          loggedErrors.push(
            error instanceof Error ? error : new Error(String(error)),
          )
        },
        logForDebugging: message => {
          debugLogs.push(message)
        },
        runForkedAgent: async (args: ForkCall) => {
          forkCalls.push(args)
          return {
            messages: [
              {
                type: 'assistant',
                message: {
                  content: [{ type: 'text', text: 'Reading udsClient.ts' }],
                },
              },
            ],
          } as unknown as ForkedAgentResult
        },
        setTimeout: ((callback: TimerHandler) => {
          if (typeof callback !== 'function') {
            throw new Error('Expected timer callback')
          }
          scheduledCount += 1
          scheduled = callback as () => void | Promise<void>
          lastTimerHandle = { id: scheduledCount }
          return lastTimerHandle as ReturnType<typeof setTimeout>
        }) as unknown as typeof setTimeout,
        updateAgentSummary: (taskId: string, summary: string) => {
          updateCalls.push({ taskId, summary })
        },
        ...dependencies,
      },
    )
  }

  beforeEach(() => {
    forkCalls = []
    updateCalls = []
    scheduled = undefined
    handle = undefined
    transcriptMessagesForTest = transcriptMessages
    debugLogs = []
    loggedErrors = []
    clearedHandles = []
    scheduledCount = 0
    lastTimerHandle = undefined
  })

  function expectDebugLogContaining(fragment: string): void {
    expect(debugLogs.some(message => message.includes(fragment))).toBe(true)
  }

  test('summarizes bounded transcript once and skips unchanged fingerprints', async () => {
    handle = startTestSummarization()

    expect(typeof scheduled).toBe('function')
    await scheduled!()

    expect(forkCalls).toHaveLength(1)
    expect(updateCalls).toEqual([
      { taskId: 'task-1', summary: 'Reading udsClient.ts' },
    ])

    const forkContext = forkCalls[0].cacheSafeParams.forkContextMessages ?? []
    expect(forkContext.map(message => String(message.uuid))).toEqual([
      'u1',
      'a1',
      'u2',
    ])
    expect(forkContext.some(message => String(message.uuid) === 'old')).toBe(
      false,
    )

    await scheduled!()

    expect(forkCalls).toHaveLength(1)
    expect(updateCalls).toHaveLength(1)
    expect(loggedErrors).toEqual([])
  })

  test('skips summarization when filtering leaves too little bounded context', async () => {
    transcriptMessagesForTest = [
      { type: 'user', message: { content: 'start' }, uuid: 'u1' },
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          content: [{ type: 'tool_use', id: 'missing', name: 'Read' }],
        },
      },
      { type: 'user', message: { content: 'continue' }, uuid: 'u2' },
    ] as unknown as Message[]

    handle = startTestSummarization()

    expect(typeof scheduled).toBe('function')
    await scheduled!()

    expect(forkCalls).toEqual([])
    expect(updateCalls).toEqual([])
    expectDebugLogContaining(
      '[AgentSummary] Skipping summary for task-1: no bounded context available',
    )
  })

  test('skips summarization before building context when transcript is too short', async () => {
    transcriptMessagesForTest = transcriptMessages.slice(0, 2)
    handle = startTestSummarization()

    expect(typeof scheduled).toBe('function')
    await scheduled!()

    expect(forkCalls).toEqual([])
    expect(updateCalls).toEqual([])
    expectDebugLogContaining(
      '[AgentSummary] Skipping summary for task-1: not enough messages (2)',
    )
  })

  test('skips and reschedules while poor mode is active', async () => {
    handle = startTestSummarization({
      isPoorModeActive: () => true,
    })

    expect(typeof scheduled).toBe('function')
    const initialScheduledCount = scheduledCount
    const initialTimerHandle = lastTimerHandle
    await scheduled!()

    expect(forkCalls).toEqual([])
    expect(updateCalls).toEqual([])
    expectDebugLogContaining('[AgentSummary] Skipping summary — poor mode active')
    expect(scheduledCount).toBe(initialScheduledCount + 1)
    expect(lastTimerHandle).not.toBe(initialTimerHandle)
  })

  test('logs summary errors and schedules the next timer', async () => {
    const error = new Error('fork failed')
    handle = startTestSummarization({
      runForkedAgent: async () => {
        throw error
      },
    })

    expect(typeof scheduled).toBe('function')
    const initialScheduledCount = scheduledCount
    const initialTimerHandle = lastTimerHandle
    await scheduled!()

    expect(loggedErrors).toEqual([error])
    expect(updateCalls).toEqual([])
    expect(scheduledCount).toBe(initialScheduledCount + 1)
    expect(lastTimerHandle).not.toBe(initialTimerHandle)
  })

  test('stop clears the pending summary timer', () => {
    handle = startTestSummarization()
    const pendingHandle = lastTimerHandle

    handle.stop()

    expectDebugLogContaining('[AgentSummary] Stopping summarization for task-1')
    expect(clearedHandles).toEqual([pendingHandle])
  })
})
