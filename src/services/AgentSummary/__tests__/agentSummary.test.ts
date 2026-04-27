import { beforeEach, describe, expect, test } from 'bun:test'
import { asAgentId } from '../../../types/ids.js'
import type { Message } from '../../../types/message.js'
import type {
  CacheSafeParams,
  ForkedAgentResult,
} from '../../../utils/forkedAgent.js'
import { startAgentSummarization } from '../agentSummary.js'

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

  beforeEach(() => {
    forkCalls = []
    updateCalls = []
    scheduled = undefined
    handle = undefined
    transcriptMessagesForTest = transcriptMessages
  })

  test('summarizes bounded transcript once and skips unchanged fingerprints', async () => {
    handle = startAgentSummarization(
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
        clearTimeout: () => undefined,
        getAgentTranscript: async () => ({
          messages: transcriptMessagesForTest,
          contentReplacements: [],
        }),
        isPoorModeActive: () => false,
        logError: () => undefined,
        logForDebugging: () => undefined,
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
          scheduled = callback as () => void | Promise<void>
          return 1 as unknown as ReturnType<typeof setTimeout>
        }) as unknown as typeof setTimeout,
        updateAgentSummary: (taskId: string, summary: string) => {
          updateCalls.push({ taskId, summary })
        },
      },
    )

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
  })

  test('skips summarization when bounded context is too small', async () => {
    transcriptMessagesForTest = transcriptMessages.slice(0, 2)

    handle = startAgentSummarization(
      'task-1',
      asAgentId('a0000000000000000'),
      {
        forkContextMessages: transcriptMessages,
        model: 'claude-test',
      } as unknown as CacheSafeParams,
      () => undefined,
      {
        clearTimeout: () => undefined,
        getAgentTranscript: async () => ({
          messages: transcriptMessagesForTest,
          contentReplacements: [],
        }),
        isPoorModeActive: () => false,
        logError: () => undefined,
        logForDebugging: () => undefined,
        runForkedAgent: async (args: ForkCall) => {
          forkCalls.push(args)
          return { messages: [] } as unknown as ForkedAgentResult
        },
        setTimeout: ((callback: TimerHandler) => {
          if (typeof callback !== 'function') {
            throw new Error('Expected timer callback')
          }
          scheduled = callback as () => void | Promise<void>
          return 1 as unknown as ReturnType<typeof setTimeout>
        }) as unknown as typeof setTimeout,
        updateAgentSummary: (taskId: string, summary: string) => {
          updateCalls.push({ taskId, summary })
        },
      },
    )

    expect(typeof scheduled).toBe('function')
    await scheduled!()

    expect(forkCalls).toEqual([])
    expect(updateCalls).toEqual([])
  })
})
