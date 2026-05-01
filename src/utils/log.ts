import { feature } from 'bun:bundle'
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { readdir, readFile, stat } from 'fs/promises'
import memoize from 'lodash-es/memoize.js'
import { join } from 'path'
import type { QuerySource } from 'src/constants/querySource.js'
import {
  setLastAPIRequest,
  setLastAPIRequestMessages,
} from '../bootstrap/state.js'
import { TICK_TAG } from '../constants/xml.js'
import {
  type LogOption,
  type SerializedMessage,
  sortLogs,
} from '../types/logs.js'
import { CACHE_PATHS } from './cachePaths.js'
import { stripDisplayTags, stripDisplayTagsAllowEmpty } from './displayTags.js'
import { isEnvTruthy } from './envUtils.js'
import { toError } from './errors.js'
import { isEssentialTrafficOnly } from './privacyLevel.js'
import { jsonParse } from './slowOperations.js'

/** 获取日志/会话的显示标题，并带有回退逻辑。
如果 firstPrompt 以 tick/goal 标签开头（自主模式自动提示），则跳过它。
从结果中剥离不适合显示的标签（如 <ide_opened_file>）。
当没有其他标题可用时，回退到截断的会话 ID。 */
export function getLogDisplayTitle(
  log: LogOption,
  defaultTitle?: string,
): string {
  // 如果 firstPrompt 是 tick/goal 消息（自主模式自动提示），则跳过它
  const isAutonomousPrompt = log.firstPrompt?.startsWith(`<${TICK_TAG}>`)
  // 尽早剥离不适合显示的标签（command-name、ide_opened_fi
  // le 等），以便仅包含命令的提示（例如 /clear）变为空，并回退到下一个
  // 备用方案，而不是显示原始 XML 标签。注意：当剥离后结
  // 果为空时，stripDisplayTags 会返回原始内容，因此我们调用 s
  // tripDisplayTagsAllowEmpty 来检测仅包含命令的提示。
  const strippedFirstPrompt = log.firstPrompt
    ? stripDisplayTagsAllowEmpty(log.firstPrompt)
    : ''
  const useFirstPrompt = strippedFirstPrompt && !isAutonomousPrompt
  const title =
    log.agentName ||
    log.customTitle ||
    log.summary ||
    (useFirstPrompt ? strippedFirstPrompt : undefined) ||
    defaultTitle ||
    // 对于没有其他上下文的自主会话，显示一个有意义的标签
    (isAutonomousPrompt ? '自主会话' : undefined) ||
    // 对于没有元数据的精简日志，回退到截断的会话 ID
    (log.sessionId ? log.sessionId.slice(0, 8) : '') ||
    ''
  // 剥离不适合显示的标签（如 <ide_opened_file>）以获得更清晰的标题
  return stripDisplayTags(title).trim()
}

