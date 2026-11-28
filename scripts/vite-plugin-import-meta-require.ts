import type { Plugin } from 'rollup'

/**
 * Rollup plugin that replaces `var __require = import.meta.require;`
 * with a Node.js compatible version that falls back to createRequire
 * when import.meta.require is not available (e.g. in Node.js runtime).
 *
 * This replicates the post-processing done in the original build.ts.
 */
export default function importMetaRequirePlugin(): Plugin {
  return {
    name: 'import-meta-require',

    renderChunk(code) {
      // Vite minifies output by default, so the exact-spaced literal never
      // matches. Use a whitespace-insensitive pattern to make the Node
      // compatibility shim apply to the published bundle.
      const pattern = /var\s+__require\s*=\s*import\.meta\.require\s*;?/g
      const replacement =
        'var __require = typeof import.meta.require === "function" ? import.meta.require : (await import("module")).createRequire(import.meta.url);'

      const patched = code.replace(pattern, replacement)
      return patched === code ? null : patched
    },
  }
}
