import type { Plugin } from "rollup";

/**
 * Rollup plugin that replaces `var __require = import.meta.require;`
 * with a Node.js compatible version that falls back to createRequire
 * when import.meta.require is not available (e.g. in Node.js runtime).
 *
 * This replicates the post-processing done in the original build.ts.
 */
export default function importMetaRequirePlugin(): Plugin {
  return {
    name: "import-meta-require",

    renderChunk(code) {
      const pattern = "var __require = import.meta.require;";
      const replacement =
        'var __require = typeof import.meta.require === "function" ? import.meta.require : (await import("module")).createRequire(import.meta.url);';

      if (code.includes(pattern)) {
        return code.replace(pattern, replacement);
      }
      return null;
    },
  };
}
