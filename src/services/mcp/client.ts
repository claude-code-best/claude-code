import { feature } from 'bun:bundle'
import type {
  Base64ImageSource,
  ContentBlockParam,
  MessageParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  SSEClientTransport,
  type SSEClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  createFetchWithInit,
  type FetchLike,
  type Transport,
} from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  CallToolResultSchema,
  ElicitRequestSchema,
  type ElicitRequestURLParams,
  type ElicitResult,
  ErrorCode,
  type JSONRPCMessage,
  type ListPromptsResult,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ListRootsRequestSchema,
  type ListToolsResult,
  ListToolsResultSchema,
  McpError,
  type PromptMessage,
  type ResourceLink,
} from '@modelcontextprotocol/sdk/types.js'
import mapValues from 'lodash-es/mapValues.js'
import memoize from 'lodash-es/memoize.js'
import zipObject from 'lodash-es/zipObject.js'
import pMap from 'p-map'
import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { getOauthConfig } from '../../constants/oauth.js'
import { PRODUCT_URL } from '../../constants/product.js'
import type { AppState } from '../../state/AppState.js'
import {
  type Tool,
  type ToolCallProgress,
  toolMatchesName,
} from '../../Tool.js'
import { ListMcpResourcesTool } from '@claude-code-best/builtin-tools/tools/ListMcpResourcesTool/ListMcpResourcesTool.js'
import {
  type MCPProgress,
  MCPTool,
} from '@claude-code-best/builtin-tools/tools/MCPTool/MCPTool.js'
import { createMcpAuthTool } from '@claude-code-best/builtin-tools/tools/McpAuthTool/McpAuthTool.js'
import { ReadMcpResourceTool } from '@claude-code-best/builtin-tools/tools/ReadMcpResourceTool/ReadMcpResourceTool.js'
import { createAbortController } from '../../utils/abortController.js'
import { count } from '../../utils/array.js'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  handleOAuth401Error,
} from '../../utils/auth.js'
import { registerCleanup } from '../../utils/cleanupRegistry.js'
import { detectCodeIndexingFromMcpServerName } from '../../utils/codeIndexing.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import {
  errorMessage,
  TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from '../../utils/errors.js'
import { getMCPUserAgent } from '../../utils/http.js'
import { maybeNotifyIDEConnected } from '../../utils/ide.js'
import { maybeResizeAndDownsampleImageBuffer } from '../../utils/imageResizer.js'
import { logMCPDebug, logMCPError } from '../../utils/log.js'
import {
  getBinaryBlobSavedMessage,
  getFormatDescription,
  getLargeOutputInstructions,
  persistBinaryContent,
} from '../../utils/mcpOutputStorage.js'
import {
  getContentSizeEstimate,
  type MCPToolResult,
  mcpContentNeedsTruncation,
  truncateMcpContentIfNeeded,
} from '../../utils/mcpValidation.js'
import { WebSocketTransport } from '../../utils/mcpWebSocketTransport.js'
import { memoizeWithLRU } from '../../utils/memoize.js'
import { getWebSocketTLSOptions } from '../../utils/mtls.js'
import {
  getProxyFetchOptions,
  getWebSocketProxyAgent,
  getWebSocketProxyUrl,
} from '../../utils/proxy.js'
import { getSessionIngressAuthToken } from '../../utils/sessionIngressAuth.js'
import { subprocessEnv } from '../../utils/subprocessEnv.js'
import {
  isPersistError,
  persistToolResult,
} from '../../utils/toolResultStorage.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import {
  type ElicitationWaitingState,
  runElicitationHooks,
  runElicitationResultHooks,
} from './elicitationHandler.js'
import { buildMcpToolName } from './mcpStringUtils.js'
import { normalizeNameForMCP } from './normalization.js'
import { getLoggingSafeMcpBaseUrl } from './utils.js'

// 包导入——在适用时委托给 mcp-client 包的工具函数
import {
  createMcpClient as createMcpClientFromPackage,
  captureStderr,
  isMcpSessionExpiredError as isMcpSessionExpiredErrorFromPackage,
  installConnectionMonitor,
  createCleanup as createCleanupFromPackage,
  buildConnectedServer,
  DEFAULT_CONNECTION_TIMEOUT_MS,
  MAX_MCP_DESCRIPTION_LENGTH as PKG_MAX_MCP_DESCRIPTION_LENGTH,
} from '@claude-code-best/mcp-client'
import { recursivelySanitizeUnicode } from '@claude-code-best/mcp-client'

/* eslint-disable @typescript-eslint/no-require-imports */
const fetchMcpSkillsForClient = feature('MCP_SKILLS')
  ? (
      require('../../skills/mcpSkills.js') as typeof import('../../skills/mcpSkills.js')
    ).fetchMcpSkillsForClient
  : null

import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type { AssistantMessage } from 'src/types/message.js'
/* eslint-enable @typescript-eslint/no-require-imports */
import { classifyMcpToolForCollapse } from '@claude-code-best/builtin-tools/tools/MCPTool/classifyForCollapse.js'
import { clearKeychainCache } from '../../utils/secureStorage/macOsKeychainHelpers.js'
import { sleep } from '../../utils/sleep.js'
import {
  ClaudeAuthProvider,
  hasMcpDiscoveryButNoToken,
  wrapFetchWithStepUpDetection,
} from './auth.js'
import { markClaudeAiMcpConnected } from './claudeai.js'
import { getAllMcpConfigs, isMcpServerDisabled } from './config.js'
import { getMcpServerHeaders } from './headersHelper.js'
import { SdkControlClientTransport } from './SdkControlTransport.js'
import type {
  ConnectedMCPServer,
  MCPServerConnection,
  McpSdkServerConfig,
  McpStdioServerConfig,
  ScopedMcpServerConfig,
  ServerResource,
} from './types.js'

/** 自定义错误类，用于指示 MCP 工具调用因认证问题（例如，过期的 OAuth 令牌返回 401）而失败。此错误应在工具执行层捕获，以将客户端状态更新为 'needs-auth'。 */
export class McpAuthError extends Error {
  serverName: string
  constructor(serverName: string, message: string) {
    super(message)
    this.name = 'McpAuthError'
    this.serverName = serverName
  }
}

/** 当 MCP 会话已过期且连接缓存已被清除时抛出。调用方应通过 ensureConnectedClient 获取新的客户端并重试。 */
class McpSessionExpiredError extends Error {
  constructor(serverName: string) {
    super(`MCP 服务器 "${serverName}" 会话已过期`)
    this.name = 'McpSessionExpiredError'
  }
}

/** 当 MCP 工具返回 `isError: true` 时抛出。携带结果的 `_meta` 数据，以便 SDK 使用者仍能接收到它——根据 MCP 规范，`_meta` 位于基础 Result 类型上，并且在错误结果上也是有效的。 */
export class McpToolCallError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS extends TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  constructor(
    message: string,
    telemetryMessage: string,
    readonly mcpMeta?: { _meta?: Record<string, unknown> },
  ) {
    super(message, telemetryMessage)
    this.name = 'McpToolCallError'
  }
}

/** 检测错误是否为 MCP "Session not found" 错误（HTTP 404 + JSON-RPC 代码 -32001）。根据 MCP 规范，当会话 ID 不再有效时，服务器会返回 404。我们检查这两个信号，以避免来自通用 404（错误的 URL、服务器消失等）的误报。 */
export const isMcpSessionExpiredError = isMcpSessionExpiredErrorFromPackage

/** MCP 工具调用的默认超时时间（实际上是无限的——约 27.8 小时）。 */
const DEFAULT_MCP_TOOL_TIMEOUT_MS = 100_000_000

/** 发送给模型的 MCP 工具描述和服务器指令的长度上限。观察到 OpenAPI 生成的 MCP 服务器会将 15-60KB 的端点文档转储到 tool.description 中；此限制旨在控制尾部 p95 的长度，同时不丢失其意图。 */
const MAX_MCP_DESCRIPTION_LENGTH = PKG_MAX_MCP_DESCRIPTION_LENGTH

/** 获取 MCP 工具调用的超时时间（毫秒）。如果设置了 MCP_TOOL_TIMEOUT 环境变量则使用该值，否则默认约为 27.8 小时。 */
function getMcpToolTimeoutMs(): number {
  return (
    parseInt(process.env.MCP_TOOL_TIMEOUT || '', 10) ||
    DEFAULT_MCP_TOOL_TIMEOUT_MS
  )
}

import { isClaudeInChromeMCPServer } from '../../utils/claudeInChrome/common.js'

// 懒加载：toolRendering.tsx 引入了 React/ink；仅在连接到 Claude-in-Chrome MCP 服务器时才需要
/* eslint-disable @typescript-eslint/no-require-imports */
const claudeInChromeToolRendering =
  (): typeof import('../../utils/claudeInChrome/toolRendering.js') =>
    require('../../utils/claudeInChrome/toolRendering.js')
// 懒加载：wrapper.tsx → hostAdapter.ts → executor.ts 引入了两个原生模块（@ant/c
// omputer-use-input + @ant/computer-use-swift）。运行时由 GrowthBo
// ok tengu_malort_pedway 控制（参见 gates.ts）。
const computerUseWrapper = feature('CHICAGO_MCP')
  ? (): typeof import('../../utils/computerUse/wrapper.js') =>
      require('../../utils/computerUse/wrapper.js')
  : undefined
const isComputerUseMCPServer = feature('CHICAGO_MCP')
  ? (
      require('../../utils/computerUse/common.js') as typeof import('../../utils/computerUse/common.js')
    ).isComputerUseMCPServer
  : undefined

import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
/* eslint-enable @typescript-eslint/no-require-imports */
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js'

const MCP_AUTH_CACHE_TTL_MS = 15 * 60 * 1000 // 15 分钟

type McpAuthCacheData = Record<string, { timestamp: number }>

function getMcpAuthCachePath(): string {
  return join(getClaudeConfigHomeDir(), 'mcp-needs-auth-cache.json')
}

// 已记忆化，以便在批量连接期间 N 个并发的 isMcpAuthCached()
// 调用共享一次文件读取，而不是对同一文件进行 N 次读取。在写入（setMcpA
// uthCacheEntry）和清除（clearMcpAuthCache）时失效
// 。未使用 lodash memoize，因为我们需要清空缓存，而不是按键删除。
let authCachePromise: Promise<McpAuthCacheData> | null = null

function getMcpAuthCache(): Promise<McpAuthCacheData> {
  if (!authCachePromise) {
    authCachePromise = readFile(getMcpAuthCachePath(), 'utf-8')
      .then(data => jsonParse(data) as McpAuthCacheData)
      .catch(() => ({}))
  }
  return authCachePromise
}

async function isMcpAuthCached(serverId: string): Promise<boolean> {
  const cache = await getMcpAuthCache()
  const entry = cache[serverId]
  if (!entry) {
    return false
  }
  return Date.now() - entry.timestamp < MCP_AUTH_CACHE_TTL_MS
}

// 通过一个 Promise 链序列化缓存写入，以防止同
// 一批次中多个服务器返回 401 时发生并发读-改-写竞争
let writeChain = Promise.resolve()

function setMcpAuthCacheEntry(serverId: string): void {
  writeChain = writeChain
    .then(async () => {
      const cache = await getMcpAuthCache()
      cache[serverId] = { timestamp: Date.now() }
      const cachePath = getMcpAuthCachePath()
      await mkdir(dirname(cachePath), { recursive: true })
      await writeFile(cachePath, jsonStringify(cache))
      // 使读取缓存失效，以便后续读取能看到新条目。这是安全的，因为
      // writeChain 序列化了写入：下一次写入的 ge
      // tMcpAuthCache() 调用将重新读取包含此条目的文件。
      authCachePromise = null
    })
    .catch(() => {
      // 尽力而为的缓存写入
    })
}

export function clearMcpAuthCache(): void {
  authCachePromise = null
  void unlink(getMcpAuthCachePath()).catch(() => {
    // 缓存文件可能不存在
  })
}

/** 用于服务器基础 URL 的、可直接展开的分析字段。调用 getLoggingSafeMcpBaseUrl 一次（不像它所替换的内联三元运算符那样调用两次）。类型为 AnalyticsMetadata，因为 URL 已去除查询参数，可以安全记录。 */
function mcpBaseUrlAnalytics(serverRef: ScopedMcpServerConfig): {
  mcpServerBaseUrl?: AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
} {
  const url = getLoggingSafeMcpBaseUrl(serverRef)
  return url
    ? {
        mcpServerBaseUrl:
          url as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }
    : {}
}

/** 连接期间 sse/http/claudeai-proxy 认证失败的共享处理程序：发出 tengu_mcp_server_needs_auth 事件，缓存 needs-auth 条目，并返回 needs-auth 连接结果。 */
function handleRemoteAuthFailure(
  name: string,
  serverRef: ScopedMcpServerConfig,
  transportType: 'sse' | 'http' | 'claudeai-proxy',
): MCPServerConnection {
  logEvent('tengu_mcp_server_needs_auth', {
    transportType:
      transportType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    ...mcpBaseUrlAnalytics(serverRef),
  })
  const label: Record<typeof transportType, string> = {
    sse: 'SSE',
    http: 'HTTP',
    'claudeai-proxy': 'claude.ai 代理',
  }
  logMCPDebug(name, `${label[transportType]} 服务器需要认证`)
  setMcpAuthCacheEntry(name)
  return { name, type: 'needs-auth', config: serverRef }
}

