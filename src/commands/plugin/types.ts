import type { LocalJSXCommandOnDone } from 'src/types/command.js'

/**
 * `/plugin` 根视图在子面板之间的导航状态。
 * 各分支对应不同子界面或从 CLI 参数解析出的初始路由。
 */
export type ViewState =
  | { type: 'menu' } // 返回插件功能总菜单
  | { type: 'help' } // 展示帮助说明
  | { type: 'validate'; path?: string } // 校验指定路径下的插件包
  | {
      type: 'browse-marketplace' // 在指定市场中浏览/安装插件
      targetMarketplace: string // 目标市场标识
      targetPlugin?: string // 可选：预选插件名
    }
  | { type: 'discover-plugins'; targetPlugin?: string } // 发现页；可预选搜索插件名
  | {
      type: 'manage-plugins' // 已安装插件管理（启用/禁用/卸载）
      targetPlugin?: string // 可选：聚焦某插件
      targetMarketplace?: string // 可选：与 targetPlugin 联用的市场
      action?: 'uninstall' | 'enable' | 'disable' // 可选：打开时直接执行的操作
    }
  | { type: 'marketplace-list' } // 列出已配置市场
  | { type: 'marketplace-menu' } // 市场相关子菜单
  | { type: 'add-marketplace'; initialValue?: string } // 添加市场；可预填 URL/名称
  | {
      type: 'manage-marketplaces' // 管理已保存的市场源
      targetMarketplace?: string // 可选：聚焦某市场
      action?: 'remove' | 'update' // 可选：移除或刷新该市场
    }

/** `/plugin` Ink 命令入口的 props。 */
export type PluginSettingsProps = {
  onComplete: LocalJSXCommandOnDone // 子流程结束回调（可带结果文案与展示方式）
  args?: string // CLI 透传的子命令参数字符串
  showMcpRedirectMessage?: boolean // 从 `/mcp` 跳转时展示 MCP 相关提示
}
