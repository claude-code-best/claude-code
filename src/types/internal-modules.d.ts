/**
 * Type declarations for internal Anthropic packages that cannot be installed
 * from public npm. All exports are typed as `any` to suppress errors while
 * still allowing IDE navigation for the actual source code.
 */

// ============================================================================
// bun:bundle — compile-time macros
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

// Third-party modules without @types packages
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

declare module '@napi-rs/keyring' {
  export class Entry {
    constructor(service: string, account: string)
    getPassword(): string | null
    setPassword(password: string): void
    deletePassword(): boolean
  }
}