/** 用于 claude.ai 代理连接的 Fetch 包装器。附加 OAuth Bearer 令牌，并在遇到 401 时通过 handleOAuth401Error（强制刷新）重试一次。

Anthropic API 路径具有此重试逻辑（withRetry.ts, grove.ts）来处理记忆化缓存过期和时钟漂移。如果此处没有相同的逻辑，单个过期的令牌会导致每个 claude.ai 连接器都收到 401 错误，并使它们全部陷入 15 分钟的 needs-auth 缓存中。 */
export function createClaudeAiProxyFetch(innerFetch: FetchLike): FetchLike {
  return async (url, init) => {
    const doRequest = async () => {
      await checkAndRefreshOAuthTokenIfNeeded()
      const currentTokens = getClaudeAIOAuthTokens()
      if (!currentTokens) {
        throw new Error('没有可用的 claude.ai OAuth 令牌')
      }
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${currentTokens.accessToken}`)
      const response = await innerFetch(url, { ...init, headers })
      // 返回发送的确切令牌。在请求后再次读取 getClaudeAIOAuthTokens(
      // ) 在并发 401 情况下是错误的：另一个连接器的 handleOAuth4
      // 01Error 会清除记忆化缓存，因此我们会从密钥链读取新的令牌，将其传递给 han
      // dleOAuth401Error，而 handleOAuth401Error 发
      // 现与密钥链相同 → 返回 false → 跳过重试。与 bridgeApi.ts 中
      // 的 withOAuthRetry 模式相同（令牌作为函数参数传递）。
      return { response, sentToken: currentTokens.accessToken }
    }

    const { response, sentToken } = await doRequest()
    if (response.status !== 401) {
      return response
    }
    // handleOAuth401Error 仅在令牌实际更改
    // 时（密钥链中有更新的令牌，或强制刷新成功）返回 true。
    // 根据此条件控制重试——否则，对于每个下游服务确实需要认证
    // 的连接器（常见情况：30 多个服务器显示 "MCP 服务器
    // 需要认证但未配置 OAuth 令牌"），我们将使往返时间加倍。
    const tokenChanged = await handleOAuth401Error(sentToken).catch(() => false)
    logEvent('tengu_mcp_claudeai_proxy_401', {
      tokenChanged:
        tokenChanged as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    if (!tokenChanged) {
      // ELOCKED 争用：另一个连接器可能已赢得锁文件并刷新了令牌——检查令牌是否在我们不知情的情况下发生了变化
      const now = getClaudeAIOAuthTokens()?.accessToken
      if (!now || now === sentToken) {
        return response
      }
    }
    try {
      return (await doRequest()).response
    } catch {
      // 重试本身失败（网络错误）。返回原始的 401 状态码，以
      // 便外部处理器能正确分类。
      return response
    }
  }
}

// 传递给 mcpWebSocketTransport 的 WebSocket 实例的最小接口
type WsClientLike = {
  readonly readyState: number
  close(): void
  send(data: string): void
}

/** 创建一个遵循 MCP 协议的 ws.WebSocket 客户端。
Bun 的 ws 垫片类型缺少真实 ws 包支持的三参数构造函数（url, protocols, options），因此我们在此处对构造函数进行类型转换。 */
async function createNodeWsClient(
  url: string,
  options: Record<string, unknown>,
): Promise<WsClientLike> {
  const wsModule = await import('ws')
  const WS = wsModule.default as unknown as new (
    url: string,
    protocols: string[],
    options: Record<string, unknown>,
  ) => WsClientLike
  return new WS(url, ['mcp'], options)
}

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

function getConnectionTimeoutMs(): number {
  return parseInt(process.env.MCP_TIMEOUT || '', 10) || 30000
}

/** 单个 MCP 请求（认证、工具调用等）的默认超时时间 */
const MCP_REQUEST_TIMEOUT_MS = 60000

/** MCP 可流式 HTTP 规范要求客户端在每个 POST 请求中声明同时接受 JSON 和 SSE。严格执行此规范的服务器会拒绝不符合要求的请求（HTTP 406）。
https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#sending-messages-to-the-server */
const MCP_STREAMABLE_HTTP_ACCEPT = 'application/json, text/event-stream'

/** 包装一个 fetch 函数，为每个请求应用新的超时信号。
这避免了在连接时创建的单个 AbortSignal.timeout() 在 60 秒后失效的 bug，该 bug 会导致所有后续请求立即失败并提示“操作超时”。使用 60 秒超时。

同时确保 MCP 可流式 HTTP 规范要求的 Accept 请求头出现在 POST 请求中。MCP SDK 在 StreamableHTTPClientTransport.send() 内部设置此头，但它附加在一个 Headers 实例上，该实例在此处通过对象展开运算符传递，并且观察到某些运行时/代理在请求发出前会丢弃它。
参见 https://github.com/anthropics/claude-agent-sdk-typescript/issues/202。
在此处（fetch() 之前的最后一个包装器）进行标准化，以保证它被发送。

GET 请求被排除在超时之外，因为对于 MCP 传输层来说，它们是旨在无限期保持打开的长连接 SSE 流。（与认证相关的 GET 请求在 auth.ts 中使用单独的、带有自身超时的 fetch 包装器。）

@param baseFetch - 要包装的 fetch 函数 */
export function wrapFetchWithTimeout(baseFetch: FetchLike): FetchLike {
  return async (url: string | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()

    // 跳过 GET 请求的超时——在 MCP 传输层中，这些是长连接的 SSE 流。（auth.ts 中的
    // OAuth 发现 GET 请求使用单独的、带有自身超时的 createAuthFetch() 函数。）
    if (method === 'GET') {
      return baseFetch(url, init)
    }

    // 标准化请求头并保证可流式 HTTP 的 Accept 值。new Headers() 接受 He
    // adersInit | undefined 并从普通对象、元组数组和现有的 Headers
    // 实例复制——因此无论 SDK 传递给我们什么格式，Accept 值都会在下面的展开操作中
    // 作为具体对象的自有属性保留下来。eslint-disable-next-line eslint-
    // plugin-n/no-unsupported-features/node-builtins
    const headers = new Headers(init?.headers)
    if (!headers.has('accept')) {
      headers.set('accept', MCP_STREAMABLE_HTTP_ACCEPT)
    }

    // 使用 setTimeout 代替 AbortSignal.timeout()，以便
    // 我们可以在完成时 clearTimeout。AbortSignal.timeout
    // 的内部计时器只有在信号被垃圾回收时才会释放，而在 Bun 中这是惰性的——即使请求在
    // 几毫秒内完成，每个请求约 2.4KB 的原生内存也会在完整的 60 秒内持续存在。
    const controller = new AbortController()
    const timer = setTimeout(
      c => c.abort(new DOMException('操作超时。', 'TimeoutError')),
      MCP_REQUEST_TIMEOUT_MS,
      controller,
    )
    timer.unref?.()

    const parentSignal = init?.signal
    const abort = () => controller.abort(parentSignal?.reason)
    parentSignal?.addEventListener('abort', abort)
    if (parentSignal?.aborted) {
      controller.abort(parentSignal.reason)
    }

    const cleanup = () => {
      clearTimeout(timer)
      parentSignal?.removeEventListener('abort', abort)
    }

    try {
      const response = await baseFetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      })
      cleanup()
      return response
    } catch (error) {
      cleanup()
      throw error
    }
  }
}

export function getMcpServerConnectionBatchSize(): number {
  return parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE || '', 10) || 3
}

function getRemoteMcpServerConnectionBatchSize(): number {
  return (
    parseInt(process.env.MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE || '', 10) ||
    20
  )
}

function isLocalMcpServer(config: ScopedMcpServerConfig): boolean {
  return !config.type || config.type === 'stdio' || config.type === 'sdk'
}

// 对于 IDE MCP 服务器，我们只包含特定的工具
const ALLOWED_IDE_TOOLS = ['mcp__ide__executeCode', 'mcp__ide__getDiagnostics']
function isIncludedMcpTool(tool: Tool): boolean {
  return (
    !tool.name.startsWith('mcp__ide__') || ALLOWED_IDE_TOOLS.includes(tool.name)
  )
}

/** 为服务器连接生成缓存键
@param name 服务器名称
@param serverRef 服务器配置
@returns 缓存键字符串 */
export function getServerCacheKey(
  name: string,
  serverRef: ScopedMcpServerConfig,
): string {
  return `${name}-${jsonStringify(serverRef)}`
}

/** TODO (ollie): 此处的记忆化大大增加了复杂性，我不确定它是否真的提升了性能
尝试连接到单个 MCP 服务器
@param name 服务器名称
@param serverRef 作用域内的服务器配置
@returns 一个包装后的客户端（已连接或已失败） */
export const connectToServer = memoize(
  async (
    name: string,
    serverRef: ScopedMcpServerConfig,
    serverStats?: {
      totalServers: number
      stdioCount: number
      sseCount: number
      httpCount: number
      sseIdeCount: number
      wsIdeCount: number
    },
  ): Promise<MCPServerConnection> => {
    const connectStartTime = Date.now()
    let inProcessServer:
      | { connect(t: Transport): Promise<void>; close(): Promise<void> }
      | undefined
    try {
      let transport

      // 如果我们拥有会话入口 JWT，我们将通过会话入口连接，而不是直接连接到远
      // 程 MCP 服务器。
      const sessionIngressToken = getSessionIngressAuthToken()

      if (serverRef.type === 'sse') {
        // 为此服务器创建一个认证提供者
        const authProvider = new ClaudeAuthProvider(name, serverRef)

        // 获取组合请求头（静态 + 动态）
        const combinedHeaders = await getMcpServerHeaders(name, serverRef)

        // 将认证提供者与 SSEClientTransport 一起使用
        const transportOptions: SSEClientTransportOptions = {
          authProvider,
          // 每个请求使用新的超时以避免 AbortSignal 失效的 bug。权
          // 限提升检测包装在最内层，以便 SDK 的处理器调用 auth() → to
          // kens() 之前能检测到 403 状态码。
          fetch: wrapFetchWithTimeout(
            wrapFetchWithStepUpDetection(createFetchWithInit(), authProvider),
          ),
          requestInit: {
            headers: {
              'User-Agent': getMCPUserAgent(),
              ...combinedHeaders,
            },
          },
        }

        // 重要：始终将 eventSourceInit 设置为使用不包含
        // 超时包装器的 fetch 函数。EventSource 连接是长连接的
        // （无限期保持打开以接收服务器发送的事件），因此应用 60 秒超时会终
        // 止它。超时仅适用于单个 API 请求（POST、认证刷新），而不适用
        // 于持久的 SSE 流。
        transportOptions.eventSourceInit = {
          fetch: async (url: string | URL, init?: RequestInit) => {
            // 从认证提供者获取认证请求头
            const authHeaders: Record<string, string> = {}
            const tokens = await authProvider.tokens()
            if (tokens) {
              authHeaders.Authorization = `Bearer ${tokens.access_token}`
            }

            const proxyOptions = getProxyFetchOptions()
            // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
            return fetch(url, {
              ...init,
              ...proxyOptions,
              headers: {
                'User-Agent': getMCPUserAgent(),
                ...authHeaders,
                ...init?.headers,
                ...combinedHeaders,
                Accept: 'text/event-stream',
              },
            })
          },
        }

        transport = new SSEClientTransport(
          new URL(serverRef.url),
          transportOptions,
        )
        logMCPDebug(name, `SSE 传输层已初始化，正在等待连接`)
      } else if (serverRef.type === 'sse-ide') {
        logMCPDebug(name, `正在设置到 ${serverRef.url} 的 SSE-IDE 传输层`)
        // IDE 服务器不需要认证 T
        // ODO: 使用锁文件中提供的认证令牌
        const proxyOptions = getProxyFetchOptions()
        const transportOptions: SSEClientTransportOptions =
          proxyOptions.dispatcher
            ? {
                eventSourceInit: {
                  fetch: async (url: string | URL, init?: RequestInit) => {
                    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
                    return fetch(url, {
                      ...init,
                      ...proxyOptions,
                      headers: {
                        'User-Agent': getMCPUserAgent(),
                        ...init?.headers,
                      },
                    })
                  },
                },
              }
            : {}

        transport = new SSEClientTransport(
          new URL(serverRef.url),
          Object.keys(transportOptions).length > 0
            ? transportOptions
            : undefined,
        )
      } else if (serverRef.type === 'ws-ide') {
        const tlsOptions = getWebSocketTLSOptions()
        const wsHeaders = {
          'User-Agent': getMCPUserAgent(),
          ...(serverRef.authToken && {
            'X-Claude-Code-Ide-Authorization': serverRef.authToken,
          }),
        }

        let wsClient: WsClientLike
        if (typeof Bun !== 'undefined') {
          // Bun 的 WebSocket 支持 headers/proxy/tls 选项，但 DOM 类型定义不支持 eslint-disa
          // ble-next-line eslint-plugin-n/no-unsupported-features/node-builtins
          wsClient = new globalThis.WebSocket(serverRef.url, {
            protocols: ['mcp'],
            headers: wsHeaders,
            proxy: getWebSocketProxyUrl(serverRef.url),
            tls: tlsOptions || undefined,
          } as unknown as string[])
        } else {
          wsClient = await createNodeWsClient(serverRef.url, {
            headers: wsHeaders,
            agent: getWebSocketProxyAgent(serverRef.url),
            ...(tlsOptions || {}),
          })
        }
        transport = new WebSocketTransport(wsClient)
      } else if (serverRef.type === 'ws') {
        logMCPDebug(name, `正在初始化到 ${serverRef.url} 的 WebSocket 传输层`)

        const combinedHeaders = await getMcpServerHeaders(name, serverRef)

        const tlsOptions = getWebSocketTLSOptions()
        const wsHeaders = {
          'User-Agent': getMCPUserAgent(),
          ...(sessionIngressToken && {
            Authorization: `Bearer ${sessionIngressToken}`,
          }),
          ...combinedHeaders,
        }

        // 在记录日志前隐藏敏感请求头
        const wsHeadersForLogging = mapValues(wsHeaders, (value, key) =>
          key.toLowerCase() === 'authorization' ? '[REDACTED]' : value,
        )

        logMCPDebug(
          name,
          `WebSocket 传输选项：${jsonStringify({
            url: serverRef.url,
            headers: wsHeadersForLogging,
            hasSessionAuth: !!sessionIngressToken,
          })}`,
        )

        let wsClient: WsClientLike
        if (typeof Bun !== 'undefined') {
          // Bun 的 WebSocket 支持 headers/proxy/tls 选项，但 DOM 类型定义不支持 eslint-disa
          // ble-next-line eslint-plugin-n/no-unsupported-features/node-builtins
          wsClient = new globalThis.WebSocket(serverRef.url, {
            protocols: ['mcp'],
            headers: wsHeaders,
            proxy: getWebSocketProxyUrl(serverRef.url),
            tls: tlsOptions || undefined,
          } as unknown as string[])
        } else {
          wsClient = await createNodeWsClient(serverRef.url, {
            headers: wsHeaders,
            agent: getWebSocketProxyAgent(serverRef.url),
            ...(tlsOptions || {}),
          })
        }
        transport = new WebSocketTransport(wsClient)
      } else if (serverRef.type === 'http') {
        logMCPDebug(name, `正在初始化到 ${serverRef.url} 的 HTTP 传输`)
        logMCPDebug(
          name,
          `Node 版本：${process.version}，平台：${process.platform}`,
        )
        logMCPDebug(
          name,
          `Environment: ${jsonStringify({
            NODE_OPTIONS: process.env.NODE_OPTIONS || '未设置',
            UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || 'default',
            HTTP_PROXY: process.env.HTTP_PROXY || '未设置',
            HTTPS_PROXY: process.env.HTTPS_PROXY || '未设置',
            NO_PROXY: process.env.NO_PROXY || '未设置',
          })}`,
        )

        // 为此服务器创建身份验证提供程序
        const authProvider = new ClaudeAuthProvider(name, serverRef)

        // 获取合并后的请求头（静态 + 动态）
        const combinedHeaders = await getMcpServerHeaders(name, serverRef)

        // 检查此服务器是否存储了 OAuth 令牌。如果是，SDK 的 authPro
        // vider 将设置 Authorization 请求头 — 不要用会话入口
        // 令牌覆盖（SDK 在 authProvider 之后合并 requestInit
        // ）。CCR 代理 URL（ccr_shttp_mcp）没有存储 OAuth，因此
        // 它们仍会获得入口令牌。请参阅 PR #24454 的讨论。
        const hasOAuthTokens = !!(await authProvider.tokens())

        // 将身份验证提供程序与 StreamableHTTPClientTransport 一起使用
        const proxyOptions = getProxyFetchOptions()
        logMCPDebug(
          name,
          `代理选项：${proxyOptions.dispatcher ? 'custom dispatcher' : 'default'}`,
        )

        const transportOptions: StreamableHTTPClientTransportOptions = {
          authProvider,
          // 每个请求使用新的超时设置，以避免陈旧的 AbortSignal 错误。St
          // ep-up 检测包装在最内层，以便在 SDK 的处理程序调用 auth() →
          // tokens() 之前看到 403 状态码。
          fetch: wrapFetchWithTimeout(
            wrapFetchWithStepUpDetection(createFetchWithInit(), authProvider),
          ),
          requestInit: {
            ...proxyOptions,
            headers: {
              'User-Agent': getMCPUserAgent(),
              ...(sessionIngressToken &&
                !hasOAuthTokens && {
                  Authorization: `Bearer ${sessionIngressToken}`,
                }),
              ...combinedHeaders,
            },
          },
        }

        // 在记录日志前隐藏敏感请求头
        const headersForLogging = transportOptions.requestInit?.headers
          ? mapValues(
              transportOptions.requestInit.headers as Record<string, string>,
              (value, key) =>
                key.toLowerCase() === 'authorization' ? '[REDACTED]' : value,
            )
          : undefined

        logMCPDebug(
          name,
          `HTTP 传输选项：${jsonStringify({
            url: serverRef.url,
            headers: headersForLogging,
            hasAuthProvider: !!authProvider,
            timeoutMs: MCP_REQUEST_TIMEOUT_MS,
          })}`,
        )

        transport = new StreamableHTTPClientTransport(
          new URL(serverRef.url),
          transportOptions,
        )
        logMCPDebug(name, `HTTP 传输创建成功`)
      } else if (serverRef.type === 'sdk') {
        throw new Error('SDK 服务器应在 print.ts 中处理')
      } else if (serverRef.type === 'claudeai-proxy') {
        logMCPDebug(
          name,
          `正在为服务器 ${serverRef.id} 初始化 claude.ai 代理传输`,
        )

        const tokens = getClaudeAIOAuthTokens()
        if (!tokens) {
          throw new Error('未找到 claude.ai OAuth 令牌')
        }

        const oauthConfig = getOauthConfig()
        const proxyUrl = `${oauthConfig.MCP_PROXY_URL}${oauthConfig.MCP_PROXY_PATH.replace('{server_id}', serverRef.id)}`

        logMCPDebug(name, `正在使用位于 ${proxyUrl} 的 claude.ai 代理`)

        // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
        const fetchWithAuth = createClaudeAiProxyFetch(globalThis.fetch)

        const proxyOptions = getProxyFetchOptions()
        const transportOptions: StreamableHTTPClientTransportOptions = {
          // 用每个请求的新超时设置包装 fetchWithAuth
          fetch: wrapFetchWithTimeout(fetchWithAuth),
          requestInit: {
            ...proxyOptions,
            headers: {
              'User-Agent': getMCPUserAgent(),
              'X-Mcp-Client-Session-Id': getSessionId(),
            },
          },
        }

        transport = new StreamableHTTPClientTransport(
          new URL(proxyUrl),
          transportOptions,
        )
        logMCPDebug(name, `claude.ai 代理传输创建成功`)
      } else if (
        ((serverRef as ScopedMcpServerConfig).type === 'stdio' ||
          !(serverRef as ScopedMcpServerConfig).type) &&
        isClaudeInChromeMCPServer(name)
      ) {
        // 在进程内运行 Chrome MCP 服务器，以避免产生一个约 325 MB 的子进程
        const { createChromeContext } = await import(
          '../../utils/claudeInChrome/mcpServer.js'
        )
        const { createClaudeForChromeMcpServer } = await import(
          '@ant/claude-for-chrome-mcp'
        )
        const { createLinkedTransportPair } = await import(
          './InProcessTransport.js'
        )
        const context = createChromeContext(
          (serverRef as McpStdioServerConfig).env,
        )
        inProcessServer = createClaudeForChromeMcpServer(context)
        const [clientTransport, serverTransport] = createLinkedTransportPair()
        await inProcessServer.connect(serverTransport)
        transport = clientTransport
        logMCPDebug(name, `进程内 Chrome MCP 服务器已启动`)
      } else if (
        feature('CHICAGO_MCP') &&
        ((serverRef as ScopedMcpServerConfig).type === 'stdio' ||
          !(serverRef as ScopedMcpServerConfig).type) &&
        isComputerUseMCPServer!(name)
      ) {
        // 在进程内运行 Computer Use MCP 服务器 — 理由与上述 C
        // hrome 相同。该包的 CallTool 处理程序是一个存根；实际的调
        // 度通过 wrapper.tsx 的 .call() 重写进行。
        const { createComputerUseMcpServerForCli } = await import(
          '../../utils/computerUse/mcpServer.js'
        )
        const { createLinkedTransportPair } = await import(
          './InProcessTransport.js'
        )
        inProcessServer = await createComputerUseMcpServerForCli()
        const [clientTransport, serverTransport] = createLinkedTransportPair()
        await inProcessServer.connect(serverTransport)
        transport = clientTransport
        logMCPDebug(name, `In-process Computer Use MCP server started`)
      } else if (
        (serverRef as ScopedMcpServerConfig).type === 'stdio' ||
        !(serverRef as ScopedMcpServerConfig).type
      ) {
        const stdioRef = serverRef as McpStdioServerConfig
        const finalCommand =
          process.env.CLAUDE_CODE_SHELL_PREFIX || stdioRef.command
        const finalArgs = process.env.CLAUDE_CODE_SHELL_PREFIX
          ? [[stdioRef.command, ...stdioRef.args].join(' ')]
          : stdioRef.args
        transport = new StdioClientTransport({
          command: finalCommand,
          args: finalArgs,
          env: {
            ...subprocessEnv(),
            ...stdioRef.env,
          } as Record<string, string>,
          stderr: 'pipe', // 防止 MCP 服务器的错误输出打印到 UI
        })
      } else {
        throw new Error(
          `Unsupported server type: ${(serverRef as ScopedMcpServerConfig).type}`,
        )
      }

      // 在连接前为标准输入输出传输设置标准错误日志记录，以防连
      // 接启动期间产生任何标准错误输出（这对调试失败的连接很有用）。
      // 存储处理程序引用以便清理，防止内存泄漏
      let stderrHandler: ((data: Buffer) => void) | undefined
      let stderrOutput = ''
      if (serverRef.type === 'stdio' || !serverRef.type) {
        const stdioTransport = transport as StdioClientTransport
        if (stdioTransport.stderr) {
          stderrHandler = (data: Buffer) => {
            // 限制标准错误累积量，防止内存无限增长
            if (stderrOutput.length < 64 * 1024 * 1024) {
              try {
                stderrOutput += data.toString()
              } catch {
                // 忽略超出最大字符串长度导致的错误
              }
            }
          }
          stdioTransport.stderr.on('data', stderrHandler)
        }
      }

      const client = new Client(
        {
          name: 'claude-code',
          title: 'Claude Code',
          version: MACRO.VERSION ?? 'unknown',
          description: 'Anthropic 的智能编码工具',
          websiteUrl: PRODUCT_URL,
        },
        {
          capabilities: {
            roots: {},
            // 空对象声明该能力。发送 {form:{},url:{}} 会破坏
            // Java MCP SDK 服务器（Spring AI），其 Eli
            // citation 类没有字段，会在未知属性上失败。
            elicitation: {},
          },
        },
      )

      // 如果可用，为客户端事件添加调试日志记录
      if (serverRef.type === 'http') {
        logMCPDebug(name, `客户端已创建，正在设置请求处理程序`)
      }

      client.setRequestHandler(ListRootsRequestSchema, async () => {
        logMCPDebug(name, `收到来自服务器的 ListRoots 请求`)
        return {
          roots: [
            {
              uri: `file://${getOriginalCwd()}`,
            },
          ],
        }
      })

      // 为连接尝试添加超时，防止测试无限期挂起
      logMCPDebug(name, `开始连接，超时时间为 ${getConnectionTimeoutMs()} 毫秒`)

      // 对于 HTTP 传输，首先尝试基本连通性测试
      if (serverRef.type === 'http') {
        logMCPDebug(name, `正在测试到 ${serverRef.url} 的基本 HTTP 连通性`)
        try {
          const testUrl = new URL(serverRef.url)
          logMCPDebug(
            name,
            `解析后的 URL：主机=${testUrl.hostname}，端口=${testUrl.port || 'default'}，协议=${testUrl.protocol}`,
          )

          // 记录 DNS 解析尝试
          if (
            testUrl.hostname === '127.0.0.1' ||
            testUrl.hostname === 'localhost'
          ) {
            logMCPDebug(name, `使用环回地址：${testUrl.hostname}`)
          }
        } catch (urlError) {
          logMCPDebug(name, `解析 URL 失败：${urlError}`)
        }
      }

      const connectPromise = client.connect(transport)
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          const elapsed = Date.now() - connectStartTime
          logMCPDebug(
            name,
            `连接超时在 ${elapsed} 毫秒后触发（限制：${getConnectionTimeoutMs()} 毫秒）`,
          )
          if (inProcessServer) {
            inProcessServer.close().catch(() => {})
          }
          transport.close().catch(() => {})
          reject(
            new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
              `MCP 服务器 "${name}" 的连接在 ${getConnectionTimeoutMs()} 毫秒后超时`,
              'MCP 连接超时',
            ),
          )
        }, getConnectionTimeoutMs())

        // 如果连接解析或拒绝，清理超时
        connectPromise.then(
          () => {
            clearTimeout(timeoutId)
          },
          _error => {
            clearTimeout(timeoutId)
          },
        )
      })

      try {
        await Promise.race([connectPromise, timeoutPromise])
        if (stderrOutput) {
          logMCPError(name, `服务器标准错误：${stderrOutput}`)
          stderrOutput = '' // 释放累积的字符串，防止内存增长
        }
        const elapsed = Date.now() - connectStartTime
        logMCPDebug(
          name,
          `成功连接（传输：${serverRef.type || 'stdio'}），耗时 ${elapsed} 毫秒`,
        )
      } catch (error) {
        const elapsed = Date.now() - connectStartTime
        // SSE 特定的错误日志记录
        if (serverRef.type === 'sse' && error instanceof Error) {
          logMCPDebug(
            name,
            `SSE 连接在 ${elapsed} 毫秒后失败：${jsonStringify({
              url: serverRef.url,
              error: error.message,
              errorType: error.constructor.name,
              stack: error.stack,
            })}`,
          )
          logMCPError(name, error)

          if (error instanceof UnauthorizedError) {
            return handleRemoteAuthFailure(name, serverRef, 'sse')
          }
        } else if (serverRef.type === 'http' && error instanceof Error) {
          const errorObj = error as Error & {
            cause?: unknown
            code?: string
            errno?: string | number
            syscall?: string
          }
          logMCPDebug(
            name,
            `HTTP 连接在 ${elapsed} 毫秒后失败：${error.message}（代码：${errorObj.code || 'none'}，错误号：${errorObj.errno || 'none'}）`,
          )
          logMCPError(name, error)

          if (error instanceof UnauthorizedError) {
            return handleRemoteAuthFailure(name, serverRef, 'http')
          }
        } else if (
          serverRef.type === 'claudeai-proxy' &&
          error instanceof Error
        ) {
          logMCPDebug(
            name,
            `claude.ai 代理连接在 ${elapsed} 毫秒后失败：${error.message}`,
          )
          logMCPError(name, error)

          // StreamableHTTPError 有一个包含 HTTP 状态的 `code` 属性
          const errorCode = (error as Error & { code?: number }).code
          if (errorCode === 401) {
            return handleRemoteAuthFailure(name, serverRef, 'claudeai-proxy')
          }
        } else if (
          serverRef.type === 'sse-ide' ||
          serverRef.type === 'ws-ide'
        ) {
          logEvent('tengu_mcp_ide_server_connection_failed', {
            connectionDurationMs: elapsed,
          })
        }
        if (inProcessServer) {
          inProcessServer.close().catch(() => {})
        }
        transport.close().catch(() => {})
        if (stderrOutput) {
          logMCPError(name, `服务器标准错误：${stderrOutput}`)
        }
        throw error
      }

      const capabilities = client.getServerCapabilities()
      const serverVersion = client.getServerVersion()
      const rawInstructions = client.getInstructions()
      let instructions = rawInstructions
      if (
        rawInstructions &&
        rawInstructions.length > MAX_MCP_DESCRIPTION_LENGTH
      ) {
        instructions =
          rawInstructions.slice(0, MAX_MCP_DESCRIPTION_LENGTH) + '… [已截断]'
        logMCPDebug(
          name,
          `服务器指令从 ${rawInstructions.length} 字符截断至 ${MAX_MCP_DESCRIPTION_LENGTH} 字符`,
        )
      }

      // 记录成功连接的详细信息
      logMCPDebug(
        name,
        `连接已建立，支持的能力：${jsonStringify({
          hasTools: !!capabilities?.tools,
          hasPrompts: !!capabilities?.prompts,
          hasResources: !!capabilities?.resources,
          hasResourceSubscribe: !!capabilities?.resources?.subscribe,
          serverVersion: serverVersion || 'unknown',
        })}`,
      )
      logForDebugging(
        `[MCP] 服务器 "${name}" 已连接，订阅状态 subscribe=${!!capabilities?.resources?.subscribe}`,
      )

      // 注册默认的引导处理程序，该程序在 registerElicitationHandle
      // r 于 onConnectionAttempt（useManageMCP
      // Connections）中覆盖它之前的窗口期内返回取消。
      client.setRequestHandler(ElicitRequestSchema, async request => {
        logMCPDebug(name, `初始化期间收到引导请求：${jsonStringify(request)}`)
        return { action: 'cancel' as const }
      })

      if (serverRef.type === 'sse-ide' || serverRef.type === 'ws-ide') {
        const ideConnectionDurationMs = Date.now() - connectStartTime
        logEvent('tengu_mcp_ide_server_connection_succeeded', {
          connectionDurationMs: ideConnectionDurationMs,
          serverVersion:
            serverVersion as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        try {
          void maybeNotifyIDEConnected(client)
        } catch (error) {
          logMCPError(name, `发送 ide_connected 通知失败：${error}`)
        }
      }

      // 为所有传输类型增强连接断开检测和日志记录
      const connectionStartTime = Date.now()
      let hasErrorOccurred = false

      // 存储原始处理程序
      const originalOnerror = client.onerror
      const originalOnclose = client.onclose

      // SDK 的传输层在连接失败时会调用 onerror，但不会调用 onclose（CC
      // 使用 onclose 来触发重连）。我们通过跟踪连续的终端错误并在达到 MAX_
      // ERRORS_BEFORE_RECONNECT 次失败后手动关闭来弥合这一差距。
      let consecutiveConnectionErrors = 0
      const MAX_ERRORS_BEFORE_RECONNECT = 3

      // 防止重入：close() 会中止进行中的流，这些流可能在关
      // 闭链完成之前再次触发 onerror。
      let hasTriggeredClose = false

      // client.close() → transport.close() → transport
      // .onclose → SDK 的 _onclose()：拒绝所有待处理的请求处理程序（因此挂
      // 起的 callTool() 承诺会以 McpError -32000 "连接已关闭" 失败
      // ），然后调用我们下面的 client.onclose 处理程序（该处理程序会清除备忘录缓存
      // ，以便下次调用重新连接）。直接调用 client.onclose?.() 只会清除缓存——
      // 待处理的工具调用将保持挂起状态。
      const closeTransportAndRejectPending = (reason: string) => {
        if (hasTriggeredClose) return
        hasTriggeredClose = true
        logMCPDebug(name, `正在关闭传输 (${reason})`)
        void client.close().catch(e => {
          logMCPDebug(name, `关闭期间出错：${errorMessage(e)}`)
        })
      }

      const isTerminalConnectionError = (msg: string): boolean => {
        return (
          msg.includes('ECONNRESET') ||
          msg.includes('ETIMEDOUT') ||
          msg.includes('EPIPE') ||
          msg.includes('EHOSTUNREACH') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('请求体超时错误') ||
          msg.includes('terminated') ||
          // SDK SSE 重连中间错误——可能包装了实际
          // 的网络错误，因此上述子字符串将无法匹配
          msg.includes('SSE 流已断开') ||
          msg.includes('重新连接 SSE 流失败')
        )
      }

      // 增强的错误处理程序，带有详细日志记录
      client.onerror = (error: Error) => {
        const uptime = Date.now() - connectionStartTime
        hasErrorOccurred = true
        const transportType = serverRef.type || 'stdio'

        // 记录带有上下文的连接断开
        logMCPDebug(
          name,
          `${transportType.toUpperCase()} 连接在运行 ${Math.floor(uptime / 1000)} 秒后断开`,
        )

        // 记录特定错误详情以供调试
        if (error.message) {
          if (error.message.includes('ECONNRESET')) {
            logMCPDebug(name, `连接重置 - 服务器可能已崩溃或重启`)
          } else if (error.message.includes('ETIMEDOUT')) {
            logMCPDebug(name, `连接超时 - 网络问题或服务器无响应`)
          } else if (error.message.includes('ECONNREFUSED')) {
            logMCPDebug(name, `连接被拒绝 - 服务器可能已关闭`)
          } else if (error.message.includes('EPIPE')) {
            logMCPDebug(name, `管道损坏 - 服务器意外关闭了连接`)
          } else if (error.message.includes('EHOSTUNREACH')) {
            logMCPDebug(name, `主机不可达 - 网络连接问题`)
          } else if (error.message.includes('ESRCH')) {
            logMCPDebug(name, `进程未找到 - stdio 服务器进程已终止`)
          } else if (error.message.includes('spawn')) {
            logMCPDebug(name, `启动进程失败 - 请检查命令和权限`)
          } else {
            logMCPDebug(name, `连接错误：${error.message}`)
          }
        }

        // 对于 HTTP 传输，检测会话过期（404 + JSON-RP
        // C -32001）并关闭传输，以便挂起的工具调用被拒绝，且下
        // 一次调用使用新的会话 ID 重新连接。
        if (
          (transportType === 'http' || transportType === 'claudeai-proxy') &&
          isMcpSessionExpiredError(error)
        ) {
          logMCPDebug(
            name,
            `MCP 会话已过期（服务器返回 404 并提示会话未找到），触发重新连接`,
          )
          closeTransportAndRejectPending('会话已过期')
          if (originalOnerror) {
            originalOnerror(error)
          }
          return
        }

        // 对于远程传输（SSE/HTTP），跟踪终端连接错误
        // ，并在检测到重复失败时通过关闭操作触发重新连接。
        if (
          transportType === 'sse' ||
          transportType === 'http' ||
          transportType === 'claudeai-proxy'
        ) {
          // SDK 的 StreamableHTTP 传输在其自身的 SSE 重
          // 连尝试（默认 maxRetries: 2）耗尽后会触发此事件——但它
          // 从不调用 onclose，因此挂起的 callTool() Pro
          // mise 会无限期挂起。这是明确的“传输已放弃”信号。
          if (error.message.includes('最大重连尝试次数')) {
            closeTransportAndRejectPending('SSE 重连已耗尽')
            if (originalOnerror) {
              originalOnerror(error)
            }
            return
          }

          if (isTerminalConnectionError(error.message)) {
            consecutiveConnectionErrors++
            logMCPDebug(
              name,
              `终端连接错误 ${consecutiveConnectionErrors}/${MAX_ERRORS_BEFORE_RECONNECT}`,
            )

            if (consecutiveConnectionErrors >= MAX_ERRORS_BEFORE_RECONNECT) {
              consecutiveConnectionErrors = 0
              closeTransportAndRejectPending('最大连续终端错误数')
            }
          } else {
            // 非终端错误（例如，暂时性问题），重置计数器
            consecutiveConnectionErrors = 0
          }
        }

        // 调用原始处理程序
        if (originalOnerror) {
          originalOnerror(error)
        }
      }

      // 增强的关闭处理程序，包含连接断开上下文
      client.onclose = () => {
        const uptime = Date.now() - connectionStartTime
        const transportType = serverRef.type ?? 'unknown'

        logMCPDebug(
          name,
          `${transportType.toUpperCase()} 连接在 ${Math.floor(uptime / 1000)} 秒后关闭（${hasErrorOccurred ? 'with errors' : 'cleanly'}）`,
        )

        // 清除记忆化缓存，以便下一次操作重新连接
        const key = getServerCacheKey(name, serverRef)

        // 同时清除 fetch 缓存（以服务器名称作为键）。
        // 重新连接会创建一个新的连接对象；如果不进行清除，
        // 下一次 fetch 将返回来自旧连接的过时工具/资源。
        fetchToolsForClient.cache.delete(name)
        fetchResourcesForClient.cache.delete(name)
        fetchCommandsForClient.cache.delete(name)
        if (feature('MCP_SKILLS')) {
          fetchMcpSkillsForClient!.cache.delete(name)
        }

        connectToServer.cache.delete(key)
        logMCPDebug(name, `已清除连接缓存以便重新连接`)

        if (originalOnclose) {
          originalOnclose()
        }
      }

      const cleanup = async () => {
        // 进程内服务器（例如 Chrome MCP）没有子进程或 stderr
        if (inProcessServer) {
          try {
            await inProcessServer.close()
          } catch (error) {
            logMCPDebug(name, `关闭进程内服务器时出错：${error}`)
          }
          try {
            await client.close()
          } catch (error) {
            logMCPDebug(name, `关闭客户端时出错：${error}`)
          }
          return
        }

        // 移除 stderr 事件监听器以防止内存泄漏
        if (stderrHandler && (serverRef.type === 'stdio' || !serverRef.type)) {
          const stdioTransport = transport as StdioClientTransport
          stdioTransport.stderr?.off('data', stderrHandler)
        }

        // 对于 stdio 传输，使用适当的信号显式终止子进程 注意：StdioCli
        // entTransport.close() 仅发送中止信号，但许多 MCP 服务
        // 器（尤其是 Docker 容器）需要显式的 SIGINT/SIGTERM 信号来触发优雅关闭
        if (serverRef.type === 'stdio') {
          try {
            const stdioTransport = transport as StdioClientTransport
            const childPid = stdioTransport.pid

            if (childPid) {
              logMCPDebug(name, '正在向 MCP 服务器进程发送 SIGINT 信号')

              // 首先尝试 SIGINT（类似 Ctrl+C）
              try {
                process.kill(childPid, 'SIGINT')
              } catch (error) {
                logMCPDebug(name, `发送 SIGINT 时出错：${error}`)
                return
              }

              // Wait for graceful shutdown with rapid escalation (total 500ms to keep CLI responsive)
              // biome-ignore lint/suspicious/noAsyncPromiseExecutor: async needed for sequential await inside executor
              await new Promise<void>(async resolve => {
                let resolved = false

                // 设置一个计时器来检查进程是否仍然存在
                const checkInterval = setInterval(() => {
                  try {
                    // process.kill(pid, 0) 检查进程是否存在而不杀死它
                    process.kill(childPid, 0)
                  } catch {
                    // 进程已不存在
                    if (!resolved) {
                      resolved = true
                      clearInterval(checkInterval)
                      clearTimeout(failsafeTimeout)
                      logMCPDebug(name, 'MCP 服务器进程已干净退出')
                      resolve()
                    }
                  }
                }, 50)

                // 绝对安全措施：无论发生什么，600 毫秒后清除定时器
                const failsafeTimeout = setTimeout(() => {
                  if (!resolved) {
                    resolved = true
                    clearInterval(checkInterval)
                    logMCPDebug(name, '清理超时已到，停止进程监控')
                    resolve()
                  }
                }, 600)

                try {
                  // 等待 100 毫秒让 SIGINT 生效（通常快得多）
                  await sleep(100)

                  if (!resolved) {
                    // 检查进程是否仍然存在
                    try {
                      process.kill(childPid, 0)
                      // 进程仍然存在，SIGINT 失败，尝试 SIGTERM
                      logMCPDebug(
                        name,
                        'SIGINT 失败，向 MCP 服务器进程发送 SIGTERM',
                      )
                      try {
                        process.kill(childPid, 'SIGTERM')
                      } catch (termError) {
                        logMCPDebug(name, `发送 SIGTERM 时出错：${termError}`)
                        resolved = true
                        clearInterval(checkInterval)
                        clearTimeout(failsafeTimeout)
                        resolve()
                        return
                      }
                    } catch {
                      // 进程已退出
                      resolved = true
                      clearInterval(checkInterval)
                      clearTimeout(failsafeTimeout)
                      resolve()
                      return
                    }

                    // 等待 400 毫秒让 SIGTERM 生效（比 SIGINT 慢，通常用于清理）
                    await sleep(400)

                    if (!resolved) {
                      // 检查进程是否仍然存在
                      try {
                        process.kill(childPid, 0)
                        // 进程仍然存在，SIGTERM 失败，使用 SIGKILL 强制终止
                        logMCPDebug(
                          name,
                          'SIGTERM 失败，向 MCP 服务器进程发送 SIGKILL',
                        )
                        try {
                          process.kill(childPid, 'SIGKILL')
                        } catch (killError) {
                          logMCPDebug(name, `发送 SIGKILL 时出错：${killError}`)
                        }
                      } catch {
                        // 进程已退出
                        resolved = true
                        clearInterval(checkInterval)
                        clearTimeout(failsafeTimeout)
                        resolve()
                      }
                    }
                  }

                  // 最终超时 - 最多 500 毫秒后始终解析（总清理时间）
                  if (!resolved) {
                    resolved = true
                    clearInterval(checkInterval)
                    clearTimeout(failsafeTimeout)
                    resolve()
                  }
                } catch {
                  // 处理升级序列中的任何错误
                  if (!resolved) {
                    resolved = true
                    clearInterval(checkInterval)
                    clearTimeout(failsafeTimeout)
                    resolve()
                  }
                }
              })
            }
          } catch (processError) {
            logMCPDebug(name, `终止进程时出错：${processError}`)
          }
        }

        // 关闭客户端连接（同时也会关闭传输层）
        try {
          await client.close()
        } catch (error) {
          logMCPDebug(name, `关闭客户端时出错：${error}`)
        }
      }

      // 为所有传输类型注册清理 - 即使是网络传输也可能需要清理。这确保所有
      // MCP 服务器都能被正确终止，而不仅仅是 stdio 类型的
      const cleanupUnregister = registerCleanup(cleanup)

      // 创建包含注销操作的包装清理函数
      const wrappedCleanup = async () => {
        cleanupUnregister?.()
        await cleanup()
      }

      const connectionDurationMs = Date.now() - connectStartTime
      logEvent('tengu_mcp_server_connection_succeeded', {
        connectionDurationMs,
        transportType: (serverRef.type ??
          'stdio') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        totalServers: serverStats?.totalServers,
        stdioCount: serverStats?.stdioCount,
        sseCount: serverStats?.sseCount,
        httpCount: serverStats?.httpCount,
        sseIdeCount: serverStats?.sseIdeCount,
        wsIdeCount: serverStats?.wsIdeCount,
        ...mcpBaseUrlAnalytics(serverRef),
      })
      return {
        name,
        client,
        type: 'connected' as const,
        capabilities: capabilities ?? {},
        serverInfo: serverVersion,
        instructions,
        config: serverRef,
        cleanup: wrappedCleanup,
      }
    } catch (error) {
      const connectionDurationMs = Date.now() - connectStartTime
      logEvent('tengu_mcp_server_connection_failed', {
        connectionDurationMs,
        totalServers: serverStats?.totalServers || 1,
        stdioCount:
          serverStats?.stdioCount || (serverRef.type === 'stdio' ? 1 : 0),
        sseCount: serverStats?.sseCount || (serverRef.type === 'sse' ? 1 : 0),
        httpCount:
          serverStats?.httpCount || (serverRef.type === 'http' ? 1 : 0),
        sseIdeCount:
          serverStats?.sseIdeCount || (serverRef.type === 'sse-ide' ? 1 : 0),
        wsIdeCount:
          serverStats?.wsIdeCount || (serverRef.type === 'ws-ide' ? 1 : 0),
        transportType: (serverRef.type ??
          'stdio') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...mcpBaseUrlAnalytics(serverRef),
      })
      logMCPDebug(
        name,
        `连接在 ${connectionDurationMs} 毫秒后失败：${errorMessage(error)}`,
      )
      logMCPError(name, `连接失败：${errorMessage(error)}`)

      if (inProcessServer) {
        inProcessServer.close().catch(() => {})
      }
      return {
        name,
        type: 'failed' as const,
        config: serverRef,
        error: errorMessage(error),
      }
    }
  },
  getServerCacheKey,
)

