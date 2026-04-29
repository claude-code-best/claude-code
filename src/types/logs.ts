import type { UUID } from 'crypto'
import type { FileHistorySnapshot } from 'src/utils/fileHistory.js'
import type { ContentReplacementRecord } from 'src/utils/toolResultStorage.js'
import type { AgentId } from './ids.js'
import type { Message } from './message.js'
import type { QueueOperationMessage } from './messageQueueTypes.js'

export type SerializedMessage = Message & {
  cwd: string
  userType: string
  entrypoint?: string // CLAUDE_CODE_ENTRYPOINT — 区分 cli/sdk-ts/sdk-py 等
  sessionId: string
  timestamp: string
  version: string
  gitBranch?: string
  slug?: string // 会话的 slug，用于计划文件（用于 resume）
}

export type LogOption = {
  date: string
  messages: SerializedMessage[]
  fullPath?: string
  value: number
  created: Date
  modified: Date
  firstPrompt: string
  messageCount: number
  fileSize?: number // 文件大小（字节），用于展示
  isSidechain: boolean
  isLite?: boolean // 为 true 表示精简日志（未加载消息）
  sessionId?: string // 精简日志的会话 ID
  teamName?: string // 如果是由衍生 agent 会话产生的，则为团队名称
  agentName?: string // agent 的自定义名称（来自 /rename 或 swarm）
  agentColor?: string // agent 的颜色（来自 /rename 或 swarm）
  agentSetting?: string // 使用的 agent 定义（来自 --agent 标志或 settings.agent）
  isTeammate?: boolean // 此会话是否由 swarm 队友创建
  leafUuid?: UUID // 如果提供，此 uuid 必须出现在数据库中
  summary?: string // 可选的会话摘要
  customTitle?: string // 用户设置的自定义标题
  tag?: string // 会话的可选标签（在 /resume 中可搜索）
  fileHistorySnapshots?: FileHistorySnapshot[] // 可选的文件历史快照
  attributionSnapshots?: AttributionSnapshotMessage[] // 可选的归因快照
  contextCollapseCommits?: ContextCollapseCommitEntry[] // 有序列表 —— commit B 可能引用 commit A 的摘要
  contextCollapseSnapshot?: ContextCollapseSnapshotEntry // 后写获胜 —— 分阶段队列 + 衍生状态
  gitBranch?: string // 会话结束时的 Git 分支
  projectPath?: string // 原始项目目录路径
  prNumber?: number // 链接到此会话的 GitHub PR 编号
  prUrl?: string // 链接到的 PR 的完整 URL
  prRepository?: string // 格式为 "owner/repo" 的仓库
  mode?: 'coordinator' | 'normal' // 会话模式，用于识别协调器/普通模式
  worktreeSession?: PersistedWorktreeSession | null // 会话结束时的 worktree 状态（null = 已退出，undefined = 从未进入）
  contentReplacements?: ContentReplacementRecord[] // 用于恢复时重建的替换决策
}

export type SummaryMessage = {
  type: 'summary'
  leafUuid: UUID
  summary: string
}

export type CustomTitleMessage = {
  type: 'custom-title'
  sessionId: UUID
  customTitle: string
}

/**
 * AI 生成的会话标题。与 CustomTitleMessage 的区别在于：
 * - 用户重命名（custom-title）在读取偏好上始终优先于 AI 标题
 * - reAppendSessionMetadata 不会重新追加 AI 标题（它们是临时的/可重新生成的；
 *   重新追加会在恢复时覆盖用户的重命名）
 * - VS Code 的 onlyIfNoCustomTitle CAS 检查仅匹配用户标题，
 *   允许 AI 覆盖自己之前生成的 AI 标题，但不能覆盖用户标题
 */
export type AiTitleMessage = {
  type: 'ai-title'
  sessionId: UUID
  aiTitle: string
}

export type LastPromptMessage = {
  type: 'last-prompt'
  sessionId: UUID
  lastPrompt: string
}

/**
 * 由 fork 定期生成的关于 agent 当前正在做什么的摘要。
 * 每 min(5 steps, 2min) 通过 fork 主线程（在回合中间）写入一次，
 * 以便 `claude ps` 能够显示比最后一条用户提示更有用的信息
 * （最后一条用户提示通常是 "ok go" 或 "fix it"）。
 */
