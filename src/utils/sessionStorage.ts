/**
 * 会话存储实用函数，用于管理对话记录文件的写入、读取、清理和元数据。
 */

import { feature } from 'bun:bundle'
import type { UUID } from 'crypto'
import type { Dirent } from 'fs'
// 用于 readFileTailSync 的同步 fs 原语 — 与上面的 fs/promises 导入分开。
// 按 CLAUDE.md 风格使用具名导入（非通配符）；避免与异步后缀名称冲突。
import { closeSync, fstatSync, openSync, readSync } from 'fs'
import {
  appendFile as fsAppendFile,
  open as fsOpen,
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from 'fs/promises'
import memoize from 'lodash-es/memoize.js'
import { basename, dirname, join } from 'path'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  getOriginalCwd,
  getPlanSlugCache,
  getPromptId,
  getSessionId,
  getSessionProjectDir,
  isSessionPersistenceDisabled,
  switchSession,
} from '../bootstrap/state.js'
import { builtInCommandNames } from '../commands.js'
import { COMMAND_NAME_TAG, TICK_TAG } from '../constants/xml.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import * as sessionIngress from '../services/api/sessionIngress.js'
import { REPL_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/REPLTool/constants.js'
import {
  type AgentId,
  asAgentId,
  asSessionId,
  type SessionId,
} from '../types/ids.js'
import type { AttributionSnapshotMessage } from '../types/logs.js'
import {
  type ContentReplacementEntry,
  type ContextCollapseCommitEntry,
  type ContextCollapseSnapshotEntry,
  type Entry,
  type FileHistorySnapshotMessage,
  type LogOption,
  type PersistedWorktreeSession,
  type SerializedMessage,
  sortLogs,
  type TranscriptMessage,
} from '../types/logs.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  SystemCompactBoundaryMessage,
  SystemMessage,
  UserMessage,
} from '../types/message.js'
import type { QueueOperationMessage } from '../types/messageQueueTypes.js'
import { uniq } from './array.js'
import { registerCleanup } from './cleanupRegistry.js'
import { updateSessionName } from './concurrentSessions.js'
import { getCwd } from './cwd.js'
import { logForDebugging } from './debug.js'
import { logForDiagnosticsNoPII } from './diagLogs.js'
import { getClaudeConfigHomeDir, isEnvTruthy } from './envUtils.js'
import { isFsInaccessible } from './errors.js'
import type { FileHistorySnapshot } from './fileHistory.js'
import { formatFileSize } from './format.js'
import { getFsImplementation } from './fsOperations.js'
import { getWorktreePaths } from './getWorktreePaths.js'
import { getBranch } from './git.js'
import { gracefulShutdownSync, isShuttingDown } from './gracefulShutdown.js'
import { parseJSONL } from './json.js'
import { logError } from './log.js'
import { extractTag, isCompactBoundaryMessage } from './messages.js'
import { sanitizePath } from './path.js'
import {
  extractJsonStringField,
  extractLastJsonStringField,
  LITE_READ_BUF_SIZE,
  readHeadAndTail,
  readTranscriptForLoad,
  SKIP_PRECOMPACT_THRESHOLD,
} from './sessionStoragePortable.js'
import { getSettings_DEPRECATED } from './settings/settings.js'
import { jsonParse, jsonStringify } from './slowOperations.js'
import type { ContentReplacementRecord } from './toolResultStorage.js'
import { validateUuid } from './uuid.js'

// 在模块级别缓存 MACRO.VERSION，以解决 Bun --define 在异步上下文中的错误
// 参见：https://github.com/oven-sh/bun/issues/26168
const VERSION = typeof MACRO !== 'undefined' ? MACRO.VERSION : 'unknown'

type Transcript = (
  | UserMessage
  | AssistantMessage
  | AttachmentMessage
  | SystemMessage
)[]

// 在每个调用点使用 getOriginalCwd()，而不是在模块加载时捕获。
// 导入时的 getCwd() 可能在引导通过 realpathSync 解析符号链接之前运行，
// 导致与引导后 getOriginalCwd() 返回的规范化项目目录不同。
// 这种不一致导致保存在一个路径下的会话在通过另一个路径加载时不可见。

/**
 * 预编译的正则表达式，用于在提取第一条提示时跳过无意义的消息。
 * 匹配以小写 XML 样式标签（IDE 上下文、钩子输出、任务通知、通道消息等）或合成中断标记开头的任何内容。
 * 与 sessionStoragePortable.ts 保持同步 — 通用模式避免了随着新通知类型不断增长的白名单。
 */
// 50MB — 防止在墓碑慢路径中读取并重写整个会话文件时 OOM。
// 会话文件可能增长到多个 GB（inc-3930）。
const MAX_TOMBSTONE_REWRITE_BYTES = 50 * 1024 * 1024

const SKIP_FIRST_PROMPT_PATTERN =
  /^(?:\s*<[a-z][\w-]*[\s>]|\[Request interrupted by user[^\]]*\])/

/**
 * 类型守卫，检查条目是否为对话记录消息。
 * 对话记录消息包括用户、助手、附件和系统消息。
 * 重要提示：这是关于什么构成对话记录消息的唯一真实来源。
 * loadTranscriptFile() 使用它来确定将哪些消息加载到链中。
 *
 * 进度消息不是对话记录消息。它们是短暂的 UI 状态，
 * 不得持久化到 JSONL 或参与 parentUuid 链。
 * 包括它们会导致链分叉，在恢复时孤立真实对话消息（参见 #14373, #23537）。
 */
export function isTranscriptMessage(entry: Entry): entry is TranscriptMessage {
  return (
    entry.type === 'user' ||
    entry.type === 'assistant' ||
    entry.type === 'attachment' ||
    entry.type === 'system'
  )
}

/**
 * 参与 parentUuid 链的条目。在写入路径（insertMessageChain、useLogMessages）上用于在分配 parentUuid 时跳过进度。
 * 已包含进度的旧对话记录由 loadTranscriptFile 中的 progressBridge 重写处理。
 */
export function isChainParticipant(m: Pick<Message, 'type'>): boolean {
  return m.type !== 'progress'
}

type LegacyProgressEntry = {
  type: 'progress'
  uuid: UUID
  parentUuid: UUID | null
}

/**
 * PR #24099 之前写入的对话记录中的进度条目。它们不再属于 Entry 类型联合，
 * 但仍然存在于磁盘上，带有 uuid 和 parentUuid 字段。loadTranscriptFile 在它们之间桥接链。
 */
function isLegacyProgressEntry(entry: unknown): entry is LegacyProgressEntry {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'type' in entry &&
    entry.type === 'progress' &&
    'uuid' in entry &&
    typeof entry.uuid === 'string'
  )
}

/**
 * 高频工具进度滴答（Sleep 每秒一次，Bash 每块一次）。
 * 这些仅限 UI：不发送到 API，工具完成后不渲染。
 * 由 REPL.tsx 用于就地替换而不是追加，并由 loadTranscriptFile 用于跳过旧对话记录中的遗留条目。
 */
const EPHEMERAL_PROGRESS_TYPES = new Set([
  'bash_progress',
  'powershell_progress',
  'mcp_progress',
  ...(feature('PROACTIVE') || feature('KAIROS')
    ? (['sleep_progress'] as const)
    : []),
])
export function isEphemeralToolProgress(dataType: unknown): boolean {
  return typeof dataType === 'string' && EPHEMERAL_PROGRESS_TYPES.has(dataType)
}

export function getProjectsDir(): string {
  return join(getClaudeConfigHomeDir(), 'projects')
}

export function getTranscriptPath(): string {
  const projectDir = getSessionProjectDir() ?? getProjectDir(getOriginalCwd())
  return join(projectDir, `${getSessionId()}.jsonl`)
}

export function getTranscriptPathForSession(sessionId: string): string {
  // 当询问当前会话的对话记录时，像 getTranscriptPath() 一样尊重 sessionProjectDir。
  // 没有这个，钩子会获得从 originalCwd 计算的 transcript_path，而实际文件写入的是 sessionProjectDir（由 switchActiveSession 在恢复/分支时设置）
  // — 不同的目录，因此钩子看到 MISSING（gh-30217）。CC-34 使 sessionId + sessionProjectDir 原子化正是为了防止这种漂移；
  // 此函数只是没有更新为读取两者。
  //
  // 对于其他会话 ID，我们只能通过 originalCwd 猜测 — 我们不维护 sessionId→projectDir 映射。
  // 想要特定其他会话路径的调用方应显式传递 fullPath（大多数 save* 函数已接受此参数）。
  if (sessionId === getSessionId()) {
    return getTranscriptPath()
  }
  const projectDir = getProjectDir(getOriginalCwd())
  return join(projectDir, `${sessionId}.jsonl`)
}

// 50 MB — 会话 JSONL 可能增长到多个 GB（inc-3930）。读取原始对话记录的调用方必须超过此阈值时退出，以避免 OOM。
export const MAX_TRANSCRIPT_READ_BYTES = 50 * 1024 * 1024

// 内存中 agentId → 子目录的映射，用于将相关的子代理对话记录分组（例如，工作流运行写入 subagents/workflows/<runId>/）。
// 在代理运行之前填充；由 getAgentTranscriptPath 查询。
const agentTranscriptSubdirs = new Map<string, string>()

export function setAgentTranscriptSubdir(
  agentId: string,
  subdir: string,
): void {
  agentTranscriptSubdirs.set(agentId, subdir)
}

export function clearAgentTranscriptSubdir(agentId: string): void {
  agentTranscriptSubdirs.delete(agentId)
}

export function getAgentTranscriptPath(agentId: AgentId): string {
  // 与 getTranscriptPathForSession 相同的 sessionProjectDir 一致性 —
  // 子代理对话记录位于会话目录下，因此如果会话对话记录在 sessionProjectDir，
  // 子代理对话记录也在那里。
  const projectDir = getSessionProjectDir() ?? getProjectDir(getOriginalCwd())
  const sessionId = getSessionId()
  const subdir = agentTranscriptSubdirs.get(agentId)
  const base = subdir
    ? join(projectDir, sessionId, 'subagents', subdir)
    : join(projectDir, sessionId, 'subagents')
  return join(base, `agent-${agentId}.jsonl`)
}

function getAgentMetadataPath(agentId: AgentId): string {
  return getAgentTranscriptPath(agentId).replace(/\.jsonl$/, '.meta.json')
}

export type AgentMetadata = {
  agentType: string
  /** 如果代理以“worktree”隔离方式生成，则为工作树路径 */
  worktreePath?: string
  /** 来自 AgentTool 输入的原始任务描述。持久化以便恢复的代理通知可以显示原始描述而不是占位符。可选 — 较旧的元数据文件缺少此字段。 */
  description?: string
}

/**
 * 持久化用于启动子代理的 agentType。由恢复时读取，以便在省略 subagent_type 时正确路由 — 没有此信息，
 * 恢复操作会静默降级为通用型（4KB 系统提示，无继承历史）。旁路文件避免了 JSONL 模式更改。
 *
 * 当代理以工作树隔离方式生成时，还会存储 worktreePath，使恢复能够恢复正确的 cwd。
 */
export async function writeAgentMetadata(
  agentId: AgentId,
  metadata: AgentMetadata,
): Promise<void> {
  const path = getAgentMetadataPath(agentId)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(metadata))
}

export async function readAgentMetadata(
  agentId: AgentId,
): Promise<AgentMetadata | null> {
  const path = getAgentMetadataPath(agentId)
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as AgentMetadata
  } catch (e) {
    if (isFsInaccessible(e)) return null
    throw e
  }
}

export type RemoteAgentMetadata = {
  taskId: string
  remoteTaskType: string
  /** CCR 会话 ID — 用于在恢复时从 Sessions API 获取实时状态。 */
  sessionId: string
  title: string
  command: string
  spawnedAt: number
  toolUseId?: string
  isLongRunning?: boolean
  isUltraplan?: boolean
  isRemoteReview?: boolean
  remoteTaskMetadata?: Record<string, unknown>
}

function getRemoteAgentsDir(): string {
  // 与 getAgentTranscriptPath 相同的 sessionProjectDir 回退 — 项目目录（包含 .jsonl），而不是会话目录，因此需要拼接 sessionId。
  const projectDir = getSessionProjectDir() ?? getProjectDir(getOriginalCwd())
  return join(projectDir, getSessionId(), 'remote-agents')
}

function getRemoteAgentMetadataPath(taskId: string): string {
  return join(getRemoteAgentsDir(), `remote-agent-${taskId}.meta.json`)
}

/**
 * 持久化远程代理任务的元数据，以便在会话恢复时还原。每个任务的旁路文件（与 subagents/ 目录同级）
 * 能在 hydrateSessionFromRemote 的 .jsonl 擦除后幸存；恢复时状态始终从 CCR 新鲜获取 — 仅身份标识在本地持久化。
 */
export async function writeRemoteAgentMetadata(
  taskId: string,
  metadata: RemoteAgentMetadata,
): Promise<void> {
  const path = getRemoteAgentMetadataPath(taskId)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(metadata))
}

export async function readRemoteAgentMetadata(
  taskId: string,
): Promise<RemoteAgentMetadata | null> {
  const path = getRemoteAgentMetadataPath(taskId)
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as RemoteAgentMetadata
  } catch (e) {
    if (isFsInaccessible(e)) return null
    throw e
  }
}

export async function deleteRemoteAgentMetadata(taskId: string): Promise<void> {
  const path = getRemoteAgentMetadataPath(taskId)
  try {
    await unlink(path)
  } catch (e) {
    if (isFsInaccessible(e)) return
    throw e
  }
}

/**
 * 扫描 remote-agents/ 目录，获取所有持久化的元数据文件。
 * 由 restoreRemoteAgentTasks 用于重新连接到仍在运行的 CCR 会话。
 */
export async function listRemoteAgentMetadata(): Promise<
  RemoteAgentMetadata[]
> {
  const dir = getRemoteAgentsDir()
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (e) {
    if (isFsInaccessible(e)) return []
    throw e
  }
  const results: RemoteAgentMetadata[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.meta.json')) continue
    try {
      const raw = await readFile(join(dir, entry.name), 'utf-8')
      results.push(JSON.parse(raw) as RemoteAgentMetadata)
    } catch (e) {
      // 跳过无法读取或损坏的文件 — 来自崩溃的即发即弃持久化的部分写入不应导致整个恢复失败。
      logForDebugging(
        `listRemoteAgentMetadata: 跳过 ${entry.name}：${String(e)}`,
      )
    }
  }
  return results
}

export function sessionIdExists(sessionId: string): boolean {
  const projectDir = getProjectDir(getOriginalCwd())
  const sessionFile = join(projectDir, `${sessionId}.jsonl`)
  const fs = getFsImplementation()
  try {
    fs.statSync(sessionFile)
    return true
  } catch {
    return false
  }
}

// 导出用于测试
export function getNodeEnv(): string {
  return process.env.NODE_ENV || 'development'
}

// 导出用于测试
export function getUserType(): string {
  return process.env.USER_TYPE || 'external'
}

function getEntrypoint(): string | undefined {
  return process.env.CLAUDE_CODE_ENTRYPOINT
}

export function isCustomTitleEnabled(): boolean {
  return true
}

// 已记忆化：每个轮次通过 hooks.ts createBaseHookInput 调用 12 次以上（PostToolUse 路径，每轮 5 次）+ 各种保存函数。
// 输入是 cwd 字符串；主目录/env/正则表达式都是会话不变的，因此结果对于给定输入是稳定的。
// 工作树切换只是更改键 — 无需清除缓存。
export const getProjectDir = memoize((projectDir: string): string => {
  return join(getProjectsDir(), sanitizePath(projectDir))
})

let project: Project | null = null
let cleanupRegistered = false

function getProject(): Project {
  if (!project) {
    project = new Project()

    // 将刷新注册为清理处理程序（仅一次）
    if (!cleanupRegistered) {
      registerCleanup(async () => {
        // 首先刷新排队的写入，然后重新追加会话元数据
        // （customTitle、tag），以便它们始终出现在最后的 64KB 尾部窗口中。
        // readLiteMetadata 只读取尾部以提取这些字段 — 如果在 /rename 后追加了足够多的消息，
        // custom-title 条目会被推出窗口，导致 --resume 显示自动生成的 firstPrompt 而不是用户设置的会话名称。
        await project?.flush()
        try {
          project?.reAppendSessionMetadata()
        } catch {
          // 尽力而为 — 不要让元数据重新追加使清理崩溃
        }
      })
      cleanupRegistered = true
    }
  }
  return project
}

/**
 * 重置项目单例的刷新状态，用于测试。
 * 这确保测试不会通过共享计数器状态相互干扰。
 */
export function resetProjectFlushStateForTesting(): void {
  project?._resetFlushState()
}

/**
 * 完全重置项目单例，用于测试。
 * 这确保具有不同 CLAUDE_CONFIG_DIR 值的测试不会共享过时的 sessionFile 路径。
 */
export function resetProjectForTesting(): void {
  project = null
}

export function setSessionFileForTesting(path: string): void {
  getProject().sessionFile = path
}

type InternalEventWriter = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { isCompaction?: boolean; agentId?: string },
) => Promise<void>

/**
 * 注册 CCR v2 内部事件写入器，用于对话记录持久化。
 * 设置后，对话记录消息将作为内部工作器事件写入，而不是通过 v1 Session Ingress。
 */
export function setInternalEventWriter(writer: InternalEventWriter): void {
  getProject().setInternalEventWriter(writer)
}

type InternalEventReader = () => Promise<
  { payload: Record<string, unknown>; agent_id?: string }[] | null
>

/**
 * 注册 CCR v2 内部事件读取器，用于会话恢复。
 * 设置后，hydrateFromCCRv2InternalEvents() 可以获取前台和子代理内部事件，以在重新连接时重建对话状态。
 */
export function setInternalEventReader(
  reader: InternalEventReader,
  subagentReader: InternalEventReader,
): void {
  getProject().setInternalEventReader(reader)
  getProject().setInternalSubagentEventReader(subagentReader)
}

/**
 * 在当前项目上设置远程入口 URL，用于测试。
 * 这模拟了生产环境中 hydrateRemoteSession 所做的操作。
 */
export function setRemoteIngressUrlForTesting(url: string): void {
  getProject().setRemoteIngressUrl(url)
}

const REMOTE_FLUSH_INTERVAL_MS = 10

class Project {
  // 仅当前会话的最小缓存（不是所有会话）
  currentSessionTag: string | undefined
  currentSessionTitle: string | undefined
  currentSessionAgentName: string | undefined
  currentSessionAgentColor: string | undefined
  currentSessionLastPrompt: string | undefined
  currentSessionAgentSetting: string | undefined
  currentSessionMode: 'coordinator' | 'normal' | undefined
  // 三态：undefined = 从未触碰（不写入），null = 已退出工作树，
  // object = 当前在工作树中。reAppendSessionMetadata 写入 null 以便
  // --resume 知道会话已退出（与在内部崩溃相对）。
  currentSessionWorktree: PersistedWorktreeSession | null | undefined
  currentSessionPrNumber: number | undefined
  currentSessionPrUrl: string | undefined
  currentSessionPrRepository: string | undefined

  sessionFile: string | null = null
  // 当 sessionFile 为 null 时缓冲的条目。在第一条用户/助手消息上通过 materializeSessionFile 刷新 — 防止仅元数据的会话文件。
  private pendingEntries: Entry[] = []
  private remoteIngressUrl: string | null = null
  private internalEventWriter: InternalEventWriter | null = null
  private internalEventReader: InternalEventReader | null = null
  private internalSubagentEventReader: InternalEventReader | null = null
  private pendingWriteCount: number = 0
  private flushResolvers: Array<() => void> = []
  // 每个文件的写入队列。每个条目携带一个 resolve 回调，以便 enqueueWrite 的调用方可以选择等待特定的写入。
  private writeQueues = new Map<
    string,
    Array<{ entry: Entry; resolve: () => void }>
  >()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private activeDrain: Promise<void> | null = null
  private FLUSH_INTERVAL_MS = 100
  private readonly MAX_CHUNK_BYTES = 100 * 1024 * 1024

  constructor() {}

  /** @internal 重置刷新/队列状态，用于测试。 */
  _resetFlushState(): void {
    this.pendingWriteCount = 0
    this.flushResolvers = []
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    this.activeDrain = null
    this.writeQueues = new Map()
  }

  private incrementPendingWrites(): void {
    this.pendingWriteCount++
  }

  private decrementPendingWrites(): void {
    this.pendingWriteCount--
    if (this.pendingWriteCount === 0) {
      // 解析所有等待的刷新 promise
      for (const resolve of this.flushResolvers) {
        resolve()
      }
      this.flushResolvers = []
    }
  }

  private async trackWrite<T>(fn: () => Promise<T>): Promise<T> {
    this.incrementPendingWrites()
    try {
      return await fn()
    } finally {
      this.decrementPendingWrites()
    }
  }

  private enqueueWrite(filePath: string, entry: Entry): Promise<void> {
    return new Promise<void>(resolve => {
      let queue = this.writeQueues.get(filePath)
      if (!queue) {
        queue = []
        this.writeQueues.set(filePath, queue)
      }
      queue.push({ entry, resolve })
      this.scheduleDrain()
    })
  }