export function dateToFilename(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

// 用于近期错误的内存错误日志。从 boo
// tstrap/state.ts 移出以打破导入循环
const MAX_IN_MEMORY_ERRORS = 100
let inMemoryErrorLog: Array<{ error: string; timestamp: string }> = []

function addToInMemoryErrorLog(errorInfo: {
  error: string
  timestamp: string
}): void {
  if (inMemoryErrorLog.length >= MAX_IN_MEMORY_ERRORS) {
    inMemoryErrorLog.shift() // 移除最旧的错误
  }
  inMemoryErrorLog.push(errorInfo)
}

/** 错误日志记录后端的接收器接口 */
export type ErrorLogSink = {
  logError: (error: Error) => void
  logMCPError: (serverName: string, error: unknown) => void
  logMCPDebug: (serverName: string, message: string) => void
  getErrorsPath: () => string
  getMCPLogsPath: (serverName: string) => string
}

// 在接收器附加之前记录的排队事件
type QueuedErrorEvent =
  | { type: 'error'; error: Error }
  | { type: 'mcpError'; serverName: string; error: unknown }
  | { type: 'mcpDebug'; serverName: string; message: string }

const errorQueue: QueuedErrorEvent[] = []

// 接收器——在应用启动期间初始化
let errorLogSink: ErrorLogSink | null = null

/** 附加将接收所有错误事件的错误日志接收器。
排队的队列会立即清空，以确保没有错误丢失。

幂等操作：如果已附加接收器，则此操作无效。这允许
从 preAction 钩子（用于子命令）和 setup()（用于
默认命令）中调用，而无需协调。 */
export function attachErrorLogSink(newSink: ErrorLogSink): void {
  if (errorLogSink !== null) {
    return
  }
  errorLogSink = newSink

  // 立即清空队列——错误不应被延迟
  if (errorQueue.length > 0) {
    const queuedEvents = [...errorQueue]
    errorQueue.length = 0

    for (const event of queuedEvents) {
      switch (event.type) {
        case 'error':
          errorLogSink.logError(event.error)
          break
        case 'mcpError':
          errorLogSink.logMCPError(event.serverName, event.error)
          break
        case 'mcpDebug':
          errorLogSink.logMCPDebug(event.serverName, event.message)
          break
      }
    }
  }
}

/** 将错误记录到多个目标，用于调试和监控。

此函数将错误记录到：
- 调试日志（通过 `claude --debug` 或 `tail -f ~/.claude/debug/latest` 可见）
- 内存错误日志（可通过 `getInMemoryErrors()` 访问，用于包含在
  错误报告中或向用户显示最近的错误）
- 持久化错误日志文件（仅限内部 'ant' 用户，存储在 ~/.claude/errors/）

用法：
```ts
logError(new Error('Failed to connect'))
```

查看错误：
- 调试：运行 `claude --debug` 或 `tail -f ~/.claude/debug/latest`
- 内存：调用 `getInMemoryErrors()` 获取当前会话的最近错误 */
const isHardFailMode = memoize((): boolean => {
  return process.argv.includes('--hard-fail')
})

export function logError(error: unknown): void {
  const err = toError(error)
  if (feature('HARD_FAIL') && isHardFailMode()) {
    console.error('[严重失败] logError 被调用，参数为：', err.stack || err.message)
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1)
  }
  try {
    // 检查是否应禁用错误报告
    if (
      // 云提供商（Bedrock/Vertex/Foundry）始终禁用功能
      isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ||
      isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ||
      isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY) ||
      process.env.DISABLE_ERROR_REPORTING ||
      isEssentialTrafficOnly()
    ) {
      return
    }

    const errorStr = err.stack || err.message

    const errorInfo = {
      error: errorStr,
      timestamp: new Date().toISOString(),
    }

    // 始终添加到内存日志（无需依赖项）
    addToInMemoryErrorLog(errorInfo)

    // 如果未附加接收器，则将事件排队
    if (errorLogSink === null) {
      errorQueue.push({ type: 'error', error: err })
      return
    }

    errorLogSink.logError(err)
  } catch {
    // 静默失败
  }
}

export function getInMemoryErrors(): { error: string; timestamp: string }[] {
  return [...inMemoryErrorLog]
}

/** 加载错误日志列表
@returns 按日期排序的错误日志列表 */
export function loadErrorLogs(): Promise<LogOption[]> {
  return loadLogList(CACHE_PATHS.errors())
}

/** 根据索引获取错误日志
@param index 排序后日志列表中的索引（从 0 开始）
@returns 日志数据，如果未找到则返回 null */
export async function getErrorLogByIndex(
  index: number,
): Promise<LogOption | null> {
  const logs = await loadErrorLogs()
  return logs[index] || null
}

