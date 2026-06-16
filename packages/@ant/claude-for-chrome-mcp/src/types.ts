/**
 * Logger 第二参数的可选类型。
 * 调用方通过 util.format 追加详情，实践中多为 catch 到的异常对象。
 */
export type LoggerDetail = Error | NodeJS.ErrnoException

/** 将 unknown 收窄为 LoggerDetail，供 catch 块传给 logger 使用。 */
export function toLoggerDetail(detail: unknown): LoggerDetail | undefined {
  return detail instanceof Error ? detail : undefined
}

/** 宿主注入的日志接口，与 DebugLogger（util.format）对齐。 */
export interface Logger {
  info: (message: string, detail?: LoggerDetail) => void // 信息
  error: (message: string, detail?: LoggerDetail) => void // 错误
  warn: (message: string, detail?: LoggerDetail) => void // 警告
  debug: (message: string, detail?: LoggerDetail) => void // 调试
  silly: (message: string, detail?: LoggerDetail) => void // 最细粒度调试
}

/**
 * Bridge 连接失败时的 error_type 枚举。
 * 由 bridgeClient 在 getUserId / getOAuthToken / WebSocket 创建失败时上报。
 */
export type ChromeBridgeConnectionErrorType =
  | 'no_user_id' // 无法获取用户 UUID
  | 'no_oauth_token' // 无法获取 OAuth token
  | 'websocket_error' // WebSocket 创建或运行异常

/** 工具调用相关遥测元数据（started / completed / timeout / error）。 */
export type ChromeBridgeToolCallMetadata = {
  tool_name: string // MCP 工具名
  tool_use_id: string // 本次调用的 UUID
  duration_ms?: number // 耗时（毫秒）
  timeout_ms?: number // 超时阈值（毫秒），仅 timeout 事件
  error_message?: string // 错误摘要（截断），仅 error 事件
}

/** Bridge 连接失败遥测元数据。 */
export type ChromeBridgeConnectionFailedMetadata = {
  duration_ms: number // 自连接开始到失败的耗时（毫秒）
  error_type: ChromeBridgeConnectionErrorType // 失败原因分类
  reconnect_attempt: number // 当前重连尝试次数
}

/** Bridge 开始连接遥测元数据。 */
export type ChromeBridgeConnectionStartedMetadata = {
  bridge_url: string // 目标 WebSocket URL（含用户路径）
}

/** Bridge 断开连接遥测元数据。 */
export type ChromeBridgeDisconnectedMetadata = {
  close_code: number // WebSocket 关闭码
  duration_since_connect_ms: number // 自连接成功到断开的时长（毫秒）
  reconnect_attempt: number // 即将进行的重连序号
}

/** Bridge 连接成功遥测元数据。 */
export type ChromeBridgeConnectionSucceededMetadata = {
  duration_ms: number // 自开始到连接就绪的耗时（毫秒）
  status: 'paired' | 'waiting' // paired=已配对扩展；waiting=等待扩展接入
}

/** Bridge 重连次数耗尽遥测元数据。 */
export type ChromeBridgeReconnectExhaustedMetadata = {
  total_attempts: number // 累计重连次数上限
}

/**
 * trackEvent 回调的 metadata 联合类型。
 * 各变体对应 bridgeClient 内 chrome_bridge_* 事件；null 表示无附加字段。
 */
export type ChromeBridgeTrackEventMetadata =
  | ChromeBridgeToolCallMetadata
  | ChromeBridgeConnectionFailedMetadata
  | ChromeBridgeConnectionStartedMetadata
  | ChromeBridgeDisconnectedMetadata
  | ChromeBridgeConnectionSucceededMetadata
  | ChromeBridgeReconnectExhaustedMetadata
  | null // 无元数据（如 peer_connected / peer_disconnected）

export type PermissionMode =
  | 'ask'
  | 'skip_all_permission_checks'
  | 'follow_a_plan'

