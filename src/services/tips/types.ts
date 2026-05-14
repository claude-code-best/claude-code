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
}
