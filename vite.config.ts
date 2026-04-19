import { defineConfig, type Plugin } from "vite";
import { resolve, dirname } from "path";
import { readFileSync } from "fs";
import { getMacroDefines } from "./scripts/defines";
import featureFlagsPlugin from "./scripts/vite-plugin-feature-flags";
import importMetaRequirePlugin from "./scripts/vite-plugin-import-meta-require";

const projectRoot = dirname(new URL(import.meta.url).pathname);

/**
 * Plugin to import .md files as raw strings (Bun's text loader behavior).
 */
function rawAssetPlugin(extensions: string[]): Plugin {
  return {
    name: "raw-asset",
    enforce: "pre",
    resolveId(id, importer) {
      if (extensions.some((ext) => id.endsWith(ext))) {
        // Resolve to actual file path
        return this.resolve(id, importer, { skipSelf: true });
      }
      return null;
    },
    load(id) {
      if (extensions.some((ext) => id.endsWith(ext))) {
        const content = readFileSync(id, "utf-8");
        return `export default ${JSON.stringify(content)}`;
      }
      return null;
    },
  };
}

export default defineConfig({
  // CLI tool — no browser features needed
  appType: "custom",

  // Tell Vite this is a Node.js build, not browser.
  // Prevents externalization of Node.js builtins (fs, path, etc.)
  ssr: {
    target: "node",
    noExternal: true,
  },

  build: {
    emptyOutDir: true,
    outDir: "dist",
    target: "es2020",
    copyPublicDir: false,
    sourcemap: false,
    minify: false,

    // SSR build mode — uses Rollup with Node.js target
    ssr: true,

    rollupOptions: {
      input: resolve(projectRoot, "src/entrypoints/cli.tsx"),

      output: {
        format: "es",
        dir: "dist",
        entryFileNames: "cli.js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },

      // Externalize native addon packages (they contain .node binaries)
      external: [
        /audio-capture-napi/,
        /color-diff-napi/,
        /image-processor-napi/,
        /modifiers-napi/,
        /url-handler-napi/,
      ],

      plugins: [
        rawAssetPlugin([".md", ".txt", ".html", ".css"]),
        featureFlagsPlugin(),
        importMetaRequirePlugin(),
      ],
    },

    cssCodeSplit: false,
  },

  // Compile-time constant replacement (MACRO.* defines)
  define: {
    ...getMacroDefines(),
  },

  resolve: {
    alias: {
      // src/* path alias (mirrors tsconfig paths)
      "src/": resolve(projectRoot, "src/"),
    },
    // Ensure workspace packages share a single copy of these
    dedupe: ["react", "react-reconciler", "react-compiler-runtime"],
    // Resolve .js imports to .ts files (Bun does this automatically)
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
});