export interface BridgeConfig {
  /** Bridge WebSocket base URL (e.g., wss://bridge.claudeusercontent.com) */
  url: string
  /** Returns the user's account UUID for the connection path */
  getUserId: () => Promise<string | undefined>
  /** Returns a valid OAuth token for bridge authentication */
  getOAuthToken: () => Promise<string | undefined>
  /** Optional dev user ID for local development (bypasses OAuth) */
  devUserId?: string
}

/** Metadata about a connected Chrome extension instance. */
export interface ChromeExtensionInfo {
  deviceId: string
  osPlatform?: string
  connectedAt: number
  name?: string
}

export interface ClaudeForChromeContext {
  serverName: string
  logger: Logger
  socketPath: string
  // Optional dynamic resolver for socket path. When provided, called on each
  // connection attempt to handle runtime conditions (e.g., TMPDIR mismatch).
  getSocketPath?: () => string
  // Optional resolver returning all available socket paths (for multi-profile support).
  // When provided, a socket pool connects to all sockets and routes by tab ID.
  getSocketPaths?: () => string[]
  clientTypeId: string // "desktop" | "claude-code"
  onToolCallDisconnected: () => string
  onAuthenticationError: () => void
  isDisabled?: () => boolean
  /** Bridge WebSocket configuration. When provided, uses bridge instead of socket. */
  bridgeConfig?: BridgeConfig
  /** If set, permission mode is sent to the extension immediately on bridge connection. */
  initialPermissionMode?: PermissionMode
  /** Bridge 遥测回调；eventName 为 chrome_bridge_* 事件名 */
  trackEvent?: (
    eventName: string, // 事件名
    metadata: ChromeBridgeTrackEventMetadata, // 事件元数据
  ) => void
  /** Called when user pairs with an extension via the browser pairing flow. */
  onExtensionPaired?: (deviceId: string, name: string) => void
  /** Returns the previously paired deviceId, if any. */
  getPersistedDeviceId?: () => string | undefined
  /** Called when a remote extension is auto-selected (only option available). */
  onRemoteExtensionWarning?: (ext: ChromeExtensionInfo) => void
}

/**
 * Map Node's process.platform to the platform string reported by Chrome extensions
 * via navigator.userAgentData.platform.
 */
export function localPlatformLabel(): string {
  return process.platform === 'darwin'
    ? 'macOS'
    : process.platform === 'win32'
      ? 'Windows'
      : 'Linux'
}

/** Permission request forwarded from the extension to the desktop for user approval. */
export interface BridgePermissionRequest {
  /** Links to the pending tool_call */
  toolUseId: string
  /** Unique ID for this permission request */
  requestId: string
  /** Tool type, e.g. "navigate", "click", "execute_javascript" */
  toolType: string
  /** The URL/domain context */
  url: string
  /** Additional action data (click coordinates, text, etc.) */
  actionData?: Record<string, unknown>
}

/** Desktop response to a bridge permission request. */
export interface BridgePermissionResponse {
  requestId: string
  allowed: boolean
}

/** Per-call permission overrides, allowing each session to use its own permission state. */
export interface PermissionOverrides {
  permissionMode: PermissionMode
  allowedDomains?: string[]
  /** Callback invoked when the extension requests user permission via the bridge. */
  onPermissionRequest?: (request: BridgePermissionRequest) => Promise<boolean>
}

/** Shared interface for McpSocketClient and McpSocketPool */
export interface SocketClient {
  ensureConnected(): Promise<boolean>
  callTool(
    name: string,
    args: Record<string, unknown>,
    permissionOverrides?: PermissionOverrides,
  ): Promise<unknown>
  isConnected(): boolean
  disconnect(): void
  setNotificationHandler(
    handler: (notification: {
      method: string
      params?: Record<string, unknown>
    }) => void,
  ): void
  /** Set permission mode for the current session. Only effective on BridgeClient. */
  setPermissionMode?(
    mode: PermissionMode,
    allowedDomains?: string[],
  ): Promise<void>
  /** Switch to a different browser. Only available on BridgeClient. */
  switchBrowser?(): Promise<
    | {
        deviceId: string
        name: string
      }
    | 'no_other_browsers'
    | null
  >
}
