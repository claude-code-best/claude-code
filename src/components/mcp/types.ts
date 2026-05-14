import type {
  ConfigScope,
  MCPServerConnection,
  McpClaudeAIProxyServerConfig,
  McpHTTPServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from '../../services/mcp/types.js'

/** `/mcp` 列表与菜单共用的服务器行基类字段。 */
type ServerInfoBase = {
  name: string // MCP 服务器规范化名称
  client: MCPServerConnection // 连接态与配置载体
  scope: ConfigScope // 配置来源作用域
}

/** stdio MCP 服务器在 `/mcp` 与插件管理 UI 中的展示形态。 */
export type StdioServerInfo = ServerInfoBase & {
  transport: 'stdio' // 标准输入输出子进程
  config: McpStdioServerConfig // stdio 启动参数
}

/** SSE MCP 服务器（含 OAuth 会话态）。 */
export type SSEServerInfo = ServerInfoBase & {
  transport: 'sse' // 服务端推送事件流
  isAuthenticated: boolean | undefined // OAuth/会话是否已就绪（未知时为 undefined）
  config: McpSSEServerConfig // SSE URL 与头等
}

/** Streamable HTTP MCP 服务器。 */
export type HTTPServerInfo = ServerInfoBase & {
  transport: 'http' // HTTP 流式或轮询类远端
  isAuthenticated: boolean | undefined // 远端鉴权是否完成
  config: McpHTTPServerConfig // HTTP 端点配置
}

/** Claude.ai 代理型 MCP 端点。 */
export type ClaudeAIServerInfo = ServerInfoBase & {
  transport: 'claudeai-proxy' // 经 Claude.ai 的代理通道
  isAuthenticated: boolean | undefined // 代理侧鉴权展示用
  config: McpClaudeAIProxyServerConfig // 代理 id/url 等
}

/** 非 agent 声明的、已连接 MCP 在 UI 中的判别联合。 */
export type ServerInfo =
  | StdioServerInfo
  | SSEServerInfo
  | HTTPServerInfo
  | ClaudeAIServerInfo

/**
 * 从 Agent frontmatter 提取、用于 `/mcp`「Agents」分组的 MCP 声明。
 * 字段按传输方式可选出现，便于菜单统一读取。
 */
export type AgentMcpServerInfo = {
  name: string // 在 agent 内声明的服务器名
  sourceAgents: string[] // 引用该声明的 agentType 列表
  transport: 'stdio' | 'sse' | 'http' | 'ws' // 传输类别
  command?: string // stdio：启动命令
  url?: string // 远端：基础 URL
  needsAuth: boolean // 是否依赖 OAuth/令牌
  /** 远程传输在 UI 中展示的 OAuth 状态（agent 声明路径下通常未知）。 */
  isAuthenticated?: boolean // UI 展示用；可选
}

/** `/mcp` 设置面板的视图状态机。 */
export type MCPViewState =
  | { type: 'list'; defaultTab?: string } // 服务器/Agents 列表；可选默认 tab
  | { type: 'server-menu'; server: ServerInfo } // 选中某服务器后的操作菜单
  | { type: 'server-tools'; server: ServerInfo } // 该服务器的工具列表
  | { type: 'server-tool-detail'; server: ServerInfo; toolIndex: number } // 单个工具详情
  | { type: 'agent-server-menu'; agentServer: AgentMcpServerInfo } // agent 声明的 MCP 菜单
