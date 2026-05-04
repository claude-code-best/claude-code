import { feature } from 'bun:bundle'
import type {
  Base64ImageSource,
  ContentBlockParam,
  ImageBlockParam,
} from '@anthropic-ai/sdk/resources/messages.mjs'
import { randomUUID } from 'crypto'
import type { QuerySource } from 'src/constants/querySource.js'
import { logEvent } from 'src/services/analytics/index.js'
import { getContentText } from 'src/utils/messages.js'
import {
  findCommand,
  getBridgeCommandSafety,
  getCommandName,
  type LocalJSXCommandContext,
} from '../../commands.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { IDESelection } from '../../hooks/useIdeSelection.js'
import type { SetToolJSXFn, ToolUseContext } from '../../Tool.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  ProgressMessage,
  SystemMessage,
  UserMessage,
} from '../../types/message.js'
import type { PermissionMode } from '../../types/permissions.js'
import {
  isValidImagePaste,
  type QueuedCommand,
  type PromptInputMode,
} from '../../types/textInputTypes.js'
import {
  type AgentMentionAttachment,
  createAttachmentMessage,
  getAttachmentMessages,
} from '../attachments.js'
import type { PastedContent } from '../config.js'
import type { EffortValue } from '../effort.js'
import { toArray } from '../generators.js'
import {
  executeUserPromptSubmitHooks,
  getUserPromptSubmitHookBlockingMessage,
} from '../hooks.js'
import {
  createImageMetadataText,
  maybeResizeAndDownsampleImageBlock,
} from '../imageResizer.js'
import { storeImages } from '../imageStore.js'
import {
  createCommandInputMessage,
  createSystemMessage,
  createUserMessage,
} from '../messages.js'
import { queryCheckpoint } from '../queryProfiler.js'
import { parseSlashCommand } from '../slashCommandParsing.js'
import {
  hasUltraplanKeyword,
  replaceUltraplanKeyword,
} from '../ultraplan/keyword.js'
import { processTextPrompt } from './processTextPrompt.js'
export type ProcessUserInputContext = ToolUseContext & LocalJSXCommandContext

export type ProcessUserInputBaseResult = {
  messages: (
    | UserMessage
    | AssistantMessage
    | AttachmentMessage
    | SystemMessage
    | ProgressMessage
  )[]
  shouldQuery: boolean
  allowedTools?: string[]
  model?: string
  effort?: EffortValue
  // 非交互模式下的输出文本（例如，分叉命令）。
  // 设置后，在 -p 模式下将使用此结果而非空字符串
  resultText?: string
  // 设置后，在命令完成后预填充或提交下一个输入。由 /
  // discover 使用，以链接到所选功能的命令
  nextInput?: string
  submitNextInput?: boolean
  // When true, the command started detached work that will finalize its
  // autonomy run after the background work completes.
  deferAutonomyCompletion?: boolean
}