/** 清除特定服务器的记忆缓存
@param name 服务器名称
@param serverRef 服务器配置 */
export async function clearServerCache(
  name: string,
  serverRef: ScopedMcpServerConfig,
): Promise<void> {
  const key = getServerCacheKey(name, serverRef)

  try {
    const wrappedClient = await connectToServer(name, serverRef)

    if (wrappedClient.type === 'connected') {
      await wrappedClient.cleanup()
    }
  } catch {
    // 忽略错误 - 服务器可能连接失败
  }

  // 从缓存中清除（包括连接缓存和获取缓存，以便重新
  // 连接时获取新的工具/资源/命令，而不是过时的）
  connectToServer.cache.delete(key)
  fetchToolsForClient.cache.delete(name)
  fetchResourcesForClient.cache.delete(name)
  fetchCommandsForClient.cache.delete(name)
  if (feature('MCP_SKILLS')) {
    fetchMcpSkillsForClient!.cache.delete(name)
  }
}

/** 确保 MCP 服务器拥有有效的已连接客户端。
对于大多数服务器类型，如果可用则使用记忆缓存，如果缓存被清除（例如，在 onclose 之后）则重新连接。
这确保工具/资源调用始终使用有效的连接。

SDK MCP 服务器在进程内运行，通过 setupSdkMcpClients 单独处理，
因此它们会原样返回，而不经过 connectToServer。

@param client 已连接的 MCP 服务器客户端
@returns 已连接的 MCP 服务器客户端（相同或重新连接）
@throws 如果服务器无法连接则抛出错误 */
export async function ensureConnectedClient(
  client: ConnectedMCPServer,
): Promise<ConnectedMCPServer> {
  // SDK MCP 服务器在进程内运行，通过 setupSdkMcpClients 单独处理
  if (client.config.type === 'sdk') {
    return client
  }

  const connectedClient = await connectToServer(client.name, client.config)
  if (connectedClient.type !== 'connected') {
    throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
      `MCP 服务器 "${client.name}" 未连接`,
      'MCP 服务器未连接',
    )
  }
  return connectedClient
}