export type TaskSummaryMessage = {
  type: 'task-summary'
  sessionId: UUID
  summary: string
  timestamp: string
}

export type TagMessage = {
  type: 'tag'
  sessionId: UUID
  tag: string
}

export type AgentNameMessage = {
  type: 'agent-name'
  sessionId: UUID
  agentName: string
}

export type AgentColorMessage = {
  type: 'agent-color'
  sessionId: UUID
  agentColor: string
}

export type AgentSettingMessage = {
  type: 'agent-setting'
  sessionId: UUID
  agentSetting: string
}

/**
 * 存储在会话记录中的 PR 链接消息。
 * 将会话链接到 GitHub pull request，用于跟踪和导航。
 */
export type PRLinkMessage = {
  type: 'pr-link'
  sessionId: UUID
  prNumber: number
  prUrl: string
  prRepository: string // 例如 "owner/repo"
  timestamp: string // 链接时的 ISO 时间戳
}

export type ModeEntry = {
  type: 'mode'
  sessionId: UUID
  mode: 'coordinator' | 'normal'
}

/**
 * 为了恢复而持久化到转录中的 worktree 会话状态。
 * 来自 utils/worktree.ts 中 WorktreeSession 的子集 —— 排除仅用于
 * 首次运行分析的临时字段（creationDurationMs、usedSparsePaths）。
 */
export type PersistedWorktreeSession = {
  originalCwd: string
  worktreePath: string
  worktreeName: string
  worktreeBranch?: string
  originalBranch?: string
  originalHeadCommit?: string
  sessionId: string
  tmuxSessionName?: string
  hookBased?: boolean
}

/**
 * 记录会话当前是否处于由 EnterWorktree 或 --worktree 创建的 worktree 内部。
 * 后写获胜：enter 写入会话，exit 写入 null。在 --resume 时，
 * 仅当 worktreePath 在磁盘上仍然存在时才恢复（/exit 对话框可能会将其删除）。
 */
export type WorktreeStateEntry = {
  type: 'worktree-state'
  sessionId: UUID
  worktreeSession: PersistedWorktreeSession | null
}

/**
 * 记录那些在上下文中被替换为更小存根的内容块（完整内容已持久化到其他地方）。
 * 在恢复时重放，以保证提示缓存的稳定性。每次执行替换至少一个块的强制传递时写入一次。
 * 当设置了 agentId 时，该记录属于子 agent 侧链（AgentTool 恢复时会读取这些记录）；
 * 当未设置时，属于主线程（/resume 读取这些记录）。
 */
export type ContentReplacementEntry = {
  type: 'content-replacement'
  sessionId: UUID
  agentId?: AgentId
  replacements: ContentReplacementRecord[]
}

export type FileHistorySnapshotMessage = {
  type: 'file-history-snapshot'
  messageId: UUID
  snapshot: FileHistorySnapshot
  isSnapshotUpdate: boolean
}

/**
 * 每文件的归因状态，跟踪 Claude 的字符贡献量。
 */
export type FileAttributionState = {
  contentHash: string // 文件内容的 SHA-256 哈希值
  claudeContribution: number // Claude 写入的字符数
  mtime: number // 文件修改时间
}

/**
 * 存储在会话转录中的归因快照消息。
 * 跟踪 Claude 在字符级别的贡献，用于提交归因。
 */
export type AttributionSnapshotMessage = {
  type: 'attribution-snapshot'
  messageId: UUID
  surface: string // 客户端面（cli、ide、web、api）
  fileStates: Record<string, FileAttributionState>
  promptCount?: number // 会话中的总提示次数
  promptCountAtLastCommit?: number // 上一次提交时的提示次数
  permissionPromptCount?: number // 显示的总许可提示次数
  permissionPromptCountAtLastCommit?: number // 上一次提交时的许可提示次数
  escapeCount?: number // ESC 按键总次数（取消的许可提示）
  escapeCountAtLastCommit?: number // 上一次提交时的 ESC 按键次数
}

