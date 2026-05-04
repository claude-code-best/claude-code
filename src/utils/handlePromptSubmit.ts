import type { UUID } from 'crypto'
import { logEvent } from 'src/services/analytics/index.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from 'src/services/analytics/metadata.js'
import { type Command, getCommandName, isCommandEnabled } from '../commands.js'
import { selectableUserMessagesFilter } from '../components/MessageSelector.js'
import type { SpinnerMode } from '../components/Spinner/types.js'
import type { QuerySource } from '../constants/querySource.js'
import { expandPastedTextRefs, parseReferences } from '../history.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { IDESelection } from '../hooks/useIdeSelection.js'
import type { AppState } from '../state/AppState.js'
import type { SetToolJSXFn } from '../Tool.js'
import type { LocalJSXCommandOnDone } from '../types/command.js'
import type { Message } from '../types/message.js'
import {
  isValidImagePaste,
  type PromptInputMode,
  type QueuedCommand,
} from '../types/textInputTypes.js'
import { createAbortController } from './abortController.js'
import type { PastedContent } from './config.js'
import { getCwd } from './cwd.js'
import { logForDebugging } from './debug.js'
import type { EffortValue } from './effort.js'
import type { FileHistoryState } from './fileHistory.js'
import { fileHistoryEnabled, fileHistoryMakeSnapshot } from './fileHistory.js'
import { gracefulShutdownSync } from './gracefulShutdown.js'
import { toError } from './errors.js'
import { logError } from './log.js'
import { enqueue } from './messageQueueManager.js'
import { resolveSkillModelOverride } from './model/model.js'
import {
  claimConsumableQueuedAutonomyCommands,
  finalizeAutonomyCommandsForTurn,
} from './autonomyQueueLifecycle.js'
import type { ProcessUserInputContext } from './processUserInput/processUserInput.js'
import { processUserInput } from './processUserInput/processUserInput.js'
import type { QueryGuard } from './QueryGuard.js'
import { queryCheckpoint, startQueryProfile } from './queryProfiler.js'
import { runWithWorkload } from './workloadContext.js'

function exit(): void {
  gracefulShutdownSync(0)
}

