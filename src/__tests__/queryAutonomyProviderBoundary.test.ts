import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import {
  resetStateForTests,
  setCwdState,
  setOriginalCwd,
  setProjectRoot,
} from '../bootstrap/state'
import { query } from '../query'
import { getEmptyToolPermissionContext } from '../Tool'
import type { AssistantMessage } from '../types/message'
import { asSystemPrompt } from '../utils/systemPromptType'
import {
  createAssistantAPIErrorMessage,
  createUserMessage,
} from '../utils/messages'
import { cleanupTempDir, createTempDir } from '../../tests/mocks/file-system'
import {
  enqueue,
  getCommandsByMaxPriority,
  resetCommandQueue,
} from '../utils/messageQueueManager'
import { getAutonomyFlowById, listAutonomyFlows } from '../utils/autonomyFlows'
import {
  getAutonomyRunById,
  startManagedAutonomyFlowFromHeartbeatTask,
} from '../utils/autonomyRuns'

let tempDir = ''
let originalProcessCwd = ''

beforeEach(async () => {
  originalProcessCwd = process.cwd()
  tempDir = await createTempDir('query-autonomy-provider-boundary-')
  resetStateForTests()
  resetCommandQueue()
  setOriginalCwd(tempDir)
  setCwdState(tempDir)
  setProjectRoot(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  resetCommandQueue()
  if (originalProcessCwd) {
    process.chdir(originalProcessCwd)
  }
  if (tempDir) {
    let lastError: unknown
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await cleanupTempDir(tempDir)
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    if (lastError) {
      throw lastError
    }
  }
})

function createToolUseAssistantMessage(): AssistantMessage {
  return {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    requestId: undefined,
    message: {
      id: 'msg_tool_use',
      type: 'message',
      role: 'assistant',
      model: 'test-model',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      content: [
        {
          type: 'tool_use',
          id: 'toolu_provider_boundary',
          name: 'MissingBoundaryTool',
          input: {},
        },
      ],
    },
  } as unknown as AssistantMessage
}

function createToolUseContext(): any {
  let inProgressToolUseIds = new Set<string>()
  let responseLength = 0
  let appState = {
    toolPermissionContext: getEmptyToolPermissionContext(),
    fastMode: false,
    mcp: {
      tools: [],
      clients: [],
    },
    effortValue: undefined,
    advisorModel: undefined,
    sessionHooks: new Map(),
  }

  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'claude-sonnet-4-5-20250929',
      tools: [],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        allowedAgentTypes: [],
      },
    },
    abortController: new AbortController(),
    readFileState: new Map(),
    getAppState: () => appState,
    setAppState: (updater: (state: any) => any) => {
      appState = updater(appState as never)
    },
    setInProgressToolUseIDs: (updater: (state: Set<string>) => Set<string>) => {
      inProgressToolUseIds = updater(inProgressToolUseIds)
    },
    setResponseLength: (updater: (state: number) => number) => {
      responseLength = updater(responseLength)
    },
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  } as any
}