/** 从指定路径加载和处理日志的内部函数
@param path 包含日志的目录
@returns 按日期排序的日志数组
@private */
async function loadLogList(path: string): Promise<LogOption[]> {
  let files: Awaited<ReturnType<typeof readdir>>
  try {
    files = await readdir(path, { withFileTypes: true }) as any
  } catch {
    logError(new Error(`在 ${path} 未找到日志`))
    return []
  }
  const logData = await Promise.all(
    files.map(async (file, i) => {
      const fullPath = join(path, String(file.name))
      const content = await readFile(fullPath, { encoding: 'utf8' })
      const messages = jsonParse(content) as SerializedMessage[]
      const firstMessage = messages[0]
      const lastMessage = messages[messages.length - 1]
      const firstPrompt =
        firstMessage?.type === 'user' &&
        typeof firstMessage?.message?.content === 'string'
          ? firstMessage?.message?.content
          : '无提示'

      // 对于新的随机文件名，我们将从文件本身获取状态信息
      const fileStats = await stat(fullPath)

      // 通过查看文件名检查是否为侧链
      const isSidechain = fullPath.includes('sidechain')

      // 对于新文件，使用文件修改时间作为日期
      const date = dateToFilename(fileStats.mtime)

      return {
        date,
        fullPath,
        messages,
        value: i, // hack：排序后覆盖，就在此下方
        created: parseISOString(firstMessage?.timestamp || date),
        modified: lastMessage?.timestamp
          ? parseISOString(lastMessage.timestamp)
          : parseISOString(date),
        firstPrompt:
          firstPrompt.split('\n')[0]?.slice(0, 50) +
            (firstPrompt.length > 50 ? '…' : '') || '无提示',
        messageCount: messages.length,
        isSidechain,
      }
    }),
  )

  return sortLogs(logData.filter(_ => _ !== null)).map((_, i) => ({
    ..._,
    value: i,
  }))
}

function parseISOString(s: string): Date {
  const b = s.split(/\D+/)
  return new Date(
    Date.UTC(
      parseInt(b[0]!, 10),
      parseInt(b[1]!, 10) - 1,
      parseInt(b[2]!, 10),
      parseInt(b[3]!, 10),
      parseInt(b[4]!, 10),
      parseInt(b[5]!, 10),
      parseInt(b[6]!, 10),
    ),
  )
}

export function logMCPError(serverName: string, error: unknown): void {
  try {
    // 如果未附加接收器，则将事件排队
    if (errorLogSink === null) {
      errorQueue.push({ type: 'mcpError', serverName, error })
      return
    }

    errorLogSink.logMCPError(serverName, error)
  } catch {
    // 静默失败
  }
}

export function logMCPDebug(serverName: string, message: string): void {
  try {
    // 如果未附加接收器，则将事件排队
    if (errorLogSink === null) {
      errorQueue.push({ type: 'mcpDebug', serverName, message })
      return
    }

    errorLogSink.logMCPDebug(serverName, message)
  } catch {
    // 静默失败
  }
}

/** 捕获最后一次 API 请求，用于包含在错误报告中。 */
export function captureAPIRequest(
  params: BetaMessageStreamParams,
  querySource?: QuerySource,
): void {
  // 使用 startsWith，而非精确匹配——使用非默认输出样式的用户会得到变体，如 'repl_m
  // ain_thread:outputStyle:Explanatory'（querySource.ts）。
  if (!querySource || !querySource.startsWith('repl_main_thread')) {
    return
  }

  // 存储不含消息的参数，以避免为所有用户保留整个对
  // 话。消息已持久化到转录文件中，并可通过 Rea
  // ct 状态访问。
  const { messages, ...paramsWithoutMessages } = params
  setLastAPIRequest(paramsWithoutMessages)
  // 仅限 ant 用户：同时保留最终消息数组的引用，以便 /share 的 s
  // erialized_conversation.json 捕获 API 收到
  // 的精确的、压缩后并注入 CLAUDE.md 的负载。每次轮次覆盖；d
  // umpPrompts.ts 已为 ants 保存了 5 个完整的请求体，
  // 因此这不是一个新的保留类别。
  setLastAPIRequestMessages(process.env.USER_TYPE === 'ant' ? messages : null)
}

/** 仅用于测试目的重置错误日志状态。
@internal */
export function _resetErrorLogForTesting(): void {
  errorLogSink = null
  errorQueue.length = 0
  inMemoryErrorLog = []
}