/** 比较两个 MCP 服务器配置以判断它们是否等效。
用于检测何时因配置变更需要重新连接服务器。 */
export function areMcpConfigsEqual(
  a: ScopedMcpServerConfig,
  b: ScopedMcpServerConfig,
): boolean {
  // 先进行快速类型检查
  if (a.type !== b.type) return false

  // 通过序列化进行比较 - 这能处理所有配置变体。我们
  // 将 'scope' 排除在比较之外，因为它是元数据，而非连接配置。
  const { scope: _scopeA, ...configA } = a
  const { scope: _scopeB, ...configB } = b
  return jsonStringify(configA) === jsonStringify(configB)
}

// fetch* 缓存的最大容量。以服务器名称作为键（在重新连接时保
// 持稳定），并设置上限以防止随着 MCP 服务器数量增多而无限增长。
const MCP_FETCH_CACHE_SIZE = 20

/** 为自动模式安全分类器编码 MCP 工具输入。
导出此功能，以便自动模式评估脚本可以镜像生产环境的编码方式
用于 `mcp__*` 工具存根，而无需重复此逻辑。 */
export function mcpToolInputToAutoClassifierInput(
  input: Record<string, unknown>,
  toolName: string,
): string {
  const keys = Object.keys(input)
  return keys.length > 0
    ? keys.map(k => `${k}=${String(input[k])}`).join(' ')
    : toolName
}

