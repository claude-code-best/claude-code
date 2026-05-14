import type {
  ConfigScope,
  MCPServerConnection,
} from '../../services/mcp/types.js'
import type { LoadedPlugin, PluginError } from '../../types/plugin.js'

import type { PersistablePluginScope } from '../../utils/plugins/pluginIdentifier.js'

/** 列表项作用域：含 MCP 的 `builtin` 与已下架插件的 `flagged`。 */
export type UnifiedInstalledScope = ConfigScope | 'builtin' | 'flagged'

/** 插件管理列表中 MCP 连接行的连接状态摘要。 */
export type McpRowStatus =
  | 'connected' // 已连接且可用
  | 'disabled' // 用户或策略禁用
  | 'pending' // 正在连接或重连
  | 'needs-auth' // 需 OAuth 等鉴权
  | 'failed' // 连接或握手失败

/**
 * 「已安装」统一列表中的一行：插件、失败占位、下架标记或 MCP 服务器。
 * 用于分页与键盘导航的同一数据源。
 */
export type UnifiedInstalledItem =
  | {
      type: 'plugin' // 正常加载的插件
      id: string // `name@marketplace` 唯一键
      name: string // 插件短名
      description: string | undefined // manifest 描述
      marketplace: string // 所属市场
      scope: PersistablePluginScope | 'builtin' // 安装/展示作用域（内置单独标）
      isEnabled: boolean // 是否在 merged settings 中启用
      errorCount: number // 与该插件关联的错误条数
      errors: PluginError[] // 结构化错误列表
      plugin: LoadedPlugin // 已解析的 manifest 与路径等
      pendingEnable?: boolean // UI：等待启用完成
      pendingUpdate?: boolean // UI：等待更新完成
      pendingToggle?: 'will-enable' | 'will-disable' // 用户已选、尚未落盘的启用切换
    }
  | {
      type: 'failed-plugin' // 未能加载的插件占位行
      id: string // 与错误 source 对齐的 id
      name: string // 展示用名称
      marketplace: string // 推断或 unknown
      scope: UnifiedInstalledScope // 推断的安装作用域
      errorCount: number
      errors: PluginError[]
    }
  | {
      type: 'flagged-plugin' // 市场已下架但仍出现在设置中的插件
      id: string
      name: string
      marketplace: string
      scope: 'flagged' // 固定为下架分组
      reason: string // 下架原因码（如 delisted）
      text: string // 面向用户的说明文案
      flaggedAt: string // 标记时间（ISO 等）
    }
  | {
      type: 'mcp' // 独立 MCP 或插件子 MCP 行
      id: string // 列表稳定 id（如 mcp:name）
      name: string // 展示名（子 MCP 可为 server 段）
      description: string | undefined // 可选副标题
      scope: UnifiedInstalledScope // 来自 server config 或父插件推导
      status: McpRowStatus // 连接态摘要
      client: MCPServerConnection // 底层连接对象（供详情/工具视图）
      indented?: boolean // true 表示挂在某插件下的子 MCP
    }