export async function processUserInput({
  input,
  preExpansionInput,
  mode,
  setToolJSX,
  context,
  pastedContents,
  ideSelection,
  messages,
  setUserInputOnProcessing,
  uuid,
  isAlreadyProcessing,
  querySource,
  canUseTool,
  skipSlashCommands,
  bridgeOrigin,
  isMeta,
  skipAttachments,
  autonomy,
}: {
  input: string | Array<ContentBlockParam>
  /** * 在 [粘贴文本 #N] 展开前的输入。用于 ultraplan 关键词
   * 检测，因此包含该词的粘贴内容不会触发。未设置时
   * 回退到字符串 `input`。 */
  preExpansionInput?: string
  mode: PromptInputMode
  setToolJSX: SetToolJSXFn
  context: ProcessUserInputContext
  pastedContents?: Record<number, PastedContent>
  ideSelection?: IDESelection
  messages?: Message[]
  setUserInputOnProcessing?: (prompt?: string) => void
  uuid?: string
  isAlreadyProcessing?: boolean
  querySource?: QuerySource
  canUseTool?: CanUseToolFn
  /** * 为 true 时，以 `/` 开头的输入被视为纯文本。
   * 用于不应触发本地斜杠命令或技能的远程接收消息（桥接/CCR）。 */
  skipSlashCommands?: boolean
  /** * 为 true 时，即使设置了 skipSlashCommands，匹配 isBridgeSafeCommand() 的斜杠命令仍会执行。
   * 参见 QueuedCommand.bridgeOrigin。 */
  bridgeOrigin?: boolean
  /** * 为 true 时，生成的 UserMessage 会获得 `isMeta: true` 属性（用户不可见，
   * 模型可见）。从 `QueuedCommand.isMeta` 传播而来，用于排队的系统生成提示。 */
  isMeta?: boolean
  skipAttachments?: boolean
  autonomy?: QueuedCommand['autonomy']
}): Promise<ProcessUserInputBaseResult> {
  const inputString = typeof input === 'string' ? input : null
  // 在处理输入时立即向用户显示输入提示。对于 isMet
  // a（系统生成的提示，如计划任务）则跳过——这些应
  // 不可见地运行。
  if (mode === 'prompt' && inputString !== null && !isMeta) {
    setUserInputOnProcessing?.(inputString)
  }

  queryCheckpoint('query_process_user_input_base_start')

  const appState = context.getAppState()

  const result = await processUserInputBase(
    input,
    mode,
    setToolJSX,
    context,
    pastedContents,
    ideSelection,
    messages,
    uuid,
    isAlreadyProcessing,
    querySource,
    canUseTool,
    appState.toolPermissionContext.mode,
    skipSlashCommands,
    bridgeOrigin,
    isMeta,
    skipAttachments,
    preExpansionInput,
    autonomy,
  )
  queryCheckpoint('query_process_user_input_base_end')

  if (!result.shouldQuery) {
    return result
  }

  // 执行 UserPromptSubmit 钩子并处理阻塞
  queryCheckpoint('query_hooks_start')
  const inputMessage = getContentText(input) || ''

  for await (const hookResult of executeUserPromptSubmitHooks(
    inputMessage,
    appState.toolPermissionContext.mode,
    context,
    context.requestPrompt,
  )) {
    // 我们只关心结果
    if (hookResult.message?.type === 'progress') {
      continue
    }

    // 仅返回系统级错误消息，清除原始用户输入
    if (hookResult.blockingError) {
      const blockingMessage = getUserPromptSubmitHookBlockingMessage(
        hookResult.blockingError,
      )
      return {
        messages: [
          // 待办：将此设为附件消息
          createSystemMessage(
            `${blockingMessage}\n\n原始提示：${input}`,
            'warning',
          ),
        ],
        shouldQuery: false,
        allowedTools: result.allowedTools,
      }
    }

    // 如果设置了 preventContinuation，则停止处理但将原始提
    // 示保留在上下文中。
    if (hookResult.preventContinuation) {
      const message = hookResult.stopReason
        ? `操作被钩子停止：${hookResult.stopReason}`
        : '操作被钩子停止'
      result.messages.push(
        createUserMessage({
          content: message,
        }),
      )
      result.shouldQuery = false
      return result
    }

    // 收集额外上下文
    if (
      hookResult.additionalContexts &&
      hookResult.additionalContexts.length > 0
    ) {
      result.messages.push(
        createAttachmentMessage({
          type: 'hook_additional_context',
          content: hookResult.additionalContexts.map(applyTruncation),
          hookName: 'UserPromptSubmit',
          toolUseID: `hook-${randomUUID()}`,
          hookEvent: 'UserPromptSubmit',
        }),
      )
    }

    // 待办：清理此处
    if (hookResult.message) {
      switch (hookResult.message.attachment!.type) {
        case 'hook_success':
          if (!hookResult.message.attachment!.content) {
            // 若无内容则跳过
            break
          }
          result.messages.push({
            ...hookResult.message,
            attachment: {
              ...hookResult.message.attachment!,
              content: applyTruncation(
                hookResult.message.attachment!.content as string,
              ),
            },
          } as AttachmentMessage)
          break
        default:
          result.messages.push(hookResult.message as AttachmentMessage)
          break
      }
    }
  }
  queryCheckpoint('query_hooks_end')

  // 理想情况：onQuery 将通过 startTransition 清除 userInputOnP
  // rocessing，因此它会在与 deferredMessages 相同的帧中解析（无闪烁间隙
  // ）。错误路径由 handlePromptSubmit 的 finally 块处理。
  return result
}

