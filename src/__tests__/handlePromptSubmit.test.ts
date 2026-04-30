import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { createAbortController } from '../utils/abortController'
import { QueryGuard } from '../utils/QueryGuard'
import { handlePromptSubmit } from '../utils/handlePromptSubmit'
import {
  getCommandQueue,
  resetCommandQueue,
} from '../utils/messageQueueManager'
import { cleanupTempDir, createTempDir } from '../../tests/mocks/file-system'
import {
  createAutonomyQueuedPrompt,
  markAutonomyRunCancelled,
} from '../utils/autonomyRuns'

let tempDirs: string[] = []

function createBaseParams() {
  const queryGuard = new QueryGuard()
  queryGuard.reserve()

  return {
    queryGuard,
    helpers: {
      setCursorOffset: mock((_offset: number) => {}),
      clearBuffer: mock(() => {}),
      resetHistory: mock(() => {}),
    },
    onInputChange: mock((_value: string) => {}),
    setPastedContents: mock((_value: unknown) => {}),
    setToolJSX: mock((_value: unknown) => {}),
    getToolUseContext: mock(() => {
      throw new Error('getToolUseContext should not be called in queued path')
    }),
    messages: [],
    mainLoopModel: 'claude-sonnet-4-6',
    ideSelection: undefined,
    querySource: 'repl_main_thread' as any,
    commands: [],
    setUserInputOnProcessing: mock((_prompt?: string) => {}),
    setAbortController: mock((_abortController: AbortController | null) => {}),
    onQuery: mock(async () => true) as unknown as (
      ...args: unknown[]
    ) => Promise<boolean>,
    setAppState: mock((_updater: unknown) => {}),
  }
}

describe('handlePromptSubmit', () => {
  beforeEach(() => {
    resetCommandQueue()
    tempDirs = []
  })

  afterEach(async () => {
    for (const tempDir of tempDirs) {
      await cleanupTempDir(tempDir)
    }
  })

  test('aborts the current turn when only cancel-interrupt tools are running', async () => {
    const params = createBaseParams()
    const abortController = createAbortController()

    await handlePromptSubmit({
      ...params,
      input: 'hello',
      mode: 'prompt',
      pastedContents: {},
      abortController,
      streamMode: 'normal' as any,
      hasInterruptibleToolInProgress: true,
      isExternalLoading: false,
    })

    expect(abortController.signal.aborted).toBe(true)
    expect(abortController.signal.reason).toBe('interrupt')
    expect(getCommandQueue()).toHaveLength(1)
    expect(getCommandQueue()[0]).toMatchObject({
      value: 'hello',
      preExpansionValue: 'hello',
      mode: 'prompt',
    })
    expect(params.onInputChange).toHaveBeenCalledWith('')
  })

  test('queues the input without aborting when a blocking tool is running', async () => {
    const params = createBaseParams()
    const abortController = createAbortController()

    await handlePromptSubmit({
      ...params,
      input: 'hello',
      mode: 'prompt',
      pastedContents: {},
      abortController,
      streamMode: 'normal' as any,
      hasInterruptibleToolInProgress: false,
      isExternalLoading: false,
    })

    expect(abortController.signal.aborted).toBe(false)
    expect(getCommandQueue()).toHaveLength(1)
    expect(getCommandQueue()[0]).toMatchObject({
      value: 'hello',
      preExpansionValue: 'hello',
      mode: 'prompt',
    })
  })

  test('preserves bridgeOrigin when a remote slash command is queued during external loading', async () => {
    const params = createBaseParams()
    const abortController = createAbortController()

    await handlePromptSubmit({
      ...params,
      input: '/proactive',
      mode: 'prompt',
      pastedContents: {},
      abortController,
      streamMode: 'normal' as any,
      hasInterruptibleToolInProgress: true,
      isExternalLoading: true,
      skipSlashCommands: true,
      bridgeOrigin: true,
    })

    expect(getCommandQueue()).toHaveLength(1)
    expect(getCommandQueue()[0]).toMatchObject({
      value: '/proactive',
      preExpansionValue: '/proactive',
      mode: 'prompt',
      skipSlashCommands: true,
      bridgeOrigin: true,
    })
  })

  test('skips stale autonomy commands in the idle queued path', async () => {
    const params = createBaseParams()
    const abortController = createAbortController()
    const tempDir = await createTempDir('handle-prompt-autonomy-')
    tempDirs.push(tempDir)
    const command = await createAutonomyQueuedPrompt({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(command).not.toBeNull()
    await markAutonomyRunCancelled(command!.autonomy!.runId, tempDir)

    await handlePromptSubmit({
      ...params,
      input: '',
      mode: 'prompt',
      pastedContents: {},
      abortController,
      streamMode: 'normal' as any,
      hasInterruptibleToolInProgress: false,
      isExternalLoading: false,
      queuedCommands: [command!],
    })

    expect(params.getToolUseContext).not.toHaveBeenCalled()
    expect(params.onQuery).not.toHaveBeenCalled()
  })
})
