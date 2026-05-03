import { defineConfig, type Plugin } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import { getMacroDefines } from './scripts/defines'
import featureFlagsPlugin from './scripts/vite-plugin-feature-flags'
import importMetaRequirePlugin from './scripts/vite-plugin-import-meta-require'

const projectRoot = dirname(fileURLToPath(import.meta.url))

const acknowledgedBuildWarnings = [
  'src/utils/sandbox/sandbox-adapter.ts',
  'packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts',
  'src/utils/claudemd.ts',
  'src/services/SessionMemory/sessionMemoryUtils.ts',
  'src/commands/logout/logout.tsx',
  'src/utils/sessionStorage.ts',
  'src/utils/swarm/backends/registry.ts',
  'src/utils/toolSearch.ts',
  'src/utils/hooks.ts',
  'src/services/skillLearning/sessionObserver.ts',
  'src/utils/settings/changeDetector.ts',
]

function isAcknowledgedBuildWarning(warning: {
  code?: string
  id?: string
  message?: string
}): boolean {
  if (warning.code === 'EVAL' && warning.id?.includes('@protobufjs+inquire')) {
    return true
  }

  return (
    warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT' &&
    acknowledgedBuildWarnings.some(id => warning.message?.includes(id))
  )
}

/**
 * Plugin to import .md files as raw strings (Bun's text loader behavior).
 */
function rawAssetPlugin(extensions: string[]): Plugin {
  return {
    name: 'raw-asset',
    enforce: 'pre',
    resolveId(id, importer) {
      if (extensions.some(ext => id.endsWith(ext))) {
        // Resolve to actual file path
        return this.resolve(id, importer, { skipSelf: true })
      }
      return null
    },
    load(id) {
      if (extensions.some(ext => id.endsWith(ext))) {
        const content = readFileSync(id, 'utf-8')
        return `export default ${JSON.stringify(content)}`
      }
      return null
    },
  }
}

export default defineConfig({
  // CLI tool — no browser features needed
  appType: 'custom',

  // Tell Vite this is a Node.js build, not browser.
  // Prevents externalization of Node.js builtins (fs, path, etc.)
  ssr: {
    target: 'node',
    noExternal: true,
    // Packages with runtime require.resolve() or WASM binaries can't be
    // inlined into the bundle — they must be resolved from node_modules
    // at runtime.  doubaoime-asr uses opus-encdec which does
    // require.resolve('opus-encdec/dist/libopus-encoder.wasm.js').
    external: ['doubaoime-asr', 'opus-encdec'],
  },

  build: {
    emptyOutDir: true,
    outDir: 'dist',
    target: 'es2020',
    copyPublicDir: false,
    sourcemap: false,
    minify: false,

    // SSR build mode — uses Rollup with Node.js target
    ssr: true,

    rollupOptions: {
      input: resolve(projectRoot, 'src/entrypoints/cli.tsx'),

      output: {
        format: 'es',
        // Single-file build: no code splitting, all dynamic imports inlined
        codeSplitting: false,
        entryFileNames: 'cli.js',
      },

      plugins: [
        rawAssetPlugin(['.md', '.txt', '.html', '.css']),
        featureFlagsPlugin(),
        importMetaRequirePlugin(),
      ],

      onwarn(warning, defaultHandler) {
        if (isAcknowledgedBuildWarning(warning)) return
        defaultHandler(warning)
      },
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
      'src/': resolve(projectRoot, 'src/'),
    },
    // Ensure workspace packages share a single copy of these
    dedupe: ['react', 'react-reconciler', 'react-compiler-runtime'],
    // Resolve .js imports to .ts files (Bun does this automatically)
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
})