  private scheduleDrain(): void {
    if (this.flushTimer) {
      return
    }
    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null
      this.activeDrain = this.drainWriteQueue()
      await this.activeDrain
      this.activeDrain = null
      // 如果在排空期间有新条目到达，再次调度
      if (this.writeQueues.size > 0) {
        this.scheduleDrain()
      }
    }, this.FLUSH_INTERVAL_MS)
  }

  private async appendToFile(filePath: string, data: string): Promise<void> {
    try {
      await fsAppendFile(filePath, data, { mode: 0o600 })
    } catch {
      // 目录可能不存在 — 某些类似 NFS 的文件系统返回意外的错误代码，因此不要根据代码进行区分。
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
      await fsAppendFile(filePath, data, { mode: 0o600 })
    }
  }

  private async drainWriteQueue(): Promise<void> {
    for (const [filePath, queue] of this.writeQueues) {
      if (queue.length === 0) {
        continue
      }
      const batch = queue.splice(0)

      let content = ''
      const resolvers: Array<() => void> = []

      for (const { entry, resolve } of batch) {
        const line = jsonStringify(entry) + '\n'

        if (content.length + line.length >= this.MAX_CHUNK_BYTES) {
          // 刷新块并在开始新块之前解析其条目
          await this.appendToFile(filePath, content)
          for (const r of resolvers) {
            r()
          }
          resolvers.length = 0
          content = ''
        }

        content += line
        resolvers.push(resolve)
      }

      if (content.length > 0) {
        await this.appendToFile(filePath, content)
        for (const r of resolvers) {
          r()
        }
      }
    }

    // 清理空队列
    for (const [filePath, queue] of this.writeQueues) {
      if (queue.length === 0) {
        this.writeQueues.delete(filePath)
      }
    }
  }

  resetSessionFile(): void {
    this.sessionFile = null
    this.pendingEntries = []
  }

  /**
   * 将缓存的会话元数据重新追加到对话记录文件的末尾。
   * 这确保元数据保持在 readLiteMetadata 在渐进加载期间读取的尾部窗口内。
   *
   * 从两个具有不同文件排序含义的上下文中调用：
   * - 在压缩期间（compact.ts，reactiveCompact.ts）：在边界标记发出之前写入元数据 — 这些条目最终位于边界之前，由 scanPreBoundaryMetadata 恢复。
   * - 在会话退出时（清理处理程序）：在所有边界之后的 EOF 写入元数据 — 这使得 loadTranscriptFile 的压缩前跳过能够在不进行前向扫描的情况下找到元数据。
   *
   * 对于 SDK 可变字段（custom-title、tag）的外部写入器安全性：
   * 在重新追加之前，从尾部扫描窗口刷新缓存。如果外部进程（SDK renameSession/tagSession）写入了更新的值，
   * 我们过时的缓存会吸收它，下面的重新追加会持久化新值 — 而不是过时的 CLI 值。如果尾部中没有条目（已被驱逐，或从未由 SDK 写入），
   * 缓存是唯一的真实来源，并按原样重新追加。
   *
   * 重新追加是无条件的（即使值已经在尾部中）：在压缩期间，距离 EOF 40KB 的标题在当前尾部窗口内，但一旦压缩后的会话增长，它将掉出窗口。
   * 跳过重新追加将破坏此调用的目的。SDK 无法触及的字段（last-prompt、agent-*、mode、pr-link）没有外部写入器问题 — 它们的缓存是权威的。
   */
  reAppendSessionMetadata(skipTitleRefresh = false): void {
    if (!this.sessionFile) return
    const sessionId = getSessionId() as UUID
    if (!sessionId) return

    // 一次同步尾部读取，以刷新 SDK 可变字段。使用与 readLiteMetadata 相同的 LITE_READ_BUF_SIZE 窗口。
    // 失败时返回空字符串 → extract 返回 null → 缓存是唯一的真实来源。
    const tail = readFileTailSync(this.sessionFile)

    // 将任何更新的 SDK 写入的标题/标记吸收到我们的缓存中。如果 SDK 在我们打开会话期间写入，我们的缓存已过时 — 尾部值是权威的。
    // 如果尾部中没有任何内容（已驱逐或从未由 SDK 外部写入），缓存保持原样。
    //
    // 使用 startsWith 过滤以仅匹配顶级 JSONL 条目（第 0 列），而不是出现在恰好被 JSON 序列化到消息中的嵌套 tool_use 输入内的“type”:“tag”。
    const tailLines = tail.split('\n')
    if (!skipTitleRefresh) {
      const titleLine = tailLines.findLast(l =>
        l.startsWith('{"type":"custom-title"'),
      )
      if (titleLine) {
        const tailTitle = extractLastJsonStringField(titleLine, 'customTitle')
        // `!== undefined` 区分无匹配和空字符串匹配。
        // renameSession 拒绝空标题，但 CLI 是防御性的：具有 customTitle:“” 的外部写入器应清除缓存，以便下面的重新追加跳过它（而不是复活过时的标题）。
        if (tailTitle !== undefined) {
          this.currentSessionTitle = tailTitle || undefined
        }
      }
    }
    const tagLine = tailLines.findLast(l => l.startsWith('{"type":"tag"'))
    if (tagLine) {
      const tailTag = extractLastJsonStringField(tagLine, 'tag')
      // 同样：tagSession(id, null) 写入 `tag:""` 以清除。
      if (tailTag !== undefined) {
        this.currentSessionTag = tailTag || undefined
      }
    }

    // lastPrompt 被重新追加，以便 readLiteMetadata 可以显示用户最近在做什么。
    // 先写入，以便 customTitle/tag 等更靠近 EOF（它们是尾部读取更关键的字段）。
    if (this.currentSessionLastPrompt) {
      appendEntryToFile(this.sessionFile, {
        type: 'last-prompt',
        lastPrompt: this.currentSessionLastPrompt,
        sessionId,
      })
    }
    // 无条件：缓存已从上面的尾部刷新；重新追加使条目保持 EOF，以便压缩推送的内容不会驱逐它。
    if (this.currentSessionTitle) {
      appendEntryToFile(this.sessionFile, {
        type: 'custom-title',
        customTitle: this.currentSessionTitle,
        sessionId,
      })
    }
    if (this.currentSessionTag) {
      appendEntryToFile(this.sessionFile, {
        type: 'tag',
        tag: this.currentSessionTag,
        sessionId,
      })
    }
    if (this.currentSessionAgentName) {
      appendEntryToFile(this.sessionFile, {
        type: 'agent-name',
        agentName: this.currentSessionAgentName,
        sessionId,
      })
    }
    if (this.currentSessionAgentColor) {
      appendEntryToFile(this.sessionFile, {
        type: 'agent-color',
        agentColor: this.currentSessionAgentColor,
        sessionId,
      })
    }
    if (this.currentSessionAgentSetting) {
      appendEntryToFile(this.sessionFile, {
        type: 'agent-setting',
        agentSetting: this.currentSessionAgentSetting,
        sessionId,
      })
    }
    if (this.currentSessionMode) {
      appendEntryToFile(this.sessionFile, {
        type: 'mode',
        mode: this.currentSessionMode,
        sessionId,
      })
    }
    if (this.currentSessionWorktree !== undefined) {
      appendEntryToFile(this.sessionFile, {
        type: 'worktree-state',
        worktreeSession: this.currentSessionWorktree,
        sessionId,
      })
    }
    if (
      this.currentSessionPrNumber !== undefined &&
      this.currentSessionPrUrl &&
      this.currentSessionPrRepository
    ) {
      appendEntryToFile(this.sessionFile, {
        type: 'pr-link',
        sessionId,
        prNumber: this.currentSessionPrNumber,
        prUrl: this.currentSessionPrUrl,
        prRepository: this.currentSessionPrRepository,
        timestamp: new Date().toISOString(),
      })
    }
  }

  async flush(): Promise<void> {
    // 取消待处理的计时器
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    // 等待任何正在进行的排空完成
    if (this.activeDrain) {
      await this.activeDrain
    }
    // 排空队列中剩余的任何内容
    await this.drainWriteQueue()

    // 等待非队列跟踪的操作（例如 removeMessageByUuid）
    if (this.pendingWriteCount === 0) {
      return
    }
    return new Promise<void>(resolve => {
      this.flushResolvers.push(resolve)
    })
  }

  /**
   * 按 UUID 从对话记录中删除消息。
   * 用于墓碑化来自失败流尝试的孤立消息。
   *
   * 目标几乎总是最近追加的条目，因此我们只读取尾部，定位该行，并使用位置写入 + 截断将其切出，而不是重写整个文件。
   */
  async removeMessageByUuid(targetUuid: UUID): Promise<void> {
    return this.trackWrite(async () => {
      if (this.sessionFile === null) return
      try {
        let fileSize = 0
        const fh = await fsOpen(this.sessionFile, 'r+')
        try {
          const { size } = await fh.stat()
          fileSize = size
          if (size === 0) return

          const chunkLen = Math.min(size, LITE_READ_BUF_SIZE)
          const tailStart = size - chunkLen
          const buf = Buffer.allocUnsafe(chunkLen)
          const { bytesRead } = await fh.read(buf, 0, chunkLen, tailStart)
          const tail = buf.subarray(0, bytesRead)

          // 条目通过 JSON.stringify 序列化（无键值空白）。搜索完整的 `"uuid":"..."` 模式，而不仅仅是裸 UUID，
          // 这样我们就不会匹配子条目的 `parentUuid` 中的相同值。UUID 是纯 ASCII，因此字节级搜索是正确的。
          const needle = `"uuid":"${targetUuid}"`
          const matchIdx = tail.lastIndexOf(needle)

          if (matchIdx >= 0) {
            // 0x0a 永远不会出现在 UTF-8 多字节序列内，因此即使块在字符中间开始，字节扫描行边界也是安全的。
            const prevNl = tail.lastIndexOf(0x0a, matchIdx)
            // 如果前一个换行符在我们的块之外并且我们没有从文件开头读取，则该行比窗口长 — 回退到慢路径。
            if (prevNl >= 0 || tailStart === 0) {
              const lineStart = prevNl + 1 // 当 prevNl === -1 时为 0
              const nextNl = tail.indexOf(0x0a, matchIdx + needle.length)
              const lineEnd = nextNl >= 0 ? nextNl + 1 : bytesRead

              const absLineStart = tailStart + lineStart
              const afterLen = bytesRead - lineEnd
              // 首先截断，然后重新追加尾部行。在常见情况下（目标是最后一个条目），afterLen 为 0，这只是单个 ftruncate。
              await fh.truncate(absLineStart)
              if (afterLen > 0) {
                await fh.write(tail, lineEnd, afterLen, absLineStart)
              }
              return
            }
          }
        } finally {
          await fh.close()
        }

        // 慢路径：目标不在最后 64KB 内。很少见 — 需要大量大型条目在写入和墓碑化之间落入。
        if (fileSize > MAX_TOMBSTONE_REWRITE_BYTES) {
          logForDebugging(
            `跳过墓碑化删除：会话文件过大（${formatFileSize(fileSize)}）`,
            { level: 'warn' },
          )
          return
        }
        const content = await readFile(this.sessionFile, { encoding: 'utf-8' })
        const lines = content.split('\n').filter((line: string) => {
          if (!line.trim()) return true
          try {
            const entry = jsonParse(line)
            return entry.uuid !== targetUuid
          } catch {
            return true // 保留格式错误的行
          }
        })
        await writeFile(this.sessionFile, lines.join('\n'), {
          encoding: 'utf8',
        })
      } catch {
        // 静默忽略错误 — 文件可能尚不存在
      }
    })
  }

  /**
   * 当测试环境 / cleanupPeriodDays=0 / --no-session-persistence /
   * CLAUDE_CODE_SKIP_PROMPT_HISTORY 应抑制所有对话记录写入时为 true。
   * appendEntry 和 materializeSessionFile 的共享防护，以便两者一致地跳过。
   * 该环境变量由 tmuxSocket.ts 设置，以便 Tungsten 生成的测试会话不会污染用户的 --resume 列表。
   */
  private shouldSkipPersistence(): boolean {
    const allowTestPersistence = isEnvTruthy(
      process.env.TEST_ENABLE_SESSION_PERSISTENCE,
    )
    return (
      (getNodeEnv() === 'test' && !allowTestPersistence) ||
      getSettings_DEPRECATED()?.cleanupPeriodDays === 0 ||
      isSessionPersistenceDisabled() ||
      isEnvTruthy(process.env.CLAUDE_CODE_SKIP_PROMPT_HISTORY)
    )
  }

  /**
   * 创建会话文件，写入缓存的启动元数据，并刷新缓冲的条目。
   * 在第一条用户/助手消息上调用。
   */
  private async materializeSessionFile(): Promise<void> {
    // 这里也有防护 — reAppendSessionMetadata 通过 appendEntryToFile（而不是 appendEntry）写入，因此它会绕过每个条目的持久化检查，
    // 并在尽管 --no-session-persistence 的情况下创建仅元数据的文件。
    if (this.shouldSkipPersistence()) return
    this.ensureCurrentSessionFile()
    // mode/agentSetting 是仅缓存的前置实例化；现在写入它们。
    this.reAppendSessionMetadata()
    if (this.pendingEntries.length > 0) {
      const buffered = this.pendingEntries
      this.pendingEntries = []
      for (const entry of buffered) {
        await this.appendEntry(entry)
      }
    }
  }

  async insertMessageChain(
    messages: Transcript,
    isSidechain: boolean = false,
    agentId?: string,
    startingParentUuid?: UUID | null,
    teamInfo?: { teamName?: string; agentName?: string },
  ) {
    return this.trackWrite(async () => {
      let parentUuid: UUID | null = startingParentUuid ?? null

      // 第一条用户/助手消息实现会话文件。
      // 单独的钩子进度/附件消息保持缓冲。
      if (
        this.sessionFile === null &&
        messages.some(m => m.type === 'user' || m.type === 'assistant')
      ) {
        await this.materializeSessionFile()
      }

      // 为此消息链获取一次当前 git 分支
      let gitBranch: string | undefined
      try {
        gitBranch = await getBranch()
      } catch {
        // 不在 git 仓库中或 git 命令失败
        gitBranch = undefined
      }

      // 如果存在，获取此会话的 slug（用于计划文件等）
      const sessionId = getSessionId()
      const slug = getPlanSlugCache().get(sessionId)

      for (const message of messages) {
        const isCompactBoundary = isCompactBoundaryMessage(message)

        // 对于 tool_result 消息，如果可用，使用消息中的助手消息 UUID（在创建时设置），否则回退到顺序父级
        let effectiveParentUuid = parentUuid
        if (
          message.type === 'user' &&
          'sourceToolAssistantUUID' in message &&
          message.sourceToolAssistantUUID
        ) {
          effectiveParentUuid = message.sourceToolAssistantUUID as UUID
        }

        const transcriptMessage: TranscriptMessage = {
          parentUuid: isCompactBoundary ? null : effectiveParentUuid,
          logicalParentUuid: isCompactBoundary ? parentUuid : undefined,
          isSidechain,
          teamName: teamInfo?.teamName,
          agentName: teamInfo?.agentName,
          promptId:
            message.type === 'user' ? (getPromptId() ?? undefined) : undefined,
          agentId,
          ...message,
          // 会话戳字段必须放在扩展之后。在 --fork-session 和 --resume 上，消息以 SerializedMessage 形式到达
          // （携带源 sessionId/cwd/etc.，因为 removeExtraFields 仅剥离 parentUuid 和 isSidechain）。如果未重新标记 sessionId，
          // FRESH.jsonl 最终会包含标记为 sessionId=A 的消息，但内容替换条目标记为 sessionId=FRESH（来自 insertContentReplacement），
          // 并且 loadFullLog 的以 sessionId 为键的 contentReplacements 查找会错过 → 替换记录丢失 → FROZEN 错误分类。
          userType: getUserType(),
          entrypoint: getEntrypoint(),
          cwd: getCwd(),
          sessionId,
          timestamp: new Date().toISOString(),
          version: VERSION,
          gitBranch,
          slug,
        }
        await this.appendEntry(transcriptMessage)
        if (isChainParticipant(message)) {
          parentUuid = message.uuid
        }
      }

      // 缓存本轮的用户提示，用于 reAppendSessionMetadata —
      // --resume 选择器显示用户最后在做什么。
      // 按设计每轮覆盖。
      if (!isSidechain) {
        const text = getFirstMeaningfulUserMessageTextContent(messages)
        if (text) {
          const flat = text.replace(/\n/g, ' ').trim()
          this.currentSessionLastPrompt =
            flat.length > 200 ? flat.slice(0, 200).trim() + '…' : flat
        }
      }
    })
  }

  async insertFileHistorySnapshot(
    messageId: UUID,
    snapshot: FileHistorySnapshot,
    isSnapshotUpdate: boolean,
  ) {
    return this.trackWrite(async () => {
      const fileHistoryMessage: FileHistorySnapshotMessage = {
        type: 'file-history-snapshot',
        messageId,
        snapshot,
        isSnapshotUpdate,
      }
      await this.appendEntry(fileHistoryMessage)
    })
  }

  async insertQueueOperation(queueOp: QueueOperationMessage) {
    return this.trackWrite(async () => {
      await this.appendEntry(queueOp)
    })
  }

  async insertAttributionSnapshot(snapshot: AttributionSnapshotMessage) {
    return this.trackWrite(async () => {
      await this.appendEntry(snapshot)
    })
  }

  async insertContentReplacement(
    replacements: ContentReplacementRecord[],
    agentId?: AgentId,
  ) {
    return this.trackWrite(async () => {
      const entry: ContentReplacementEntry = {
        type: 'content-replacement',
        sessionId: getSessionId() as UUID,
        agentId,
        replacements,
      }
      await this.appendEntry(entry)
    })
  }

  async appendEntry(entry: Entry, sessionId: UUID = getSessionId() as UUID) {
    if (this.shouldSkipPersistence()) {
      return
    }

    const currentSessionId = getSessionId() as UUID
    const isCurrentSession = sessionId === currentSessionId

    let sessionFile: string
    if (isCurrentSession) {
      // 缓冲直到 materializeSessionFile 运行（第一条用户/助手消息）。
      if (this.sessionFile === null) {
        this.pendingEntries.push(entry)
        return
      }
      sessionFile = this.sessionFile
    } else {
      const existing = await this.getExistingSessionFile(sessionId)
      if (!existing) {
        logError(
          new Error(
            `appendEntry：未找到其他会话 ${sessionId} 的会话文件`,
          ),
        )
        return
      }
      sessionFile = existing
    }

    // 仅在需要时加载当前会话消息
    if (entry.type === 'summary') {
      // 摘要总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'custom-title') {
      // 自定义标题总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'ai-title') {
      // AI 标题总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'last-prompt') {
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'task-summary') {
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'tag') {
      // 标签总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'agent-name') {
      // 代理名称总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'agent-color') {
      // 代理颜色总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'agent-setting') {
      // 代理设置总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'pr-link') {
      // PR 链接总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'file-history-snapshot') {
      // 文件历史快照总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'attribution-snapshot') {
      // 归属快照总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'speculation-accept') {
      // 推测接受条目总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'mode') {
      // 模式条目总是可以追加
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'worktree-state') {
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'content-replacement') {
      // 内容替换记录总是可以追加。子代理记录进入侧链文件（用于 AgentTool 恢复）；
      // 主线程记录进入会话文件（用于 /resume）。
      const targetFile = entry.agentId
        ? getAgentTranscriptPath(entry.agentId)
        : sessionFile
      void this.enqueueWrite(targetFile, entry)
    } else if (entry.type === 'marble-origami-commit') {
      // 总是追加。提交顺序对恢复很重要（后面的提交可能引用前面提交的摘要消息），
      // 因此必须按接收顺序写入，并按顺序读回。
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'marble-origami-snapshot') {
      // 总是追加。恢复时后者获胜 — 后面的条目覆盖前面的。
      void this.enqueueWrite(sessionFile, entry)
    } else {
      const messageSet = await getSessionMessages(sessionId)
      if (entry.type === 'queue-operation') {
        // 队列操作总是追加到会话文件
        void this.enqueueWrite(sessionFile, entry)
      } else {
        // 此时，entry 必须是 TranscriptMessage（user/assistant/attachment/system）
        // 所有其他条目类型已在上面处理
        const isAgentSidechain =
          entry.isSidechain && entry.agentId !== undefined
        const targetFile = isAgentSidechain
          ? getAgentTranscriptPath(asAgentId(entry.agentId!))
          : sessionFile

        // 对于消息条目，检查 UUID 是否已存在于当前会话中。
        // 对代理侧链的本地写入跳过去重 — 它们进入单独的文件，
        // 并且分支继承的父消息与主会话对话记录共享 UUID。针对主会话集合去重会丢弃它们，
        // 导致持久化的侧链对话记录不完整（恢复分支时加载的是 10KB 文件而不是完整的 85KB 继承上下文）。
        //
        // 侧链绕过仅适用于本地文件写入 — 远程持久化（session-ingress）每个 sessionId 使用单个 Last-Uuid 链，
        // 因此向它已经拥有的 UUID 重复 POST 会导致 409 错误并最终耗尽重试次数 → gracefulShutdownSync(1)。参见 inc-4718。
        const isNewUuid = !messageSet.has(entry.uuid)
        if (isAgentSidechain || isNewUuid) {
          // 入队写入 — appendToFile 通过创建目录处理 ENOENT
          void this.enqueueWrite(targetFile, entry)

          if (!isAgentSidechain) {
            // messageSet 是以主文件为权威的。侧链条目进入单独的代理文件 — 在此处添加它们的 UUID 会导致 recordTranscript
            // 在主线程上跳过它们（第 1270 行附近），因此消息永远不会写入主会话文件。紧接着的下一条主线程消息会将其 parentUuid
            // 链接到仅存在于代理文件中的 UUID，导致 --resume 的 buildConversationChain 在悬空引用处终止。
            // 远程（上面的 inc-4718）也有同样的约束：侧链持久化一个主线程尚未写入的 UUID → 主线程写入时返回 409。
            messageSet.add(entry.uuid)

            if (isTranscriptMessage(entry)) {
              await this.persistToRemote(sessionId, entry)
            }
          }
        }
      }
    }
  }

  /** 加载 sessionFile 变量。在需要写入之前，无需创建会话文件。 */
  private ensureCurrentSessionFile(): string {
    if (this.sessionFile === null) {
      this.sessionFile = getTranscriptPath()
    }

    return this.sessionFile
  }

  /** 如果会话文件存在则返回其路径，否则返回 null。用于写入当前会话以外的其他会话。缓存肯定结果，以便每个会话只 stat 一次。 */
  private existingSessionFiles = new Map<string, string>()
  private async getExistingSessionFile(
    sessionId: UUID,
  ): Promise<string | null> {
    const cached = this.existingSessionFiles.get(sessionId)
    if (cached) return cached

    const targetFile = getTranscriptPathForSession(sessionId)
    try {
      await stat(targetFile)
      this.existingSessionFiles.set(sessionId, targetFile)
      return targetFile
    } catch (e) {
      if (isFsInaccessible(e)) return null
      throw e
    }
  }

  private async persistToRemote(sessionId: UUID, entry: TranscriptMessage) {
    if (isShuttingDown()) {
      return
    }

    // CCR v2 路径：作为内部 worker 事件写入
    if (this.internalEventWriter) {
      try {
        await this.internalEventWriter(
          'transcript',
          entry as unknown as Record<string, unknown>,
          {
            ...(isCompactBoundaryMessage(entry) && { isCompaction: true }),
            ...(entry.agentId && { agentId: entry.agentId }),
          },
        )
      } catch {
        logEvent('tengu_session_persistence_failed', {})
        logForDebugging('无法将转录作为内部事件写入')
      }
      return
    }

    // v1 会话入口路径
    if (
      !isEnvTruthy(process.env.ENABLE_SESSION_PERSISTENCE) ||
      !this.remoteIngressUrl
    ) {
      return
    }

    const success = await sessionIngress.appendSessionLog(
      sessionId,
      entry,
      this.remoteIngressUrl,
    )

    if (!success) {
      logEvent('tengu_session_persistence_failed', {})
      gracefulShutdownSync(1, 'other')
    }
  }

  setRemoteIngressUrl(url: string): void {
    this.remoteIngressUrl = url
    logForDebugging(`远程持久化已启用，URL：${url}`)
    if (url) {
      // 如果使用 CCR，消息延迟不超过 10ms。
      this.FLUSH_INTERVAL_MS = REMOTE_FLUSH_INTERVAL_MS
    }
  }

  setInternalEventWriter(writer: InternalEventWriter): void {
    this.internalEventWriter = writer
    logForDebugging(
      'CCR v2 内部事件写入器已注册，用于转录持久化',
    )
    // 对 CCR v2 使用快速刷新间隔
    this.FLUSH_INTERVAL_MS = REMOTE_FLUSH_INTERVAL_MS
  }

  setInternalEventReader(reader: InternalEventReader): void {
    this.internalEventReader = reader
    logForDebugging(
      'CCR v2 内部事件读取器已注册，用于会话恢复',
    )
  }

  setInternalSubagentEventReader(reader: InternalEventReader): void {
    this.internalSubagentEventReader = reader
    logForDebugging(
      'CCR v2 子代理事件读取器已注册，用于会话恢复',
    )
  }

  getInternalEventReader(): InternalEventReader | null {
    return this.internalEventReader
  }

  getInternalSubagentEventReader(): InternalEventReader | null {
    return this.internalSubagentEventReader
  }
}

