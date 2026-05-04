/**
 * 无法从公共 npm 安装的 Anthropic 内部包的类型声明。所有导出均类型化为 `any` 以抑制错误，同时仍允许 IDE 导航到实际源代码。
 */

// ============================================================================
// bun:bundle — 编译时宏
// ============================================================================
declare module 'bun:bundle' {
  export function feature(name: string): boolean
}

declare module 'bun:ffi' {
  export function dlopen<
    T extends Record<string, { args: readonly string[]; returns: string }>,
  >(
    path: string,
    symbols: T,
  ): {
    symbols: { [K in keyof T]: (...args: unknown[]) => unknown }
    close(): void
  }
}

// 没有 @types 包的第三方模块
declare module 'bidi-js' {
  function getEmbeddingLevels(
    text: string,
    defaultDirection?: string,
  ): { paragraphLevel: number; levels: Uint8Array }
  function getReorderSegments(
    text: string,
    embeddingLevels: { paragraphLevel: number; levels: Uint8Array },
    start?: number,
    end?: number,
  ): [number, number][]
  function getVisualOrder(reorderSegments: [number, number][]): number[]
  export { getEmbeddingLevels, getReorderSegments, getVisualOrder }
  export default { getEmbeddingLevels, getReorderSegments, getVisualOrder }
}

declare module 'asciichart' {
  function plot(
    series: number[] | number[][],
    config?: Record<string, unknown>,
  ): string
  export { plot }
  export default { plot }
}
