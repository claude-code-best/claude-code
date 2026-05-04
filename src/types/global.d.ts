/** 全局声明，用于编译时宏和仅内部标识符，这些通过 Bun 的 MACRO/打包功能系统被消除。 */

// ============================================================================
// MACRO — Bun 编译时常量，通过 bunfig.toml [define]（开发环境）和 Bun.bu
// ild({ define })（生产环境）注入。参见 bunfig.toml 和 build.ts。
declare namespace MACRO {
  export const VERSION: string
  export const BUILD_TIME: string
  export const FEEDBACK_CHANNEL: string
  export const ISSUES_EXPLAINER: string
  export const NATIVE_PACKAGE_URL: string
  export const PACKAGE_URL: string
  export const VERSION_CHANGELOG: string
}

// ============================================================================
// 内部 Anthropic 专用标识符（在开源版本中作为死代码消除）这些在 `MA
// CRO(() => ...)` 或 `false && ...` 块中被引用。

// Model resolution (internal)
declare function resolveAntModel(
  model: string,
): import('../utils/model/antModels.js').AntModel | undefined
declare function getAntModels(): import('../utils/model/antModels.js').AntModel[]
declare function getAntModelOverrideConfig(): {
  defaultSystemPromptSuffix?: string
  [key: string]: unknown
} | null

// 伴侣反应由 src/buddy/companionReact.ts 处理（直接导入）

// Metrics (internal)
type ApiMetricEntry = {
  ttftMs: number
  firstTokenTime: number
  lastTokenTime: number
  responseLengthBaseline: number
  endResponseLength: number
}
declare const apiMetricsRef: React.RefObject<ApiMetricEntry[]> | null
declare function computeTtftText(metrics: ApiMetricEntry[]): string

// 门控/功能系统（内部）
declare const Gates: Record<string, boolean>
declare function GateOverridesWarning(): JSX.Element | null
declare function ExperimentEnrollmentNotice(): JSX.Element | null

// 钩子时序阈值（从 services/tools/toolExecution.ts 重新导出）
declare const HOOK_TIMING_DISPLAY_THRESHOLD_MS: number

// Ultraplan（内部）声明函数
// UltraplanChoiceDialog(props: Record<string, unknown>): JSX.Element | null 声
// 明函数 UltraplanLaunchDialog(props: Record<string, unknown>): JSX.Element | nul
// l 声明函数 launchUltraplan(...args: unknown[]): Promise<string>

// T — 泛型类型参数从 React 编译器输出泄漏（react
// /compiler-runtime 发出编译后的 JSX，丢失了泛型类型参数）
declare type T = unknown

// Tungsten (internal)
declare function TungstenPill(props?: {
  key?: string
  selected?: boolean
}): JSX.Element | null

// ============================================================================
// 构建时常量 BUILD_TARGET/BUILD_ENV/INTERFACE_TYPE — 已移除（零运行时使用）

// ============================================================================
// Ink 自定义 JSX 固有元素 — 参见 src/types/ink-jsx.d.ts

// ============================================================================
// Bun 文本/文件加载器 — 允许将非 TS 资源作为字符串导入
declare module '*.md' {
  const content: string
  export default content
}
declare module '*.txt' {
  const content: string
  export default content
}
declare module '*.html' {
  const content: string
  export default content
}
declare module '*.css' {
  const content: string
  export default content
}