export const fetchToolsForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<Tool[]> => {
    if (client.type !== 'connected') return []

    try {
      if (!client.capabilities?.tools) {
        return []
      }

      const result = (await client.client.request(
        { method: 'tools/list' },
        ListToolsResultSchema,
      )) as ListToolsResult

      // 清理来自 MCP 服务器的工具数据
      const toolsToProcess = recursivelySanitizeUnicode(result.tools)

      // 检查是否应为 SDK MCP 服务器跳过 mcp__ 前缀
      const skipPrefix =
        client.config.type === 'sdk' &&
        isEnvTruthy(process.env.CLAUDE_AGENT_SDK_MCP_NO_PREFIX)

      // 将 MCP 工具转换为我们内部的 Tool 格式
      return toolsToProcess
        .map((tool): Tool => {
          const fullyQualifiedName = buildMcpToolName(client.name, tool.name)
          return {
            ...MCPTool,
            // 在跳过前缀模式下，使用原始名称进行模型调用，以便 MCP 工具
            // 可以通过名称覆盖内置工具。mcpInfo 用于权限检查。
            name: skipPrefix ? tool.name : fullyQualifiedName,
            mcpInfo: { serverName: client.name, toolName: tool.name },
            isMcp: true,
            // 压缩空白字符：_meta 对外部 MCP 服务器开放，此处的换
            // 行符会将孤立行注入到延迟工具列表中（formatDeferre
            // dToolLine 以 '\n' 连接）。
            searchHint:
              typeof tool._meta?.['anthropic/searchHint'] === 'string'
                ? tool._meta['anthropic/searchHint']
                    .replace(/\s+/g, ' ')
                    .trim() || undefined
                : undefined,
            alwaysLoad: tool._meta?.['anthropic/alwaysLoad'] === true,
            async description() {
              return tool.description ?? ''
            },
            async prompt() {
              const desc = tool.description ?? ''
              return desc.length > MAX_MCP_DESCRIPTION_LENGTH
                ? desc.slice(0, MAX_MCP_DESCRIPTION_LENGTH) + '… [已截断]'
                : desc
            },
            isConcurrencySafe() {
              return tool.annotations?.readOnlyHint ?? false
            },
            isReadOnly() {
              return tool.annotations?.readOnlyHint ?? false
            },
            toAutoClassifierInput(input) {
              return mcpToolInputToAutoClassifierInput(input, tool.name)
            },
            isDestructive() {
              return tool.annotations?.destructiveHint ?? false
            },
            isOpenWorld() {
              return tool.annotations?.openWorldHint ?? false
            },
            isSearchOrReadCommand() {
              return classifyMcpToolForCollapse(client.name, tool.name)
            },
            inputJSONSchema: tool.inputSchema as Tool['inputJSONSchema'],
            async checkPermissions() {
              return {
                behavior: 'passthrough' as const,
                message: 'MCPTool 需要权限。',
                suggestions: [
                  {
                    type: 'addRules' as const,
                    rules: [
                      {
                        toolName: fullyQualifiedName,
                        ruleContent: undefined,
                      },
                    ],
                    behavior: 'allow' as const,
                    destination: 'localSettings' as const,
                  },
                ],
              }
            },
            async call(
              args: Record<string, unknown>,
              context,
              _canUseTool,
              parentMessage,
              onProgress?: ToolCallProgress<MCPProgress>,
            ) {
              const toolUseId = extractToolUseId(parentMessage)
              const meta = toolUseId
                ? { 'claudecode/toolUseId': toolUseId }
                : {}

              // 工具启动时发出进度通知
              if (onProgress && toolUseId) {
                onProgress({
                  toolUseID: toolUseId,
                  data: {
                    type: 'mcp_progress',
                    status: 'started',
                    serverName: client.name,
                    toolName: tool.name,
                  },
                })
              }

              const startTime = Date.now()
              const MAX_SESSION_RETRIES = 1
              for (let attempt = 0; ; attempt++) {
                try {
                  const connectedClient = await ensureConnectedClient(client)
                  const mcpResult = await callMCPToolWithUrlElicitationRetry({
                    client: connectedClient,
                    clientConnection: client,
                    tool: tool.name,
                    args,
                    meta,
                    signal: context.abortController.signal,
                    setAppState: context.setAppState,
                    onProgress:
                      onProgress && toolUseId
                        ? progressData => {
                            onProgress({
                              toolUseID: toolUseId,
                              data: progressData,
                            })
                          }
                        : undefined,
                    handleElicitation: context.handleElicitation,
                  })

                  // 工具成功完成时发出进度通知
                  if (onProgress && toolUseId) {
                    onProgress({
                      toolUseID: toolUseId,
                      data: {
                        type: 'mcp_progress',
                        status: 'completed',
                        serverName: client.name,
                        toolName: tool.name,
                        elapsedTimeMs: Date.now() - startTime,
                      },
                    })
                  }

                  return {
                    data: mcpResult.content,
                    ...((mcpResult._meta || mcpResult.structuredContent) && {
                      mcpMeta: {
                        ...(mcpResult._meta && {
                          _meta: mcpResult._meta,
                        }),
                        ...(mcpResult.structuredContent && {
                          structuredContent: mcpResult.structuredContent,
                        }),
                      },
                    }),
                  }
                } catch (error) {
                  // 会话已过期 — 连接缓存已被清
                  // 空，请使用新的客户端重试。
                  if (
                    error instanceof McpSessionExpiredError &&
                    attempt < MAX_SESSION_RETRIES
                  ) {
                    logMCPDebug(
                      client.name,
                      `会话恢复后重试工具 '${tool.name}'`,
                    )
                    continue
                  }

                  // 工具失败时发出进度通知
                  if (onProgress && toolUseId) {
                    onProgress({
                      toolUseID: toolUseId,
                      data: {
                        type: 'mcp_progress',
                        status: 'failed',
                        serverName: client.name,
                        toolName: tool.name,
                        elapsedTimeMs: Date.now() - startTime,
                      },
                    })
                  }
                  // 包装 MCP SDK 错误，以便遥测获得有用的上下
                  // 文，而不仅仅是 "Error" 或 "McpErro
                  // r"（构造函数名称）。MCP SDK 错误是协议级
                  // 别的消息，不包含用户文件路径或代码。
                  if (
                    error instanceof Error &&
                    !(
                      error instanceof
                      TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
                    )
                  ) {
                    const name = error.constructor.name
                    if (name === 'Error') {
                      throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
                        error.message,
                        error.message.slice(0, 200),
                      )
                    }
                    // McpError 有一个数字类型的 `code`，代表 JSON-RPC 错误码（例如
                    // -32000 ConnectionClosed, -32001 RequestTimeout）
                    if (
                      name === 'McpError' &&
                      'code' in error &&
                      typeof error.code === 'number'
                    ) {
                      throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
                        error.message,
                        `McpError ${error.code}`,
                      )
                    }
                  }
                  throw error
                }
              }
            },
            userFacingName() {
              // 优先使用标题注解（如果可用），否则使用工具名称
              const displayName = tool.annotations?.title || tool.name
              return `${client.name} - ${displayName} (MCP)`
            },
            ...(isClaudeInChromeMCPServer(client.name) &&
            (client.config.type === 'stdio' || !client.config.type)
              ? claudeInChromeToolRendering().getClaudeInChromeMCPToolOverrides(
                  tool.name,
                )
              : {}),
            ...(feature('CHICAGO_MCP') &&
            (client.config.type === 'stdio' || !client.config.type) &&
            isComputerUseMCPServer!(client.name)
              ? computerUseWrapper!().getComputerUseMCPToolOverrides(tool.name)
              : {}),
          }
        })
        .filter(isIncludedMcpTool)
    } catch (error) {
      logMCPError(client.name, `获取工具失败：${errorMessage(error)}`)
      return []
    }
  },
  (client: MCPServerConnection) => client.name,
  MCP_FETCH_CACHE_SIZE,
)

