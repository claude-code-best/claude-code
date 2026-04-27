import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'
import { asAgentId } from '../../../types/ids.js'
import type { CacheSafeParams } from '../../../utils/forkedAgent.js'

const transcriptMessages = [
  { type: 'user', message: { content: 'start' }, uuid: 'u1' },
  {
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'working' }] },
    uuid: 'a1',
  },
  { type: 'user', message: { content: 'continue' }, uuid: 'u2' },
]

let poorModeActive = false
let forkCalls = 0
let updateCalls: Array<{ taskId: string; summary: string }> = []
let transcript = { messages: transcriptMessages }
const sessionStorageSnapshot = {
  ...(require('../../../utils/sessionStorage.ts') as Record<string, unknown>),
}

mock.module('src/commands/poor/poorMode.js', () => ({
  isPoorModeActive: () => poorModeActive,
}))

mock.module('src/tasks/LocalAgentTask/LocalAgentTask.js', () => ({
  updateAgentSummary: (taskId: string, summary: string) => {
    updateCalls.push({ taskId, summary })
  },
}))

mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js',
  () => ({
    filterIncompleteToolCalls: <T>(messages: T) => messages,
  }),
)

mock.module('src/utils/debug.js', debugMock)
mock.module('src/utils/log.js', logMock)

mock.module('src/utils/forkedAgent.js', () => ({
  runForkedAgent: async () => {
    forkCalls += 1
    return {
      messages: [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Reading udsClient.ts' }],
          },
        },
      ],
    }
  },
}))

mock.module('src/utils/sessionStorage.js', () => ({
  ...sessionStorageSnapshot,
  getAgentTranscript: async () => transcript,
}))

afterAll(() => {
  mock.module('src/utils/sessionStorage.js', () =>
    require('../../../utils/sessionStorage.ts'),
  )
})

describe('startAgentSummarization', () => {
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  let scheduled:
    | ((...args: Parameters<TimerHandler & ((...args: unknown[]) => void)>) => void)
    | undefined

  beforeEach(() => {
    poorModeActive = false
    forkCalls = 0
    updateCalls = []
    transcript = { messages: transcriptMessages }
    scheduled = undefined
    globalThis.setTimeout = ((callback: TimerHandler) => {
      scheduled = callback as (...args: unknown[]) => void
      return 1 as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout
    globalThis.clearTimeout = (() => undefined) as typeof clearTimeout
  })

  afterEach(() => {
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
  })

  test('summarizes bounded transcript once and skips unchanged fingerprints', async () => {
    const { startAgentSummarization } = await import('../agentSummary.js')

    const handle = startAgentSummarization(
      'task-1',
      asAgentId('a0000000000000000'),
      {
        forkContextMessages: [{ type: 'user', message: { content: 'old' } }],
        model: 'claude-test',
      } as unknown as CacheSafeParams,
      () => undefined,
    )

    expect(typeof scheduled).toBe('function')
    await scheduled!()

    expect(forkCalls).toBe(1)
    expect(updateCalls).toEqual([
      { taskId: 'task-1', summary: 'Reading udsClient.ts' },
    ])

    await scheduled!()

    expect(forkCalls).toBe(1)
    expect(updateCalls).toHaveLength(1)

    handle.stop()
  })
})