type BaseExecutionParams = {
  queuedCommands?: QueuedCommand[]
  messages: Message[]
  mainLoopModel: string
  ideSelection: IDESelection | undefined
  querySource: QuerySource
  commands: Command[]
  queryGuard: QueryGuard
  /** * 当外部加载（远程会话、前台化的后台任务）处于活动状态时为 true。
   * 这些不经过 queryGuard 路由，因此队列检查必须单独考虑它们。
   * 对于出队路径（executeQueuedInput）省略（默认为 false）——出队的项目已经通过了此检查并已入队。 */
  isExternalLoading?: boolean
  setToolJSX: SetToolJSXFn
  getToolUseContext: (
    messages: Message[],
    newMessages: Message[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  setUserInputOnProcessing: (prompt?: string) => void
  setAbortController: (abortController: AbortController | null) => void
  onQuery: (
    newMessages: Message[],
    abortController: AbortController,
    shouldQuery: boolean,
    additionalAllowedTools: string[],
    mainLoopModel: string,
    onBeforeQuery?: (input: string, newMessages: Message[]) => Promise<boolean>,
    input?: string,
    effort?: EffortValue,
  ) => Promise<boolean>
  setAppState: (updater: (prev: AppState) => AppState) => void
  onBeforeQuery?: (input: string, newMessages: Message[]) => Promise<boolean>
  canUseTool?: CanUseToolFn
}

/** * 核心执行逻辑的参数（不涉及 UI 问题）。 */
type ExecuteUserInputParams = BaseExecutionParams & {
  resetHistory: () => void
  onInputChange: (value: string) => void
}

export type PromptInputHelpers = {
  setCursorOffset: (offset: number) => void
  clearBuffer: () => void
  resetHistory: () => void
}

export type HandlePromptSubmitParams = BaseExecutionParams & {
  // 直接用户输入路径（在从 onSubmit 调用时设置，队列处理器中不存在）
  input?: string
  mode?: PromptInputMode
  pastedContents?: Record<number, PastedContent>
  helpers: PromptInputHelpers
  onInputChange: (value: string) => void
  setPastedContents: React.Dispatch<
    React.SetStateAction<Record<number, PastedContent>>
  >
  abortController?: AbortController | null
  addNotification?: (notification: {
    key: string
    text: string
    priority: 'low' | 'medium' | 'high' | 'immediate'
  }) => void
  setMessages?: (updater: (prev: Message[]) => Message[]) => void
  streamMode?: SpinnerMode
  hasInterruptibleToolInProgress?: boolean
  uuid?: UUID
  /** * 当为 true 时，以 `/` 开头的输入被视为纯文本。
   * 用于不应触发本地斜杠命令或技能的远程接收消息（桥接/CCR）。 */
  skipSlashCommands?: boolean
  /** 保留输入在入队时源自远程控制的信息。 */
  bridgeOrigin?: boolean
}

export async function handlePromptSubmit(
  params: HandlePromptSubmitParams,
): Promise<void> {
  const {
    helpers,
    queryGuard,
    isExternalLoading = false,
    commands,
    onInputChange,
    setPastedContents,
    setToolJSX,
    getToolUseContext,
    messages,
    mainLoopModel,
    ideSelection,
    setUserInputOnProcessing,
    setAbortController,
    onQuery,
    setAppState,
    onBeforeQuery,
    canUseTool,
    queuedCommands,
    uuid,
    skipSlashCommands,
    bridgeOrigin,
  } = params

  const { setCursorOffset, clearBuffer, resetHistory } = helpers

  // 队列处理器路径：命令已预先验证并准备执行。
  // 跳过所有输入验证、引用解析和排队逻辑。
  if (queuedCommands?.length) {
    startQueryProfile()
    await executeUserInput({
      queuedCommands,
      messages,
      mainLoopModel,
      ideSelection,
      querySource: params.querySource,
      commands,
      queryGuard,
      setToolJSX,
      getToolUseContext,
      setUserInputOnProcessing,
      setAbortController,
      onQuery,
      setAppState,
      onBeforeQuery,
      resetHistory,
      canUseTool,
      onInputChange,
    })
    return
  }

  const input = params.input ?? ''
  const mode = params.mode ?? 'prompt'
  const rawPastedContents = params.pastedContents ?? {}

  // 仅当图片的 [Image #N] 占位符仍在文本中时，图片才会被发送。
  // 删除内联药丸会丢弃图片；孤立的条目在此处被过滤掉。
  const referencedIds = new Set(parseReferences(input).map(r => r.id))
  const pastedContents = Object.fromEntries(
    Object.entries(rawPastedContents).filter(
      ([, c]) => c.type !== 'image' || referencedIds.has(c.id),
    ),
  )

  const hasImages = Object.values(pastedContents).some(isValidImagePaste)
  if (input.trim() === '') {
    return
  }

  // 通过触发退出命令来处理退出命令，而不是直接调用 process.exit
  // 跳过远程桥接消息——在 iOS 上输入的 "exit" 不应终止本地会话
  if (
    !skipSlashCommands &&
    ['exit', 'quit', ':q', ':q!', ':wq', ':wq!'].includes(input.trim())
  ) {
    // 触发退出命令，该命令将显示反馈对话框
    const exitCommand = commands.find(cmd => cmd.name === 'exit')
    if (exitCommand) {
      // 提交 /exit 命令替代 - 需要处理递归调用
      void handlePromptSubmit({
        ...params,
        input: '/exit',
      })
    } else {
      // 如果未找到退出命令，则回退到直接退出
      exit()
    }
    return
  }

  // 在入队之前，尽早解析引用并替换为实际内容
  // 或立即命令分发，以便排队的命令和立即命令
  // 都接收到提交时的扩展文本。
  const finalInput = expandPastedTextRefs(input, pastedContents)
  const pastedTextRefs = parseReferences(input).filter(
    r => pastedContents[r.id]?.type === 'text',
  )
  const pastedTextCount = pastedTextRefs.length
  const pastedTextBytes = pastedTextRefs.reduce(
    (sum, r) => sum + (pastedContents[r.id]?.content.length ?? 0),
    0,
  )
  logEvent('tengu_paste_text', { pastedTextCount, pastedTextBytes })

  // 处理本地 JSX 立即命令（例如，/config, /doctor）
  // 跳过远程桥接消息——来自 CCR 客户端的斜杠命令是纯文本
  if (!skipSlashCommands && finalInput.trim().startsWith('/')) {
    const trimmedInput = finalInput.trim()
    const spaceIndex = trimmedInput.indexOf(' ')
    const commandName =
      spaceIndex === -1
        ? trimmedInput.slice(1)
        : trimmedInput.slice(1, spaceIndex)
    const commandArgs =
      spaceIndex === -1 ? '' : trimmedInput.slice(spaceIndex + 1).trim()

    const immediateCommand = commands.find(
      cmd =>
        cmd.immediate &&
        isCommandEnabled(cmd) &&
        (cmd.name === commandName ||
          cmd.aliases?.includes(commandName) ||
          getCommandName(cmd) === commandName),
    )
    //只执行远程发过来的命令
    if (
      immediateCommand &&
      immediateCommand.type === 'local-jsx' &&
      (queryGuard.isActive || isExternalLoading)
    ) {
      logEvent('tengu_immediate_command_executed', {
        commandName:
          immediateCommand.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      // 清空输入
      onInputChange('')
      setCursorOffset(0)
      setPastedContents({})
      clearBuffer()

      const context = getToolUseContext(
        messages,
        [],
        createAbortController(),
        mainLoopModel,
      )

      let doneWasCalled = false
      const onDone: LocalJSXCommandOnDone = (result, options) => {
        doneWasCalled = true
        // 使用 clearLocalJSX 来显式清除本地 JSX 命令
        setToolJSX({
          jsx: null,
          shouldHidePromptInput: false,
          clearLocalJSX: true,
        })
        if (result && options?.display !== 'skip' && params.addNotification) {
          params.addNotification({
            key: `immediate-${immediateCommand.name}`,
            text: result,
            priority: 'immediate',
          })
        }
        if (options?.nextInput) {
          if (options.submitNextInput) {
            enqueue({ value: options.nextInput, mode: 'prompt' })
          } else {
            onInputChange(options.nextInput)
          }
        }
      }

      const impl = await immediateCommand.load()
      const jsx = await impl.call(onDone, context, commandArgs)

      // 如果 onDone 已触发则跳过——防止 isLocalJSXCommand 卡住
      // （完整机制请参见 processSlashCommand.tsx 中的 local-jsx 案例）。
      if (jsx && !doneWasCalled) {
        setToolJSX({
          jsx,
          shouldHidePromptInput: false,
          isLocalJSXCommand: true,
          isImmediate: true,
        })
      }
      return
    }
  }
  //命令开始排队
  if (queryGuard.isActive || isExternalLoading) {
    // 仅允许提示符和 bash 模式命令入队
    if (mode !== 'prompt' && mode !== 'bash') {
      return
    }

    // 当所有正在执行工具的中断行为为 'cancel' 时，中断当前轮次
    // （例如 SleepTool）。
    if (params.hasInterruptibleToolInProgress) {
      logForDebugging(
        `[中断] 正在中止当前轮次：streamMode=${params.streamMode}`,
      )
      logEvent('tengu_cancel', {
        source:
          'interrupt_on_submit' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        streamMode:
          params.streamMode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      params.abortController?.abort('interrupt')
    }

    // 使用字符串值和原始粘贴内容入队。图片将在执行时调整大小
    // （当 processUserInput 运行时，不在此处预先处理）。
    enqueue({
      value: finalInput.trim(),
      preExpansionValue: input.trim(),
      mode,
      pastedContents: hasImages ? pastedContents : undefined,
      skipSlashCommands,
      bridgeOrigin,
      uuid,
    })

    onInputChange('')
    setCursorOffset(0)
    setPastedContents({})
    resetHistory()
    clearBuffer()
    return
  }

  // 为此查询启动查询性能分析
  startQueryProfile()

  // 根据直接用户输入构建一个 QueuedCommand，使两条路径都经过相同的 executeUserInput 循环。这确保无论命令如何到达，图像都能通过 processUserInput 调整大小。
  // 通过相同的 executeUserInput 循环。这确保图像能通过 processUserInput 调整大小，无论命令如何到达。
  // 调整大小，无论命令如何到达。
  const cmd: QueuedCommand = {
    value: finalInput,
    preExpansionValue: input,
    mode,
    pastedContents: hasImages ? pastedContents : undefined,
    skipSlashCommands,
    bridgeOrigin,
    uuid,
  }

  await executeUserInput({
    queuedCommands: [cmd],
    messages,
    mainLoopModel,
    ideSelection,
    querySource: params.querySource,
    commands,
    queryGuard,
    setToolJSX,
    getToolUseContext,
    setUserInputOnProcessing,
    setAbortController,
    onQuery,
    setAppState,
    onBeforeQuery,
    resetHistory,
    canUseTool,
    onInputChange,
  })
}

/** * 执行用户输入且无 UI 副作用的核心逻辑。
 *
 * 所有命令都以 `queuedCommands` 形式到达。第一条命令得到完整处理
 *（附件、ideSelection、带图像调整的粘贴内容）。第 2 到 N 条命令
 * 使用 `skipAttachments` 以避免重复回合级上下文。 */
async function executeUserInput(params: ExecuteUserInputParams): Promise<void> {
  const {
    messages,
    mainLoopModel,
    ideSelection,
    querySource,
    queryGuard,
    setToolJSX,
    getToolUseContext,
    setUserInputOnProcessing,
    setAbortController,
    onQuery,
    setAppState,
    onBeforeQuery,
    resetHistory,
    canUseTool,
    queuedCommands,
  } = params

  // 注意：粘贴引用在调用此函数前已处理（在排队前的 handlePromptSubmit 中，或在初始执行前）。
  // （在排队前的 handlePromptSubmit 中，或在初始执行前）。
  // 始终创建一个新的 abort controller — queryGuard 保证没有并发的 executeUserInput 调用，因此没有先前的 controller 可继承。
  // executeUserInput 调用，因此没有先前的 controller 可继承。
  const abortController = createAbortController()
  setAbortController(abortController)

  function makeContext(): ProcessUserInputContext {
    return getToolUseContext(messages, [], abortController, mainLoopModel)
  }

  // 包装在 try-finally 中，这样即使 processUserInput 抛出异常或跳过 onQuery，也能释放 guard。onQuery 的 finally 会调用 queryGuard.end()，
  // 抛出异常或跳过 onQuery，也能释放 guard。onQuery 的 finally 会调用 queryGuard.end()，
  // 将状态从 running 转为 idle；下面的 cancelReservation() 在这种情况下是空操作（仅对 dispatching 状态生效）。
  // （仅对 dispatching 状态生效）。
  try {
    // 在 processUserInput 之前保留 guard — processBashCommand 等待 BashTool.call()，processSlashCommand 等待 getMessagesForSlashCommand，
    // BashTool.call()，processSlashCommand 等待 getMessagesForSlashCommand，
    // 因此在这些等待期间 guard 必须处于活动状态，以确保并发的 handlePromptSubmit 调用排队（通过上面的 isActive 检查）
    // 而不是启动第二个 executeUserInput。如果 guard 已处于 dispatching 状态（传统队列处理器路径），此调用是空操作。
    // 而不是启动第二个 executeUserInput。如果 guard 已处于 dispatching 状态（传统队列处理器路径），此调用是空操作。
    // （传统队列处理器路径），此调用是空操作。
    queryGuard.reserve()
    queryCheckpoint('query_process_user_input_start')

    const newMessages: Message[] = []
    let shouldQuery = false
    let allowedTools: string[] | undefined
    let model: string | undefined
    let effort: EffortValue | undefined
    let nextInput: string | undefined
    let submitNextInput: boolean | undefined

    // Iterate all commands uniformly. First command gets attachments +
    // ideSelection + pastedContents, rest skip attachments to avoid
    // duplicating turn-level context (IDE selection, todos, diffs).
    let commands = queuedCommands ?? []
    const queuedAutonomyClaim =
      await claimConsumableQueuedAutonomyCommands(commands)
    commands = queuedAutonomyClaim.attachmentCommands
    const claimedAutonomyCommands = queuedAutonomyClaim.claimedCommands
    if (commands.length === 0) {
      // Clear the abort controller published a few lines above so this turn's
      // stale controller does not leak into the next turn when every claimed
      // autonomy command was skipped as non-consumable.
      setAbortController(null)
      return
    }

    // 计算此回合的工作负载标签。queueProcessor 可以将一个 cron 提示与同一时刻的人工提示批量处理；仅当每条命令都同意相同的非 undefined 工作负载时才标记 — 混合中的人工正在主动等待。
    // cron 提示与同一时刻的人工提示批量处理；仅当每条命令都同意相同的非 undefined 工作负载时才标记 — 混合中的人工正在主动等待。
    // 命令都同意相同的非 undefined 工作负载时才标记 — 混合中的人工正在主动等待。
    // 混合中的人工正在主动等待。
    const firstWorkload = commands[0]?.workload
    const turnWorkload =
      firstWorkload !== undefined &&
      commands.every(c => c.workload === firstWorkload)
        ? firstWorkload
        : undefined
    const deferredAutonomyRunIds = new Set<string>()

    // Wrap the entire turn (processUserInput loop + onQuery) in an
    // AsyncLocalStorage context. This is the ONLY way to correctly
    // propagate workload across await boundaries: void-detached bg agents
    // (executeForkedSlashCommand, AgentTool) capture the ALS context at
    // invocation time, and every await inside them resumes in that
    // context — isolated from the parent's continuation. A process-global
    // mutable slot would be clobbered at the detached closure's first
    // await by this function's synchronous return path. See state.ts.
    let turnError: unknown
    try {
      await runWithWorkload(turnWorkload, async () => {
        for (let i = 0; i < commands.length; i++) {
          const cmd = commands[i]!
          const isFirst = i === 0
          const runId = cmd.autonomy?.runId
          const result = await processUserInput({
            input: cmd.value,
            preExpansionInput: cmd.preExpansionValue,
            mode: cmd.mode,
            setToolJSX,
            context: makeContext(),
            pastedContents: isFirst ? cmd.pastedContents : undefined,
            messages,
            setUserInputOnProcessing: isFirst
              ? setUserInputOnProcessing
              : undefined,
            isAlreadyProcessing: !isFirst,
            querySource,
            canUseTool,
            uuid: cmd.uuid,
            ideSelection: isFirst ? ideSelection : undefined,
            skipSlashCommands: cmd.skipSlashCommands,
            bridgeOrigin: cmd.bridgeOrigin,
            isMeta: cmd.isMeta,
            skipAttachments: !isFirst,
            autonomy: cmd.autonomy,
          })
          if (runId && result.deferAutonomyCompletion) {
            deferredAutonomyRunIds.add(runId)
          }
          // Stamp origin here rather than threading another arg through
          // processUserInput → processUserInputBase → processTextPrompt → createUserMessage.
          // Derive origin from mode for task-notifications — mirrors the origin
          // derivation at messages.ts (case 'queued_command'); intentionally
          // does NOT mirror its isMeta:true so idle-dequeued notifications stay
          // visible in the transcript via UserAgentNotificationMessage.
          const origin =
            cmd.origin ??
            (cmd.mode === 'task-notification'
              ? ({ kind: 'task-notification' } as const)
              : undefined)
          if (origin) {
            for (const m of result.messages) {
              if (m.type === 'user') m.origin = origin
            }
          }
          newMessages.push(...result.messages)
          if (isFirst) {
            shouldQuery = result.shouldQuery
            allowedTools = result.allowedTools
            model = result.model
            effort = result.effort
            nextInput = result.nextInput
            submitNextInput = result.submitNextInput
          }
        }

        queryCheckpoint('query_process_user_input_end')
        if (fileHistoryEnabled()) {
          queryCheckpoint('query_file_history_snapshot_start')
          newMessages.filter(selectableUserMessagesFilter).forEach(message => {
            void fileHistoryMakeSnapshot(
              (updater: (prev: FileHistoryState) => FileHistoryState) => {
                setAppState(prev => ({
                  ...prev,
                  fileHistory: updater(prev.fileHistory),
                }))
              },
              message.uuid,
            )
          })
          queryCheckpoint('query_file_history_snapshot_end')
        }

        if (newMessages.length) {
          // 如果在 guard 仍被保留时清除 toolJSX，微调器会短暂显示。下面的 finally 也会调用 cancelReservation（如果空闲则无操作）。
          // 处理希望链式执行的命令的 nextInput（例如 /discover 激活）
          // 安全网：如果 processUserInput 抛出异常或跳过了 onQuery，则释放 guard 保留。如果 onQuery 已运行则无操作（guard 通过 end() 空闲，或正在运行 — cancelReservation 仅作用于调度中）。
          // 这是释放保留的唯一真实来源；useQueueProcessor 不再需要自己的 .finally()。
          resetHistory()
          setToolJSX({
            jsx: null,
            shouldHidePromptInput: false,
            clearLocalJSX: true,
          })

          const primaryCmd = commands[0]
          const primaryMode = primaryCmd?.mode ?? 'prompt'
          const primaryInput =
            primaryCmd && typeof primaryCmd.value === 'string'
              ? primaryCmd.value
              : undefined
          const shouldCallBeforeQuery = primaryMode === 'prompt'
          await onQuery(
            newMessages,
            abortController,
            shouldQuery,
            allowedTools ?? [],
            model
              ? resolveSkillModelOverride(model, mainLoopModel)
              : mainLoopModel,
            shouldCallBeforeQuery ? onBeforeQuery : undefined,
            primaryInput,
            effort,
          )
        } else {
          // 安全网：如果 processUserInput 未生成消息或抛出异常，则清除占位符 — 否则它将保持可见直到下一轮的 resetLoadingState。当 onQuery 运行时无害：setMessages 使 displayedMessages 超过基线，因此 REPL.tsx 已将其隐藏。
          // 在清除 toolJSX 之前释放防护锁，防止加载指示器闪烁——
          // 加载指示器的判断逻辑是：(!toolJSX || showSpinner) && isLoading。
          // 如果防护锁仍被占用时我们清除了 toolJSX，加载指示器会短暂显示。
          // 下面的 finally 块也会调用 cancelReservation（如果空闲则无操作）。
          queryGuard.cancelReservation()
          setToolJSX({
            jsx: null,
            shouldHidePromptInput: false,
            clearLocalJSX: true,
          })
          resetHistory()
          setAbortController(null)
        }

        // 处理来自希望链式执行的命令的 nextInput（例如，/discover 激活）
        if (nextInput) {
          if (submitNextInput) {
            enqueue({ value: nextInput, mode: 'prompt' })
          } else {
            params.onInputChange(nextInput)
          }
        }
      }) // end runWithWorkload — ALS context naturally scoped, no finally needed
    } catch (error) {
      turnError = error
    }

    // Finalize claimed autonomy commands as `completed` only if the turn
    // body itself succeeded. Run the finalize call in its own try/catch so a
    // failure there does not double-finalize the same commands as `failed`
    // (which previously cancelled follow-up queue state after a successful
    // turn).
    if (claimedAutonomyCommands.length) {
      const finalizableCommands = claimedAutonomyCommands.filter(command => {
        const runId = command.autonomy?.runId
        return !runId || !deferredAutonomyRunIds.has(runId)
      })
      if (turnError) {
        try {
          await finalizeAutonomyCommandsForTurn({
            commands: finalizableCommands,
            outcome: { type: 'failed', error: turnError },
            currentDir: getCwd(),
            priority: 'later',
            workload: turnWorkload,
          })
        } catch (finalizeError) {
          logError(toError(finalizeError))
        }
      } else {
        try {
          const nextCommands = await finalizeAutonomyCommandsForTurn({
            commands: finalizableCommands,
            outcome: { type: 'completed' },
            currentDir: getCwd(),
            priority: 'later',
            workload: turnWorkload,
          })
          for (const nextCommand of nextCommands) {
            enqueue(nextCommand)
          }
        } catch (finalizeError) {
          logError(toError(finalizeError))
        }
      }
    }

    if (turnError) {
      throw turnError
    }
  } finally {
    // 安全网：如果 processUserInput 抛出异常或 onQuery 被跳过，则释放防护锁占用。
    // 如果 onQuery 已运行（通过 end() 防护锁已空闲，或正在运行——cancelReservation 仅作用于调度状态），则无操作。
    // 这是释放占用的唯一可靠来源；
    // useQueueProcessor 不再需要自己的 .finally()。
    // 安全网：如果 processUserInput 未生成消息或抛出异常，则清除占位符——
    queryGuard.cancelReservation()
    // 否则它将保持可见直到下一轮的 resetLoadingState。当 onQuery 运行时无害：setMessages 使
    // displayedMessages 超出基线，因此 REPL.tsx 已将其隐藏。
    // turn's resetLoadingState. Harmless when onQuery ran: setMessages grew
    // displayedMessages past the baseline, so REPL.tsx already hid it.
    setUserInputOnProcessing(undefined)
  }
}