export const fetchResourcesForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<ServerResource[]> => {
    if (client.type !== 'connected') return []

    try {
      if (!client.capabilities?.resources) {
        return []
      }

      const result = await client.client.request(
        { method: 'resources/list' },
        ListResourcesResultSchema,
      )

      if (!result.resources) return []

      // 为每个资源添加服务器名称
      return result.resources.map(resource => ({
        ...resource,
        server: client.name,
      }))
    } catch (error) {
      logMCPError(client.name, `获取资源失败：${errorMessage(error)}`)
      return []
    }
  },
  (client: MCPServerConnection) => client.name,
  MCP_FETCH_CACHE_SIZE,
)

export const fetchCommandsForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<Command[]> => {
    if (client.type !== 'connected') return []

    try {
      if (!client.capabilities?.prompts) {
        return []
      }

      // 向客户端请求提示列表
      const result = (await client.client.request(
        { method: 'prompts/list' },
        ListPromptsResultSchema,
      )) as ListPromptsResult

      if (!result.prompts) return []

      // 清理来自 MCP 服务器的提示数据
      const promptsToProcess = recursivelySanitizeUnicode(result.prompts)

      // 将 MCP 提示转换为我们内部的 Command 格式
      return promptsToProcess.map(prompt => {
        const argNames = Object.values(prompt.arguments ?? {}).map(k => k.name)
        return {
          type: 'prompt' as const,
          name: 'mcp__' + normalizeNameForMCP(client.name) + '__' + prompt.name,
          description: prompt.description ?? '',
          hasUserSpecifiedDescription: !!prompt.description,
          contentLength: 0, // 动态 MCP 内容
          isEnabled: () => true,
          isHidden: false,
          isMcp: true,
          progressMessage: 'running',
          userFacingName() {
            // 使用 prompt.name（编程标识符）而非 prompt.tit
            // le（显示名称），以避免空格破坏斜杠命令解析
            return `${client.name}:${prompt.name} (MCP)`
          },
          argNames,
          source: 'mcp',
          async getPromptForCommand(args: string) {
            const argsArray = args.split(' ')
            try {
              const connectedClient = await ensureConnectedClient(client)
              const result = await connectedClient.client.getPrompt({
                name: prompt.name,
                arguments: zipObject(argNames, argsArray),
              })
              const transformed = await Promise.all(
                result.messages.map(message =>
                  transformResultContent(message.content, connectedClient.name),
                ),
              )
              return transformed.flat()
            } catch (error) {
              logMCPError(
                client.name,
                `运行命令 '${prompt.name}' 时出错：${errorMessage(error)}`,
              )
              throw error
            }
          },
        }
      })
    } catch (error) {
      logMCPError(client.name, `获取命令失败：${errorMessage(error)}`)
      return []
    }
  },
  (client: MCPServerConnection) => client.name,
  MCP_FETCH_CACHE_SIZE,
)

/** 将 IDE 工具直接作为 RPC 调用
@param toolName 要调用的工具名称
@param args 传递给工具的参数
@param client 用于 RPC 调用的 IDE 客户端
@returns 工具调用的结果 */
export async function callIdeRpc(
  toolName: string,
  args: Record<string, unknown>,
  client: ConnectedMCPServer,
): Promise<string | ContentBlockParam[] | undefined> {
  const result = await callMCPTool({
    client,
    tool: toolName,
    args,
    signal: createAbortController().signal,
  })
  return result.content
}

/** 注意：UI 组件不应直接调用此函数，它们应使用 useManageMcpConnections 中的 reconnectMcpServer 函数。
@param name 服务器名称
@param config 服务器配置
@returns 包含客户端连接及其资源的对象 */
export async function reconnectMcpServerImpl(
  name: string,
  config: ScopedMcpServerConfig,
): Promise<{
  client: MCPServerConnection
  tools: Tool[]
  commands: Command[]
  resources?: ServerResource[]
}> {
  try {
    // 使密钥链缓存失效，以便从磁盘读取最新的凭据。当另一个进
    // 程（例如 VS Code 扩展主机）修改了存储的令牌（清
    // 除身份验证、保存新的 OAuth 令牌）然后要求 CLI
    // 子进程重新连接时，这是必要的。如果没有这一步，子进程将
    // 使用过时的缓存数据，永远不会注意到令牌已被移除。
    clearKeychainCache()

    await clearServerCache(name, config)
    const client = await connectToServer(name, config)

    if (client.type !== 'connected') {
      return {
        client,
        tools: [],
        commands: [],
      }
    }

    if (config.type === 'claudeai-proxy') {
      markClaudeAiMcpConnected(name)
    }

    const supportsResources = !!client.capabilities?.resources

    const [tools, mcpCommands, mcpSkills, resources] = await Promise.all([
      fetchToolsForClient(client),
      fetchCommandsForClient(client),
      feature('MCP_SKILLS') && supportsResources
        ? fetchMcpSkillsForClient!(client)
        : Promise.resolve([]),
      supportsResources ? fetchResourcesForClient(client) : Promise.resolve([]),
    ])
    const commands = [...mcpCommands, ...mcpSkills]

    // 检查是否需要添加资源工具
    const resourceTools: Tool[] = []
    if (supportsResources) {
      // 仅当没有其他服务器拥有资源工具时才添加
      const hasResourceTools = [ListMcpResourcesTool, ReadMcpResourceTool].some(
        tool => tools.some(t => toolMatchesName(t, tool.name)),
      )
      if (!hasResourceTools) {
        resourceTools.push(ListMcpResourcesTool, ReadMcpResourceTool)
      }
    }

    return {
      client,
      tools: [...tools, ...resourceTools],
      commands,
      resources: resources.length > 0 ? resources : undefined,
    }
  } catch (error) {
    // 优雅地处理错误 - 连接可能在获取期间已关闭
    logMCPError(name, `重新连接期间出错：${errorMessage(error)}`)

    // 返回失败状态
    return {
      client: { name, type: 'failed' as const, config },
      tools: [],
      commands: [],
    }
  }
}

// 已于 2026-03 替换：之前的实现运行固定大小的顺序批次（
// 等待批次 1 完全完成，然后开始批次 2）。这意味着批次 N
// 中的一个慢速服务器会阻塞批次 N+1 中的所有服务器，即使
// 其他 19 个槽位处于空闲状态。pMap 会在每个服务器完成
// 后立即释放其槽位，因此单个慢速服务器只占用一个槽位，而不会
// 阻塞整个批次边界。相同的并发上限，相同的结果，更好的调度。
async function processBatched<T>(
  items: T[],
  concurrency: number,
  processor: (item: T) => Promise<void>,
): Promise<void> {
  await pMap(items, processor, { concurrency })
}

export async function getMcpToolsCommandsAndResources(
  onConnectionAttempt: (params: {
    client: MCPServerConnection
    tools: Tool[]
    commands: Command[]
    resources?: ServerResource[]
  }) => void,
  mcpConfigs?: Record<string, ScopedMcpServerConfig>,
): Promise<void> {
  let resourceToolsAdded = false

  const allConfigEntries = Object.entries(
    mcpConfigs ?? (await getAllMcpConfigs()).servers,
  )

  // 划分为禁用和活跃条目 —— 禁用的服务器永远
  // 不应生成 HTTP 连接或进入批处理流程
  const configEntries: typeof allConfigEntries = []
  for (const entry of allConfigEntries) {
    if (isMcpServerDisabled(entry[0])) {
      onConnectionAttempt({
        client: { name: entry[0], type: 'disabled', config: entry[1] },
        tools: [],
        commands: [],
      })
    } else {
      configEntries.push(entry)
    }
  }

  // 计算传输计数以供日志记录
  const totalServers = configEntries.length
  const stdioCount = count(configEntries, ([_, c]) => c.type === 'stdio')
  const sseCount = count(configEntries, ([_, c]) => c.type === 'sse')
  const httpCount = count(configEntries, ([_, c]) => c.type === 'http')
  const sseIdeCount = count(configEntries, ([_, c]) => c.type === 'sse-ide')
  const wsIdeCount = count(configEntries, ([_, c]) => c.type === 'ws-ide')

  // 按类型划分服务器：本地服务器（stdio/sdk）由于进
  // 程生成需要较低的并发度，远程服务器可以以更高的并发度连接
  const localServers = configEntries.filter(([_, config]) =>
    isLocalMcpServer(config),
  )
  const remoteServers = configEntries.filter(
    ([_, config]) => !isLocalMcpServer(config),
  )

  const serverStats = {
    totalServers,
    stdioCount,
    sseCount,
    httpCount,
    sseIdeCount,
    wsIdeCount,
  }

  const processServer = async ([name, config]: [
    string,
    ScopedMcpServerConfig,
  ]): Promise<void> => {
    try {
      // 检查服务器是否被禁用 - 如果是，则仅将其添加到状态中而不连接
      if (isMcpServerDisabled(name)) {
        onConnectionAttempt({
          client: {
            name,
            type: 'disabled',
            config,
          },
          tools: [],
          commands: [],
        })
        return
      }

      // 跳过最近返回 401 的服务器（15 分钟 TTL），或者我们
      // 之前探测过但没有持有令牌的服务器。第二次检查弥补了 TTL
      // 留下的空白：如果没有它，每 15 分钟我们会重新探测那些在
      // 用户运行 /mcp 之前无法成功的服务器。每次探测都涉及一次
      // 网络往返（connect-401）加上 OAuth 发现
      // ，并且打印模式会等待整个批次（main.tsx:3503）。
      if (
        (config.type === 'claudeai-proxy' ||
          config.type === 'http' ||
          config.type === 'sse') &&
        ((await isMcpAuthCached(name)) ||
          ((config.type === 'http' || config.type === 'sse') &&
            hasMcpDiscoveryButNoToken(name, config)))
      ) {
        logMCPDebug(name, `跳过连接（缓存的需要身份验证）`)
        onConnectionAttempt({
          client: { name, type: 'needs-auth' as const, config },
          tools: [createMcpAuthTool(name, config)],
          commands: [],
        })
        return
      }

      const client = await connectToServer(name, config, serverStats)

      if (client.type !== 'connected') {
        onConnectionAttempt({
          client,
          tools:
            client.type === 'needs-auth'
              ? [createMcpAuthTool(name, config)]
              : [],
          commands: [],
        })
        return
      }

      if (config.type === 'claudeai-proxy') {
        markClaudeAiMcpConnected(name)
      }

      const supportsResources = !!client.capabilities?.resources

      const [tools, mcpCommands, mcpSkills, resources] = await Promise.all([
        fetchToolsForClient(client),
        fetchCommandsForClient(client),
        // 从 skill:// 资源中发现技能
        feature('MCP_SKILLS') && supportsResources
          ? fetchMcpSkillsForClient!(client)
          : Promise.resolve([]),
        // 如果支持则获取资源
        supportsResources
          ? fetchResourcesForClient(client)
          : Promise.resolve([]),
      ])
      const commands = [...mcpCommands, ...mcpSkills]

      // 如果这是服务器资源并且我们尚未添加资源工具，则将
      // 此客户端的工具与我们的资源工具一起包含
      const resourceTools: Tool[] = []
      if (supportsResources && !resourceToolsAdded) {
        resourceToolsAdded = true
        resourceTools.push(ListMcpResourcesTool, ReadMcpResourceTool)
      }

      onConnectionAttempt({
        client,
        tools: [...tools, ...resourceTools],
        commands,
        resources: resources.length > 0 ? resources : undefined,
      })
    } catch (error) {
      // 优雅地处理错误 - 连接可能在获取期间已关闭
      logMCPError(name, `获取工具/命令/资源时出错：${errorMessage(error)}`)

      // 仍然使用客户端更新，但没有工具/命令
      onConnectionAttempt({
        client: { name, type: 'failed' as const, config },
        tools: [],
        commands: [],
      })
    }
  }

  // 并发处理两组，每组都有自己的并发限制：- 本地服务
  // 器（stdio/sdk）：较低的并发度以避免进程生成资源争用
  // - 远程服务器：较高的并发度，因为它们只是网络连接
  await Promise.all([
    processBatched(
      localServers,
      getMcpServerConnectionBatchSize(),
      processServer,
    ),
    processBatched(
      remoteServers,
      getRemoteMcpServerConnectionBatchSize(),
      processServer,
    ),
  ])
}

