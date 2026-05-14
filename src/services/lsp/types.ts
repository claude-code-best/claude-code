import type { z } from 'zod/v4'
import { LspServerConfigSchema } from '../../utils/plugins/schemas.js'

/** 插件 manifest / `.lsp.json` 中的单条 LSP 服务器配置（由 Zod schema 推导）。 */
export type LspServerConfig = z.infer<ReturnType<typeof LspServerConfigSchema>>

/**
 * 插件动态注册时附带的作用域与来源插件名。
 * 与全局 user/project 配置区分，避免多插件同名冲突。
 */
export type ScopedLspServerConfig = LspServerConfig & {
  scope: 'dynamic' // 运行时由插件挂载的作用域标记
  source: string // 来源插件名（用于 `plugin:name:server` 前缀等）
}

/** LSP 子进程生命周期状态（由 `LSPServerInstance` 维护）。 */
export type LspServerState =
  | 'stopped' // 未启动或已完全退出
  | 'starting' // 正在拉起进程/握手
  | 'running' // 已初始化并可服务请求
  | 'stopping' // 正在优雅关闭
  | 'error' // 启动失败或运行期崩溃后的错误态
