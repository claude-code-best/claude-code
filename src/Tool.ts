import type {
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
export type { ToolResultBlockParam }
import type {
  ElicitRequestURLParams,
  ElicitResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { UUID } from 'crypto'
import type { z } from 'zod/v4'
import type { Command } from './commands.js'
import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import type { ThinkingConfig } from './utils/thinking.js'

export type ToolInputJSONSchema = {
  [x: string]: unknown
  type: 'object'
  properties?: {
    [x: string]: unknown
  }
}

import type { Notification } from './context/notifications.js'
import type {
  MCPServerConnection,
  ServerResource,
} from './services/mcp/types.js'
import type {
  AgentDefinition,
  AgentDefinitionsResult,
} from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  ProgressMessage,
  SystemLocalCommandMessage,
  SystemMessage,
  UserMessage,
} from './types/message.js'
// 从集中位置导入权限类型以打破导入循环
// 从集中位置导入 PermissionResult 以打破导入循环
import type {
  AdditionalWorkingDirectory,
  PermissionMode,
  PermissionResult,
} from './types/permissions.js'
// 从集中位置导入工具进度类型以打破导入循环
import type {
  AgentToolProgress,
  BashProgress,
  MCPProgress,
  REPLToolProgress,
  SkillToolProgress,
  TaskOutputProgress,
  ToolProgressData,
  WebSearchProgress,
} from './types/tools.js'
import type { FileStateCache } from './utils/fileStateCache.js'
import type { DenialTrackingState } from './utils/permissions/denialTracking.js'
import type { SystemPrompt } from './utils/systemPromptType.js'
import type { ContentReplacementState } from './utils/toolResultStorage.js'

// 重新导出进度类型以保持向后兼容性
export type {
  AgentToolProgress,
  BashProgress,
  MCPProgress,
  REPLToolProgress,
  SkillToolProgress,
  TaskOutputProgress,
  WebSearchProgress,
}

import type { SpinnerMode } from './components/Spinner.js'
import type { QuerySource } from './constants/querySource.js'
import type { SDKStatus } from './entrypoints/agentSdkTypes.js'
import type { AppState } from './state/AppState.js'
import type { LangfuseSpan } from './services/langfuse/index.js'
import type {
  HookProgress,
  PromptRequest,
  PromptResponse,
} from './types/hooks.js'
import type { AgentId } from './types/ids.js'
import type { DeepImmutable } from './types/utils.js'
import type { AttributionState } from './utils/commitAttribution.js'
import type { FileHistoryState } from './utils/fileHistory.js'
import type { Theme, ThemeName } from './utils/theme.js'

export type QueryChainTracking = {
  chainId: string
  depth: number
}

export type ValidationResult =
  | { result: true }
  | {
      result: false
      message: string
      errorCode: number
    }

export type SetToolJSXFn = (
  args: {
    jsx: React.ReactNode | null
    shouldHidePromptInput: boolean
    shouldContinueAnimation?: true
    showSpinner?: boolean
    isLocalJSXCommand?: boolean
    isImmediate?: boolean
    /** 设为 true 以清除本地 JSX 命令（例如，从其 onDone 回调中） */
    clearLocalJSX?: boolean
  } | null,
) => void

// 从集中位置导入工具权限类型以打破导入循环
import type { ToolPermissionRulesBySource } from './types/permissions.js'

// 重新导出以保持向后兼容性
export type { ToolPermissionRulesBySource }

// 对导入的类型应用 DeepImmutable
export type ToolPermissionContext = DeepImmutable<{
  mode: PermissionMode
  additionalWorkingDirectories: Map<string, AdditionalWorkingDirectory>
  alwaysAllowRules: ToolPermissionRulesBySource
  alwaysDenyRules: ToolPermissionRulesBySource
  alwaysAskRules: ToolPermissionRulesBySource
  isBypassPermissionsModeAvailable: boolean
  isAutoModeAvailable?: boolean
  strippedDangerousRules?: ToolPermissionRulesBySource
  /** 为 true 时，权限提示将自动拒绝（例如，无法显示 UI 的后台代理） */
  shouldAvoidPermissionPrompts?: boolean
  /** 为 true 时，在显示权限对话框前等待自动化检查（分类器、钩子）（协调器工作线程） */
  awaitAutomatedChecksBeforeDialog?: boolean
  /** 存储模型启动的计划模式进入前的权限模式，以便在退出时恢复 */
  prePlanMode?: PermissionMode
}>

export const getEmptyToolPermissionContext: () => ToolPermissionContext =
  () => ({
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
  })

export type CompactProgressEvent =
  | {
      type: 'hooks_start'
      hookType: 'pre_compact' | 'post_compact' | 'session_start'
    }
  | { type: 'compact_start' }
  | { type: 'compact_end' }

export type ToolUseContext = {
  options: {
    commands: Command[]
    debug: boolean
    mainLoopModel: string
    tools: Tools
    verbose: boolean
    thinkingConfig: ThinkingConfig
    mcpClients: MCPServerConnection[]
    mcpResources: Record<string, ServerResource[]>
    isNonInteractiveSession: boolean
    agentDefinitions: AgentDefinitionsResult
    maxBudgetUsd?: number
    /** 替换默认系统提示的自定义系统提示 */
    customSystemPrompt?: string
    /** 在主系统提示后追加的额外系统提示 */
    appendSystemPrompt?: string
    /** 覆盖用于分析跟踪的 querySource */
    querySource?: QuerySource
    /** 用于获取最新工具的可选回调（例如，在 MCP 服务器在查询中途连接后） */
    refreshTools?: () => Tools
    /**
     * @internal TEST-ONLY ESCAPE HATCH. MUST remain undefined in production.
     *
     * Allows non-bundled unit-test harnesses to exercise the background
     * forked slash command path that production assistant mode gates behind
     * `feature('KAIROS')`. Still requires `AppState.kairosEnabled`. This
     * field is constructed in-process by trusted application code only;
     * no external surface (MCP, plugin, slash command, network) writes to
     * `ToolUseContext.options`. Setting this true outside a test bypasses
     * the KAIROS feature flag; `processSlashCommand` rejects this flag
     * outside `NODE_ENV=test`.
     */
    allowBackgroundForkedSlashCommands?: boolean
  }
  abortController: AbortController
  readFileState: FileStateCache
  getAppState(): AppState
  setAppState(f: (prev: AppState) => AppState): void
  /** * 用于会话范围基础设施（后台任务、会话钩子）的始终共享的 setAppState。与 setAppState 不同（对于异步代理是空操作，参见 createSubagentContext），此方法始终到达根存储，因此任何嵌套深度的代理都可以注册/清理超出单个回合生命周期的基础设施。仅由 createSubagentContext 设置；主线程上下文回退到 setAppState。 */
  setAppStateForTasks?: (f: (prev: AppState) => AppState) => void
  /** * 用于处理由工具调用错误（-32042）触发的 URL 请求的可选处理器。在打印/SDK 模式下，此处理器委托给 structuredIO.handleElicitation。在 REPL 模式下，此处理器未定义，使用基于队列的 UI 路径。 */
  handleElicitation?: (
    serverName: string,
    params: ElicitRequestURLParams,
    signal: AbortSignal,
  ) => Promise<ElicitResult>
  setToolJSX?: SetToolJSXFn
  addNotification?: (notif: Notification) => void
  /** 向 REPL 消息列表追加一条仅用于 UI 的系统消息。在 normalizeMessagesForAPI 边界处被剥离 — Exclude<> 确保了类型强制执行。 */
  appendSystemMessage?: (
    msg: Exclude<SystemMessage, SystemLocalCommandMessage>,
  ) => void
  /** 发送操作系统级别的通知（iTerm2、Kitty、Ghostty、铃声等） */
  sendOSNotification?: (opts: {
    message: string
    notificationType: string
  }) => void
  nestedMemoryAttachmentTriggers?: Set<string>
  /** * 本次会话中已作为 nested_memory 附件注入的 CLAUDE.md 路径。为 memoryFilesToAttachments 去重 — readFileState 是一个 LRU 缓存，在繁忙会话中会逐出条目，因此仅靠其 .has() 检查可能会重新注入同一个 CLAUDE.md 数十次。 */
  loadedNestedMemoryPaths?: Set<string>
  dynamicSkillDirTriggers?: Set<string>
  /** 本次会话中通过 skill_discovery 公开的技能名称。仅用于遥测（反馈 was_discovered）。 */
  discoveredSkillNames?: Set<string>
  userModified?: boolean
  setInProgressToolUseIDs: (f: (prev: Set<string>) => Set<string>) => void
  /** 仅在交互式（REPL）上下文中连接；SDK/QueryEngine 不设置此项。 */
  setHasInterruptibleToolInProgress?: (v: boolean) => void
  setResponseLength: (f: (prev: number) => number) => void
  /** 仅限 Ant：为 OTPS 跟踪推送新的 API 指标条目。当新的 API 请求开始时由子代理流调用。 */
  pushApiMetricsEntry?: (ttftMs: number) => void
  setStreamMode?: (mode: SpinnerMode) => void
  onCompactProgress?: (event: CompactProgressEvent) => void
  setSDKStatus?: (status: SDKStatus) => void
  openMessageSelector?: () => void
  updateFileHistoryState: (
    updater: (prev: FileHistoryState) => FileHistoryState,
  ) => void
  updateAttributionState: (
    updater: (prev: AttributionState) => AttributionState,
  ) => void
  setConversationId?: (id: UUID) => void
  agentId?: AgentId // Only set for subagents; use getSessionId() for session ID. Hooks use this to distinguish subagent calls.
  agentType?: string // Subagent type name. For the main thread's --agent type, hooks fall back to getMainThreadAgentType().
  /** 为 true 时，即使钩子自动批准，也必须始终调用 canUseTool。用于推测覆盖文件路径重写。 */
  requireCanUseTool?: boolean
  messages: Message[]
  fileReadingLimits?: {
    maxTokens?: number
    maxSizeBytes?: number
  }
  globLimits?: {
    maxResults?: number
  }
  toolDecisions?: Map<
    string,
    {
      source: string
      decision: 'accept' | 'reject'
      timestamp: number
    }
  >
  queryTracking?: QueryChainTracking
  /** 用于向用户请求交互式提示的回调工厂。返回一个绑定到给定源名称的提示回调。仅在交互式（REPL）上下文中可用。 */
  requestPrompt?: (
    sourceName: string,
    toolInputSummary?: string | null,
  ) => (request: PromptRequest) => Promise<PromptResponse>
  toolUseId?: string
  criticalSystemReminder_EXPERIMENTAL?: string
  /** 此查询轮次的 Langfuse 根跟踪跨度。传递给工具执行以实现可观测性。----本Agent自己在query.ts中创建的*/
  langfuseTrace?: LangfuseSpan | null
  /** 外部/主代理跟踪的 Langfuse 根跟踪跨度。当子代理需要将观测嵌套在父代理跟踪下时使用。----父Agent创建并传递过来的*/
  langfuseRootTrace?: LangfuseSpan | null
  /** 封装并发工具组的 Langfuse 批处理跨度。设置后，工具观测将嵌套在其下。----串行、并行都会使用它*/
  langfuseBatchSpan?: LangfuseSpan | null
  /** 为 true 时，即使在子代理上，也保留消息上的 toolUseResult。用于其对话记录对用户可见的进程内队友。 */
  preserveToolUseResults?: boolean
  /** 针对 setAppState 为空操作的异步子代理的本地拒绝跟踪状态。没有此状态，拒绝计数器永远不会累积，并且永远不会达到回退到提示的阈值。可变 — 权限代码会就地更新它。 */
  localDenialTracking?: DenialTrackingState
  /** * 用于工具结果预算的每个对话线程内容替换状态。存在时，query.ts 应用聚合工具结果预算。主线程：REPL 配置一次（从不重置 — 过时的 UUID 键是惰性的）。子代理：createSubagentContext 默认克隆父级状态（缓存共享分支需要相同的决策），或者 resumeAgentBackground 线程从侧链记录重建一个状态。 */
  contentReplacementState?: ContentReplacementState
  /** * 父代理已渲染的系统提示字节数，在回合开始时冻结。
   * 用于分叉子代理共享父代理的提示缓存——在分叉生成时重新调用
   * getSystemPrompt() 可能导致差异（GrowthBook 冷启动→热启动）
   * 并破坏缓存。参见 forkSubagent.ts。 */
  renderedSystemPrompt?: SystemPrompt
}

// 从集中位置重新导出 ToolProgressData
export type { ToolProgressData }

export type Progress = ToolProgressData | HookProgress

export type ToolProgress<P extends ToolProgressData> = {
  toolUseID: string
  data: P
}

export function filterToolProgressMessages(
  progressMessagesForMessage: ProgressMessage[],
): ProgressMessage<ToolProgressData>[] {
  return progressMessagesForMessage.filter(
    (msg): msg is ProgressMessage<ToolProgressData> =>
      (msg.data as { type?: string })?.type !== 'hook_progress',
  )
}

export type ToolResult<T> = {
  data: T
  newMessages?: (
    | UserMessage
    | AssistantMessage
    | AttachmentMessage
    | SystemMessage
  )[]
  // contextModifier 仅对非并发安全的工具生效。
  contextModifier?: (context: ToolUseContext) => ToolUseContext
  /** 要传递给 SDK 消费者的 MCP 协议元数据（structuredContent, _meta） */
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
}

export type ToolCallProgress<P extends ToolProgressData = ToolProgressData> = (
  progress: ToolProgress<P>,
) => void

// 任何输出具有字符串键对象的模式的类型
export type AnyObject = z.ZodType<{ [key: string]: unknown }>

/** * 检查工具是否匹配给定名称（主名称或别名）。 */
export function toolMatchesName(
  tool: { name: string; aliases?: string[] },
  name: string,
): boolean {
  return tool.name === name || (tool.aliases?.includes(name) ?? false)
}

/** * 从工具列表中按名称或别名查找工具。 */
export function findToolByName(tools: Tools, name: string): Tool | undefined {
  return tools.find(t => toolMatchesName(t, name))
}

export type Tool<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = {
  /** * 工具重命名时用于向后兼容的可选别名。
   * 除了主名称外，工具也可以通过其中任何一个名称被查找。 */
  aliases?: string[]
  /** * ToolSearch 用于关键词匹配的单行能力短语。
   * 当工具被延迟加载时，帮助模型通过关键词搜索找到此工具。
   * 3–10 个词，末尾不加句号。
   * 优先使用工具名称中未出现的术语（例如，NotebookEdit 用 'jupyter'）。 */
  searchHint?: string
  call(
    args: z.infer<Input>,
    context: ToolUseContext,
    canUseTool: CanUseToolFn,
    parentMessage: AssistantMessage,
    onProgress?: ToolCallProgress<P>,
  ): Promise<ToolResult<Output>>
  description(
    input: z.infer<Input>,
    options: {
      isNonInteractiveSession: boolean
      toolPermissionContext: ToolPermissionContext
      tools: Tools
    },
  ): Promise<string>
  readonly inputSchema: Input
  // 可以直接以 JSON Schema 格式指定其输入模式的 MCP 工具类型
  // 而不是从 Zod 模式转换而来
  readonly inputJSONSchema?: ToolInputJSONSchema
  // 可选，因为 TungstenTool 未定义此属性。TODO：将其设为必需。
  // 当我们完成那一步时，我们也可以进一步处理，使其类型更安全一些。
  outputSchema?: z.ZodType<unknown>
  inputsEquivalent?(a: z.infer<Input>, b: z.infer<Input>): boolean
  isConcurrencySafe(input: z.infer<Input>): boolean
  isEnabled(): boolean
  isReadOnly(input: z.infer<Input>): boolean
  /** 默认为 false。仅当工具执行不可逆操作（删除、覆盖、发送）时设置。 */
  isDestructive?(input: z.infer<Input>): boolean
  /** * 当此工具正在运行时，用户提交新消息时应发生什么。
   *
   * - `'cancel'` — 停止工具并丢弃其结果
   * - `'block'`  — 继续运行；新消息等待
   *
   * 未实现时默认为 `'block'`。 */
  interruptBehavior?(): 'cancel' | 'block'
  /** * 返回关于此工具使用是否为应在 UI 中折叠为精简显示的搜索或读取操作的信息。
   * 示例包括文件搜索（Grep, Glob）、文件读取（Read）以及 bash 命令如 find、
   * grep、wc 等。
   *
   * 返回一个指示操作是否为搜索或读取操作的对象：
   * - `isSearch: true` 用于搜索操作（grep, find, glob 模式）
   * - `isRead: true` 用于读取操作（cat, head, tail, 文件读取）
   * - `isList: true` 用于目录列表操作（ls, tree, du）
   * - 如果操作不应被折叠，则所有值均可为 false */
  isSearchOrReadCommand?(input: z.infer<Input>): {
    isSearch: boolean
    isRead: boolean
    isList?: boolean
  }
  isOpenWorld?(input: z.infer<Input>): boolean
  requiresUserInteraction?(): boolean
  isMcp?: boolean
  isLsp?: boolean
  /** * 为 true 时，此工具被延迟加载（以 defer_loading: true 发送），需要
   * 在使用 ToolSearch 后才能被调用。 */
  readonly shouldDefer?: boolean
  /** * 为 true 时，此工具永远不会被延迟加载——即使启用了 ToolSearch，其完整模式
   * 也会出现在初始提示中。对于 MCP 工具，通过 `_meta['anthropic/alwaysLoad']` 设置。
   * 用于模型必须在第一回合看到而无需 ToolSearch 往返的工具。 */
  readonly alwaysLoad?: boolean
  /** * 对于 MCP 工具：从 MCP 服务器接收到的服务器和工具名称（未规范化）。
   * 存在于所有 MCP 工具上，无论 `name` 是否带有前缀（mcp__server__tool）
   * 或不带前缀（CLAUDE_AGENT_SDK_MCP_NO_PREFIX 模式）。 */
  mcpInfo?: { serverName: string; toolName: string }
  readonly name: string
  /** * 工具结果在被持久化到磁盘前的最大字符大小。
   * 超过此限制时，结果将保存到文件中，Claude 将收到包含文件路径的预览
   * 而非完整内容。
   *
   * 对于输出绝不应被持久化的工具（例如 Read，
   * 持久化会导致 Read→文件→Read 的循环，且该工具
   * 已通过其自身限制进行自约束），设置为 Infinity。 */
  maxResultSizeChars: number
  /** * 为 true 时，为此工具启用严格模式，这将使 API 更严格地
   * 遵循工具指令和参数模式。
   * 仅在 tengu_tool_pear 启用时应用。 */
  readonly strict?: boolean

  /** * 在观察者（SDK 流、
   * 转录、canUseTool、PreToolUse/PostToolUse 钩子）看到 tool_use 输入之前，在其副本上调用。
   * 就地修改以添加遗留/派生字段。必须是幂等的。原始的 API 绑定
   * 输入永远不会被修改（保留提示缓存）。当钩子/权限返回新的 updatedInput 时
   * 不会重新应用——它们拥有自己的形状。 */
  backfillObservableInput?(input: Record<string, unknown>): void

  /** * 确定在当前上下文中是否允许此工具使用此输入运行。
   * 它告知模型工具使用失败的原因，并不直接显示任何 UI。
   * @param input
   * @param context */
  validateInput?(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<ValidationResult>

  /** * 确定是否向用户请求权限。仅在 validateInput() 通过后调用。
   * 通用权限逻辑在 permissions.ts 中。此方法包含工具特定的逻辑。
   * @param input
   * @param context */
  checkPermissions(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<PermissionResult>

  // 用于操作文件路径的工具的可选方法
  getPath?(input: z.infer<Input>): string

  /** * 为钩子 `if` 条件（权限规则模式，如来自 "Bash(git *)" 的 "git *"）
   * 准备一个匹配器。每个钩子-输入对调用一次；任何
   * 昂贵的解析都在此处进行。返回一个闭包，该闭包针对每个
   * 钩子模式被调用。如果未实现，则仅工具名称级别的匹配有效。 */
  preparePermissionMatcher?(
    input: z.infer<Input>,
  ): Promise<(pattern: string) => boolean>

  prompt(options: {
    getToolPermissionContext: () => Promise<ToolPermissionContext>
    tools: Tools
    agents: AgentDefinition[]
    allowedAgentTypes?: string[]
  }): Promise<string>
  userFacingName(input: Partial<z.infer<Input>> | undefined): string
  userFacingNameBackgroundColor?(
    input: Partial<z.infer<Input>> | undefined,
  ): keyof Theme | undefined
  /** * 透明包装器（例如 REPL）将所有渲染委托给其进度
   * 处理器，该处理器为每个内部工具调用发出原生外观的块。
   * 包装器本身不显示任何内容。 */
  isTransparentWrapper?(): boolean
  /** * 返回此工具使用的简短字符串摘要，用于在紧凑视图中显示。
   * @param input 工具输入
   * @returns 简短字符串摘要，或 null 表示不显示 */
  getToolUseSummary?(input: Partial<z.infer<Input>> | undefined): string | null
  /** * 返回用于旋转器显示的人类可读的现在时活动描述。
   * 示例："正在读取 src/foo.ts"、"正在运行 bun test"、"正在搜索模式"
   * @param input 工具输入
   * @returns 活动描述字符串，或 null 以回退到工具名称 */
  getActivityDescription?(
    input: Partial<z.infer<Input>> | undefined,
  ): string | null
  /** * 返回此工具使用的紧凑表示，用于自动模式
   * 安全分类器。示例：Bash 的 `ls -la`，
   * Edit 的 `/tmp/x: new content`。
   * 返回 '' 以在分类器转录中跳过此工具
   * （例如，与安全无关的工具）。可以返回一个对象以避免
   * 调用者 JSON 包装值时进行双重编码。 */
  toAutoClassifierInput(input: z.infer<Input>): unknown
  mapToolResultToToolResultBlockParam(
    content: Output,
    toolUseID: string,
  ): ToolResultBlockParam
  /** * 可选。省略时，工具结果不渲染任何内容（与返回 null 相同）。对于结果在其他地方展示的工具（例如，TodoWrite 更新待办事项面板而非对话记录），请省略。 */
  renderToolResultMessage?(
    content: Output,
    progressMessagesForMessage: ProgressMessage<P>[],
    options: {
      style?: 'condensed'
      theme: ThemeName
      tools: Tools
      verbose: boolean
      isTranscriptMode?: boolean
      isBriefOnly?: boolean
      /** 原始 tool_use 输入（如果可用）。适用于需要引用请求内容的简洁结果摘要（例如“已发送至 #foo”）。 */
      input?: unknown
    },
  ): React.ReactNode
  /** * 在对话记录模式下（verbose=true, isTranscriptMode=true），renderToolResultMessage 所展示的扁平化文本。用于对话记录搜索索引：索引统计此字符串中的出现次数，高亮覆盖层扫描实际的屏幕缓冲区。为使计数与高亮匹配，此方法必须返回最终可见的文本——而非来自 mapToolResultToToolResultBlockParam 的面向模型的序列化（后者会添加系统提醒、持久化输出包装器）。
   *
   * 可以跳过无关紧要的文本（少量漏计是可以接受的）。例如“在 12ms 内找到 3 个文件”不值得索引。但幻影文本是不允许的——此处声明但未渲染的文本会导致计数≠高亮的错误。
   *
   * 可选：省略 → 使用 transcriptSearch.ts 中的字段名启发式方法。
   * 偏差由 test/utils/transcriptSearch.renderFidelity.test.tsx 捕获，该测试渲染示例输出并标记出已索引但未渲染（幻影）或已渲染但未索引（漏计警告）的文本。 */
  extractSearchText?(out: Output): string
  /** * 渲染工具使用消息。注意 `input` 是部分的，因为我们尽可能早地渲染消息，可能在工具参数完全流式传输完成之前。 */
  renderToolUseMessage(
    input: Partial<z.infer<Input>>,
    options: { theme: ThemeName; verbose: boolean; commands?: Command[] },
  ): React.ReactNode
  /** * 当此输出的非详细渲染被截断时返回 true（即，点击展开会显示更多内容）。控制全屏模式下的点击展开行为——只有 verbose 模式确实显示更多内容的消息才会获得悬停/点击提示。未设置表示从不截断。 */
  isResultTruncated?(output: Output): boolean
  /** * 渲染一个可选的标签，显示在工具使用消息之后。用于显示额外的元数据，如超时、模型、恢复 ID 等。返回 null 则不显示任何内容。 */
  renderToolUseTag?(input: Partial<z.infer<Input>>): React.ReactNode
  /** * 可选。省略时，工具运行期间不显示进度 UI。 */
  renderToolUseProgressMessage?(
    progressMessagesForMessage: ProgressMessage<P>[],
    options: {
      tools: Tools
      verbose: boolean
      terminalSize?: { columns: number; rows: number }
      inProgressToolCallCount?: number
      isTranscriptMode?: boolean
    },
  ): React.ReactNode
  renderToolUseQueuedMessage?(): React.ReactNode
  /** * 可选。省略时，回退到 <FallbackToolUseRejectedMessage />。仅当工具需要自定义拒绝 UI 时才定义此方法（例如，显示被拒绝差异的文件编辑）。 */
  renderToolUseRejectedMessage?(
    input: z.infer<Input>,
    options: {
      columns: number
      messages: Message[]
      style?: 'condensed'
      theme: ThemeName
      tools: Tools
      verbose: boolean
      progressMessagesForMessage: ProgressMessage<P>[]
      isTranscriptMode?: boolean
    },
  ): React.ReactNode
  /** * 可选。省略时，回退到 <FallbackToolUseErrorMessage />。仅当工具需要自定义错误 UI 时才定义此方法（例如，搜索工具显示“文件未找到”而非原始错误）。 */
  renderToolUseErrorMessage?(
    result: ToolResultBlockParam['content'],
    options: {
      progressMessagesForMessage: ProgressMessage<P>[]
      tools: Tools
      verbose: boolean
      isTranscriptMode?: boolean
    },
  ): React.ReactNode

  /** * 将此工具的多个并行实例作为一个组进行渲染。
   * @returns 要渲染的 React 节点，或 null 以回退到单独渲染 */
  /** * 将多个工具使用作为一个组进行渲染（仅限非详细模式）。
   * 在详细模式下，各个工具使用在其原始位置渲染。
   * @returns 要渲染的 React 节点，或 null 以回退到单独渲染 */
  renderGroupedToolUse?(
    toolUses: Array<{
      param: ToolUseBlockParam
      isResolved: boolean
      isError: boolean
      isInProgress: boolean
      progressMessages: ProgressMessage<P>[]
      result?: {
        param: ToolResultBlockParam
        output: unknown
      }
    }>,
    options: {
      shouldAnimate: boolean
      tools: Tools
    },
  ): React.ReactNode | null
}

/** * 工具的集合。使用此类型而非 `Tool[]`，以便于在整个代码库中追踪工具集的组装、传递和过滤位置。 */
export type Tools = readonly Tool[]

/** * `buildTool` 提供默认实现的方法。`ToolDef` 可以省略这些方法；生成的 `Tool` 始终包含它们。 */
type DefaultableToolKeys =
  | 'isEnabled'
  | 'isConcurrencySafe'
  | 'isReadOnly'
  | 'isDestructive'
  | 'checkPermissions'
  | 'toAutoClassifierInput'
  | 'userFacingName'

/** * `buildTool` 接受的工具定义。与 `Tool` 结构相同，但可默认的方法为可选——`buildTool` 会填充它们，因此调用方始终看到一个完整的 `Tool`。 */
export type ToolDef<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = Omit<Tool<Input, Output, P>, DefaultableToolKeys> &
  Partial<Pick<Tool<Input, Output, P>, DefaultableToolKeys>>

/** * 类型层面的展开，镜像 `{ ...TOOL_DEFAULTS, ...def }`。对于每个可默认的键：如果 D 提供了它（必需），则 D 的类型优先；如果 D 省略了它或使其为可选（继承自约束中的 Partial<>），则由默认值填充。所有其他键均直接来自 D——保持参数数量、可选性以及字面量类型，与 `satisfies Tool` 完全一致。 */
type BuiltTool<D> = Omit<D, DefaultableToolKeys> & {
  [K in DefaultableToolKeys]-?: K extends keyof D
    ? undefined extends D[K]
      ? ToolDefaults[K]
      : D[K]
    : ToolDefaults[K]
}

/** * 从部分定义构建完整的 `Tool`，为通常存根化的方法填充安全的默认值。所有工具导出都应通过此函数，以便默认值集中在一处，调用方无需使用 `?.() ?? default`。
 *
 * 默认值（在关键处采用故障关闭原则）：
 * - `isEnabled` → `true`
 * - `isConcurrencySafe` → `false`（假设不安全）
 * - `isReadOnly` → `false`（假设有写入操作）
 * - `isDestructive` → `false`
 * - `checkPermissions` → `{ behavior: 'allow', updatedInput }`（交由通用权限系统处理）
 * - `toAutoClassifierInput` → `''`（跳过分类器——安全相关工具必须重写）
 * - `userFacingName` → `name` */
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: (_input?: unknown) => false,
  isReadOnly: (_input?: unknown) => false,
  isDestructive: (_input?: unknown) => false,
  checkPermissions: (
    input: { [key: string]: unknown },
    _ctx?: ToolUseContext,
  ): Promise<PermissionResult> =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: (_input?: unknown) => '',
  userFacingName: (_input?: unknown) => '',
}

// 默认值类型是 TOOL_DEFAULTS 的实际形状（参数可选，以便
// 零参数和全参数调用点都能通过类型检查——存根的参数数量各异，
// 测试依赖于此），而非接口的严格签名。
type ToolDefaults = typeof TOOL_DEFAULTS

// D 从调用点推断具体的对象字面量类型。
// 约束为方法参数提供上下文类型；约束位置的 `any` 是结构性的，
// 永远不会泄漏到返回类型中。
// BuiltTool<D> 在类型层面镜像运行时的 `{...TOOL_DEFAULTS, ...def}`。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDef = ToolDef<any, any, any>

export function buildTool<D extends AnyToolDef>(def: D): BuiltTool<D> {
  // 运行时的展开是直接的；`as` 桥接了
  // 结构性 any 约束与精确的 BuiltTool<D> 返回类型之间的间隙。
  // 其类型语义已通过所有 60 多个工具的零错误类型检查得到验证。
  return {
    ...TOOL_DEFAULTS,
    userFacingName: () => def.name,
    ...def,
  } as BuiltTool<D>
}
