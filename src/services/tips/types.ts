import type { ThemeName } from '@anthropic/ink'
import type { FileStateCache } from '../../utils/fileStateCache.js'

/** Spinner 提示评估时可用的会话上下文（字段可按调用场景部分提供）。 */
export type TipContext = {
  theme?: ThemeName // 当前终端主题名，用于 `color()` 等着色
  readFileState?: FileStateCache // 近期已读文件 LRU，用于文件类相关性判断
  bashTools?: Set<string> // 本会话出现过的 bash 子命令集合
}

/** 内置或用户自定义的 Spinner 提示条目。 */
export type Tip = {
  id: string // 稳定 id：用于冷却与历史去重
  content: (ctx?: TipContext) => Promise<string> // 异步生成 Spinner 旁提示文案
  cooldownSessions: number // 至少间隔多少会话后才可再次展示
  isRelevant?: (ctx?: TipContext) => Promise<boolean> // 可选：当前是否应展示该条
  /**
   * 终身最多展示次数（跨所有会话的硬上限）。达到后该 tip 永不再出现。
   * 未设置（undefined）表示无终身上限，仅受 cooldownSessions 约束。
   * 计数持久化在全局配置的 tipsShowCounts 中。
   */
  maxLifetimeShows?: number
  /**
   * 该 tip 宣传的命令名（不含斜杠，如 "voice" 对应 /voice）。
   * 用于调度层与埋点（如统计哪些命令被 tip 带来曝光）；文案中的
   * /command 高亮由 content 自身负责（content 生成时可自行着色）。
   */
  advertisedCommand?: string
  /**
   * 调度优先级：数字越小越优先。仅在多个候选 tip 的"距上次展示的
   * 会话数"相同（平局）时作为决胜条件；未设置视为最低优先级。
   */
  priority?: number
  /**
   * 是否与 API provider 无关（第三方兼容层如 OpenAI/Gemini/Grok 端点
   * 也可展示）。未设置（undefined）视为 false：在第三方 provider 下
   * 会被过滤，仅 providerAgnostic: true 的内置 tip 参与调度。
   * 用户自定义 tips 不受此限制。
   */
  providerAgnostic?: boolean
}