const MAX_HOOK_OUTPUT_LENGTH = 10000

function applyTruncation(content: string): string {
  if (content.length > MAX_HOOK_OUTPUT_LENGTH) {
    return `${content.substring(0, MAX_HOOK_OUTPUT_LENGTH)}… [输出已截断 - 超过 ${MAX_HOOK_OUTPUT_LENGTH} 个字符]`
  }
  return content
}

async function processUserInputBase(
  input: string | Array<ContentBlockParam>,
  mode: PromptInputMode,
  setToolJSX: SetToolJSXFn,
  context: ProcessUserInputContext,
  pastedContents?: Record<number, PastedContent>,
  ideSelection?: IDESelection,
  messages?: Message[],
  uuid?: string,
  isAlreadyProcessing?: boolean,
  querySource?: QuerySource,
  canUseTool?: CanUseToolFn,
  permissionMode?: PermissionMode,
  skipSlashCommands?: boolean,
  bridgeOrigin?: boolean,
  isMeta?: boolean,
  skipAttachments?: boolean,
  preExpansionInput?: string,
  autonomy?: QueuedCommand['autonomy'],
): Promise<ProcessUserInputBaseResult> {
  let inputString: string | null = null
  let precedingInputBlocks: ContentBlockParam[] = []

  // 为 isMeta 消息收集图像元数据文本
  const imageMetadataTexts: string[] = []

  // `input` 的规范化视图，其中图像块已调整大小。对于字符串输入，这仅
  // 是 `input`；对于数组输入，则是处理后的块。我们将此（而非原始 `i
  // nput`）传递给 processTextPrompt，以便调整大小/规范
  // 化的图像块实际到达 API——否则上述调整大小的工作将在常规提示路径
  // 中被丢弃。同时规范化桥接输入，其中 iOS 可能发送 `mediaTy
  // pe` 而非 `media_type` (mobile-apps#5825)。
  let normalizedInput: string | ContentBlockParam[] = input

  if (typeof input === 'string') {
    inputString = input
  } else if (input.length > 0) {
    queryCheckpoint('query_image_processing_start')
    const processedBlocks: ContentBlockParam[] = []
    for (const block of input) {
      if (block.type === 'image') {
        const resized = await maybeResizeAndDownsampleImageBlock(block)
        // 为 isMeta 消息收集图像元数据
        if (resized.dimensions) {
          const metadataText = createImageMetadataText(resized.dimensions)
          if (metadataText) {
            imageMetadataTexts.push(metadataText)
          }
        }
        processedBlocks.push(resized.block)
      } else {
        processedBlocks.push(block)
      }
    }
    normalizedInput = processedBlocks
    queryCheckpoint('query_image_processing_end')
    // 如果最后一个内容块是文本，则从中提取输入
    // 字符串，并跟踪前面的内容块
    const lastBlock = processedBlocks[processedBlocks.length - 1]
    if (lastBlock?.type === 'text') {
      inputString = lastBlock.text
      precedingInputBlocks = processedBlocks.slice(0, -1)
    } else {
      precedingInputBlocks = processedBlocks
    }
  }

  if (inputString === null && mode !== 'prompt') {
    throw new Error(`模式：${mode} 需要一个字符串输入。`)
  }

  // 提前提取图像内容并转换为内容块。按
  // 顺序跟踪 ID 以便消息存储
  const imageContents = pastedContents
    ? Object.values(pastedContents).filter(isValidImagePaste)
    : []
  const imagePasteIds = imageContents.map(img => img.id)

  // 将图像存储到磁盘，以便 Claude 可以在上下文中引用
  // 路径（用于 CLI 工具操作、上传到 PR 等）
  const storedImagePaths = pastedContents
    ? await storeImages(pastedContents)
    : new Map<number, string>()

  // 调整粘贴图像的大小以确保符合 API 限制（并行处理）
  queryCheckpoint('query_pasted_image_processing_start')
  const imageProcessingResults = await Promise.all(
    imageContents.map(async pastedImage => {
      const imageBlock: ImageBlockParam = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: (pastedImage.mediaType ||
            'image/png') as Base64ImageSource['media_type'],
          data: pastedImage.content,
        },
      }
      logEvent('tengu_pasted_image_resize_attempt', {
        original_size_bytes: pastedImage.content.length,
      })
      const resized = await maybeResizeAndDownsampleImageBlock(imageBlock)
      return {
        resized,
        originalDimensions: pastedImage.dimensions,
        sourcePath:
          pastedImage.sourcePath ?? storedImagePaths.get(pastedImage.id),
      }
    }),
  )
  // 收集结果并保持顺序
  const imageContentBlocks: ContentBlockParam[] = []
  for (const {
    resized,
    originalDimensions,
    sourcePath,
  } of imageProcessingResults) {
    // 为 isMeta 消息收集图像元数据（优先使用调整后的尺寸）
    if (resized.dimensions) {
      const metadataText = createImageMetadataText(
        resized.dimensions,
        sourcePath,
      )
      if (metadataText) {
        imageMetadataTexts.push(metadataText)
      }
    } else if (originalDimensions) {
      // 如果调整大小未提供尺寸，则回退到原始尺寸
      const metadataText = createImageMetadataText(
        originalDimensions,
        sourcePath,
      )
      if (metadataText) {
        imageMetadataTexts.push(metadataText)
      }
    } else if (sourcePath) {
      // 如果有源路径但无尺寸，仍添加源信息
      imageMetadataTexts.push(`[图片来源：${sourcePath}]`)
    }
    imageContentBlocks.push(resized.block)
  }
  queryCheckpoint('query_pasted_image_processing_end')

  // 桥接安全的斜杠命令覆盖：移动端/Web 客户端设置 bridgeOr
  // igin 时 skipSlashCommands 仍为 true（针对退
  // 出词和即时命令快速路径的深度防御）。在此处解析命令——如果通过 is
  // BridgeSafeCommand 检查，则清除跳过标志，以便下方的
  // 门打开。如果是已知但不安全的命令（本地 JSX UI 或仅限终端），
  // 则用有帮助的消息短路，而不是让模型看到原始的 "/config"。
  let effectiveSkipSlash = skipSlashCommands
  if (bridgeOrigin && inputString !== null && inputString.startsWith('/')) {
    const parsed = parseSlashCommand(inputString)
    const cmd = parsed
      ? findCommand(parsed.commandName, context.options.commands)
      : undefined
    if (cmd) {
      const safety = getBridgeCommandSafety(cmd, parsed?.args ?? '')
      if (safety.ok) {
        effectiveSkipSlash = false
      } else {
        const msg =
          safety.reason ?? `/${getCommandName(cmd)} 在远程控制中不可用。`
        return {
          messages: [
            createUserMessage({ content: inputString, uuid }),
            createCommandInputMessage(
              `<local-command-stdout>${msg}</local-command-stdout>`,
            ),
          ],
          shouldQuery: false,
          resultText: msg,
        }
      }
    }
    // 未知的 /foo 或无法解析——回退到纯文本，与 #1913
    // 4 之前相同。移动用户输入 "/shrug" 不应看到“未知技能”。
  }

  // Ultraplan 关键词——通过 /ultrapla
  // n 路由。在预扩展输入中检测，以便包含该词的粘贴内容无法触发
  // CCR 会话；在扩展输入中替换为“plan”，以便 CCR
  // 提示接收粘贴内容并保持语法正确。有关引号/路径排除，请参阅
  // keyword.ts。仅限交互式提示模式 + 非斜杠前缀：无头
  // /打印模式从 cont
  // ext.options 中过滤掉本地 JSX 命令，因此路由到
  // /ultraplan 会产生“未知技能”——而且打印模式中也没有
  // 彩虹动画。在附件提取之前运行，因此此
  // 路径与下方的斜杠命令路径匹配（setUserInputOnProc
  // essing 和 setAppState 之间无 await——R
  // eact 将两者批处理为一次渲染，无闪烁）。
  if (
    feature('ULTRAPLAN') &&
    mode === 'prompt' &&
    !context.options.isNonInteractiveSession &&
    inputString !== null &&
    !effectiveSkipSlash &&
    !inputString.startsWith('/') &&
    !context.getAppState().ultraplanSessionUrl &&
    !context.getAppState().ultraplanLaunching &&
    hasUltraplanKeyword(preExpansionInput ?? inputString)
  ) {
    logEvent('tengu_ultraplan_keyword', {})
    const rewritten = replaceUltraplanKeyword(inputString).trim()
    const { processSlashCommand } = await import('./processSlashCommand.js')
    const slashResult = await processSlashCommand(
      `/ultraplan ${rewritten}`,
      precedingInputBlocks,
      imageContentBlocks,
      [],
      context,
      setToolJSX,
      uuid,
      isAlreadyProcessing,
      canUseTool,
      autonomy,
    )
    return addImageMetadataMessage(slashResult, imageMetadataTexts)
  }

  // 对于斜杠命令，附件将在 getMessagesForSlashCommand 中提取
  const shouldExtractAttachments =
    !skipAttachments &&
    inputString !== null &&
    (mode !== 'prompt' || effectiveSkipSlash || !inputString.startsWith('/'))

  queryCheckpoint('query_attachment_loading_start')
  const attachmentMessages = shouldExtractAttachments
    ? await toArray(
        getAttachmentMessages(
          inputString,
          context,
          ideSelection ?? null,
          [], // queuedCommands - handled by query.ts for mid-turn attachments
          messages,
          querySource,
        ),
      )
    : []
  queryCheckpoint('query_attachment_loading_end')

  // Bash 命令
  if (inputString !== null && mode === 'bash') {
    const { processBashCommand } = await import('./processBashCommand.js')
    return addImageMetadataMessage(
      await processBashCommand(
        inputString,
        precedingInputBlocks,
        attachmentMessages,
        context,
        setToolJSX,
      ),
      imageMetadataTexts,
    )
  }

  // 斜杠命令
  // 跳过远程桥接消息——来自 CCR 客户端的输入是纯文本
  if (
    inputString !== null &&
    !effectiveSkipSlash &&
    inputString.startsWith('/')
  ) {
    const { processSlashCommand } = await import('./processSlashCommand.js')
    const slashResult = await processSlashCommand(
      inputString,
      precedingInputBlocks,
      imageContentBlocks,
      attachmentMessages,
      context,
      setToolJSX,
      uuid,
      isAlreadyProcessing,
      canUseTool,
      autonomy,
    )
    return addImageMetadataMessage(slashResult, imageMetadataTexts)
  }

  // 记录代理提及查询以供分析
  if (inputString !== null && mode === 'prompt') {
    const trimmedInput = inputString.trim()

    const agentMention = attachmentMessages.find(
      (m): m is AttachmentMessage<AgentMentionAttachment> =>
        m.attachment.type === 'agent_mention',
    )

    if (agentMention) {
      const agentMentionString = `@agent-${agentMention.attachment.agentType}`
      const isSubagentOnly = trimmedInput === agentMentionString
      const isPrefix =
        trimmedInput.startsWith(agentMentionString) && !isSubagentOnly

      // 每当用户使用 @agent-<name> 语法时记录
      logEvent('tengu_subagent_at_mention', {
        is_subagent_only: isSubagentOnly,
        is_prefix: isPrefix,
      })
    }
  }

  // 常规用户提示
  return addImageMetadataMessage(
    processTextPrompt(
      normalizedInput,
      imageContentBlocks,
      imagePasteIds,
      attachmentMessages,
      uuid,
      permissionMode,
      isMeta,
    ),
    imageMetadataTexts,
  )
}

// 将图像元数据文本作为 isMeta 消息添加到结果中
function addImageMetadataMessage(
  result: ProcessUserInputBaseResult,
  imageMetadataTexts: string[],
): ProcessUserInputBaseResult {
  if (imageMetadataTexts.length > 0) {
    result.messages.push(
      createUserMessage({
        content: imageMetadataTexts.map(text => ({ type: 'text', text })),
        isMeta: true,
      }),
    )
  }
  return result
}