describe('query autonomy/provider boundary', () => {
  test('provider api-error messages fail a consumed autonomy run instead of advancing the flow', async () => {
    const previousDisableAttachments =
      process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
    process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = '1'
    try {
      const command = await startManagedAutonomyFlowFromHeartbeatTask({
        task: {
          name: 'provider-boundary',
          interval: '1h',
          prompt: 'Exercise provider boundary',
          steps: [
            { name: 'first', prompt: 'First provider-boundary step' },
            { name: 'second', prompt: 'Second provider-boundary step' },
          ],
        },
        rootDir: tempDir,
        currentDir: tempDir,
        priority: 'next',
      })
      expect(command).not.toBeNull()
      enqueue(command!)

      const toolUseContext = createToolUseContext()

      let callCount = 0
      const deps = {
        uuid: () => 'query-chain-id',
        microcompact: async (messages: unknown[]) => ({ messages }),
        autocompact: async () => ({
          compactionResult: undefined,
          consecutiveFailures: 0,
        }),
        callModel: async function* () {
          callCount += 1
          if (callCount === 1) {
            yield createToolUseAssistantMessage()
            return
          }
          yield createAssistantAPIErrorMessage({
            content: 'API Error: provider unavailable',
            apiError: 'api_error',
            error: new Error('provider unavailable') as never,
          })
        },
      }

      const emitted: any[] = []
      const generator = query({
        messages: [
          createUserMessage({
            content: 'start provider-boundary test',
          }),
        ],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: async (_tool, input) => ({
          behavior: 'allow',
          updatedInput: input,
        }),
        toolUseContext,
        querySource: 'sdk',
        maxTurns: 3,
        deps: deps as never,
      })
      let next = await generator.next()
      while (!next.done) {
        emitted.push(next.value)
        next = await generator.next()
      }

      const [flow] = await listAutonomyFlows(tempDir)
      const finalFlow = await getAutonomyFlowById(flow!.flowId, tempDir)
      const run = await getAutonomyRunById(command!.autonomy!.runId, tempDir)

      expect(next.value.reason).toBe('model_error')
      expect(callCount).toBe(2)
      expect(
        emitted.some(
          message =>
            message.type === 'attachment' &&
            message.attachment.type === 'queued_command',
        ),
      ).toBe(true)
      expect(run!.status).toBe('failed')
      expect(run!.error).toBe('provider api_error')
      expect(finalFlow!.status).toBe('failed')
      expect(finalFlow!.stateJson!.steps.map(step => step.status)).toEqual([
        'failed',
        'pending',
      ])
      expect(getCommandsByMaxPriority('later')).toHaveLength(0)
    } finally {
      if (previousDisableAttachments === undefined) {
        delete process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
      } else {
        process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = previousDisableAttachments
      }
    }
  })

  test('generator return cancels a consumed autonomy run instead of leaving it running', async () => {
    const previousDisableAttachments =
      process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
    process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = '1'
    try {
      const command = await startManagedAutonomyFlowFromHeartbeatTask({
        task: {
          name: 'return-boundary',
          interval: '1h',
          prompt: 'Exercise generator return boundary',
          steps: [
            { name: 'first', prompt: 'First return-boundary step' },
            { name: 'second', prompt: 'Second return-boundary step' },
          ],
        },
        rootDir: tempDir,
        currentDir: tempDir,
        priority: 'next',
      })
      expect(command).not.toBeNull()
      enqueue(command!)

      const toolUseContext = createToolUseContext()
      const deps = {
        uuid: () => 'query-chain-id',
        microcompact: async (messages: unknown[]) => ({ messages }),
        autocompact: async () => ({
          compactionResult: undefined,
          consecutiveFailures: 0,
        }),
        callModel: async function* () {
          yield createToolUseAssistantMessage()
        },
      }

      const generator = query({
        messages: [
          createUserMessage({
            content: 'start return-boundary test',
          }),
        ],
        systemPrompt: asSystemPrompt([]),
        userContext: {},
        systemContext: {},
        canUseTool: async (_tool, input) => ({
          behavior: 'allow',
          updatedInput: input,
        }),
        toolUseContext,
        querySource: 'sdk',
        maxTurns: 3,
        deps: deps as never,
      })

      let sawQueuedAttachment = false
      let next = await generator.next()
      while (!next.done) {
        const message = next.value as any
        if (
          message.type === 'attachment' &&
          message.attachment.type === 'queued_command'
        ) {
          sawQueuedAttachment = true
          await generator.return(undefined as never)
          break
        }
        next = await generator.next()
      }

      const [flow] = await listAutonomyFlows(tempDir)
      const finalFlow = await getAutonomyFlowById(flow!.flowId, tempDir)
      const run = await getAutonomyRunById(command!.autonomy!.runId, tempDir)

      expect(sawQueuedAttachment).toBe(true)
      expect(run!.status).toBe('cancelled')
      expect(finalFlow!.status).toBe('cancelled')
      expect(finalFlow!.stateJson!.steps.map(step => step.status)).toEqual([
        'cancelled',
        'cancelled',
      ])
      expect(getCommandsByMaxPriority('later')).toHaveLength(0)
    } finally {
      if (previousDisableAttachments === undefined) {
        delete process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS
      } else {
        process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS = previousDisableAttachments
      }
    }
  })
})