export type TeamInfo = {
  teamName?: string
  agentName?: string
}

// 在传递给 insertMessageChain 之前，过滤掉已记录的消息。
// 如果不这样做，压缩后的 messagesToKeep（与压缩前消息具有相
// 同 UUID）会被 appendEntry 去重跳过，但仍会推进 inser
// tMessageChain 中的 parentUuid 游标，导致新消息从压
// 缩前的 UUID 开始链接，而不是从压缩后的摘要开始——从而孤立压缩边界。
//
// `startingParentUuidHint`：由 useLogMessage
// s 使用，用于传递上一个增量切片中的父节点，避免 O(n) 扫描来重新发现它。
//
// 跳过跟踪：已记录的消息仅当它们构成一个前缀（出现在任何新消息之前）时才被跟踪
// 为父节点。这处理了两种情况：- 增长数组调用者（QueryEngine、que
// ryHelpers、LocalMainSessionTask、traject
// ory）：已记录的消息始终是前缀 → 被跟踪 → 新消息获得正确的父链。
// - 压缩（useLogMessa
// ges）：新的 CB/摘要首先出现，然后是已记录的 messagesToKe
// ep → 不是前缀 → 不被跟踪 → CB 获得 parentUuid=
// null（正确：在压缩边界截断 --continue 链）。
export async function recordTranscript(
  messages: Message[],
  teamInfo?: TeamInfo,
  startingParentUuidHint?: UUID,
  allMessages?: readonly Message[],
): Promise<UUID | null> {
  const cleanedMessages = cleanMessagesForLogging(messages, allMessages)
  const sessionId = getSessionId() as UUID
  const messageSet = await getSessionMessages(sessionId)
  const newMessages: typeof cleanedMessages = []
  let startingParentUuid: UUID | undefined = startingParentUuidHint
  let seenNewMessage = false
  for (const m of cleanedMessages) {
    if (messageSet.has(m.uuid as UUID)) {
      // 仅跟踪构成前缀的跳过消息。压缩后，messagesTo
      // Keep 出现在新的 CB/摘要之后，因此会跳过它们。
      if (!seenNewMessage && isChainParticipant(m)) {
        startingParentUuid = m.uuid as UUID
      }
    } else {
      newMessages.push(m)
      seenNewMessage = true
    }
  }
  if (newMessages.length > 0) {
    await getProject().insertMessageChain(
      newMessages,
      false,
      undefined,
      startingParentUuid,
      teamInfo,
    )
  }
  // 返回最后一个实际记录的链参与者的 UUID，或者如果没有记录新
  // 的链参与者，则返回前缀跟踪的 UUID。这允许调用者（useLogM
  // essages）即使在切片全部被记录的情况下（回退、/resume
  // 场景，其中每条消息都已存在于 messageSet 中）也能维护正
  // 确的父链。进度被跳过——它被写入 JSONL，但没有任何东西链接到
  // 它（参见 isChainParticipant）。
  const lastRecorded = newMessages.findLast(isChainParticipant)
  return (lastRecorded?.uuid as UUID | undefined) ?? startingParentUuid ?? null
}

export async function recordSidechainTranscript(
  messages: Message[],
  agentId?: string,
  startingParentUuid?: UUID | null,
) {
  await getProject().insertMessageChain(
    cleanMessagesForLogging(messages),
    true,
    agentId,
    startingParentUuid,
  )
}

export async function recordQueueOperation(queueOp: QueueOperationMessage) {
  await getProject().insertQueueOperation(queueOp)
}

/** 通过 UUID 从转录中移除一条消息。当收到孤立消息的墓碑时使用。 */
export async function removeTranscriptMessage(targetUuid: UUID): Promise<void> {
  await getProject().removeMessageByUuid(targetUuid)
}

export async function recordFileHistorySnapshot(
  messageId: UUID,
  snapshot: FileHistorySnapshot,
  isSnapshotUpdate: boolean,
) {
  await getProject().insertFileHistorySnapshot(
    messageId,
    snapshot,
    isSnapshotUpdate,
  )
}

export async function recordAttributionSnapshot(
  snapshot: AttributionSnapshotMessage,
) {
  await getProject().insertAttributionSnapshot(snapshot)
}

export async function recordContentReplacement(
  replacements: ContentReplacementRecord[],
  agentId?: AgentId,
) {
  await getProject().insertContentReplacement(replacements, agentId)
}

/** 在 switchSession/regenerateSessionId 之后重置会话文件指针。新文件在第一条用户/助手消息时延迟创建。 */
export async function resetSessionFilePointer() {
  getProject().resetSessionFile()
}

/** 在 --continue/--resume（非 fork）后采用现有的会话文件。在 switchSession + resetSessionFilePointer + restoreSessionMetadata 之后调用：getTranscriptPath() 现在从切换后的 sessionId 派生恢复文件的路径，并且缓存保存最终的元数据（--name 标题、恢复的模式/标签/代理）。在此处设置 sessionFile——而不是等待第一条用户消息时的 materializeSessionFile——允许退出清理处理程序的 reAppendSessionMetadata 运行（当 sessionFile 为 null 时它会退出）。如果没有这个，`-c -n foo` + 在发送消息前退出会导致标题丢失：内存中的缓存是正确的，但从未写入。恢复的文件已经存在于磁盘上（我们从中加载），因此这不会像全新的 --name 会话那样创建孤立文件。skipTitleRefresh：restoreSessionMetadata 在几微秒前从相同的磁盘读取中填充了缓存，因此在此处从尾部刷新是一个空操作——除非使用了 --name，在这种情况下它会用陈旧的磁盘值覆盖新的 CLI 标题。在此写入之后，磁盘 == 缓存，后续调用（压缩、退出清理）正常吸收 SDK 写入。 */
export function adoptResumedSessionFile(): void {
  const project = getProject()
  project.sessionFile = getTranscriptPath()
  project.reAppendSessionMetadata(true)
}

/** 向转录追加一个上下文折叠提交条目。每个提交一个条目，按提交顺序排列。恢复时，这些条目被收集到一个有序数组中，并传递给 restoreFromEntries()，后者重建提交日志。 */
export async function recordContextCollapseCommit(commit: {
  collapseId: string
  summaryUuid: string
  summaryContent: string
  summary: string
  firstArchivedUuid: string
  lastArchivedUuid: string
}): Promise<void> {
  const sessionId = getSessionId() as UUID
  if (!sessionId) return
  await getProject().appendEntry({
    type: 'marble-origami-commit',
    sessionId,
    ...commit,
  })
}

/** 快照暂存队列和生成状态。在每个 ctx-agent 生成解析后写入（此时暂存内容可能已更改）。恢复时最后写入的生效——加载器只保留最新的快照条目。 */
export async function recordContextCollapseSnapshot(snapshot: {
  staged: Array<{
    startUuid: string
    endUuid: string
    summary: string
    risk: number
    stagedAt: number
  }>
  armed: boolean
  lastSpawnTokens: number
}): Promise<void> {
  const sessionId = getSessionId() as UUID
  if (!sessionId) return
  await getProject().appendEntry({
    type: 'marble-origami-snapshot',
    sessionId,
    ...snapshot,
  })
}

export async function flushSessionStorage(): Promise<void> {
  await getProject().flush()
}

export async function hydrateRemoteSession(
  sessionId: string,
  ingressUrl: string,
): Promise<boolean> {
  switchSession(asSessionId(sessionId))

  const project = getProject()

  try {
    const remoteLogs =
      (await sessionIngress.getSessionLogs(sessionId, ingressUrl)) || []

    // 确保项目目录和会话文件存在
    const projectDir = getProjectDir(getOriginalCwd())
    await mkdir(projectDir, { recursive: true, mode: 0o700 })

    const sessionFile = getTranscriptPathForSession(sessionId)

    // 用远程日志替换本地日志。writeFile 会截断文件，因此无需
    // unlink；空的 remoteLogs 数组会产生一个空文件。
    const content = remoteLogs.map(e => jsonStringify(e) + '\n').join('')
    await writeFile(sessionFile, content, { encoding: 'utf8', mode: 0o600 })

    logForDebugging(`从远程水化了 ${remoteLogs.length} 个条目`)
    return remoteLogs.length > 0
  } catch (error) {
    logForDebugging(`从远程水化会话时出错：${error}`)
    logForDiagnosticsNoPII('error', 'hydrate_remote_session_fail')
    return false
  } finally {
    // 在水化远程会话后设置远程入口 U
    // RL，以确保在启用持久化之前始
    // 终与远程会话同步
    project.setRemoteIngressUrl(ingressUrl)
  }
}

/** 从 CCR v2 内部事件水化会话状态。通过已注册的读取器获取前台和子代理事件，从负载中提取转录条目，并将其写入本地转录文件（主文件 + 每个代理文件）。服务器处理压缩过滤——它返回从最新压缩边界开始的事件。 */
export async function hydrateFromCCRv2InternalEvents(
  sessionId: string,
): Promise<boolean> {
  const startMs = Date.now()
  switchSession(asSessionId(sessionId))

  const project = getProject()
  const reader = project.getInternalEventReader()
  if (!reader) {
    logForDebugging('未注册用于 CCR v2 恢复的内部事件读取器')
    return false
  }

  try {
    // 获取前台事件
    const events = await reader()
    if (!events) {
      logForDebugging('读取用于恢复的内部事件失败')
      logForDiagnosticsNoPII('error', 'hydrate_ccr_v2_read_fail')
      return false
    }

    const projectDir = getProjectDir(getOriginalCwd())
    await mkdir(projectDir, { recursive: true, mode: 0o700 })

    // 写入前台转录
    const sessionFile = getTranscriptPathForSession(sessionId)
    const fgContent = events.map(e => jsonStringify(e.payload) + '\n').join('')
    await writeFile(sessionFile, fgContent, { encoding: 'utf8', mode: 0o600 })

    logForDebugging(
      `从 CCR v2 内部事件水化了 ${events.length} 个前台条目`,
    )

    // 获取并写入子代理事件
    let subagentEventCount = 0
    const subagentReader = project.getInternalSubagentEventReader()
    if (subagentReader) {
      const subagentEvents = await subagentReader()
      if (subagentEvents && subagentEvents.length > 0) {
        subagentEventCount = subagentEvents.length
        // 按 agent_id 分组
        const byAgent = new Map<string, Record<string, unknown>[]>()
        for (const e of subagentEvents) {
          const agentId = e.agent_id || ''
          if (!agentId) continue
          let list = byAgent.get(agentId)
          if (!list) {
            list = []
            byAgent.set(agentId, list)
          }
          list.push(e.payload)
        }

        // 将每个代理的转录写入其自己的文件
        for (const [agentId, entries] of byAgent) {
          const agentFile = getAgentTranscriptPath(asAgentId(agentId))
          await mkdir(dirname(agentFile), { recursive: true, mode: 0o700 })
          const agentContent = entries
            .map(p => jsonStringify(p) + '\n')
            .join('')
          await writeFile(agentFile, agentContent, {
            encoding: 'utf8',
            mode: 0o600,
          })
        }

        logForDebugging(
          `跨 ${byAgent.size} 个代理水化了 ${subagentEvents.length} 个子代理条目`,
        )
      }
    }

    logForDiagnosticsNoPII('info', 'hydrate_ccr_v2_completed', {
      duration_ms: Date.now() - startMs,
      event_count: events.length,
      subagent_event_count: subagentEventCount,
    })
    return events.length > 0
  } catch (error) {
    // 重新抛出 epoch 不匹配，以便 worker 不与 gracefulShutdown 竞争
    if (
      error instanceof Error &&
      error.message === 'CCRClient：Epoch 不匹配 (409)'
    ) {
      throw error
    }
    logForDebugging(`从 CCR v2 水化会话时出错：${error}`)
    logForDiagnosticsNoPII('error', 'hydrate_ccr_v2_fail')
    return false
  }
}

function extractFirstPrompt(transcript: TranscriptMessage[]): string {
  const textContent = getFirstMeaningfulUserMessageTextContent(transcript)
  if (textContent) {
    let result = textContent.replace(/\n/g, ' ').trim()

    // 存储一个足够长的版本，以便在显示
    // 时截断。实际的截断将在显示时根据终端宽度进行
    if (result.length > 200) {
      result = result.slice(0, 200).trim() + '…'
    }

    return result
  }

  return '无提示'
}

/** 获取最后一条已处理的用户消息（即，在任何非用户消息出现之前）。用于确定会话是否具有有效的用户交互。 */
export function getFirstMeaningfulUserMessageTextContent<T extends Message>(
  transcript: T[],
): string | undefined {
  for (const msg of transcript) {
    if (msg.type !== 'user' || msg.isMeta) continue
    // 跳过压缩摘要消息——它们不应被视为第一个提示
    if ('isCompactSummary' in msg && msg.isCompactSummary) continue

    const content = msg.message?.content
    if (!content) continue

    // 收集所有文本值。对于数组内容（在 VS Code 中很常见，其中 I
    // DE 元数据标签出现在用户的实际提示之前），迭代所有文本块，这样我们就
    // 不会错过隐藏在 <ide_selection>/<ide_o
    // pened_file> 块后面的真实提示。
    const texts: string[] = []
    if (typeof content === 'string') {
      texts.push(content)
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          texts.push(block.text)
        }
      }
    }

    for (const textContent of texts) {
      if (!textContent) continue

      const commandNameTag = extractTag(textContent, COMMAND_NAME_TAG)
      if (commandNameTag) {
        const commandName = commandNameTag.replace(/^\//, '')

        // 如果是内置命令，则不太可能提供有意义的上下文（例
        // 如 `/model sonnet`）
        if (builtInCommandNames().has(commandName)) {
          continue
        } else {
          // 否则，对于自定义命令，仅当它有参数时才保留（例如 `/revi
          // ew reticulate splines`）
          const commandArgs = extractTag(textContent, 'command-args')?.trim()
          if (!commandArgs) {
            continue
          }
          // 返回干净的格式化命令，而不是原始 XML
          return `${commandNameTag} ${commandArgs}`
        }
      }

      // 使用 ! 前缀格式化 bash 输入（如用户所键入）。在通用 X
      // ML 跳过之前检查，以便 bash 模式会话获得有意义的标题。
      const bashInput = extractTag(textContent, 'bash-input')
      if (bashInput) {
        return `! ${bashInput}`
      }

      // 跳过无意义的消息（本地命令输出、钩子输出、自动
      // tick 提示、任务通知、纯 IDE 元数据标签）
      if (SKIP_FIRST_PROMPT_PATTERN.test(textContent)) {
        continue
      }

      return textContent
    }
  }
  return undefined
}

export function removeExtraFields(
  transcript: TranscriptMessage[],
): SerializedMessage[] {
  return transcript.map(m => {
    const { isSidechain, parentUuid, ...serializedMessage } = m
    return serializedMessage
  })
}