// 未记忆化：仅在启动/重新配置时调用 2-3 次。内部工作（connectToSe
// rver, fetch*ForClient）已被缓存。此处通过 mcpConfi
// gs 对象引用进行记忆化会导致泄漏 —— main.tsx 每次调用都会创建新的配置对象。
export function prefetchAllMcpResources(
  mcpConfigs: Record<string, ScopedMcpServerConfig>,
): Promise<{
  clients: MCPServerConnection[]
  tools: Tool[]
  commands: Command[]
}> {
  return new Promise(resolve => {
    let pendingCount = 0
    let completedCount = 0

    pendingCount = Object.keys(mcpConfigs).length

    if (pendingCount === 0) {
      void resolve({
        clients: [],
        tools: [],
        commands: [],
      })
      return
    }

    const clients: MCPServerConnection[] = []
    const tools: Tool[] = []
    const commands: Command[] = []

    getMcpToolsCommandsAndResources(result => {
      clients.push(result.client)
      tools.push(...result.tools)
      commands.push(...result.commands)

      completedCount++
      if (completedCount >= pendingCount) {
        const commandsMetadataLength = commands.reduce((sum, command) => {
          const commandMetadataLength =
            command.name.length +
            (command.description ?? '').length +
            (command.argumentHint ?? '').length
          return sum + commandMetadataLength
        }, 0)
        logEvent('tengu_mcp_tools_commands_loaded', {
          tools_count: tools.length,
          commands_count: commands.length,
          commands_metadata_length: commandsMetadataLength,
        })

        void resolve({
          clients,
          tools,
          commands,
        })
      }
    }, mcpConfigs).catch(error => {
      logMCPError(
        'prefetchAllMcpResources',
        `获取 MCP 资源失败：${errorMessage(error)}`,
      )
      // 仍然解析，但返回空结果
      void resolve({
        clients: [],
        tools: [],
        commands: [],
      })
    })
  })
}

/** 将 MCP 工具或 MCP 提示的结果内容转换为消息块 */
export async function transformResultContent(
  resultContent: PromptMessage['content'],
  serverName: string,
): Promise<Array<ContentBlockParam>> {
  switch (resultContent.type) {
    case 'text':
      return [
        {
          type: 'text',
          text: resultContent.text,
        },
      ]
    case 'audio': {
      const audioData = resultContent as {
        type: 'audio'
        data: string
        mimeType?: string
      }
      return await persistBlobToTextBlock(
        Buffer.from(audioData.data, 'base64'),
        audioData.mimeType,
        serverName,
        `[音频来自 ${serverName}] `,
      )
    }
    case 'image': {
      // 调整大小并压缩图像数据，强制执行 API 维度限制
      const imageBuffer = Buffer.from(String(resultContent.data), 'base64')
      const ext = resultContent.mimeType?.split('/')[1] || 'png'
      const resized = await maybeResizeAndDownsampleImageBuffer(
        imageBuffer,
        imageBuffer.length,
        ext,
      )
      return [
        {
          type: 'image',
          source: {
            data: resized.buffer.toString('base64'),
            media_type:
              `image/${resized.mediaType}` as Base64ImageSource['media_type'],
            type: 'base64',
          },
        },
      ]
    }
    case 'resource': {
      const resource = resultContent.resource
      const prefix = `[来自 ${serverName} 的资源，时间 ${resource.uri}]`

      if ('text' in resource) {
        return [
          {
            type: 'text',
            text: `${prefix}${resource.text}`,
          },
        ]
      } else if ('blob' in resource) {
        const isImage = IMAGE_MIME_TYPES.has(resource.mimeType ?? '')

        if (isImage) {
          // 调整图像 blob 大小并进行压缩，强制执行 API 尺寸限制
          const imageBuffer = Buffer.from(resource.blob, 'base64')
          const ext = resource.mimeType?.split('/')[1] || 'png'
          const resized = await maybeResizeAndDownsampleImageBuffer(
            imageBuffer,
            imageBuffer.length,
            ext,
          )
          const content: MessageParam['content'] = []
          if (prefix) {
            content.push({
              type: 'text',
              text: prefix,
            })
          }
          content.push({
            type: 'image',
            source: {
              data: resized.buffer.toString('base64'),
              media_type:
                `image/${resized.mediaType}` as Base64ImageSource['media_type'],
              type: 'base64',
            },
          })
          return content
        } else {
          return await persistBlobToTextBlock(
            Buffer.from(resource.blob, 'base64'),
            resource.mimeType,
            serverName,
            prefix,
          )
        }
      }
      return []
    }
    case 'resource_link': {
      const resourceLink = resultContent as ResourceLink
      let text = `[资源链接：${resourceLink.name}] ${resourceLink.uri}`
      if (resourceLink.description) {
        text += ` (${resourceLink.description})`
      }
      return [
        {
          type: 'text',
          text,
        },
      ]
    }
    default:
      return []
  }
}

/** 解码 base64 二进制内容，使用正确的扩展名将其写入磁盘，并返回一个包含文件路径的小文本块。取代了将原始 base64 数据转储到上下文中的旧行为。 */
async function persistBlobToTextBlock(
  bytes: Buffer,
  mimeType: string | undefined,
  serverName: string,
  sourceDescription: string,
): Promise<Array<ContentBlockParam>> {
  const persistId = `mcp-${normalizeNameForMCP(serverName)}-blob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const result = await persistBinaryContent(bytes, mimeType, persistId)

  if ('error' in result) {
    return [
      {
        type: 'text',
        text: `${sourceDescription}二进制内容 (${mimeType || 'unknown type'}, ${bytes.length} 字节) 无法保存到磁盘：${result.error}`,
      },
    ]
  }

  return [
    {
      type: 'text',
      text: getBinaryBlobSavedMessage(
        result.filepath,
        mimeType,
        result.size,
        sourceDescription,
      ),
    },
  ]
}

/** 将 MCP 工具结果处理为标准化格式。 */
export type MCPResultType = 'toolResult' | 'structuredContent' | 'contentArray'

export type TransformedMCPResult = {
  content: MCPToolResult
  type: MCPResultType
  schema?: string
}

/** 为值生成一个紧凑的、jq 友好的类型签名。
例如："{title: string, items: [{id: number, name: string}]}" */
export function inferCompactSchema(value: unknown, depth = 2): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[${inferCompactSchema(value[0], depth - 1)}]`
  }
  if (typeof value === 'object') {
    if (depth <= 0) return '{...}'
    const entries = Object.entries(value).slice(0, 10)
    const props = entries.map(
      ([k, v]) => `${k}: ${inferCompactSchema(v, depth - 1)}`,
    )
    const suffix = Object.keys(value).length > 10 ? ', ...' : ''
    return `{${props.join(', ')}${suffix}}`
  }
  return typeof value
}

export async function transformMCPResult(
  result: unknown,
  tool: string, // 用于验证的工具名称（例如 "search"）
  name: string, // 用于转换的服务器名称（例如 "slack"）
): Promise<TransformedMCPResult> {
  if (result && typeof result === 'object') {
    if ('toolResult' in result) {
      return {
        content: String(result.toolResult),
        type: 'toolResult',
      }
    }

    if (
      'structuredContent' in result &&
      result.structuredContent !== undefined
    ) {
      return {
        content: jsonStringify(result.structuredContent),
        type: 'structuredContent',
        schema: inferCompactSchema(result.structuredContent),
      }
    }

    if ('content' in result && Array.isArray(result.content)) {
      const transformedContent = (
        await Promise.all(
          result.content.map(item => transformResultContent(item, name)),
        )
      ).flat()
      return {
        content: transformedContent,
        type: 'contentArray',
        schema: inferCompactSchema(transformedContent),
      }
    }
  }

  const errorMessage = `MCP 服务器 "${name}" 的工具 "${tool}"：响应格式异常`
  logMCPError(name, errorMessage)
  throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
    errorMessage,
    'MCP 工具响应格式异常',
  )
}

/** 检查 MCP 内容是否包含任何图像块。
用于决定是否持久化到文件（图像应改用截断以保持图像压缩和可查看性）。 */
function contentContainsImages(content: MCPToolResult): boolean {
  if (!content || typeof content === 'string') {
    return false
  }
  return content.some(block => block.type === 'image')
}