export type TranscriptMessage = SerializedMessage & {
  parentUuid: UUID | null
  logicalParentUuid?: UUID | null // 当 parentUuid 因会话中断被置空时，保留逻辑父节点
  isSidechain: boolean
  gitBranch?: string
  agentId?: string // 侧链转录的 Agent ID，用于恢复 agent
  teamName?: string // 如果是由衍生 agent 会话产生的，则为团队名称
  agentName?: string // agent 的自定义名称（来自 /rename 或 swarm）
  agentColor?: string // agent 的颜色（来自 /rename 或 swarm）
  promptId?: string // 对于用户提示消息，与 OTel prompt.id 关联
}

export type SpeculationAcceptMessage = {
  type: 'speculation-accept'
  timestamp: string
  timeSavedMs: number
}

/**
 * 持久化的上下文折叠提交。归档的消息本身不会持久化 —— 它们已经作为普通的 user/
 * assistant 消息存在于转录中。我们仅持久化足够的数据以重建拼接指令（边界 uuid）
 * 和摘要占位符（该占位符不在转录中，因为它从未交给 REPL）。
 *
 * 恢复时，存储层用 archived=[] 重建 CommittedCollapse；
 * projectView 在首次找到该区间时惰性填充归档。
 *
 * 判别器使用模糊名称以匹配门控名称。sessionStorage.ts 不受功能门控影响
 * （它是被每个条目类型使用的通用转录管道），因此这里的描述性字符串会通过
 * appendEntry 分发 / loadTranscriptFile 解析泄漏到外部构建中，即使外部构建
 * 从未写入或读取此条目。
 */
export type ContextCollapseCommitEntry = {
  type: 'marble-origami-commit'
  sessionId: UUID
  /** 16 位折叠 ID。所有条目中的最大值用于重置 ID 计数器。 */
  collapseId: string
  /** 摘要占位符的 uuid —— registerSummary() 需要它。 */
  summaryUuid: string
  /** 用于占位符的完整 <collapsed id="...">text</collapsed> 字符串。 */
  summaryContent: string
  /** 用于 ctx_inspect 的纯文本摘要。 */
  summary: string
  /** 区间边界 —— projectView 在恢复后的 Message[] 中找到它们。 */
  firstArchivedUuid: string
  lastArchivedUuid: string
}

/**
 * 分阶段队列和衍生触发器状态的快照。与提交（追加写入，全部重放）不同，
 * 快照是后写获胜 —— 恢复时仅应用最近的快照条目。
 * 在每次 ctx-agent 衍生解析后写入（当分阶段内容可能已更改时）。
 *
 * 分阶段边界是 UUID（会话稳定），而不是折叠 ID（折叠 ID 会随 uuidToId
 * 双射映射重置）。恢复分阶段区间会在下一次装饰/展示时为这些消息分配
 * 新的折叠 ID，但区间本身能够正确解析。
 */
export type ContextCollapseSnapshotEntry = {
  type: 'marble-origami-snapshot'
  sessionId: UUID
  staged: Array<{
    startUuid: string
    endUuid: string
    summary: string
    risk: number
    stagedAt: number
  }>
  /** 衍生触发器状态 —— 以便 +interval 时钟从中断处继续。 */
  armed: boolean
  lastSpawnTokens: number
}

export type Entry =
  | TranscriptMessage
  | SummaryMessage
  | CustomTitleMessage
  | AiTitleMessage
  | LastPromptMessage
  | TaskSummaryMessage
  | TagMessage
  | AgentNameMessage
  | AgentColorMessage
  | AgentSettingMessage
  | PRLinkMessage
  | FileHistorySnapshotMessage
  | AttributionSnapshotMessage
  | QueueOperationMessage
  | SpeculationAcceptMessage
  | ModeEntry
  | WorktreeStateEntry
  | ContentReplacementEntry
  | ContextCollapseCommitEntry
  | ContextCollapseSnapshotEntry

export function sortLogs(logs: LogOption[]): LogOption[] {
  return logs.sort((a, b) => {
    // 按修改日期排序（最新的在前）
    const modifiedDiff = b.modified.getTime() - a.modified.getTime()
    if (modifiedDiff !== 0) {
      return modifiedDiff
    }

    // 如果修改日期相同，则按创建日期排序（最新的在前）
    return b.created.getTime() - a.created.getTime()
  })
}