/** 压缩后，将保留的片段拼接回链中。保留的消息存在于 JSONL 中，具有其原始的压缩前 parentUuid（recordTranscript 去重跳过了它们——无法重写）。内部链（keep[i+1]→keep[i]）是完整的；只需要修补端点：head→anchor，以及 anchor 的其他子节点→tail。对于后缀保留，anchor 是最后一个摘要；对于前缀保留，anchor 是边界本身。只有最后一个片段边界被重新链接——较早的片段被汇总到其中。绝对最后一个边界之前的所有物理内容（preservedUuids 除外）都被删除，这处理了所有多边界形状，无需特殊处理。原地修改 Map。 */
function applyPreservedSegmentRelinks(
  messages: Map<UUID, TranscriptMessage>,
): void {
  type Seg = NonNullable<
    SystemCompactBoundaryMessage['compactMetadata']['preservedSegment']
  >

  // 找到绝对最后一个边界和最后一个片段边界（可能不同：响应式压缩
  // 后的手动 /compact → 片段已过时）。
  let lastSeg: Seg | undefined
  let lastSegBoundaryIdx = -1
  let absoluteLastBoundaryIdx = -1
  const entryIndex = new Map<UUID, number>()
  let i = 0
  for (const entry of messages.values()) {
    entryIndex.set(entry.uuid, i)
    if (isCompactBoundaryMessage(entry)) {
      absoluteLastBoundaryIdx = i
      const seg = entry.compactMetadata?.preservedSegment
      if (seg) {
        lastSeg = seg
        lastSegBoundaryIdx = i
      }
    }
    i++
  }
  // 任何地方都没有片段 → 无操作。findUnresolvedToolUse 等读取完整映射。
  if (!lastSeg) return

  // 片段已过时（无片段边界出现在之后）：跳过重新链接，仍
  // 然在绝对边界处修剪——否则过时的保留链会成为幻影叶子。
  const segIsLive = lastSegBoundaryIdx === absoluteLastBoundaryIdx

  // 在修改之前验证 tail→head，以便格式错误的元数据成为真正
  // 的无操作（遍历在 headUuid 处停止，不需要先运行重新链接）。
  const preservedUuids = new Set<UUID>()
  if (segIsLive) {
    const walkSeen = new Set<UUID>()
    let cur = messages.get(lastSeg.tailUuid)
    let reachedHead = false
    while (cur && !walkSeen.has(cur.uuid)) {
      walkSeen.add(cur.uuid)
      preservedUuids.add(cur.uuid)
      if (cur.uuid === lastSeg.headUuid) {
        reachedHead = true
        break
      }
      cur = cur.parentUuid ? messages.get(cur.parentUuid) : undefined
    }
    if (!reachedHead) {
      // tail→head 遍历中断——保留片段中的 UUID 不在转录
      // 中。在此处返回会跳过下面的修剪，因此恢复会加载完整的压缩前历史
      // 记录。已知原因：中途生成的附件被推送到 mutableM
      // essages 但从未 recordTranscript（SD
      // K 子进程在下一轮 qe:420 刷新之前重新启动）。
      logEvent('tengu_relink_walk_broken', {
        tailInTranscript: messages.has(lastSeg.tailUuid),
        headInTranscript: messages.has(lastSeg.headUuid),
        anchorInTranscript: messages.has(lastSeg.anchorUuid),
        walkSteps: walkSeen.size,
        transcriptSize: messages.size,
      })
      return
    }
  }

  if (segIsLive) {
    const head = messages.get(lastSeg.headUuid)
    if (head) {
      messages.set(lastSeg.headUuid, {
        ...head,
        parentUuid: lastSeg.anchorUuid,
      })
    }
    // 尾部拼接：anchor 的其他子节点 → tail。如果已经指向 tail（useL
    // ogMessages 竞争情况），则为无操作。
    for (const [uuid, msg] of messages) {
      if (msg.parentUuid === lastSeg.anchorUuid && uuid !== lastSeg.headUuid) {
        messages.set(uuid, { ...msg, parentUuid: lastSeg.tailUuid })
      }
    }
    // 零过时使用：磁盘上的 input_tokens 反映压缩前的上
    // 下文（约 190K）——stripStaleUsage 只修补
    // 了被去重跳过的内存副本。没有这个，恢复 → 立即自动压缩螺旋。
    for (const uuid of preservedUuids) {
      const msg = messages.get(uuid)
      if (msg?.type !== 'assistant') continue
      messages.set(uuid, {
        ...msg,
        message: {
          ...msg.message!,
          usage: {
            ...msg.message!.usage,
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      })
    }
  }

  // 修剪绝对最后一个边界之前的所有物理内容，保留的内容除外。当 !seg
  // IsLive 时 preservedUuids 为空 → 完全修剪。
  const toDelete: UUID[] = []
  for (const [uuid] of messages) {
    const idx = entryIndex.get(uuid)
    if (
      idx !== undefined &&
      idx < absoluteLastBoundaryIdx &&
      !preservedUuids.has(uuid)
    ) {
      toDelete.push(uuid)
    }
  }
  for (const uuid of toDelete) messages.delete(uuid)
}

/** 删除 Snip 执行从内存数组中移除的消息，并跨间隙重新链接 parentUuid。与截断前缀的 compact_boundary 不同，snip 移除中间范围。JSONL 是仅追加的，因此已移除的消息保留在磁盘上，而幸存消息的 parentUuid 链会遍历它们。没有这个过滤器，buildConversationChain 会重建完整的未剪裁历史记录，并且恢复会立即 PTL（adamr-20260320-165831：显示 397K → 实际 1.65M）。仅删除是不够的：已移除范围之后的幸存消息的 parentUuid 指向间隙内部。buildConversationChain 会命中 messages.get(undefined) 并停止，从而孤立间隙之前的所有内容。因此，在删除之后，我们重新链接：对于每个具有悬空 parentUuid 的幸存者，通过已移除区域自身的父链接向后遍历到第一个未移除的祖先。边界在执行时记录 removedUuids，以便我们可以在加载时重放精确的移除操作。没有 removedUuids 的旧边界被跳过——恢复加载其剪裁前历史记录（修复前行为）。原地修改 Map。 */
function applySnipRemovals(messages: Map<UUID, TranscriptMessage>): void {
  // 结构检查——snipMetadata 仅存在于边界子类型上。避免使用子类
  // 型字面量，该字面量位于 excluded-strings.tx
  // t 中（HISTORY_SNIP 仅限 ant；该字面量不得泄露到外部构建中）。
  type WithSnipMeta = { snipMetadata?: { removedUuids?: UUID[] } }
  const toDelete = new Set<UUID>()
  for (const entry of messages.values()) {
    const removedUuids = (entry as WithSnipMeta).snipMetadata?.removedUuids
    if (!removedUuids) continue
    for (const uuid of removedUuids) toDelete.add(uuid)
  }
  if (toDelete.size === 0) return

  // 在删除之前捕获每个待删除条目的自身 parentUuid，以便我
  // 们可以向后遍历连续的已移除范围。不在 Map 中的条目（已经不存
  // 在，例如来自之前的 compact_boundary 修剪）不贡
  // 献链接；重新链接遍历将在间隙处停止并获取 null（链根行为——
  // 与 compact 在那里截断相同，它确实截断了）。
  const deletedParent = new Map<UUID, UUID | null>()
  let removedCount = 0
  for (const uuid of toDelete) {
    const entry = messages.get(uuid)
    if (!entry) continue
    deletedParent.set(uuid, entry.parentUuid)
    messages.delete(uuid)
    removedCount++
  }

  // 重新链接具有悬空 parentUuid 的幸存者。通过 d
  // eletedParent 向后遍历，直到遇到不在 toDel
  // ete 中的 UUID（或 null）。路径压缩：解析后，用解
  // 析后的链接填充映射，以便共享同一链段的后续幸存者不会重新遍历。
  const resolve = (start: UUID): UUID | null => {
    const path: UUID[] = []
    let cur: UUID | null | undefined = start
    while (cur && toDelete.has(cur)) {
      path.push(cur)
      cur = deletedParent.get(cur)
      if (cur === undefined) {
        cur = null
        break
      }
    }
    for (const p of path) deletedParent.set(p, cur)
    return cur
  }
  let relinkedCount = 0
  for (const [uuid, msg] of messages) {
    if (!msg.parentUuid || !toDelete.has(msg.parentUuid)) continue
    messages.set(uuid, { ...msg, parentUuid: resolve(msg.parentUuid) })
    relinkedCount++
  }

  logEvent('tengu_snip_resume_filtered', {
    removed_count: removedCount,
    relinked_count: relinkedCount,
  })
}

/** O(n) 单次遍历：找到具有最新时间戳且匹配谓词的消息。替换 `[...values].filter(pred).sort((a,b) => Date(b)-Date(a))[0]` 模式，该模式是 O(n log n) + 2n 次 Date 分配。 */
function findLatestMessage<T extends { timestamp: string }>(
  messages: Iterable<T>,
  predicate: (m: T) => boolean,
): T | undefined {
  let latest: T | undefined
  let maxTime = -Infinity
  for (const m of messages) {
    if (!predicate(m)) continue
    const t = Date.parse(m.timestamp)
    if (t > maxTime) {
      maxTime = t
      latest = m
    }
  }
  return latest
}

/** 从叶子消息到根构建对话链
@param messages 所有消息的映射
@param leafMessage 起始的叶子消息
@returns 从根到叶子的消息数组 */
export function buildConversationChain(
  messages: Map<UUID, TranscriptMessage>,
  leafMessage: TranscriptMessage,
): TranscriptMessage[] {
  const transcript: TranscriptMessage[] = []
  const seen = new Set<UUID>()
  let currentMsg: TranscriptMessage | undefined = leafMessage
  while (currentMsg) {
    if (seen.has(currentMsg.uuid)) {
      logError(
        new Error(
          `在消息 ${currentMsg.uuid} 的 parentUuid 链中检测到循环。返回部分转录。`,
        ),
      )
      logEvent('tengu_chain_parent_cycle', {})
      break
    }
    seen.add(currentMsg.uuid)
    transcript.push(currentMsg)
    currentMsg = currentMsg.parentUuid
      ? messages.get(currentMsg.parentUuid)
      : undefined
  }
  transcript.reverse()
  return recoverOrphanedParallelToolResults(messages, transcript, seen)
}

/** buildConversationChain 的后处理：恢复单亲遍历孤立的兄弟助手块和 tool_results。流式传输（claude.ts:~2024）为每个 content_block_stop 发出一个 AssistantMessage——N 个并行 tool_use → N 条消息，不同的 uuid，相同的 message.id。每个 tool_result 的 sourceToolAssistantUUID 指向其自己的单块助手，因此 insertMessageChain 的覆盖（第 ~894 行）将每个 TR 的 parentUuid 写入一个不同的助手。拓扑结构是一个 DAG；上面的遍历是一个链表遍历，只保留一个分支。在生产中观察到两种丢失模式（均在此处修复）：1. 兄弟助手被孤立：遍历 prev→asstA→TR_A→next，丢弃 asstB（相同的 message.id，链接在 asstA 之后）和 TR_B。2. 进度分叉（旧版，pre-#23537）：每个 tool_use asst 有一个进度子节点（继续写入链）和一个 TR 子节点。遍历跟随进度；TR 被丢弃。不再写入（进度已从转录持久化中移除），但旧转录仍然具有这种形状。读取端修复：写入拓扑结构已存在于旧转录的磁盘上；此恢复过程处理它们。 */
function recoverOrphanedParallelToolResults(
  messages: Map<UUID, TranscriptMessage>,
  chain: TranscriptMessage[],
  seen: Set<UUID>,
): TranscriptMessage[] {
  type ChainAssistant = TranscriptMessage & { type: 'assistant' }
  const chainAssistants = chain.filter(
    (m): m is ChainAssistant => m.type === 'assistant',
  )
  if (chainAssistants.length === 0) return chain

  // 锚点 = 每个兄弟组的最后一个链上成员。chainAssistan
  // ts 已经按链顺序排列，因此后续迭代会覆盖 → 最后一个生效。
  const anchorByMsgId = new Map<string, ChainAssistant>()
  for (const a of chainAssistants) {
    if (a.message!.id) anchorByMsgId.set(a.message!.id, a)
  }

  // O(n) 预计算：兄弟组和 TR 索引。TR 按 paren
  // tUuid 索引——insertMessageChain:~894 已经将其写为 srcUUI
  // D，并且 --fork-session 会剥离 srcUUID 但保留 parentUuid。
  const siblingsByMsgId = new Map<string, TranscriptMessage[]>()
  const toolResultsByAsst = new Map<UUID, TranscriptMessage[]>()
  for (const m of messages.values()) {
    if (m.type === 'assistant' && m.message!.id) {
      const group = siblingsByMsgId.get(m.message!.id)
      if (group) group.push(m)
      else siblingsByMsgId.set(m.message!.id, [m])
    } else if (
      m.type === 'user' &&
      m.parentUuid &&
      Array.isArray(m.message!.content) &&
      (m.message!.content as Array<{type: string}>).some(b => b.type === 'tool_result')
    ) {
      const group = toolResultsByAsst.get(m.parentUuid)
      if (group) group.push(m)
      else toolResultsByAsst.set(m.parentUuid, [m])
    }
  }

  // 对于每个触及链的 message.id 组：收集链外兄弟，然后收集所有
  // 成员的链外 TR。在最后一个链上成员之后立即拼接，以便组对于 norm
  // alizeMessagesForAPI 的合并保持连续，并且每个 TR
  // 都位于其 tool_use 之后。
  const processedGroups = new Set<string>()
  const inserts = new Map<UUID, TranscriptMessage[]>()
  let recoveredCount = 0
  for (const asst of chainAssistants) {
    const msgId = asst.message!.id
    if (!msgId || processedGroups.has(msgId)) continue
    processedGroups.add(msgId)

    const group = siblingsByMsgId.get(msgId) ?? [asst]
    const orphanedSiblings = group.filter(s => !seen.has(s.uuid))
    const orphanedTRs: TranscriptMessage[] = []
    for (const member of group) {
      const trs = toolResultsByAsst.get(member.uuid)
      if (!trs) continue
      for (const tr of trs) {
        if (!seen.has(tr.uuid)) orphanedTRs.push(tr)
      }
    }
    if (orphanedSiblings.length === 0 && orphanedTRs.length === 0) continue

    // 时间戳排序保持内容块/完成顺序；稳定排序在平局时保
    // 持 JSONL 写入顺序。
    orphanedSiblings.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    orphanedTRs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    const anchor = anchorByMsgId.get(msgId)!
    const recovered = [...orphanedSiblings, ...orphanedTRs]
    for (const r of recovered) seen.add(r.uuid)
    recoveredCount += recovered.length
    inserts.set(anchor.uuid, recovered)
  }

  if (recoveredCount === 0) return chain
  logEvent('tengu_chain_parallel_tr_recovered', {
    recovered_count: recoveredCount,
  })

  const result: TranscriptMessage[] = []
  for (const m of chain) {
    result.push(m)
    const toInsert = inserts.get(m.uuid)
    if (toInsert) result.push(...toInsert)
  }
  return result
}

/** 在重建的链中找到最新的 turn_duration 检查点，并将其记录的 messageCount 与该点链的位置进行比较。发出 tengu_resume_consistency_delta 用于 BigQuery 监控写入→加载往返漂移——即 snip/compact/parallel-TR 操作修改内存但磁盘上的 parentUuid 遍历重建出不同集合的那类错误（adamr-20260320-165831：显示 397K → 恢复时实际 1.65M）。delta > 0：恢复加载了比会话中更多的内容（通常的失败模式）delta < 0：恢复加载了更少的内容（链截断——#22453 类）delta = 0：往返一致从 loadConversationForResume 调用——每次恢复触发一次，而不是在 /share 或日志列表链重建时触发。 */
export function checkResumeConsistency(chain: Message[]): void {
  for (let i = chain.length - 1; i >= 0; i--) {
    const m = chain[i]!
    if (m.type !== 'system' || m.subtype !== 'turn_duration') continue
    const expected = m.messageCount as number | undefined
    if (expected === undefined) return
    // `i` 是检查点在重建链中的基于 0 的索引。检查点是在 messa
    // geCount 条消息之后追加的，因此其自身位置应为 messa
    // geCount（即 i === expected）。
    const actual = i
    logEvent('tengu_resume_consistency_delta', {
      expected,
      actual,
      delta: actual - expected,
      chain_length: chain.length,
      checkpoint_age_entries: chain.length - 1 - i,
    })
    return
  }
}

/** 从对话构建文件历史快照链 */
function buildFileHistorySnapshotChain(
  fileHistorySnapshots: Map<UUID, FileHistorySnapshotMessage>,
  conversation: TranscriptMessage[],
): FileHistorySnapshot[] {
  const snapshots: FileHistorySnapshot[] = []
  // messageId → snapshots[] 中的最后一个索引，用于 O(1) 更新查找
  const indexByMessageId = new Map<string, number>()
  for (const message of conversation) {
    const snapshotMessage = fileHistorySnapshots.get(message.uuid)
    if (!snapshotMessage) {
      continue
    }
    const { snapshot, isSnapshotUpdate } = snapshotMessage
    const existingIndex = isSnapshotUpdate
      ? indexByMessageId.get(snapshot.messageId)
      : undefined
    if (existingIndex === undefined) {
      indexByMessageId.set(snapshot.messageId, snapshots.length)
      snapshots.push(snapshot)
    } else {
      snapshots[existingIndex] = snapshot
    }
  }
  return snapshots
}

/** 从对话构建归属快照链。与文件历史快照不同，归属快照会完整返回，因为它们使用生成的 UUID（而非消息 UUID）并代表应在会话恢复时恢复的累积状态。 */
function buildAttributionSnapshotChain(
  attributionSnapshots: Map<UUID, AttributionSnapshotMessage>,
  _conversation: TranscriptMessage[],
): AttributionSnapshotMessage[] {
  // 返回所有归属快照——它们将在恢复期间合并
  return Array.from(attributionSnapshots.values())
}

/** 从 JSON 或 JSONL 文件加载转录并将其转换为 LogOption 格式
@param filePath 转录文件的路径（.json 或 .jsonl）
@returns 包含转录消息的 LogOption
@throws 如果文件不存在或包含无效数据则抛出错误 */
export async function loadTranscriptFromFile(
  filePath: string,
): Promise<LogOption> {
  if (filePath.endsWith('.jsonl')) {
    const {
      messages,
      summaries,
      customTitles,
      tags,
      fileHistorySnapshots,
      attributionSnapshots,
      contextCollapseCommits,
      contextCollapseSnapshot,
      leafUuids,
      contentReplacements,
      worktreeStates,
    } = await loadTranscriptFile(filePath)

    if (messages.size === 0) {
      throw new Error('在JSONL文件中未找到消息')
    }

    // 使用预计算的叶子UUID查找最近的叶子消息
    const leafMessage = findLatestMessage(messages.values(), msg =>
      leafUuids.has(msg.uuid),
    )

    if (!leafMessage) {
      throw new Error('在JSONL文件中未找到有效的对话链')
    }

    // 从叶子节点反向构建对话链至根节点
    const transcript = buildConversationChain(messages, leafMessage)

    const summary = summaries.get(leafMessage.uuid)
    const customTitle = customTitles.get(leafMessage.sessionId as UUID)
    const tag = tags.get(leafMessage.sessionId as UUID)
    const sessionId = leafMessage.sessionId as UUID
    return {
      ...convertToLogOption(
        transcript,
        0,
        summary,
        customTitle,
        buildFileHistorySnapshotChain(fileHistorySnapshots, transcript),
        tag,
        filePath,
        buildAttributionSnapshotChain(attributionSnapshots, transcript),
        undefined,
        contentReplacements.get(sessionId) ?? [],
      ),
      contextCollapseCommits: contextCollapseCommits.filter(
        e => e.sessionId === sessionId,
      ),
      contextCollapseSnapshot:
        contextCollapseSnapshot?.sessionId === sessionId
          ? contextCollapseSnapshot
          : undefined,
      worktreeSession: worktreeStates.has(sessionId)
        ? worktreeStates.get(sessionId)
        : undefined,
    }
  }

  // JSON日志文件
  const content = await readFile(filePath, { encoding: 'utf-8' })
  let parsed: unknown

  try {
    parsed = jsonParse(content)
  } catch (error) {
    throw new Error(`转录文件中的JSON无效：${error}`)
  }

  let messages: TranscriptMessage[]

  if (Array.isArray(parsed)) {
    messages = parsed
  } else if (parsed && typeof parsed === 'object' && 'messages' in parsed) {
    if (!Array.isArray(parsed.messages)) {
      throw new Error('转录消息必须是一个数组')
    }
    messages = parsed.messages
  } else {
    throw new Error(
      '转录必须是消息数组或包含messages数组的对象',
    )
  }

  return convertToLogOption(
    messages,
    0,
    undefined,
    undefined,
    undefined,
    undefined,
    filePath,
  )
}

/** 检查用户消息是否包含可见内容（文本或图片，而不仅仅是tool_result）。
工具结果作为折叠组的一部分显示，不作为独立消息。
同时排除不向用户显示的元消息。 */
function hasVisibleUserContent(message: TranscriptMessage): boolean {
  if (message.type !== 'user') return false

  // 元消息不向用户显示
  if (message.isMeta) return false

  const content = message.message?.content
  if (!content) return false

  // 字符串内容始终可见
  if (typeof content === 'string') {
    return content.trim().length > 0
  }

  // 数组内容：检查文本或图片块（非tool_result）
  if (Array.isArray(content)) {
    return content.some(
      block =>
        block.type === 'text' ||
        block.type === 'image' ||
        block.type === 'document',
    )
  }

  return false
}

/** 检查助手消息是否包含可见的文本内容（而不仅仅是tool_use块）。
工具使用作为分组/折叠的UI元素显示，不作为独立消息。 */
function hasVisibleAssistantContent(message: TranscriptMessage): boolean {
  if (message.type !== 'assistant') return false

  const content = message.message?.content
  if (!content || !Array.isArray(content)) return false

  // 检查文本块（而不仅仅是tool_use/thinking块）
  return content.some(
    block =>
      block.type === 'text' &&
      typeof block.text === 'string' &&
      block.text.trim().length > 0,
  )
}

/** 统计在UI中作为对话轮次出现的可见消息数量。
排除：
- 系统、附件和进度消息
- 带有isMeta标志的用户消息（对用户隐藏）
- 仅包含tool_result块的用户消息（显示为折叠组）
- 仅包含tool_use块的助手消息（显示为折叠组） */
function countVisibleMessages(transcript: TranscriptMessage[]): number {
  let count = 0
  for (const message of transcript) {
    switch (message.type) {
      case 'user':
        // 统计包含可见内容（文本、图片，而不仅仅是tool_result或meta）的用户消息
        if (hasVisibleUserContent(message)) {
          count++
        }
        break
      case 'assistant':
        // 统计包含文本内容（而不仅仅是tool_use）的助手消息
        if (hasVisibleAssistantContent(message)) {
          count++
        }
        break
      case 'attachment':
      case 'system':
      case 'progress':
        // 这些消息类型不计为可见的对话轮次
        break
    }
  }
  return count
}

function convertToLogOption(
  transcript: TranscriptMessage[],
  value: number = 0,
  summary?: string,
  customTitle?: string,
  fileHistorySnapshots?: FileHistorySnapshot[],
  tag?: string,
  fullPath?: string,
  attributionSnapshots?: AttributionSnapshotMessage[],
  agentSetting?: string,
  contentReplacements?: ContentReplacementRecord[],
): LogOption {
  const lastMessage = transcript.at(-1)!
  const firstMessage = transcript[0]!

  // 获取提示中的第一条用户消息
  const firstPrompt = extractFirstPrompt(transcript)

  // 根据消息时间戳创建时间戳
  const created = new Date(firstMessage.timestamp)
  const modified = new Date(lastMessage.timestamp)

  return {
    date: lastMessage.timestamp,
    messages: removeExtraFields(transcript),
    fullPath,
    value,
    created,
    modified,
    firstPrompt,
    messageCount: countVisibleMessages(transcript),
    isSidechain: firstMessage.isSidechain,
    teamName: firstMessage.teamName,
    agentName: firstMessage.agentName,
    agentSetting,
    leafUuid: lastMessage.uuid,
    summary,
    customTitle,
    tag,
    fileHistorySnapshots: fileHistorySnapshots,
    attributionSnapshots: attributionSnapshots,
    contentReplacements,
    gitBranch: lastMessage.gitBranch,
    projectPath: firstMessage.cwd,
  }
}

async function trackSessionBranchingAnalytics(
  logs: LogOption[],
): Promise<void> {
  const sessionIdCounts = new Map<string, number>()
  let maxCount = 0
  for (const log of logs) {
    const sessionId = getSessionIdFromLog(log)
    if (sessionId) {
      const newCount = (sessionIdCounts.get(sessionId) || 0) + 1
      sessionIdCounts.set(sessionId, newCount)
      maxCount = Math.max(newCount, maxCount)
    }
  }

  // 若未检测到重复项则提前退出
  if (maxCount <= 1) {
    return
  }

  // 使用函数式方法统计带分支的会话并计算统计信息
  const branchCounts = Array.from(sessionIdCounts.values()).filter(c => c > 1)
  const sessionsWithBranches = branchCounts.length
  const totalBranches = branchCounts.reduce((sum, count) => sum + count, 0)

  logEvent('tengu_session_forked_branches_fetched', {
    total_sessions: sessionIdCounts.size,
    sessions_with_branches: sessionsWithBranches,
    max_branches_per_session: Math.max(...branchCounts),
    avg_branches_per_session: Math.round(totalBranches / sessionsWithBranches),
    total_transcript_count: logs.length,
  })
}

export async function fetchLogs(limit?: number): Promise<LogOption[]> {
  const projectDir = getProjectDir(getOriginalCwd())
  const logs = await getSessionFilesLite(projectDir, limit, getOriginalCwd())

  await trackSessionBranchingAnalytics(logs)

  return logs
}

/** 向会话文件追加条目。若父目录不存在则创建。 */
/* eslint-disable custom-rules/no-sync-fs -- 同步调用者（退出清理、物化） */
function appendEntryToFile(
  fullPath: string,
  entry: Record<string, unknown>,
): void {
  const fs = getFsImplementation()
  const line = jsonStringify(entry) + '\n'
  try {
    fs.appendFileSync(fullPath, line, { mode: 0o600 })
  } catch {
    fs.mkdirSync(dirname(fullPath), { mode: 0o700 })
    fs.appendFileSync(fullPath, line, { mode: 0o600 })
  }
}

/** 为reAppendSessionMetadata的外部写入检查执行同步尾部读取。
对已打开的文件描述符执行fstat（无需额外路径查找）；读取与readLiteMetadata扫描相同的
LITE_READ_BUF_SIZE窗口。出错时返回空字符串，以便调用者回退到无条件行为。 */
function readFileTailSync(fullPath: string): string {
  let fd: number | undefined
  try {
    fd = openSync(fullPath, 'r')
    const st = fstatSync(fd)
    const tailOffset = Math.max(0, st.size - LITE_READ_BUF_SIZE)
    const buf = Buffer.allocUnsafe(
      Math.min(LITE_READ_BUF_SIZE, st.size - tailOffset),
    )
    const bytesRead = readSync(fd, buf, 0, buf.length, tailOffset)
    return buf.toString('utf8', 0, bytesRead)
  } catch {
    return ''
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // closeSync可能抛出异常；吞掉以保持返回''的约定
      }
    }
  }
}
/* eslint-enable custom-rules/no-sync-fs */