export async function processMCPResult(
  result: unknown,
  tool: string, // 用于验证的工具名称（例如 "search"）
  name: string, // 用于 IDE 检查和转换的服务器名称（例如 "slack"）
): Promise<MCPToolResult> {
  const { content, type, schema } = await transformMCPResult(result, tool, name)

  // IDE 工具不会直接发送给模型，因此我们不需要
  // 处理大型输出。
  if (name === 'ide') {
    return content
  }

  // 检查内容是否需要截断（即是否过大）
  if (!(await mcpContentNeedsTruncation(content))) {
    return content
  }

  const sizeEstimateTokens = getContentSizeEstimate(content)

  // 如果大型输出文件功能被禁用，则回退到旧的截断行为
  if (isEnvDefinedFalsy(process.env.ENABLE_MCP_LARGE_OUTPUT_FILES)) {
    logEvent('tengu_mcp_large_result_handled', {
      outcome: 'truncated',
      reason: 'env_disabled',
      sizeEstimateTokens,
    } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
    return await truncateMcpContentIfNeeded(content)
  }

  // 将大型输出保存到文件并返回读取说明。此时内容保证存在
  // （我们已检查 mcpContentNeedsTruncation）
  if (!content) {
    return content
  }

  // 如果内容包含图像，则回退到截断 - 将图像持久化为
  // JSON 会破坏图像压缩逻辑并使其无法查看
  if (contentContainsImages(content)) {
    logEvent('tengu_mcp_large_result_handled', {
      outcome: 'truncated',
      reason: 'contains_images',
      sizeEstimateTokens,
    } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
    return await truncateMcpContentIfNeeded(content)
  }

  // 为持久化文件生成唯一 ID（server__tool-timestamp）
  const timestamp = Date.now()
  const persistId = `mcp-${normalizeNameForMCP(name)}-${normalizeNameForMCP(tool)}-${timestamp}`
  // 转换为字符串以便持久化（persistToolResult 期望字符串或特定的块类型）
  const contentStr =
    typeof content === 'string' ? content : jsonStringify(content, null, 2)
  const persistResult = await persistToolResult(contentStr, persistId)

  if (isPersistError(persistResult)) {
    // 如果文件保存失败，则回退到返回截断的内容信息
    const contentLength = contentStr.length
    logEvent('tengu_mcp_large_result_handled', {
      outcome: 'truncated',
      reason: 'persist_failed',
      sizeEstimateTokens,
    } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
    return `错误：结果（${contentLength.toLocaleString()} 个字符）超出允许的最大 token 数。无法将输出保存到文件：${persistResult.error}。如果此 MCP 服务器提供分页或过滤工具，请使用它们来检索数据的特定部分。`
  }

  logEvent('tengu_mcp_large_result_handled', {
    outcome: 'persisted',
    reason: 'file_saved',
    sizeEstimateTokens,
    persistedSizeChars: persistResult.originalSize,
  } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)

  const formatDescription = getFormatDescription(type, schema)
  return getLargeOutputInstructions(
    persistResult.filepath,
    persistResult.originalSize,
    formatDescription,
  )
}

/** 调用 MCP 工具，通过向用户显示 URL 请求、等待完成通知并重试工具调用来处理 UrlElicitationRequiredError (-32042)。 */
type MCPToolCallResult = {
  content: MCPToolResult
  _meta?: Record<string, unknown>
  structuredContent?: Record<string, unknown>
}

/** @internal 为测试而导出。 */
export async function callMCPToolWithUrlElicitationRetry({
  client: connectedClient,
  clientConnection,
  tool,
  args,
  meta,
  signal,
  setAppState,
  onProgress,
  callToolFn = callMCPTool,
  handleElicitation,
}: {
  client: ConnectedMCPServer
  clientConnection: MCPServerConnection
  tool: string
  args: Record<string, unknown>
  meta?: Record<string, unknown>
  signal: AbortSignal
  setAppState: (f: (prev: AppState) => AppState) => void
  onProgress?: (data: MCPProgress) => void
  /** 可注入用于测试。默认为 callMCPTool。 */
  callToolFn?: (opts: {
    client: ConnectedMCPServer
    tool: string
    args: Record<string, unknown>
    meta?: Record<string, unknown>
    signal: AbortSignal
    onProgress?: (data: MCPProgress) => void
  }) => Promise<MCPToolCallResult>
  /** 当没有钩子处理 URL 请求时的处理程序。
在 print/SDK 模式下，委托给 structuredIO。在 REPL 中，回退到队列。 */
  handleElicitation?: (
    serverName: string,
    params: ElicitRequestURLParams,
    signal: AbortSignal,
  ) => Promise<ElicitResult>
}): Promise<MCPToolCallResult> {
  const MAX_URL_ELICITATION_RETRIES = 3
  for (let attempt = 0; ; attempt++) {
    try {
      return await callToolFn({
        client: connectedClient,
        tool,
        args,
        meta,
        signal,
        onProgress,
      })
    } catch (error) {
      // MCP SDK 的协议会为错误响应创建普通的 McpError（而不是 UrlElicitatio
      // nRequiredError），因此我们检查错误代码而不是使用 instanceof。
      if (
        !(error instanceof McpError) ||
        error.code !== ErrorCode.UrlElicitationRequired
      ) {
        throw error
      }

      // 限制 URL 引导重试次数
      if (attempt >= MAX_URL_ELICITATION_RETRIES) {
        throw error
      }

      const errorData = error.data
      const rawElicitations =
        errorData != null &&
        typeof errorData === 'object' &&
        'elicitations' in errorData &&
        Array.isArray(errorData.elicitations)
          ? (errorData.elicitations as unknown[])
          : []

      // 验证每个元素是否包含 ElicitRequestURLParams 所需的字段
      const elicitations = rawElicitations.filter(
        (e): e is ElicitRequestURLParams => {
          if (e == null || typeof e !== 'object') return false
          const obj = e as Record<string, unknown>
          return (
            obj.mode === 'url' &&
            typeof obj.url === 'string' &&
            typeof obj.elicitationId === 'string' &&
            typeof obj.message === 'string'
          )
        },
      )

      const serverName =
        clientConnection.type === 'connected'
          ? clientConnection.name
          : 'unknown'

      if (elicitations.length === 0) {
        logMCPDebug(
          serverName,
          `工具 '${tool}' 返回了 -32042 错误，但错误数据中没有有效的引导信息`,
        )
        throw error
      }

      logMCPDebug(
        serverName,
        `工具 '${tool}' 需要 URL 引导（错误 -32042，第 ${attempt + 1} 次尝试），正在处理 ${elicitations.length} 个引导`,
      )

      // 处理错误中的每个 URL 引导。完成通知处理程
      // 序（在 registerElicitationHandler 中）会在匹配
      // 的队列事件上设置 `completed: true`；对话框会对此标志做出反应。
      for (const elicitation of elicitations) {
        const { elicitationId } = elicitation

        // 运行引导钩子 —— 它们可以通过编程方式解析 URL 引导
        const hookResponse = await runElicitationHooks(
          serverName,
          elicitation,
          signal,
        )
        if (hookResponse) {
          logMCPDebug(
            serverName,
            `URL 引导 ${elicitationId} 已通过钩子解析：${jsonStringify(hookResponse)}`,
          )
          if (hookResponse.action !== 'accept') {
            return {
              content: `URL 引导被钩子 ${hookResponse.action === 'decline' ? 'declined' : hookResponse.action + 'ed'}。工具 "${tool}" 无法完成，因为它需要用户打开一个 URL。`,
            }
          }
          // 钩子已接受 —— 跳过 UI 并继续重试
          continue
        }

        // 通过回调（打印/SDK 模式）或队列（REPL 模式）解析 URL 引导。
        let userResult: ElicitResult
        if (handleElicitation) {
          // 打印/SDK 模式：委托给 structuredIO，它会发送一个控制请求
          userResult = await handleElicitation(serverName, elicitation, signal)
        } else {
          // REPL 模式：为 ElicitationDialog 排队，采用两阶段同意/等待流程
          const waitingState: ElicitationWaitingState = {
            actionLabel: '立即重试',
            showCancel: true,
          }
          userResult = await new Promise<ElicitResult>(resolve => {
            const onAbort = () => {
              void resolve({ action: 'cancel' })
            }
            if (signal.aborted) {
              onAbort()
              return
            }
            signal.addEventListener('abort', onAbort, { once: true })

            setAppState(prev => ({
              ...prev,
              elicitation: {
                queue: [
                  ...prev.elicitation.queue,
                  {
                    serverName,
                    requestId: `error-elicit-${elicitationId}`,
                    params: elicitation,
                    signal,
                    waitingState,
                    respond: result => {
                      // 阶段 1 同意：接受是一个空操作（不会解析重试 Promise）
                      if (result.action === 'accept') {
                        return
                      }
                      // 拒绝或取消：解析重试 Promise
                      signal.removeEventListener('abort', onAbort)
                      void resolve(result)
                    },
                    onWaitingDismiss: action => {
                      signal.removeEventListener('abort', onAbort)
                      if (action === 'retry') {
                        void resolve({ action: 'accept' })
                      } else {
                        void resolve({ action: 'cancel' })
                      }
                    },
                  },
                ],
              },
            }))
          })
        }

        // 运行 ElicitationResult 钩子 —— 它们可以修改或阻止响应
        const finalResult = await runElicitationResultHooks(
          serverName,
          userResult,
          signal,
          'url',
          elicitationId,
        )

        if (finalResult.action !== 'accept') {
          logMCPDebug(
            serverName,
            `用户 ${finalResult.action === 'decline' ? 'declined' : finalResult.action + 'ed'} URL 引导 ${elicitationId}`,
          )
          return {
            content: `URL 引导被用户 ${finalResult.action === 'decline' ? 'declined' : finalResult.action + 'ed'}。工具 "${tool}" 无法完成，因为它需要用户打开一个 URL。`,
          }
        }

        logMCPDebug(
          serverName,
          `引导 ${elicitationId} 已完成，正在重试工具调用`,
        )
      }

      // 循环返回以重试工具调用
    }
  }
}

async function callMCPTool({
  client: { client, name, config },
  tool,
  args,
  meta,
  signal,
  onProgress,
}: {
  client: ConnectedMCPServer
  tool: string
  args: Record<string, unknown>
  meta?: Record<string, unknown>
  signal: AbortSignal
  onProgress?: (data: MCPProgress) => void
}): Promise<{
  content: MCPToolResult
  _meta?: Record<string, unknown>
  structuredContent?: Record<string, unknown>
}> {
  const toolStartTime = Date.now()
  let progressInterval: NodeJS.Timeout | undefined

  try {
    logMCPDebug(name, `正在调用 MCP 工具：${tool}`)

    // 为长时间运行的工具设置进度日志记录（每 30 秒）
    progressInterval = setInterval(
      (startTime, name, tool) => {
        const elapsed = Date.now() - startTime
        const elapsedSeconds = Math.floor(elapsed / 1000)
        const duration = `${elapsedSeconds}s`
        logMCPDebug(name, `工具 '${tool}' 仍在运行（已耗时 ${duration}）`)
      },
      30000, // 每 30 秒记录一次
      toolStartTime,
      name,
      tool,
    )

    // 使用 Promise.race 和我们自己的超时来处理 SD
    // K 内部超时不起作用的情况（例如，SSE 流在请求中途中断）
    const timeoutMs = getMcpToolTimeoutMs()
    let timeoutId: NodeJS.Timeout | undefined

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        (reject, name, tool, timeoutMs) => {
          reject(
            new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
              `MCP 服务器 "${name}" 的工具 "${tool}" 在 ${Math.floor(timeoutMs / 1000)} 秒后超时`,
              'MCP 工具超时',
            ),
          )
        },
        timeoutMs,
        reject,
        name,
        tool,
        timeoutMs,
      )
    })

    const result = await Promise.race([
      client.callTool(
        {
          name: tool,
          arguments: args,
          _meta: meta,
        },
        CallToolResultSchema,
        {
          signal,
          timeout: timeoutMs,
          onprogress: onProgress
            ? sdkProgress => {
                onProgress({
                  type: 'mcp_progress',
                  status: 'progress',
                  serverName: name,
                  toolName: tool,
                  progress: sdkProgress.progress,
                  total: sdkProgress.total,
                  progressMessage: sdkProgress.message,
                })
              }
            : undefined,
        },
      ),
      timeoutPromise,
    ]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    })

    if ('isError' in result && result.isError) {
      let errorDetails = '未知错误'
      if (
        'content' in result &&
        Array.isArray(result.content) &&
        result.content.length > 0
      ) {
        const firstContent = result.content[0]
        if (
          firstContent &&
          typeof firstContent === 'object' &&
          'text' in firstContent
        ) {
          errorDetails = firstContent.text
        }
      } else if ('error' in result) {
        // 旧版错误格式的回退处理
        errorDetails = String(result.error)
      }
      logMCPError(name, errorDetails)
      throw new McpToolCallError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
        errorDetails,
        'MCP 工具返回错误',
        '_meta' in result && result._meta ? { _meta: result._meta } : undefined,
      )
    }
    const elapsed = Date.now() - toolStartTime
    const duration =
      elapsed < 1000
        ? `${elapsed}ms`
        : elapsed < 60000
          ? `${Math.floor(elapsed / 1000)}s`
          : `${Math.floor(elapsed / 60000)}分 ${Math.floor((elapsed % 60000) / 1000)}秒`

    logMCPDebug(name, `工具 '${tool}' 在 ${duration} 内成功完成`)

    // 记录代码索引工具使用情况
    const codeIndexingTool = detectCodeIndexingFromMcpServerName(name)
    if (codeIndexingTool) {
      logEvent('tengu_code_indexing_tool_used', {
        tool: codeIndexingTool as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        source:
          'mcp' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        success: true,
      })
    }

    const content = await processMCPResult(result, tool, name)
    return {
      content,
      _meta: result._meta as Record<string, unknown> | undefined,
      structuredContent: result.structuredContent as
        | Record<string, unknown>
        | undefined,
    }
  } catch (e) {
    // 出错时清除定时器
    if (progressInterval !== undefined) {
      clearInterval(progressInterval)
    }

    const elapsed = Date.now() - toolStartTime

    if (e instanceof Error && e.name !== 'AbortError') {
      logMCPDebug(
        name,
        `工具 '${tool}' 在 ${Math.floor(elapsed / 1000)} 秒后失败：${e.message}`,
      )
    }

    // 检查表示 OAuth 令牌过期/无效的 401 错误。MCP SDK 的
    // StreamableHTTPError 有一个包含 HTTP 状态的 `code` 属性
    if (e instanceof Error) {
      const errorCode = 'code' in e ? (e.code as number | undefined) : undefined
      if (errorCode === 401 || e instanceof UnauthorizedError) {
        logMCPDebug(name, `工具调用返回 401 未授权 - 令牌可能已过期`)
        logEvent('tengu_mcp_tool_call_auth_error', {})
        throw new McpAuthError(
          name,
          `MCP 服务器 "${name}" 需要重新授权（令牌已过期）`,
        )
      }

      // 检查会话过期 — 这里可能出现两种错误形式：1. 服务器直接返
      // 回 404 + JSON-RPC -32001 (Streamable
      // HTTPError)。2. -32000 "连接已关闭" (McpErr
      // or) — SDK 在 onerror 处理程序触发后关闭传输，因此
      // 待处理的 callTool() 会拒绝并返回此派生错误
      // ，而不是原始的 404。在这两种情况下，请清除连接缓存，以便下一
      // 次工具调用创建新的会话。
      const isSessionExpired = isMcpSessionExpiredError(e)
      const isConnectionClosedOnHttp =
        'code' in e &&
        (e as Error & { code?: number }).code === -32000 &&
        e.message.includes('连接已关闭') &&
        (config.type === 'http' || config.type === 'claudeai-proxy')
      if (isSessionExpired || isConnectionClosedOnHttp) {
        logMCPDebug(
          name,
          `工具调用期间 MCP 会话已过期 (${isSessionExpired ? '404/-32001' : 'connection closed'})，正在清除连接缓存以重新初始化`,
        )
        logEvent('tengu_mcp_session_expired', {})
        await clearServerCache(name, config)
        throw new McpSessionExpiredError(name)
      }
    }

    // 当用户按下 esc 键时，避免日志刷屏
    if (!(e instanceof Error) || e.name !== 'AbortError') {
      throw e
    }
    return { content: undefined }
  } finally {
    // 始终清除定时器
    if (progressInterval !== undefined) {
      clearInterval(progressInterval)
    }
  }
}

function extractToolUseId(message: AssistantMessage): string | undefined {
  const firstBlock = (
    message.message.content as ContentBlockParam[] | undefined
  )?.[0]
  if (
    !firstBlock ||
    typeof firstBlock === 'string' ||
    firstBlock.type !== 'tool_use'
  ) {
    return undefined
  }
  return firstBlock.id
}

/** 通过创建传输并连接它们来设置 SDK MCP 客户端。
这用于与 SDK 在同一进程中运行的 SDK MCP 服务器。

@param sdkMcpConfigs - SDK MCP 服务器配置
@param sendMcpMessage - 通过控制通道发送 MCP 消息的回调函数
@returns 已连接的客户端、它们的工具以及用于消息路由的传输映射 */
export async function setupSdkMcpClients(
  sdkMcpConfigs: Record<string, McpSdkServerConfig>,
  sendMcpMessage: (
    serverName: string,
    message: JSONRPCMessage,
  ) => Promise<JSONRPCMessage>,
): Promise<{
  clients: MCPServerConnection[]
  tools: Tool[]
}> {
  const clients: MCPServerConnection[] = []
  const tools: Tool[] = []

  // 并行连接到所有服务器
  const results = await Promise.allSettled(
    Object.entries(sdkMcpConfigs).map(async ([name, config]) => {
      const transport = new SdkControlClientTransport(name, sendMcpMessage)

      const client = new Client(
        {
          name: 'claude-code',
          title: 'Claude Code',
          version: MACRO.VERSION ?? 'unknown',
          description: 'Anthropic 的智能编码工具',
          websiteUrl: PRODUCT_URL,
        },
        {
          capabilities: {},
        },
      )

      try {
        // 连接客户端
        await client.connect(transport)

        // 从服务器获取能力
        const capabilities = client.getServerCapabilities()

        // 创建已连接的客户端对象
        const connectedClient: MCPServerConnection = {
          type: 'connected',
          name,
          capabilities: capabilities || {},
          client,
          config: { ...config, scope: 'dynamic' as const },
          cleanup: async () => {
            await client.close()
          },
        }

        // 如果服务器有工具，则获取工具
        const serverTools: Tool[] = []
        if (capabilities?.tools) {
          const sdkTools = await fetchToolsForClient(connectedClient)
          serverTools.push(...sdkTools)
        }

        return {
          client: connectedClient,
          tools: serverTools,
        }
      } catch (error) {
        // 如果连接失败，返回失败的服务器
        logMCPError(name, `连接 SDK MCP 服务器失败：${error}`)
        return {
          client: {
            type: 'failed' as const,
            name,
            config: { ...config, scope: 'user' as const },
          },
          tools: [],
        }
      }
    }),
  )

  // 处理结果并收集客户端和工具
  for (const result of results) {
    if (result.status === 'fulfilled') {
      clients.push(result.value.client)
      tools.push(...result.value.tools)
    }
    // 如果被拒绝（意外情况），错误已在 Promise 内部记录
  }

  return { clients, tools }
}