export async function saveCustomTitle(
  sessionId: UUID,
  customTitle: string,
  fullPath?: string,
  source: 'user' | 'auto' = 'user',
) {
  // 若未提供fullPath，则回退到计算路径
  const resolvedPath = fullPath ?? getTranscriptPathForSession(sessionId)
  appendEntryToFile(resolvedPath, {
    type: 'custom-title',
    customTitle,
    sessionId,
  })
  // 仅当前会话的缓存（用于即时可见性）
  if (sessionId === getSessionId()) {
    getProject().currentSessionTitle = customTitle
  }
  logEvent('tengu_session_renamed', {
    source:
      source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
}

/** 将AI生成的标题作为独立的`ai-title`条目持久化到JSONL文件中。

写入独立的条目类型（而非复用`custom-title`）是有意为之：
- 读取优先级：读取器优先使用`customTitle`字段而非`aiTitle`，因此无论追加顺序如何，用户重命名始终优先。
- 恢复安全性：`loadTranscriptFile`仅从`custom-title`条目填充`customTitles`映射，因此`restoreSessionMetadata`永远不会缓存AI标题，`reAppendSessionMetadata`也永远不会在EOF处重新追加AI标题——从而避免了恢复时陈旧的AI标题覆盖会话中用户重命名的错误。
- CAS语义：VS Code的`onlyIfNoCustomTitle`检查仅扫描`customTitle`字段，因此AI可以覆盖自己之前的AI标题，但绝不会覆盖用户标题。
- 指标：AI标题不会触发`tengu_session_renamed`事件。

由于该条目永远不会被重新追加，一旦累积足够多的消息，它就会滚出64KB的尾部窗口。此时读取器（`readLiteMetadata`、`listSessionsImpl`、VS Code `fetchSessions`）会回退到扫描头部缓冲区以查找`aiTitle`。头部和尾部读取都有界（各64KB，通过`extractLastJsonStringField`实现），不会进行全量扫描。

带有陈旧写入防护的调用者（例如VS Code客户端）应优先向SDK控制请求传递`persist: false`，并在防护通过后通过自己的重命名路径进行持久化，以避免AI标题在会话中途的用户重命名之后写入的竞态条件。 */
export function saveAiGeneratedTitle(sessionId: UUID, aiTitle: string): void {
  appendEntryToFile(getTranscriptPathForSession(sessionId), {
    type: 'ai-title',
    aiTitle,
    sessionId,
  })
}

/** 为`claude ps`追加周期性任务摘要。与ai-title不同，该条目不会被reAppendSessionMetadata重新追加——它是代理*当前*正在做什么的滚动快照，因此陈旧性是可以接受的；ps从尾部读取最新的一个。 */
export function saveTaskSummary(sessionId: UUID, summary: string): void {
  appendEntryToFile(getTranscriptPathForSession(sessionId), {
    type: 'task-summary',
    summary,
    sessionId,
    timestamp: new Date().toISOString(),
  })
}

export async function saveTag(sessionId: UUID, tag: string, fullPath?: string) {
  // 若未提供fullPath，则回退到计算路径
  const resolvedPath = fullPath ?? getTranscriptPathForSession(sessionId)
  appendEntryToFile(resolvedPath, { type: 'tag', tag, sessionId })
  // 仅当前会话的缓存（用于即时可见性）
  if (sessionId === getSessionId()) {
    getProject().currentSessionTag = tag
  }
  logEvent('tengu_session_tagged', {})
}

/** 将会话链接到GitHub拉取请求。
存储PR编号、URL和仓库，用于跟踪和导航。 */
export async function linkSessionToPR(
  sessionId: UUID,
  prNumber: number,
  prUrl: string,
  prRepository: string,
  fullPath?: string,
): Promise<void> {
  const resolvedPath = fullPath ?? getTranscriptPathForSession(sessionId)
  appendEntryToFile(resolvedPath, {
    type: 'pr-link',
    sessionId,
    prNumber,
    prUrl,
    prRepository,
    timestamp: new Date().toISOString(),
  })
  // 当前会话的缓存，以便reAppendSessionMetadata在压缩后重新写入
  if (sessionId === getSessionId()) {
    const project = getProject()
    project.currentSessionPrNumber = prNumber
    project.currentSessionPrUrl = prUrl
    project.currentSessionPrRepository = prRepository
  }
  logEvent('tengu_session_linked_to_pr', { prNumber })
}

export function getCurrentSessionTag(sessionId: UUID): string | undefined {
  // 仅返回当前会话的标签（我们缓存的唯一一个）
  if (sessionId === getSessionId()) {
    return getProject().currentSessionTag
  }
  return undefined
}

export function getCurrentSessionTitle(
  sessionId: SessionId,
): string | undefined {
  // 仅返回当前会话的标题（我们缓存的唯一一个）
  if (sessionId === getSessionId()) {
    return getProject().currentSessionTitle
  }
  return undefined
}

export function getCurrentSessionAgentColor(): string | undefined {
  return getProject().currentSessionAgentColor
}

/** 在恢复时将会话元数据恢复到内存缓存中。
填充缓存，以便元数据可用于显示（例如代理横幅），并在会话退出时通过reAppendSessionMetadata重新追加。 */
export function restoreSessionMetadata(meta: {
  customTitle?: string
  tag?: string
  agentName?: string
  agentColor?: string
  agentSetting?: string
  mode?: 'coordinator' | 'normal'
  worktreeSession?: PersistedWorktreeSession | null
  prNumber?: number
  prUrl?: string
  prRepository?: string
}): void {
  const project = getProject()
  // ??= 使得--name（cacheSessionTitle）
  // 优先于恢复会话的标题。REPL.tsx在调用前会清除，因此/resume不受影响。
  if (meta.customTitle) project.currentSessionTitle ??= meta.customTitle
  if (meta.tag !== undefined) project.currentSessionTag = meta.tag || undefined
  if (meta.agentName) project.currentSessionAgentName = meta.agentName
  if (meta.agentColor) project.currentSessionAgentColor = meta.agentColor
  if (meta.agentSetting) project.currentSessionAgentSetting = meta.agentSetting
  if (meta.mode) project.currentSessionMode = meta.mode
  if (meta.worktreeSession !== undefined)
    project.currentSessionWorktree = meta.worktreeSession
  if (meta.prNumber !== undefined)
    project.currentSessionPrNumber = meta.prNumber
  if (meta.prUrl) project.currentSessionPrUrl = meta.prUrl
  if (meta.prRepository) project.currentSessionPrRepository = meta.prRepository
}

/** 清除所有缓存的会话元数据（标题、标签、代理名称/颜色）。
当/clear创建新会话时调用，以防止上一个会话的陈旧元数据泄漏到新会话中。 */
export function clearSessionMetadata(): void {
  const project = getProject()
  project.currentSessionTitle = undefined
  project.currentSessionTag = undefined
  project.currentSessionAgentName = undefined
  project.currentSessionAgentColor = undefined
  project.currentSessionLastPrompt = undefined
  project.currentSessionAgentSetting = undefined
  project.currentSessionMode = undefined
  project.currentSessionWorktree = undefined
  project.currentSessionPrNumber = undefined
  project.currentSessionPrUrl = undefined
  project.currentSessionPrRepository = undefined
}

/** 将缓存的会话元数据（自定义标题、标签）重新追加到转录文件末尾。
在压缩后调用此方法，以确保元数据保持在readLiteMetadata在渐进加载期间读取的16KB尾部窗口内。
如果不这样做，压缩后足够多的消息可能会将元数据条目推出窗口，导致`--resume`显示自动生成的firstPrompt而非用户设置的会话名称。 */
export function reAppendSessionMetadata(): void {
  getProject().reAppendSessionMetadata()
}

export async function saveAgentName(
  sessionId: UUID,
  agentName: string,
  fullPath?: string,
  source: 'user' | 'auto' = 'user',
) {
  const resolvedPath = fullPath ?? getTranscriptPathForSession(sessionId)
  appendEntryToFile(resolvedPath, { type: 'agent-name', agentName, sessionId })
  // 仅当前会话的缓存（用于即时可见性）
  if (sessionId === getSessionId()) {
    getProject().currentSessionAgentName = agentName
    void updateSessionName(agentName)
  }
  logEvent('tengu_agent_name_set', {
    source:
      source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
}

export async function saveAgentColor(
  sessionId: UUID,
  agentColor: string,
  fullPath?: string,
) {
  const resolvedPath = fullPath ?? getTranscriptPathForSession(sessionId)
  appendEntryToFile(resolvedPath, {
    type: 'agent-color',
    agentColor,
    sessionId,
  })
  // 仅当前会话的缓存（用于即时可见性）
  if (sessionId === getSessionId()) {
    getProject().currentSessionAgentColor = agentColor
  }
  logEvent('tengu_agent_color_set', {})
}

/** 缓存会话代理设置。由materializeSessionFile在第一条用户消息时写入磁盘，并在退出时由reAppendSessionMetadata重新标记。
此处仅缓存，以避免在启动时创建仅包含元数据的会话文件。 */
export function saveAgentSetting(agentSetting: string): void {
  getProject().currentSessionAgentSetting = agentSetting
}

/** 缓存在启动时设置的会话标题（--name）。由materializeSessionFile在第一条用户消息时写入磁盘。
此处仅缓存，以避免在会话ID最终确定之前创建孤立的仅元数据文件。 */
export function cacheSessionTitle(customTitle: string): void {
  getProject().currentSessionTitle = customTitle
}

/** 缓存会话模式。由materializeSessionFile在第一条用户消息时写入磁盘，并在退出时由reAppendSessionMetadata重新标记。
此处仅缓存，以避免在启动时创建仅包含元数据的会话文件。 */
export function saveMode(mode: 'coordinator' | 'normal'): void {
  getProject().currentSessionMode = mode
}

/** 记录会话的工作树状态以供--resume使用。由materializeSessionFile在第一条用户消息时写入磁盘，并在退出时由reAppendSessionMetadata重新标记。
退出工作树时传递null，以便--resume知道不要cd回该工作树。 */
export function saveWorktreeState(
  worktreeSession: PersistedWorktreeSession | null,
): void {
  // 剥离调用者可能通过完整WorktreeSession对象传递的临时字段（cr
  // eationDurationMs、usedSparsePaths）——Typ
  // eScript结构类型允许这样做，但我们不希望它们被序列化到转录中。
  const stripped: PersistedWorktreeSession | null = worktreeSession
    ? {
        originalCwd: worktreeSession.originalCwd,
        worktreePath: worktreeSession.worktreePath,
        worktreeName: worktreeSession.worktreeName,
        worktreeBranch: worktreeSession.worktreeBranch,
        originalBranch: worktreeSession.originalBranch,
        originalHeadCommit: worktreeSession.originalHeadCommit,
        sessionId: worktreeSession.sessionId,
        tmuxSessionName: worktreeSession.tmuxSessionName,
        hookBased: worktreeSession.hookBased,
      }
    : null
  const project = getProject()
  project.currentSessionWorktree = stripped
  // 当文件已存在时（会话中途进入/退出）立即写入。对于--worktree启动，s
  // essionFile为null——materializeSessionFile
  // 将在第一条消息时通过reAppendSessionMetadata写入。
  if (project.sessionFile) {
    appendEntryToFile(project.sessionFile, {
      type: 'worktree-state',
      worktreeSession: stripped,
      sessionId: getSessionId(),
    })
  }
}

/** 从日志中提取会话ID。
对于精简日志，直接使用sessionId字段。
对于完整日志，从第一条消息中提取。 */
export function getSessionIdFromLog(log: LogOption): UUID | undefined {
  // 对于精简日志，使用直接的sessionId字段
  if (log.sessionId) {
    return log.sessionId as UUID
  }
  // 回退到从第一条消息中提取（完整日志）
  return log.messages[0]?.sessionId as UUID | undefined
}

/** 检查日志是否为需要完整加载的精简日志。
精简日志具有messages: []和sessionId已设置的特征。 */
export function isLiteLog(log: LogOption): boolean {
  return log.messages.length === 0 && log.sessionId !== undefined
}

/** 通过读取JSONL文件为精简日志加载完整消息。
返回一个包含填充后messages数组的新LogOption。
如果日志已经是完整的或加载失败，则返回原始日志。 */
export async function loadFullLog(log: LogOption): Promise<LogOption> {
  // 如果已经是完整的，则原样返回
  if (!isLiteLog(log)) {
    return log
  }

  // 直接使用索引条目中的fullPath
  const sessionFile = log.fullPath
  if (!sessionFile) {
    return log
  }

  try {
    const {
      messages,
      summaries,
      customTitles,
      tags,
      agentNames,
      agentColors,
      agentSettings,
      prNumbers,
      prUrls,
      prRepositories,
      modes,
      worktreeStates,
      fileHistorySnapshots,
      attributionSnapshots,
      contentReplacements,
      contextCollapseCommits,
      contextCollapseSnapshot,
      leafUuids,
    } = await loadTranscriptFile(sessionFile)

    if (messages.size === 0) {
      return log
    }

    // 从转录中查找最近的用户/助手叶子消息
    const mostRecentLeaf = findLatestMessage(
      messages.values(),
      msg =>
        leafUuids.has(msg.uuid) &&
        (msg.type === 'user' || msg.type === 'assistant'),
    )
    if (!mostRecentLeaf) {
      return log
    }

    // 从该叶子节点构建对话链
    const transcript = buildConversationChain(messages, mostRecentLeaf)
    // 叶子的sessionId——分叉会话从源复制chain[0]，但
    // 元数据条目（custom-title等）由当前会话的ID作为键。
    const sessionId = mostRecentLeaf.sessionId as UUID | undefined
    return {
      ...log,
      messages: removeExtraFields(transcript),
      firstPrompt: extractFirstPrompt(transcript),
      messageCount: countVisibleMessages(transcript),
      summary: mostRecentLeaf
        ? summaries.get(mostRecentLeaf.uuid)
        : log.summary,
      customTitle: sessionId ? customTitles.get(sessionId) : log.customTitle,
      tag: sessionId ? tags.get(sessionId) : log.tag,
      agentName: sessionId ? agentNames.get(sessionId) : log.agentName,
      agentColor: sessionId ? agentColors.get(sessionId) : log.agentColor,
      agentSetting: sessionId ? agentSettings.get(sessionId) : log.agentSetting,
      mode: sessionId ? (modes.get(sessionId) as LogOption['mode']) : log.mode,
      worktreeSession:
        sessionId && worktreeStates.has(sessionId)
          ? worktreeStates.get(sessionId)
          : log.worktreeSession,
      prNumber: sessionId ? prNumbers.get(sessionId) : log.prNumber,
      prUrl: sessionId ? prUrls.get(sessionId) : log.prUrl,
      prRepository: sessionId
        ? prRepositories.get(sessionId)
        : log.prRepository,
      gitBranch: mostRecentLeaf?.gitBranch ?? log.gitBranch,
      isSidechain: transcript[0]?.isSidechain ?? log.isSidechain,
      teamName: transcript[0]?.teamName ?? log.teamName,
      leafUuid: mostRecentLeaf?.uuid ?? log.leafUuid,
      fileHistorySnapshots: buildFileHistorySnapshotChain(
        fileHistorySnapshots,
        transcript,
      ),
      attributionSnapshots: buildAttributionSnapshotChain(
        attributionSnapshots,
        transcript,
      ),
      contentReplacements: sessionId
        ? (contentReplacements.get(sessionId) ?? [])
        : log.contentReplacements,
      // 过滤到恢复会话的条目。loadTranscript
      // File按顺序读取文件，因此数组已按提交顺序排列
      // ；过滤保持该顺序。
      contextCollapseCommits: sessionId
        ? contextCollapseCommits.filter(e => e.sessionId === sessionId)
        : undefined,
      contextCollapseSnapshot:
        sessionId && contextCollapseSnapshot?.sessionId === sessionId
          ? contextCollapseSnapshot
          : undefined,
    }
  } catch {
    // 如果加载失败，返回原始日志
    return log
  }
}

/** 按自定义标题匹配搜索会话。
返回按时间倒序（最新在前）排序的匹配结果。
使用不区分大小写的匹配以获得更好的用户体验。
按sessionId去重（每个会话保留最新的）。
默认跨同一仓库的工作树搜索。 */
export async function searchSessionsByCustomTitle(
  query: string,
  options?: { limit?: number; exact?: boolean },
): Promise<LogOption[]> {
  const { limit, exact } = options || {}
  // 使用工作树感知的加载来搜索同一仓库的会话
  const worktreePaths = await getWorktreePaths(getOriginalCwd())
  const allStatLogs = await getStatOnlyLogsForWorktrees(worktreePaths)
  // 丰富所有日志以访问customTitle元数据
  const { logs } = await enrichLogs(allStatLogs, 0, allStatLogs.length)
  const normalizedQuery = query.toLowerCase().trim()

  const matchingLogs = logs.filter(log => {
    const title = log.customTitle?.toLowerCase().trim()
    if (!title) return false
    return exact ? title === normalizedQuery : title.includes(normalizedQuery)
  })

  // 按sessionId去重——多个日志可能具有相同的se
  // ssionId，如果它们是同一对话的不同分支。保留最新的。
  const sessionIdToLog = new Map<UUID, LogOption>()
  for (const log of matchingLogs) {
    const sessionId = getSessionIdFromLog(log)
    if (sessionId) {
      const existing = sessionIdToLog.get(sessionId)
      if (!existing || log.modified > existing.modified) {
        sessionIdToLog.set(sessionId, log)
      }
    }
  }
  const deduplicated = Array.from(sessionIdToLog.values())

  // 按时间倒序排序
  deduplicated.sort((a, b) => b.modified.getTime() - a.modified.getTime())

  // 如果指定了限制，则应用
  if (limit) {
    return deduplicated.slice(0, limit)
  }

  return deduplicated
}

/** 可能出现在压缩边界之前但必须加载的元数据条目类型（它们是会话范围的，而非消息范围的）。
保留为原始JSON字符串标记，以便在流式处理期间进行廉价的行过滤。 */
const METADATA_TYPE_MARKERS = [
  '"type":"summary"',
  '"type":"custom-title"',
  '"type":"tag"',
  '"type":"agent-name"',
  '"type":"agent-color"',
  '"type":"agent-setting"',
  '"type":"mode"',
  '"type":"worktree-state"',
  '"type":"pr-link"',
]
const METADATA_MARKER_BUFS = METADATA_TYPE_MARKERS.map(m => Buffer.from(m))
// 最长标记为22字节；加上前导`{`为23字节。
const METADATA_PREFIX_BOUND = 25

// null = carry跨越整个块。当carry可证明不是元数据行
// 时跳过拼接（标记位于`{`之后的第1个字节处）。
function resolveMetadataBuf(
  carry: Buffer | null,
  chunkBuf: Buffer,
): Buffer | null {
  if (carry === null || carry.length === 0) return chunkBuf
  if (carry.length < METADATA_PREFIX_BOUND) {
    return Buffer.concat([carry, chunkBuf])
  }
  if (carry[0] === 0x7b /* { */) {
    for (const m of METADATA_MARKER_BUFS) {
      if (carry.compare(m, 0, m.length, 1, 1 + m.length) === 0) {
        return Buffer.concat([carry, chunkBuf])
      }
    }
  }
  const firstNl = chunkBuf.indexOf(0x0a)
  return firstNl === -1 ? null : chunkBuf.subarray(firstNl + 1)
}

/** 轻量级前向扫描[0, endOffset)，仅收集元数据条目行。
使用原始Buffer块和字节级标记匹配——无需readline，无需对约99%的消息内容行进行逐行字符串转换。

快速路径：如果一个块包含零个标记（常见情况——每个会话的元数据条目少于50个），则跳过整个块，无需行拆分。 */
async function scanPreBoundaryMetadata(
  filePath: string,
  endOffset: number,
): Promise<string[]> {
  const { createReadStream } = await import('fs')
  const NEWLINE = 0x0a

  const stream = createReadStream(filePath, { end: endOffset - 1 })
  const metadataLines: string[] = []
  let carry: Buffer | null = null

  for await (const chunk of stream) {
    const chunkBuf = chunk as Buffer
    const buf = resolveMetadataBuf(carry, chunkBuf)
    if (buf === null) {
      carry = null
      continue
    }

    // 快速路径：大多数块包含零个元数据标记。跳过行拆分。
    let hasAnyMarker = false
    for (const m of METADATA_MARKER_BUFS) {
      if (buf.includes(m)) {
        hasAnyMarker = true
        break
      }
    }

    if (hasAnyMarker) {
      let lineStart = 0
      let nl = buf.indexOf(NEWLINE)
      while (nl !== -1) {
        // 有界标记检查：仅在此行的字节范围内查找
        for (const m of METADATA_MARKER_BUFS) {
          const mIdx = buf.indexOf(m, lineStart)
          if (mIdx !== -1 && mIdx < nl) {
            metadataLines.push(buf.toString('utf-8', lineStart, nl))
            break
          }
        }
        lineStart = nl + 1
        nl = buf.indexOf(NEWLINE, lineStart)
      }
      carry = buf.subarray(lineStart)
    } else {
      // 此块中无标记——仅保留不完整的尾随行
      const lastNl = buf.lastIndexOf(NEWLINE)
      carry = lastNl >= 0 ? buf.subarray(lastNl + 1) : buf
    }

    // 防止病态大行（例如，10 MB的工具输出行且无换行符
    // ）导致carry二次增长。真实元数据条目小于1 KB，因此
    // 如果carry超过此值，则说明处于消息内容中间——丢弃它。
    if (carry.length > 64 * 1024) carry = null
  }

  // 最终不完整行（endOffset处无尾随换行符）
  if (carry !== null && carry.length > 0) {
    for (const m of METADATA_MARKER_BUFS) {
      if (carry.includes(m)) {
        metadataLines.push(carry.toString('utf-8'))
        break
      }
    }
  }

  return metadataLines
}

/** 在parseJSONL之前执行字节级预过滤，剔除死分支。

每次回退/ctrl-z都会在仅追加的JSONL中留下一个孤立的链分支。buildConversationChain从最新的叶子节点遍历parentUuid并丢弃其余部分，但到那时parseJSONL已经为JSON.parse所有内容付出了代价。在分叉密集的会话上测量：

  41 MB，99%死亡：parseJSONL 56.0 ms -> 3.9 ms（-93%）
  151 MB，92%死亡：47.3 ms -> 9.4 ms（-80%）

死分支较少（5-7%）的会话，由于索引传递的开销大致抵消了解析节省，因此收益较小，因此此优化受缓冲区大小限制（与SKIP_PRECOMPACT_THRESHOLD相同的阈值）。

依赖于在本地会话中跨25k+消息行验证的两个不变性（0次违反）：

  1. 转录消息始终以parentUuid作为第一个键进行序列化。
     JSON.stringify按插入顺序发出键，而recordTranscript的对象字面量将parentUuid放在第一位。因此`{"parentUuid":`是一个稳定的行前缀，用于区分转录消息和元数据。

  2. 顶级uuid检测通过后缀检查+深度检查完成（参见扫描循环中的内联注释）。toolUseResult/mcpMeta在uuid之后序列化，包含任意服务器控制的对象，而agent_progress条目在data中序列化嵌套的Message，位于uuid之前——两者都可能产生嵌套的`"uuid":"<36>","timestamp":"`字节，因此仅后缀不够。当存在多个后缀匹配时，通过括号深度扫描进行消歧。

仅追加的写入规则保证父节点出现在文件中比子节点更早的偏移量处，因此从EOF向后遍历总能找到它们。 */

/** 消歧一行中多个`"uuid":"<36>","timestamp":"`匹配，通过找到JSON嵌套深度为1的那个。字符串感知的括号计数器：
字符串值内部的`{`/`}`不计入；字符串内部的`\"`和`\\`已处理。candidates按升序排序（扫描循环按字节顺序产生它们）。
返回第一个深度为1的候选，如果没有深度为1的候选，则返回最后一个候选（对于格式良好的JSONL不应发生——深度1是顶级对象字段所在的位置）。

仅在存在≥2个后缀匹配时调用（带有嵌套Message的agent_progress，或带有巧合后缀对象的mcpMeta）。开销为O(max(candidates) - lineStart)——一次前向字节遍历，在第一个深度为1的命中处停止。 */
function pickDepthOneUuidCandidate(
  buf: Buffer,
  lineStart: number,
  candidates: number[],
): number {
  const QUOTE = 0x22
  const BACKSLASH = 0x5c
  const OPEN_BRACE = 0x7b
  const CLOSE_BRACE = 0x7d
  let depth = 0
  let inString = false
  let escapeNext = false
  let ci = 0
  for (let i = lineStart; ci < candidates.length; i++) {
    if (i === candidates[ci]) {
      if (depth === 1 && !inString) return candidates[ci]!
      ci++
    }
    const b = buf[i]!
    if (escapeNext) {
      escapeNext = false
    } else if (inString) {
      if (b === BACKSLASH) escapeNext = true
      else if (b === QUOTE) inString = false
    } else if (b === QUOTE) inString = true
    else if (b === OPEN_BRACE) depth++
    else if (b === CLOSE_BRACE) depth--
  }
  return candidates.at(-1)!
}

function walkChainBeforeParse(buf: Buffer): Buffer {
  const NEWLINE = 0x0a
  const OPEN_BRACE = 0x7b
  const QUOTE = 0x22
  const PARENT_PREFIX = Buffer.from('{"parentUuid":')
  const UUID_KEY = Buffer.from('"uuid":"')
  const SIDECHAIN_TRUE = Buffer.from('"isSidechain":true')
  const UUID_LEN = 36
  const TS_SUFFIX = Buffer.from('","timestamp":"')
  const TS_SUFFIX_LEN = TS_SUFFIX.length
  const PREFIX_LEN = PARENT_PREFIX.length
  const KEY_LEN = UUID_KEY.length

  // 转录消息的步长为3的扁平索引：[lineStart, lineEnd, parentSta
  // rt]。parentStart是父uuid第一个字符的字节偏移量，如果为null则为-1。元
  // 数据行（summary、mode、file-history-snapshot等）未经过滤
  // 地进入metaRanges——它们缺少parentUuid前缀，并且下游需要所有元数据行。
  const msgIdx: number[] = []
  const metaRanges: number[] = []
  const uuidToSlot = new Map<string, number>()

  let pos = 0
  const len = buf.length
  while (pos < len) {
    const nl = buf.indexOf(NEWLINE, pos)
    const lineEnd = nl === -1 ? len : nl + 1
    if (
      lineEnd - pos > PREFIX_LEN &&
      buf[pos] === OPEN_BRACE &&
      buf.compare(PARENT_PREFIX, 0, PREFIX_LEN, pos, pos + PREFIX_LEN) === 0
    ) {
      // `{"parentUuid":null,` 或 `{"parentUuid":"<36个字符>",`
      const parentStart =
        buf[pos + PREFIX_LEN] === QUOTE ? pos + PREFIX_LEN + 1 : -1
      // 顶层 uuid 后面紧跟着 `","timestamp":"`，出现在 us
      // er/assistant/attachment 条目中（create*
      // 辅助函数将它们放在一起；两者始终已定义）。但后缀并非唯一：- agen
      // t_progress 条目在 data.message 中携带嵌套的 Me
      // ssage，该 Message 在顶层 uuid 之前序列化——该内部
      // Message 有自己的 uuid,timestamp 相邻，因
      // 此其字节也满足后
      // 缀检查。- mcpMeta/toolUseResult 出现在顶层
      // uuid 之后，包含服务器控制的 Record<string,unk
      // nown>——返回 {uuid:"<36>",time
      // stamp:"..."} 的服务器也会匹配。收集所有后缀匹配项；单个匹配
      // 项是明确的（常见情况），多个匹配项需要括号深度检查以选择 JSON
      // 嵌套深度为 1 的那个。没有后缀匹配的条目（某些 progress 变体将
      // timestamp 放在 uuid 之前 → 行尾的 `"uuid":
      // "<36>"}`）只有一个 `"uuid":"`，此时首次匹配回退是合理的。
      let firstAny = -1
      let suffix0 = -1
      let suffixN: number[] | undefined
      let from = pos
      for (;;) {
        const next = buf.indexOf(UUID_KEY, from)
        if (next < 0 || next >= lineEnd) break
        if (firstAny < 0) firstAny = next
        const after = next + KEY_LEN + UUID_LEN
        if (
          after + TS_SUFFIX_LEN <= lineEnd &&
          buf.compare(
            TS_SUFFIX,
            0,
            TS_SUFFIX_LEN,
            after,
            after + TS_SUFFIX_LEN,
          ) === 0
        ) {
          if (suffix0 < 0) suffix0 = next
          else (suffixN ??= [suffix0]).push(next)
        }
        from = next + KEY_LEN
      }
      const uk = suffixN
        ? pickDepthOneUuidCandidate(buf, pos, suffixN)
        : suffix0 >= 0
          ? suffix0
          : firstAny
      if (uk >= 0) {
        const uuidStart = uk + KEY_LEN
        // UUID 是纯 ASCII，因此 latin1 避免了 UTF-8 解码开销。
        const uuid = buf.toString('latin1', uuidStart, uuidStart + UUID_LEN)
        uuidToSlot.set(uuid, msgIdx.length)
        msgIdx.push(pos, lineEnd, parentStart)
      } else {
        metaRanges.push(pos, lineEnd)
      }
    } else {
      metaRanges.push(pos, lineEnd)
    }
    pos = lineEnd
  }

  // Leaf = 最后一个非侧链条目。isSidechain 是第二个或第三个
  // 键（在 parentUuid 之后，可能还有 logicalParentUui
  // d），因此从 lineStart 开始的 indexOf 在存在时可以在几十个
  // 字节内找到它；不存在时会溢出到下一行，由边界检查捕获。
  let leafSlot = -1
  for (let i = msgIdx.length - 3; i >= 0; i -= 3) {
    const sc = buf.indexOf(SIDECHAIN_TRUE, msgIdx[i]!)
    if (sc === -1 || sc >= msgIdx[i + 1]!) {
      leafSlot = i
      break
    }
  }
  if (leafSlot < 0) return buf

  // 沿 parentUuid 向上遍历到根节点。收集保留消息的
  // 行起始位置并求和其字节长度，以便决定拼接是否值得。父节点（
  // uuid 不在文件中）是分叉会话和边界后链的正常终止方式—
  // —语义与 buildConversationChain
  // 相同。针对索引污染的正确性依赖于上述时间戳后缀检查：没有后
  // 缀的嵌套 `"uuid":"` 匹配永远不会成为 uk。
  const seen = new Set<number>()
  const chain = new Set<number>()
  let chainBytes = 0
  let slot: number | undefined = leafSlot
  while (slot !== undefined) {
    if (seen.has(slot)) break
    seen.add(slot)
    chain.add(msgIdx[slot]!)
    chainBytes += msgIdx[slot + 1]! - msgIdx[slot]!
    const parentStart = msgIdx[slot + 2]!
    if (parentStart < 0) break
    const parent = buf.toString('latin1', parentStart, parentStart + UUID_LEN)
    slot = uuidToSlot.get(parent)
  }

  // parseJSONL 的开销与字节数成正比，而非条目数。一
  // 个会话可能有数千个死条目，但如果死分支是短轮次而活动链包含
  // 大量助手响应，则死条目仅占字节数的个位数百分比（实测：1
  // 07 MB 会话，69% 死条目，30% 死字节——索引+
  // 拼接开销超过了解析节省）。以字节数为门控：仅当可以丢弃至
  // 少一半缓冲区时才拼接。元数据很小，因此 len - cha
  // inBytes 可以足够接近地近似死字节数。在接近平衡点
  // 时，拼接的 memcpy（将 chainBytes 复制
  // 到新分配中）占主导，因此保守的 50% 门控可以安全地保持
  // 在有利一侧。
  if (len - chainBytes < len >> 1) return buf

  // 按原始文件顺序合并链条目与元数据。msgIdx 和 met
  // aRanges 都已按偏移量排序；将它们交错排列成子数组
  // 视图并一次性拼接。
  const parts: Buffer[] = []
  let m = 0
  for (let i = 0; i < msgIdx.length; i += 3) {
    const start = msgIdx[i]!
    while (m < metaRanges.length && metaRanges[m]! < start) {
      parts.push(buf.subarray(metaRanges[m]!, metaRanges[m + 1]!))
      m += 2
    }
    if (chain.has(start)) {
      parts.push(buf.subarray(start, msgIdx[i + 1]!))
    }
  }
  while (m < metaRanges.length) {
    parts.push(buf.subarray(metaRanges[m]!, metaRanges[m + 1]!))
    m += 2
  }
  return Buffer.concat(parts)
}

/** 从转录文件加载所有消息、摘要和文件历史快照。
返回消息、摘要、自定义标题、标签、文件历史快照和归属快照。 */
export async function loadTranscriptFile(
  filePath: string,
  opts?: { keepAllLeaves?: boolean },
): Promise<{
  messages: Map<UUID, TranscriptMessage>
  summaries: Map<UUID, string>
  customTitles: Map<UUID, string>
  tags: Map<UUID, string>
  agentNames: Map<UUID, string>
  agentColors: Map<UUID, string>
  agentSettings: Map<UUID, string>
  prNumbers: Map<UUID, number>
  prUrls: Map<UUID, string>
  prRepositories: Map<UUID, string>
  modes: Map<UUID, string>
  worktreeStates: Map<UUID, PersistedWorktreeSession | null>
  fileHistorySnapshots: Map<UUID, FileHistorySnapshotMessage>
  attributionSnapshots: Map<UUID, AttributionSnapshotMessage>
  contentReplacements: Map<UUID, ContentReplacementRecord[]>
  agentContentReplacements: Map<AgentId, ContentReplacementRecord[]>
  contextCollapseCommits: ContextCollapseCommitEntry[]
  contextCollapseSnapshot: ContextCollapseSnapshotEntry | undefined
  leafUuids: Set<UUID>
}> {
  const messages = new Map<UUID, TranscriptMessage>()
  const summaries = new Map<UUID, string>()
  const customTitles = new Map<UUID, string>()
  const tags = new Map<UUID, string>()
  const agentNames = new Map<UUID, string>()
  const agentColors = new Map<UUID, string>()
  const agentSettings = new Map<UUID, string>()
  const prNumbers = new Map<UUID, number>()
  const prUrls = new Map<UUID, string>()
  const prRepositories = new Map<UUID, string>()
  const modes = new Map<UUID, string>()
  const worktreeStates = new Map<UUID, PersistedWorktreeSession | null>()
  const fileHistorySnapshots = new Map<UUID, FileHistorySnapshotMessage>()
  const attributionSnapshots = new Map<UUID, AttributionSnapshotMessage>()
  const contentReplacements = new Map<UUID, ContentReplacementRecord[]>()
  const agentContentReplacements = new Map<
    AgentId,
    ContentReplacementRecord[]
  >()
  // 使用数组而非 Map——提交顺序很重要（嵌套折叠）。
  const contextCollapseCommits: ContextCollapseCommitEntry[] = []
  // 最后写入者胜出——后续条目覆盖先前的。
  let contextCollapseSnapshot: ContextCollapseSnapshotEntry | undefined

  try {
    // 对于大型转录，避免物化数兆字节的过时内容。单次前向分块读取：归属
    // 快照行在 fd 级别被跳过（从不缓冲），紧凑边界在流中截断累加器
    // 。峰值分配是输出大小，而非文件大小——一个 151 MB
    // 的会话（84% 为过时的 attr-snaps）分配约 3
    // 2 MB，而非 159+64 MB。这很重要，因为即使 JS
    // 级别的 GC 释放了底层缓冲区，mimalloc 也不会将
    // 这些页面归还给操作系统（实测：Bun.gc(true) 后 a
    // rrayBuffers=0，但旧扫描+剥离路径的 RSS 仍卡
    // 在约 316 MB，而此处约为 155 MB）。
    //
    // 边界前元数据（agent-setting、mode、pr-link 等）通过对
    // [0, boundary) 进行廉价的字节级前向扫描恢复。
    let buf: Buffer | null = null
    let metadataLines: string[] | null = null
    let hasPreservedSegment = false
    if (!isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_PRECOMPACT_SKIP)) {
      const { size } = await stat(filePath)
      if (size > SKIP_PRECOMPACT_THRESHOLD) {
        const scan = await readTranscriptForLoad(filePath, size)
        buf = scan.postBoundaryBuf
        hasPreservedSegment = scan.hasPreservedSegment
        // >0 表示我们截断了边界前字节，必须从该
        // 范围恢复会话范围的元数据。preserv
        // edSegment 边界不会截断（保留的消
        // 息物理上位于边界前），因此偏移量保持为 0，
        // 除非更早的非保留边界已经截断——在这种情况下
        // ，后续边界的保留消息位于该更早边界之后并被
        // 保留，我们仍然需要元数据扫描。
        if (scan.boundaryStartOffset > 0) {
          metadataLines = await scanPreBoundaryMetadata(
            filePath,
            scan.boundaryStartOffset,
          )
        }
      }
    }
    buf ??= await readFile(filePath)
    // 对于大型缓冲区（此处指 readTranscriptForLoad 的输
    // 出，且 attr-snaps 已在 fd 级别剥离——<5MB 的 re
    // adFile 路径会通过下面的大小门控），主要开销是解析 buildCo
    // nversationChain 无论如何都会丢弃的死分支。在以下情况下跳
    // 过：调用者需要所有叶子节点
    // （loadAllLogsFromSessionFile 用于 /insig
    // hts 选择用户消息最多的分支，而非最新的）；边界具有 pres
    // ervedSegment（这些消息在磁盘上保留其预紧凑 parentUu
    // id——applyPreservedSegmentRelinks 在
    // 解析后在内存中拼接它们，因此解析前的链遍历会将它们作为孤儿丢弃）；以及设置
    // 了 CLAUDE_CODE_DISABLE_PRECOMPACT_SK
    // IP（该终止开关意味着“加载所有内容，不跳过任何内容”；这是另一个解析
    // 前跳过优化，并且其依赖的 hasPreservedSegment 扫描
    // 未运行）。
    if (
      !opts?.keepAllLeaves &&
      !hasPreservedSegment &&
      !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_PRECOMPACT_SKIP) &&
      buf.length > SKIP_PRECOMPACT_THRESHOLD
    ) {
      buf = walkChainBeforeParse(buf)
    }

    // 第一遍：处理边界扫描期间收集的仅元数据行。这些行填充在紧
    // 凑边界之前写入的条目的会话范围映射（agentSett
    // ings、modes、prNumbers 等）。与边
    // 界后缓冲区的任何重叠都是无害的——后面的值会覆盖前面的。
    if (metadataLines && metadataLines.length > 0) {
      const metaEntries = parseJSONL<Entry>(
        Buffer.from(metadataLines.join('\n')),
      )
      for (const entry of metaEntries) {
        if (entry.type === 'summary' && entry.leafUuid) {
          summaries.set(entry.leafUuid, entry.summary)
        } else if (entry.type === 'custom-title' && entry.sessionId) {
          customTitles.set(entry.sessionId, entry.customTitle)
        } else if (entry.type === 'tag' && entry.sessionId) {
          tags.set(entry.sessionId, entry.tag)
        } else if (entry.type === 'agent-name' && entry.sessionId) {
          agentNames.set(entry.sessionId, entry.agentName)
        } else if (entry.type === 'agent-color' && entry.sessionId) {
          agentColors.set(entry.sessionId, entry.agentColor)
        } else if (entry.type === 'agent-setting' && entry.sessionId) {
          agentSettings.set(entry.sessionId, entry.agentSetting)
        } else if (entry.type === 'mode' && entry.sessionId) {
          modes.set(entry.sessionId, entry.mode)
        } else if (entry.type === 'worktree-state' && entry.sessionId) {
          worktreeStates.set(entry.sessionId, entry.worktreeSession)
        } else if (entry.type === 'pr-link' && entry.sessionId) {
          prNumbers.set(entry.sessionId, entry.prNumber)
          prUrls.set(entry.sessionId, entry.prUrl)
          prRepositories.set(entry.sessionId, entry.prRepository)
        }
      }
    }

    const entries = parseJSONL<Entry>(buf)

    // 旧版 progress 条目的桥接映射：progress_uuid → progress_pa
    // rent_uuid。PR #24099 从 isTranscriptMessage 中移除了
    // progress，因此如果旧转录的 parentUuid 链中包含 progress，当
    // messages.get(progressUuid) 返回 undefined 时，bu
    // ildConversationChain 会截断。由于转录是仅追加的（父节点在子节点之前），
    // 我们在看到每个 progress→parent 链接时记录它，通过连续的 progres
    // s 条目进行链式解析，然后将任何后续消息的 parentUuid 重写为桥接中的值。
    const progressBridge = new Map<UUID, UUID | null>()

    for (const entry of entries) {
      // 旧版 progress 检查在 Entry 类型的 else-if 链之前运行——
      // progress 不在 Entry 联合类型中，因此在 TypeScript 缩小了
      // `entry` 类型后检查它会交集为 `never`。
      if (isLegacyProgressEntry(entry)) {
        // 通过连续的 progress 条目进行链式解析，以便指向
        // progress 运行尾部的一条后续消息可以通过一次查
        // 找桥接到最近的非 progress 祖先。
        const parent = entry.parentUuid
        progressBridge.set(
          entry.uuid,
          parent && progressBridge.has(parent)
            ? (progressBridge.get(parent) ?? null)
            : parent,
        )
        continue
      }
      if (isTranscriptMessage(entry)) {
        if (entry.parentUuid && progressBridge.has(entry.parentUuid)) {
          entry.parentUuid = progressBridge.get(entry.parentUuid) ?? null
        }
        messages.set(entry.uuid, entry)
        // 紧凑边界：之前的 marble-origami-commit
        // 条目引用的消息不会出现在边界后的链中。>5MB 的后向
        // 扫描路径通过从不读取边界前字节来自然丢弃它们；<5MB 的路
        // 径读取所有内容，因此在此处丢弃。没有这个，/context
        // 中的 getStats().collapsedSpa
        // ns 会过度计数（projectView 静默跳过过时的
        // 提交，但它们仍在日志中）。
        if (isCompactBoundaryMessage(entry)) {
          contextCollapseCommits.length = 0
          contextCollapseSnapshot = undefined
        }
      } else if (entry.type === 'summary' && entry.leafUuid) {
        summaries.set(entry.leafUuid, entry.summary)
      } else if (entry.type === 'custom-title' && entry.sessionId) {
        customTitles.set(entry.sessionId, entry.customTitle)
      } else if (entry.type === 'tag' && entry.sessionId) {
        tags.set(entry.sessionId, entry.tag)
      } else if (entry.type === 'agent-name' && entry.sessionId) {
        agentNames.set(entry.sessionId, entry.agentName)
      } else if (entry.type === 'agent-color' && entry.sessionId) {
        agentColors.set(entry.sessionId, entry.agentColor)
      } else if (entry.type === 'agent-setting' && entry.sessionId) {
        agentSettings.set(entry.sessionId, entry.agentSetting)
      } else if (entry.type === 'mode' && entry.sessionId) {
        modes.set(entry.sessionId, entry.mode)
      } else if (entry.type === 'worktree-state' && entry.sessionId) {
        worktreeStates.set(entry.sessionId, entry.worktreeSession)
      } else if (entry.type === 'pr-link' && entry.sessionId) {
        prNumbers.set(entry.sessionId, entry.prNumber)
        prUrls.set(entry.sessionId, entry.prUrl)
        prRepositories.set(entry.sessionId, entry.prRepository)
      } else if (entry.type === 'file-history-snapshot') {
        fileHistorySnapshots.set(entry.messageId, entry)
      } else if (entry.type === 'attribution-snapshot') {
        attributionSnapshots.set(entry.messageId, entry)
      } else if (entry.type === 'content-replacement') {
        // 子代理决策按 agentId 键控（侧链恢复）；主线程决策按 ses
        // sionId 键控（/resume）。
        if (entry.agentId) {
          const existing = agentContentReplacements.get(entry.agentId) ?? []
          agentContentReplacements.set(entry.agentId, existing)
          existing.push(...entry.replacements)
        } else {
          const existing = contentReplacements.get(entry.sessionId) ?? []
          contentReplacements.set(entry.sessionId, existing)
          existing.push(...entry.replacements)
        }
      } else if (entry.type === 'marble-origami-commit') {
        contextCollapseCommits.push(entry)
      } else if (entry.type === 'marble-origami-snapshot') {
        contextCollapseSnapshot = entry
      }
    }
  } catch {
    // 文件不存在或无法读取
  }

  applyPreservedSegmentRelinks(messages)
  applySnipRemovals(messages)

  // 在加载时一次性计算叶子 UUI
  // D。只有 user/assistant 消息才应被视为用于锚定恢复的
  // 叶子。其他消息类型（system、attachment）是元数据或辅
  // 助性的，不应锚定对话链。
  //
  // 我们使用标准父关系进行主链检测，但也需要处理最后一条消息是
  // system/metadata 消息的情况。对
  // 于每个对话链（通过跟踪父链接标识），叶子是最新的 use
  // r/assistant 消息。
  const allMessages = [...messages.values()]

  // 使用父关系的标准叶子计算
  const parentUuids = new Set(
    allMessages
      .map(msg => msg.parentUuid)
      .filter((uuid): uuid is UUID => uuid !== null),
  )

  // 查找所有终端消息（没有子节点的消息）
  const terminalMessages = allMessages.filter(msg => !parentUuids.has(msg.uuid))

  const leafUuids = new Set<UUID>()
  let hasCycle = false

  if (getFeatureValue_CACHED_MAY_BE_STALE('tengu_pebble_leaf_prune', false)) {
    // 构建一个包含拥有 user/assistant 子节点的
    // UUID 的集合（这些是对话中间节点，不是死胡同）
    const hasUserAssistantChild = new Set<UUID>()
    for (const msg of allMessages) {
      if (msg.parentUuid && (msg.type === 'user' || msg.type === 'assistant')) {
        hasUserAssistantChild.add(msg.parentUuid)
      }
    }

    // 对于每条终端消息，向后遍历以找到最近的 user/assistant 祖先
    // 。跳过已经拥有 user/assistant 子节点的祖先——这些是对话继续进
    // 行的中间节点（例如，一个 assistant tool_use 消息，其
    // progress 子节点是终端，但其 tool_result 子节点继续对话）。
    for (const terminal of terminalMessages) {
      const seen = new Set<UUID>()
      let current: TranscriptMessage | undefined = terminal
      while (current) {
        if (seen.has(current.uuid)) {
          hasCycle = true
          break
        }
        seen.add(current.uuid)
        if (current.type === 'user' || current.type === 'assistant') {
          if (!hasUserAssistantChild.has(current.uuid)) {
            leafUuids.add(current.uuid)
          }
          break
        }
        current = current.parentUuid
          ? messages.get(current.parentUuid)
          : undefined
      }
    }
  } else {
    // 原始叶子计算：从终端消息无条件向后遍历以找到最近
    // 的 user/assistant 祖先
    for (const terminal of terminalMessages) {
      const seen = new Set<UUID>()
      let current: TranscriptMessage | undefined = terminal
      while (current) {
        if (seen.has(current.uuid)) {
          hasCycle = true
          break
        }
        seen.add(current.uuid)
        if (current.type === 'user' || current.type === 'assistant') {
          leafUuids.add(current.uuid)
          break
        }
        current = current.parentUuid
          ? messages.get(current.parentUuid)
          : undefined
      }
    }
  }

  if (hasCycle) {
    logEvent('tengu_transcript_parent_cycle', {})
  }

  return {
    messages,
    summaries,
    customTitles,
    tags,
    agentNames,
    agentColors,
    agentSettings,
    prNumbers,
    prUrls,
    prRepositories,
    modes,
    worktreeStates,
    fileHistorySnapshots,
    attributionSnapshots,
    contentReplacements,
    agentContentReplacements,
    contextCollapseCommits,
    contextCollapseSnapshot,
    leafUuids,
  }
}

/** 从特定会话文件加载所有消息、摘要、文件历史快照和归属快照。 */
async function loadSessionFile(sessionId: UUID): Promise<{
  messages: Map<UUID, TranscriptMessage>
  summaries: Map<UUID, string>
  customTitles: Map<UUID, string>
  tags: Map<UUID, string>
  agentSettings: Map<UUID, string>
  worktreeStates: Map<UUID, PersistedWorktreeSession | null>
  fileHistorySnapshots: Map<UUID, FileHistorySnapshotMessage>
  attributionSnapshots: Map<UUID, AttributionSnapshotMessage>
  contentReplacements: Map<UUID, ContentReplacementRecord[]>
  contextCollapseCommits: ContextCollapseCommitEntry[]
  contextCollapseSnapshot: ContextCollapseSnapshotEntry | undefined
}> {
  const sessionFile = join(
    getSessionProjectDir() ?? getProjectDir(getOriginalCwd()),
    `${sessionId}.jsonl`,
  )
  return loadTranscriptFile(sessionFile)
}

/** 获取特定会话的消息 UUID，无需加载所有会话。
已记忆化以避免多次读取同一会话文件。 */
const getSessionMessages = memoize(
  async (sessionId: UUID): Promise<Set<UUID>> => {
    const { messages } = await loadSessionFile(sessionId)
    return new Set(messages.keys())
  },
  (sessionId: UUID) => sessionId,
)

/** 清除记忆化的会话消息缓存。
在压缩后调用，此时旧消息 UUID 不再有效。 */
export function clearSessionMessagesCache(): void {
  getSessionMessages.cache.clear?.()
}

/** 检查消息 UUID 是否存在于会话存储中 */
export async function doesMessageExistInSession(
  sessionId: UUID,
  messageUuid: UUID,
): Promise<boolean> {
  const messageSet = await getSessionMessages(sessionId)
  return messageSet.has(messageUuid)
}

export async function getLastSessionLog(
  sessionId: UUID,
): Promise<LogOption | null> {
  // 单次读取：一次性加载所有会话数据，而不是读取文件两次
  const {
    messages,
    summaries,
    customTitles,
    tags,
    agentSettings,
    worktreeStates,
    fileHistorySnapshots,
    attributionSnapshots,
    contentReplacements,
    contextCollapseCommits,
    contextCollapseSnapshot,
  } = await loadSessionFile(sessionId)
  if (messages.size === 0) return null
  // 预填充 getSessionMessages 缓存，以便 recordTra
  // nscript（在 --resume 的 REPL 挂载后调用）跳过第二次完整的文件加载
  // 。大型会话上节省 -170~227ms。保护：仅在缓存为空时预填充。会话中间的调用者（
  // 例如 IssueFeedback）可能会在当前会话上调用 getLastSessio
  // nLog——用过时的磁盘快照覆盖活动缓存会丢失未刷新的 UUID 并破坏去重。
  if (!getSessionMessages.cache.has(sessionId)) {
    getSessionMessages.cache.set(
      sessionId,
      Promise.resolve(new Set(messages.keys())),
    )
  }

  // 查找最近的非侧链消息
  const lastMessage = findLatestMessage(messages.values(), m => !m.isSidechain)
  if (!lastMessage) return null

  // 从最后一条消息构建转录链
  const transcript = buildConversationChain(messages, lastMessage)

  const summary = summaries.get(lastMessage.uuid)
  const customTitle = customTitles.get(lastMessage.sessionId as UUID)
  const tag = tags.get(lastMessage.sessionId as UUID)
  const agentSetting = agentSettings.get(sessionId)
  return {
    ...convertToLogOption(
      transcript,
      0,
      summary,
      customTitle,
      buildFileHistorySnapshotChain(fileHistorySnapshots, transcript),
      tag,
      getTranscriptPathForSession(sessionId),
      buildAttributionSnapshotChain(attributionSnapshots, transcript),
      agentSetting,
      contentReplacements.get(sessionId) ?? [],
    ),
    worktreeSession: worktreeStates.get(sessionId),
    contextCollapseCommits: contextCollapseCommits.filter(
      e => e.sessionId === sessionId,
    ),
    contextCollapseSnapshot:
      contextCollapseSnapshot?.sessionId === sessionId
        ? contextCollapseSnapshot
        : undefined,
  }
}

/** 加载消息日志列表
@param limit 可选，限制要加载的会话文件数量
@returns 按日期排序的消息日志列表 */
export async function loadMessageLogs(limit?: number): Promise<LogOption[]> {
  const sessionLogs = await fetchLogs(limit)
  // fetchLogs 返回精简（仅统计信息）日志——丰富它们以获取
  // 元数据。enrichLogs 已经过滤掉了侧链、空会话等。
  const { logs: enriched } = await enrichLogs(
    sessionLogs,
    0,
    sessionLogs.length,
  )

  // enrichLogs 返回新的未共享对象——原地修改以避免仅仅为了
  // 重新编号索引而重新展开每个 30 字段的 LogOption。
  const sorted = sortLogs(enriched)
  sorted.forEach((log, i) => {
    log.value = i
  })
  return sorted
}

/** 从所有项目目录加载消息日志。
@param limit 可选，限制每个项目要加载的会话文件数量（当没有索引时使用）
@returns 按日期排序的消息日志列表 */
export async function loadAllProjectsMessageLogs(
  limit?: number,
  options?: { skipIndex?: boolean; initialEnrichCount?: number },
): Promise<LogOption[]> {
  if (options?.skipIndex) {
    // 加载所有会话的完整消息数据（例如用于 /insights 分析）
    return loadAllProjectsMessageLogsFull(limit)
  }
  const result = await loadAllProjectsMessageLogsProgressive(
    limit,
    options?.initialEnrichCount ?? INITIAL_ENRICH_COUNT,
  )
  return result.logs
}

async function loadAllProjectsMessageLogsFull(
  limit?: number,
): Promise<LogOption[]> {
  const projectsDir = getProjectsDir()

  let dirents: Dirent[]
  try {
    dirents = await readdir(projectsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const projectDirs = dirents
    .filter(dirent => dirent.isDirectory())
    .map(dirent => join(projectsDir, dirent.name))

  const logsPerProject = await Promise.all(
    projectDirs.map(projectDir => getLogsWithoutIndex(projectDir, limit)),
  )
  const allLogs = logsPerProject.flat()

  // 去重——相同的会话+叶子可能出现在多个项目目录中。此路径为每个叶子创建一个
  // LogOption，因此使用 sessionId+leafUuid 作为键。
  const deduped = new Map<string, LogOption>()
  for (const log of allLogs) {
    const key = `${log.sessionId ?? ''}:${log.leafUuid ?? ''}`
    const existing = deduped.get(key)
    if (!existing || log.modified.getTime() > existing.modified.getTime()) {
      deduped.set(key, log)
    }
  }

  // 去重后的值来自 getLogsWithoutIndex，是新的——可以安全修改
  const sorted = sortLogs([...deduped.values()])
  sorted.forEach((log, i) => {
    log.value = i
  })
  return sorted
}

export async function loadAllProjectsMessageLogsProgressive(
  limit?: number,
  initialEnrichCount: number = INITIAL_ENRICH_COUNT,
): Promise<SessionLogResult> {
  const projectsDir = getProjectsDir()

  let dirents: Dirent[]
  try {
    dirents = await readdir(projectsDir, { withFileTypes: true })
  } catch {
    return { logs: [], allStatLogs: [], nextIndex: 0 }
  }

  const projectDirs = dirents
    .filter(dirent => dirent.isDirectory())
    .map(dirent => join(projectsDir, dirent.name))

  const rawLogs: LogOption[] = []
  for (const projectDir of projectDirs) {
    rawLogs.push(...(await getSessionFilesLite(projectDir, limit)))
  }
  // 去重——相同的会话可能出现在多个项目目录中
  const sorted = deduplicateLogsBySessionId(rawLogs)

  const { logs, nextIndex } = await enrichLogs(sorted, 0, initialEnrichCount)

  // enrichLogs 返回新的未共享对象——可以安全地原地修改
  logs.forEach((log, i) => {
    log.value = i
  })
  return { logs, allStatLogs: sorted, nextIndex }
}

/** 从同一 git 仓库的所有工作树加载消息日志。
如果没有提供工作树，则回退到 loadMessageLogs。

使用纯文件系统元数据实现快速加载。

@param worktreePaths 工作树路径数组（来自 getWorktreePaths）
@param limit 可选，限制每个项目要加载的会话文件数量
@returns 按日期排序的消息日志列表 */
/** 支持渐进式富化的会话日志加载结果。 */
export type SessionLogResult = {
  /** 已富化的日志，可供显示 */
  logs: LogOption[]
  /** 完整的仅统计信息列表，用于渐进式加载（调用 enrichLogs 获取更多信息） */
  allStatLogs: LogOption[]
  /** allStatLogs 中渐进式加载应继续的索引 */
  nextIndex: number
}

export async function loadSameRepoMessageLogs(
  worktreePaths: string[],
  limit?: number,
  initialEnrichCount: number = INITIAL_ENRICH_COUNT,
): Promise<LogOption[]> {
  const result = await loadSameRepoMessageLogsProgressive(
    worktreePaths,
    limit,
    initialEnrichCount,
  )
  return result.logs
}

export async function loadSameRepoMessageLogsProgressive(
  worktreePaths: string[],
  limit?: number,
  initialEnrichCount: number = INITIAL_ENRICH_COUNT,
): Promise<SessionLogResult> {
  logForDebugging(
    `/resume: 正在为 cwd=${getOriginalCwd()}, worktrees=[${worktreePaths.join(', ')}] 加载会话`,
  )
  const allStatLogs = await getStatOnlyLogsForWorktrees(worktreePaths, limit)
  logForDebugging(`/resume: 在磁盘上找到 ${allStatLogs.length} 个会话文件`)

  const { logs, nextIndex } = await enrichLogs(
    allStatLogs,
    0,
    initialEnrichCount,
  )

  // enrichLogs 返回新的未共享对象——可以安全地原地修改
  logs.forEach((log, i) => {
    log.value = i
  })
  return { logs, allStatLogs, nextIndex }
}

/** 获取工作树路径的仅统计信息日志（无文件读取）。 */
async function getStatOnlyLogsForWorktrees(
  worktreePaths: string[],
  limit?: number,
): Promise<LogOption[]> {
  const projectsDir = getProjectsDir()

  if (worktreePaths.length <= 1) {
    const cwd = getOriginalCwd()
    const projectDir = getProjectDir(cwd)
    return getSessionFilesLite(projectDir, undefined, cwd)
  }

  // 在 Windows 上，驱动器号大小写在 git worktree li
  // st 输出（例如 C:/Users/...）和项目目录中存储路径的方式
  // （例如 c:/Users/...）之间可能不同。使用不区分大小写的比较。
  const caseInsensitive = process.platform === 'win32'

  // 按清理后的前缀长度（最长优先）对工作树路径进行排序，以便更
  // 具体的匹配优先于较短的匹配。没有这个，像 -code-myre
  // po 这样的短前缀可能会在更长、更具体的前缀有机会之前匹配到
  // -code-myrepo-worktree1。
  const indexed = worktreePaths.map(wt => {
    const sanitized = sanitizePath(wt)
    return {
      path: wt,
      prefix: caseInsensitive ? sanitized.toLowerCase() : sanitized,
    }
  })
  indexed.sort((a, b) => b.prefix.length - a.prefix.length)

  const allLogs: LogOption[] = []
  const seenDirs = new Set<string>()

  let allDirents: Dirent[]
  try {
    allDirents = await readdir(projectsDir, { withFileTypes: true })
  } catch (e) {
    // 回退到当前项目
    logForDebugging(
      `无法读取项目目录 ${projectsDir}，回退到当前项目：${e}`,
    )
    const projectDir = getProjectDir(getOriginalCwd())
    return getSessionFilesLite(projectDir, limit, getOriginalCwd())
  }

  for (const dirent of allDirents) {
    if (!dirent.isDirectory()) continue
    const dirName = caseInsensitive ? dirent.name.toLowerCase() : dirent.name
    if (seenDirs.has(dirName)) continue

    for (const { path: wtPath, prefix } of indexed) {
      if (dirName === prefix || dirName.startsWith(prefix + '-')) {
        seenDirs.add(dirName)
        allLogs.push(
          ...(await getSessionFilesLite(
            join(projectsDir, dirent.name),
            undefined,
            wtPath,
          )),
        )
        break
      }
    }
  }

  // 按 sessionId 去重——同一会话可能出现
  // 在多个工作树项目目录中。保留修改时间最新的条目。
  return deduplicateLogsBySessionId(allLogs)
}

/** 按 agentId 检索特定代理的转录。
直接加载代理特定的转录文件。
@param agentId 要搜索的代理 ID
@returns 该代理的对话链和预算替换记录，如果未找到则返回 null */
export async function getAgentTranscript(agentId: AgentId): Promise<{
  messages: Message[]
  contentReplacements: ContentReplacementRecord[]
} | null> {
  const agentFile = getAgentTranscriptPath(agentId)

  try {
    const { messages, agentContentReplacements } =
      await loadTranscriptFile(agentFile)

    // 查找具有匹配 agentId 的消息
    const agentMessages = Array.from(messages.values()).filter(
      msg => msg.agentId === agentId && msg.isSidechain,
    )

    if (agentMessages.length === 0) {
      return null
    }

    // 查找具有此 agentId 的最新叶子消息
    const parentUuids = new Set(agentMessages.map(msg => msg.parentUuid))
    const leafMessage = findLatestMessage(
      agentMessages,
      msg => !parentUuids.has(msg.uuid),
    )

    if (!leafMessage) {
      return null
    }

    // 构建对话链
    const transcript = buildConversationChain(messages, leafMessage)

    // 过滤为仅包含具有此 agentId 的消息
    const agentTranscript = transcript.filter(msg => msg.agentId === agentId)

    return {
      // 将 TranscriptMessage[] 转换为 Message[]
      messages: agentTranscript.map(
        ({ isSidechain, parentUuid, ...msg }) => msg,
      ),
      contentReplacements: agentContentReplacements.get(agentId) ?? [],
    }
  } catch {
    return null
  }
}

/** 从对话中的 progress 消息提取代理 ID。
代理/技能 progress 消息的类型为 'progress'，data.type 为 'agent_progress' 或 'skill_progress'，并包含 data.agentId。
这会捕获在执行期间发出 progress 消息的同步代理。 */
export function extractAgentIdsFromMessages(messages: Message[]): string[] {
  const agentIds: string[] = []

  for (const message of messages) {
    if (
      message.type === 'progress' &&
      message.data &&
      typeof message.data === 'object' &&
      'type' in message.data &&
      (message.data.type === 'agent_progress' ||
        message.data.type === 'skill_progress') &&
      'agentId' in message.data &&
      typeof message.data.agentId === 'string'
    ) {
      agentIds.push(message.data.agentId)
    }
  }

  return uniq(agentIds)
}

/** 直接从 AppState 任务中提取队友转录。
进程内队友将其消息存储在 task.messages 中，
这比从磁盘加载更可靠，因为每个队友轮次
使用随机的 agentId 进行转录存储。 */
export function extractTeammateTranscriptsFromTasks(tasks: {
  [taskId: string]: {
    type: string
    identity?: { agentId: string }
    messages?: Message[]
  }
}): { [agentId: string]: Message[] } {
  const transcripts: { [agentId: string]: Message[] } = {}

  for (const task of Object.values(tasks)) {
    if (
      task.type === 'in_process_teammate' &&
      task.identity?.agentId &&
      task.messages &&
      task.messages.length > 0
    ) {
      transcripts[task.identity.agentId] = task.messages
    }
  }

  return transcripts
}

/** 为给定的代理 ID 加载子代理转录 */
export async function loadSubagentTranscripts(
  agentIds: string[],
): Promise<{ [agentId: string]: Message[] }> {
  const results = await Promise.all(
    agentIds.map(async agentId => {
      try {
        const result = await getAgentTranscript(asAgentId(agentId))
        if (result && result.messages.length > 0) {
          return { agentId, transcript: result.messages }
        }
        return null
      } catch {
        // 如果无法加载转录则跳过
        return null
      }
    }),
  )

  const transcripts: { [agentId: string]: Message[] } = {}
  for (const result of results) {
    if (result) {
      transcripts[result.agentId] = result.transcript
    }
  }
  return transcripts
}

// 直接 glob 会话的 subagents 目录——与 AppState.tasks 不同，这可以避免任务被驱逐。
export async function loadAllSubagentTranscriptsFromDisk(): Promise<{
  [agentId: string]: Message[]
}> {
  const subagentsDir = join(
    getSessionProjectDir() ?? getProjectDir(getOriginalCwd()),
    getSessionId(),
    'subagents',
  )
  let entries: Dirent[]
  try {
    entries = await readdir(subagentsDir, { withFileTypes: true })
  } catch {
    return {}
  }
  // 文件名格式与 getAgentTranscriptPath() 相反——请保持同步。
  const agentIds = entries
    .filter(
      d =>
        d.isFile() && d.name.startsWith('agent-') && d.name.endsWith('.jsonl'),
    )
    .map(d => d.name.slice('agent-'.length, -'.jsonl'.length))
  return loadSubagentTranscripts(agentIds)
}

// 已导出，以便 useLogMessages 可以同步计算最后一个可记录的 u
// uid，而无需等待 recordTranscript 的返回值（无竞态条件的提示跟踪）。
export function isLoggableMessage(m: Message): boolean {
  if (m.type === 'progress') return false
  // 重要提示：我们有意过滤掉非 ant 用户的大多数附件，因为它
  // 们包含用于训练的敏感信息，我们不希望向公众公开。启用时，我们允许
  // hook_additional_context 通过，因
  // 为它包含用户配置的钩子输出，对于恢复时的会话上下文很有用。
  if (m.type === 'attachment' && getUserType() !== 'ant') {
    if (
      m.attachment!.type === 'hook_additional_context' &&
      isEnvTruthy(process.env.CLAUDE_CODE_SAVE_HOOK_ADDITIONAL_CONTEXT)
    ) {
      return true
    }
    return false
  }
  return true
}

function collectReplIds(messages: readonly Message[]): Set<string> {
  const ids = new Set<string>()
  for (const m of messages) {
    if (m.type === 'assistant' && Array.isArray(m.message!.content)) {
      for (const b of m.message!.content as Array<{type: string; name: string; id: string}>) {
        if (b.type === 'tool_use' && b.name === REPL_TOOL_NAME) {
          ids.add(b.id)
        }
      }
    }
  }
  return ids
}

/** 对于外部用户，使 REPL 在持久化转录中不可见：剥离
REPL tool_use/tool_result 对，并将 isVirtual 消息提升为真实消息。在
--resume 时，模型会看到一个连贯的原生工具调用历史（助手
调用了 Bash，得到了结果，调用了 Read，得到了结果），而没有 REPL 包装器。
Ant 转录保留包装器，以便 /share 训练数据看到 REPL 使用。

replIds 是从完整的会话数组中预先收集的，而不是正在转换的切片——
recordTranscript 接收增量切片，其中 REPL tool_use（较早的渲染）
及其 tool_result（较晚的渲染，在异步执行之后）落在不同的调用中。
每次调用时新建的 Set 会错过 ID，并在磁盘上留下孤立的 tool_result。 */
function transformMessagesForExternalTranscript(
  messages: Transcript,
  replIds: Set<string>,
): Transcript {
  return messages.flatMap(m => {
    if (m.type === 'assistant' && Array.isArray(m.message.content)) {
      const content = m.message.content
      const hasRepl = content.some(
        b => b.type === 'tool_use' && b.name === REPL_TOOL_NAME,
      )
      const filtered = hasRepl
        ? content.filter(
            b => !(b.type === 'tool_use' && b.name === REPL_TOOL_NAME),
          )
        : content
      if (filtered.length === 0) return []
      if (m.isVirtual) {
        const { isVirtual: _omit, ...rest } = m
        return [{ ...rest, message: { ...m.message, content: filtered } }]
      }
      if (filtered !== content) {
        return [{ ...m, message: { ...m.message, content: filtered } }]
      }
      return [m]
    }
    if (m.type === 'user' && Array.isArray(m.message.content)) {
      const content = m.message.content
      const hasRepl = content.some(
        b => b.type === 'tool_result' && replIds.has(b.tool_use_id),
      )
      const filtered = hasRepl
        ? content.filter(
            b => !(b.type === 'tool_result' && replIds.has(b.tool_use_id)),
          )
        : content
      if (filtered.length === 0) return []
      if (m.isVirtual) {
        const { isVirtual: _omit, ...rest } = m
        return [{ ...rest, message: { ...m.message, content: filtered } }]
      }
      if (filtered !== content) {
        return [{ ...m, message: { ...m.message, content: filtered } }]
      }
      return [m]
    }
    // 字符串内容的 user、system、attachment
    if ('isVirtual' in m && m.isVirtual) {
      const { isVirtual: _omit, ...rest } = m
      return [rest]
    }
    return [m]
  }) as Transcript
}

export function cleanMessagesForLogging(
  messages: Message[],
  allMessages: readonly Message[] = messages,
): Transcript {
  const filtered = messages.filter(isLoggableMessage) as Transcript
  return getUserType() !== 'ant'
    ? transformMessagesForExternalTranscript(
        filtered,
        collectReplIds(allMessages),
      )
    : filtered
}

/** 按索引获取日志
@param index 排序日志列表中的索引（从 0 开始）
@returns 日志数据，如果未找到则返回 null */
export async function getLogByIndex(index: number): Promise<LogOption | null> {
  const logs = await loadMessageLogs()
  return logs[index] || null
}

/** 在转录中按 tool_use_id 查找未解析的工具使用。
返回包含该 tool_use 的助手消息，如果未找到
或该工具调用已有 tool_result，则返回 null。 */
export async function findUnresolvedToolUse(
  toolUseId: string,
): Promise<AssistantMessage | null> {
  try {
    const transcriptPath = getTranscriptPath()
    const { messages } = await loadTranscriptFile(transcriptPath)

    let toolUseMessage = null

    // 找到工具使用，但确保没有对应的结果
    for (const message of messages.values()) {
      if (message.type === 'assistant') {
        const content = message.message!.content
        if (Array.isArray(content)) {
          for (const block of content as Array<{type: string; id: string}>) {
            if (block.type === 'tool_use' && block.id === toolUseId) {
              toolUseMessage = message
              break
            }
          }
        }
      } else if (message.type === 'user') {
        const content = message.message!.content
        if (Array.isArray(content)) {
          for (const block of content as Array<{type: string; tool_use_id: string}>) {
            if (
              block.type === 'tool_result' &&
              block.tool_use_id === toolUseId
            ) {
              // 找到了工具结果，退出
              return null
            }
          }
        }
      }
    }

    return toolUseMessage as AssistantMessage | null
  } catch {
    return null
  }
}

/** 获取项目目录中所有会话 JSONL 文件及其统计信息。
返回 sessionId → {path, mtime, ctime, size} 的映射。
统计信息通过 Promise.all 批量处理，以避免热循环中的串行系统调用。 */
export async function getSessionFilesWithMtime(
  projectDir: string,
): Promise<
  Map<string, { path: string; mtime: number; ctime: number; size: number }>
> {
  const sessionFilesMap = new Map<
    string,
    { path: string; mtime: number; ctime: number; size: number }
  >()

  let dirents: Dirent[]
  try {
    dirents = await readdir(projectDir, { withFileTypes: true })
  } catch {
    // 目录不存在——返回空映射
    return sessionFilesMap
  }

  const candidates: Array<{ sessionId: string; filePath: string }> = []
  for (const dirent of dirents) {
    if (!dirent.isFile() || !dirent.name.endsWith('.jsonl')) continue
    const sessionId = validateUuid(basename(dirent.name, '.jsonl'))
    if (!sessionId) continue
    candidates.push({ sessionId, filePath: join(projectDir, dirent.name) })
  }

  await Promise.all(
    candidates.map(async ({ sessionId, filePath }) => {
      try {
        const st = await stat(filePath)
        sessionFilesMap.set(sessionId, {
          path: filePath,
          mtime: st.mtime.getTime(),
          ctime: st.birthtime.getTime(),
          size: st.size,
        })
      } catch {
        logForDebugging(`无法获取会话文件状态：${filePath}`)
      }
    }),
  )

  return sessionFilesMap
}

/** 在恢复选择器初始加载时，需要丰富元数据的会话数量。
每次丰富操作会读取每个文件最多 128 KB（头部 + 尾部），因此 50 个会话
意味着约 6.4 MB 的 I/O 操作——在任何现代文件系统上都非常快，同时为用户
提供比之前默认的 10 个会话更好的初始视图。 */
const INITIAL_ENRICH_COUNT = 50

type LiteMetadata = {
  firstPrompt: string
  gitBranch?: string
  isSidechain: boolean
  projectPath?: string
  teamName?: string
  customTitle?: string
  summary?: string
  tag?: string
  agentSetting?: string
  prNumber?: number
  prUrl?: string
  prRepository?: string
}

/** 从单个会话文件中加载所有日志，包含完整的消息数据。
为文件中的每条叶子消息构建一个 LogOption。 */
export async function loadAllLogsFromSessionFile(
  sessionFile: string,
  projectPathOverride?: string,
): Promise<LogOption[]> {
  const {
    messages,
    summaries,
    customTitles,
    tags,
    agentNames,
    agentColors,
    agentSettings,
    prNumbers,
    prUrls,
    prRepositories,
    modes,
    fileHistorySnapshots,
    attributionSnapshots,
    contentReplacements,
    leafUuids,
  } = await loadTranscriptFile(sessionFile, { keepAllLeaves: true })

  if (messages.size === 0) return []

  const leafMessages: TranscriptMessage[] = []
  // 一次性构建 parentUuid → children 索引（O(n)），使得尾部消息查找对每条叶子消息都是 O(1)
  const childrenByParent = new Map<UUID, TranscriptMessage[]>()
  for (const msg of messages.values()) {
    if (leafUuids.has(msg.uuid)) {
      leafMessages.push(msg)
    } else if (msg.parentUuid) {
      const siblings = childrenByParent.get(msg.parentUuid)
      if (siblings) {
        siblings.push(msg)
      } else {
        childrenByParent.set(msg.parentUuid, [msg])
      }
    }
  }

  const logs: LogOption[] = []

  for (const leafMessage of leafMessages) {
    const chain = buildConversationChain(messages, leafMessage)
    if (chain.length === 0) continue

    // 追加作为叶子消息子节点的尾部消息
    const trailingMessages = childrenByParent.get(leafMessage.uuid)
    if (trailingMessages) {
      // ISO-8601 UTC 时间戳在字典序上是可排序的
      trailingMessages.sort((a, b) =>
        a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
      )
      chain.push(...trailingMessages)
    }

    const firstMessage = chain[0]!
    const sessionId = leafMessage.sessionId as UUID

    logs.push({
      date: leafMessage.timestamp,
      messages: removeExtraFields(chain),
      fullPath: sessionFile,
      value: 0,
      created: new Date(firstMessage.timestamp),
      modified: new Date(leafMessage.timestamp),
      firstPrompt: extractFirstPrompt(chain),
      messageCount: countVisibleMessages(chain),
      isSidechain: firstMessage.isSidechain ?? false,
      sessionId,
      leafUuid: leafMessage.uuid,
      summary: summaries.get(leafMessage.uuid),
      customTitle: customTitles.get(sessionId),
      tag: tags.get(sessionId),
      agentName: agentNames.get(sessionId),
      agentColor: agentColors.get(sessionId),
      agentSetting: agentSettings.get(sessionId),
      mode: modes.get(sessionId) as LogOption['mode'],
      prNumber: prNumbers.get(sessionId),
      prUrl: prUrls.get(sessionId),
      prRepository: prRepositories.get(sessionId),
      gitBranch: leafMessage.gitBranch,
      projectPath: projectPathOverride ?? firstMessage.cwd,
      fileHistorySnapshots: buildFileHistorySnapshotChain(
        fileHistorySnapshots,
        chain,
      ),
      attributionSnapshots: buildAttributionSnapshotChain(
        attributionSnapshots,
        chain,
      ),
      contentReplacements: contentReplacements.get(sessionId) ?? [],
    })
  }

  return logs
}

/** 通过完全加载所有会话文件来获取日志，绕过会话索引。
当你需要完整的消息数据时使用此方法（例如，用于 /insights 分析）。 */
async function getLogsWithoutIndex(
  projectDir: string,
  limit?: number,
): Promise<LogOption[]> {
  const sessionFilesMap = await getSessionFilesWithMtime(projectDir)
  if (sessionFilesMap.size === 0) return []

  // 如果指定了 limit，则仅按 mtime 加载最新的 N 个文件
  let filesToProcess: Array<{ path: string; mtime: number }>
  if (limit && sessionFilesMap.size > limit) {
    filesToProcess = [...sessionFilesMap.values()]
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
  } else {
    filesToProcess = [...sessionFilesMap.values()]
  }

  const logs: LogOption[] = []
  for (const fileInfo of filesToProcess) {
    try {
      const fileLogOptions = await loadAllLogsFromSessionFile(fileInfo.path)
      logs.push(...fileLogOptions)
    } catch {
      logForDebugging(`无法加载会话文件：${fileInfo.path}`)
    }
  }

  return logs
}

/** 读取 JSONL 文件的前 64KB 和后 64KB，并提取轻量元数据。

头部（前 64KB）：isSidechain、projectPath、teamName、firstPrompt。
尾部（后 64KB）：customTitle、tag、PR 链接、latest gitBranch。

接受一个共享缓冲区以避免每个文件分配的开销。 */
async function readLiteMetadata(
  filePath: string,
  fileSize: number,
  buf: Buffer,
): Promise<LiteMetadata> {
  const { head, tail } = await readHeadAndTail(filePath, fileSize, buf)
  if (!head) return { firstPrompt: '', isSidechain: false }

  // 通过字符串搜索从第一行提取稳定的元数据。即使第一
  // 行被截断（超过 64KB 的消息）也能正常工作。
  const isSidechain =
    head.includes('"isSidechain":true') || head.includes('"isSidechain": true')
  const projectPath = extractJsonStringField(head, 'cwd')
  const teamName = extractJsonStringField(head, 'teamName')
  const agentSetting = extractJsonStringField(head, 'agentSetting')

  // 优先使用 last-prompt 尾部条目——在写入时由 extra
  // ctFirstPrompt 捕获（经过过滤，具有权威性），并显示用户
  // 最近在做什么。头部扫描是对于在 last-prompt 条目存在之前
  // 写入的会话的备用方案。原始字符串的头部抓取是最后的手段，用于捕获数组格
  // 式的内容块（VS Code <ide_selection> 元数据）。
  const firstPrompt =
    extractLastJsonStringField(tail, 'lastPrompt') ||
    extractFirstPromptFromChunk(head) ||
    extractJsonStringFieldPrefix(head, 'content', 200) ||
    extractJsonStringFieldPrefix(head, 'text', 200) ||
    ''

  // 通过字符串搜索提取尾部元数据（最后一次出现优先）。用户标题（custom
  // Title 字段，来自 custom-title 条目）优先于 AI 标题（
  // aiTitle 字段，来自 ai-title 条目）。不同的字段名意味着 ex
  // tractLastJsonStringField 可以自然地消除歧义。
  const customTitle =
    extractLastJsonStringField(tail, 'customTitle') ??
    extractLastJsonStringField(head, 'customTitle') ??
    extractLastJsonStringField(tail, 'aiTitle') ??
    extractLastJsonStringField(head, 'aiTitle')
  const summary = extractLastJsonStringField(tail, 'summary')
  const tag = extractLastJsonStringField(tail, 'tag')
  const gitBranch =
    extractLastJsonStringField(tail, 'gitBranch') ??
    extractJsonStringField(head, 'gitBranch')

  // PR 链接字段——prNumber 是数字而非字符串，因此两种都尝试
  const prUrl = extractLastJsonStringField(tail, 'prUrl')
  const prRepository = extractLastJsonStringField(tail, 'prRepository')
  let prNumber: number | undefined
  const prNumStr = extractLastJsonStringField(tail, 'prNumber')
  if (prNumStr) {
    prNumber = parseInt(prNumStr, 10) || undefined
  }
  if (!prNumber) {
    const prNumMatch = tail.lastIndexOf('"prNumber":')
    if (prNumMatch >= 0) {
      const afterColon = tail.slice(prNumMatch + 11, prNumMatch + 25)
      const num = parseInt(afterColon.trim(), 10)
      if (num > 0) prNumber = num
    }
  }

  return {
    firstPrompt,
    gitBranch,
    isSidechain,
    projectPath,
    teamName,
    customTitle,
    summary,
    tag,
    agentSetting,
    prNumber,
    prUrl,
    prRepository,
  }
}

/** 扫描一段文本以查找第一个有意义的用户提示。 */
function extractFirstPromptFromChunk(chunk: string): string {
  let start = 0
  let hasTickMessages = false
  let firstCommandFallback = ''
  while (start < chunk.length) {
    const newlineIdx = chunk.indexOf('\n', start)
    const line =
      newlineIdx >= 0 ? chunk.slice(start, newlineIdx) : chunk.slice(start)
    start = newlineIdx >= 0 ? newlineIdx + 1 : chunk.length

    if (!line.includes('"type":"user"') && !line.includes('"type": "user"')) {
      continue
    }
    if (line.includes('"tool_result"')) continue
    if (line.includes('"isMeta":true') || line.includes('"isMeta": true'))
      continue

    try {
      const entry = jsonParse(line) as Record<string, unknown>
      if (entry.type !== 'user') continue

      const message = entry.message as Record<string, unknown> | undefined
      if (!message) continue

      const content = message.content
      // 收集消息内容中的所有文本值。对于数组内容（在 VS Code
      // 中很常见，IDE 元数据标签位于用户实际提示之前），遍历所有
      // 文本块，这样我们就不会错过隐藏在 <ide_selectio
      // n>/<ide_opened_file> 块后面的真实提示。
      const texts: string[] = []
      if (typeof content === 'string') {
        texts.push(content)
      } else if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>
          if (b.type === 'text' && typeof b.text === 'string') {
            texts.push(b.text as string)
          }
        }
      }

      for (const text of texts) {
        if (!text) continue

        let result = text.replace(/\n/g, ' ').trim()

        // 跳过命令消息（斜杠命令），但记住第一个作为备用标题。匹配 g
        // etFirstMeaningfulUs
        // erMessageTextContent 中的跳过逻辑，但不是
        // 完全丢弃命令消息，而是将其格式化为干净的形式（例如 "/cl
        // ear"），以便会话仍然出现在恢复选择器中。
        const commandNameTag = extractTag(result, COMMAND_NAME_TAG)
        if (commandNameTag) {
          const name = commandNameTag.replace(/^\//, '')
          const commandArgs = extractTag(result, 'command-args')?.trim() || ''
          if (builtInCommandNames().has(name) || !commandArgs) {
            if (!firstCommandFallback) {
              firstCommandFallback = commandNameTag
            }
            continue
          }
          // 带有有意义参数的自定义命令——使用干净的显示形式
          return commandArgs
            ? `${commandNameTag} ${commandArgs}`
            : commandNameTag
        }

        // 在通用 XML 跳过之前，使用 ! 前缀格式化 bash 输入
        const bashInput = extractTag(result, 'bash-input')
        if (bashInput) return `! ${bashInput}`

        if (SKIP_FIRST_PROMPT_PATTERN.test(result)) {
          if (
            (feature('PROACTIVE') || feature('KAIROS')) &&
            result.startsWith(`<${TICK_TAG}>`)
          )
            hasTickMessages = true
          continue
        }
        if (result.length > 200) {
          result = result.slice(0, 200).trim() + '…'
        }
        return result
      }
    } catch {
    }
  }
  // 会话以斜杠命令开始，但没有后续的真实消息——使
  // 用干净的命令名称，以便会话仍然出现在恢复选择器中
  if (firstCommandFallback) return firstCommandFallback
  // 主动会话只有 tick 消息——为它们提供一个合成提示，以
  // 免被 enrichLogs 过滤掉
  if ((feature('PROACTIVE') || feature('KAIROS')) && hasTickMessages)
    return '主动会话'
  return ''
}

/** 类似于 extractJsonStringField，但即使缺少右引号（缓冲区被截断），也会返回值的前 `maxLen` 个字符。
换行转义符被替换为空格，结果会被修剪。 */
function extractJsonStringFieldPrefix(
  text: string,
  key: string,
  maxLen: number,
): string {
  const patterns = [`"${key}":"`, `"${key}": "`]
  for (const pattern of patterns) {
    const idx = text.indexOf(pattern)
    if (idx < 0) continue

    const valueStart = idx + pattern.length
    // 从值中获取最多 maxLen 个字符，在右引号处停止
    let i = valueStart
    let collected = 0
    while (i < text.length && collected < maxLen) {
      if (text[i] === '\\') {
        i += 2 // 跳过转义字符
        collected++
        continue
      }
      if (text[i] === '"') break
      i++
      collected++
    }
    const raw = text.slice(valueStart, i)
    return raw.replace(/\\n/g, ' ').replace(/\\t/g, ' ').trim()
  }
  return ''
}

/** 按 sessionId 对日志进行去重，保留修改时间最新的条目。
返回按顺序值索引排序的日志。 */
function deduplicateLogsBySessionId(logs: LogOption[]): LogOption[] {
  const deduped = new Map<string, LogOption>()
  for (const log of logs) {
    if (!log.sessionId) continue
    const existing = deduped.get(log.sessionId)
    if (!existing || log.modified.getTime() > existing.modified.getTime()) {
      deduped.set(log.sessionId, log)
    }
  }
  return sortLogs([...deduped.values()]).map((log, i) => ({
    ...log,
    value: i,
  }))
}

/** 从纯文件系统元数据（仅 stat）返回轻量 LogOption[]。
无需读取文件——即时完成。调用 `enrichLogs` 来丰富
可见会话的 firstPrompt、gitBranch、customTitle 等。 */
export async function getSessionFilesLite(
  projectDir: string,
  limit?: number,
  projectPath?: string,
): Promise<LogOption[]> {
  const sessionFilesMap = await getSessionFilesWithMtime(projectDir)

  // 按 mtime 降序排序并应用 limit
  let entries = [...sessionFilesMap.entries()].sort(
    (a, b) => b[1].mtime - a[1].mtime,
  )
  if (limit && entries.length > limit) {
    entries = entries.slice(0, limit)
  }

  const logs: LogOption[] = []

  for (const [sessionId, fileInfo] of entries) {
    logs.push({
      date: new Date(fileInfo.mtime).toISOString(),
      messages: [],
      isLite: true,
      fullPath: fileInfo.path,
      value: 0,
      created: new Date(fileInfo.ctime),
      modified: new Date(fileInfo.mtime),
      firstPrompt: '',
      messageCount: 0,
      fileSize: fileInfo.size,
      isSidechain: false,
      sessionId,
      projectPath,
    })
  }

  // 日志刚刚被推入上方——可以安全地原地修改
  const sorted = sortLogs(logs)
  sorted.forEach((log, i) => {
    log.value = i
  })
  return sorted
}

/** 使用 JSONL 文件中的元数据丰富轻量日志。
返回丰富后的日志，如果日志没有有意义的内容则返回 null
（没有 firstPrompt，没有 customTitle——例如，仅元数据的会话文件）。 */
async function enrichLog(
  log: LogOption,
  readBuf: Buffer,
): Promise<LogOption | null> {
  if (!log.isLite || !log.fullPath) return log

  const meta = await readLiteMetadata(log.fullPath, log.fileSize ?? 0, readBuf)

  const enriched: LogOption = {
    ...log,
    isLite: false,
    firstPrompt: meta.firstPrompt,
    gitBranch: meta.gitBranch,
    isSidechain: meta.isSidechain,
    teamName: meta.teamName,
    customTitle: meta.customTitle,
    summary: meta.summary,
    tag: meta.tag,
    agentSetting: meta.agentSetting,
    prNumber: meta.prNumber,
    prUrl: meta.prUrl,
    prRepository: meta.prRepository,
    projectPath: meta.projectPath ?? log.projectPath,
  }

  // 为无法提取第一个提示的会话提供备用标题（例如，超
  // 过 16KB 读取缓冲区的大型第一条消息）。以
  // 前这些会话会被静默丢弃，导致在崩溃或大型上下文会
  // 话后无法通过 /resume 访问。
  if (!enriched.firstPrompt && !enriched.customTitle) {
    enriched.firstPrompt = '(session)'
  }
  // 过滤：跳过 sidechain 和 agent 会话
  if (enriched.isSidechain) {
    logForDebugging(
      `会话 ${log.sessionId} 已从 /resume 中过滤：isSidechain=true`,
    )
    return null
  }
  if (enriched.teamName) {
    logForDebugging(
      `会话 ${log.sessionId} 已从 /resume 中过滤：teamName=${enriched.teamName}`,
    )
    return null
  }

  return enriched
}

/** 从 `allLogs` 中（从 `startIndex` 开始）丰富足够多的轻量日志，以
产生 `count` 个有效结果。返回有效的丰富日志以及
扫描停止的索引（以便渐进加载可以从中继续）。 */
export async function enrichLogs(
  allLogs: LogOption[],
  startIndex: number,
  count: number,
): Promise<{ logs: LogOption[]; nextIndex: number }> {
  const result: LogOption[] = []
  const readBuf = Buffer.alloc(LITE_READ_BUF_SIZE)
  let i = startIndex

  while (i < allLogs.length && result.length < count) {
    const log = allLogs[i]!
    i++

    const enriched = await enrichLog(log, readBuf)
    if (enriched) {
      result.push(enriched)
    }
  }

  const scanned = i - startIndex
  const filtered = scanned - result.length
  if (filtered > 0) {
    logForDebugging(
      `/resume：丰富了 ${scanned} 个会话，${filtered} 个被过滤，${result.length} 个可见（磁盘上剩余 ${allLogs.length - i} 个）`,
    )
  }

  return { logs: result, nextIndex: i }
}
