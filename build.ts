import { readdir, readFile, writeFile, cp } from 'fs/promises'
import { join } from 'path'
import { getMacroDefines } from './scripts/defines.ts'

const outdir = 'dist'

// Step 1: Clean output directory
const { rmSync } = await import('fs')
rmSync(outdir, { recursive: true, force: true })

// Default features that match the official CLI build.
// Additional features can be enabled via FEATURE_<NAME>=1 env vars.
const DEFAULT_BUILD_FEATURES = [
  'AGENT_TRIGGERS_REMOTE',
  'CHICAGO_MCP',
  'VOICE_MODE',
  'SHOT_STATS',
  'PROMPT_CACHE_BREAK_DETECTION',
  'TOKEN_BUDGET',
  // P0: local features
  'AGENT_TRIGGERS',
  'ULTRATHINK',
  'BUILTIN_EXPLORE_PLAN_AGENTS',
  'LODESTONE',
  // P1: API-dependent features
  'EXTRACT_MEMORIES',
  'VERIFICATION_AGENT',
  'KAIROS_BRIEF',
  'AWAY_SUMMARY',
  'ULTRAPLAN',
  // P2: daemon + remote control server
  'DAEMON',
  // PR-package restored features
  'WORKFLOW_SCRIPTS',
  'HISTORY_SNIP',
  'CONTEXT_COLLAPSE',
  'MONITOR_TOOL',
  'FORK_SUBAGENT',
//   'UDS_INBOX',
  'KAIROS',
  'COORDINATOR_MODE',
  'LAN_PIPES',
  // 'REVIEW_ARTIFACT', // API 请求无响应，需进一步排查 schema 兼容性
  // P3: poor mode (disable extract_memories + prompt_suggestion)
  'POOR',
]

// Collect FEATURE_* env vars → Bun.build features
const envFeatures = Object.keys(process.env)
  .filter(k => k.startsWith('FEATURE_'))
  .map(k => k.replace('FEATURE_', ''))
const features = [...new Set([...DEFAULT_BUILD_FEATURES, ...envFeatures])]

// Step 2: Bundle with splitting
const result = await Bun.build({
  entrypoints: ['src/entrypoints/cli.tsx'],
  outdir,
  target: 'bun',
  splitting: true,
  define: getMacroDefines(),
  features,
})

if (!result.success) {
  console.error('Build failed:')
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Step 3: Post-process — replace Bun-only `import.meta.require` with Node.js compatible version
const files = await readdir(outdir)
const IMPORT_META_REQUIRE = 'var __require = import.meta.require;'
const COMPAT_REQUIRE = `var __require = typeof import.meta.require === "function" ? import.meta.require : (await import("module")).createRequire(import.meta.url);`

let patched = 0
for (const file of files) {
  if (!file.endsWith('.js')) continue
  const filePath = join(outdir, file)
  const content = await readFile(filePath, 'utf-8')
  if (content.includes(IMPORT_META_REQUIRE)) {
    await writeFile(
      filePath,
      content.replace(IMPORT_META_REQUIRE, COMPAT_REQUIRE),
    )
    patched++
  }
}

console.log(
  `Bundled ${result.outputs.length} files to ${outdir}/ (patched ${patched} for Node.js compat)`,
)

// Step 4: Copy native .node addon files (audio-capture)
const vendorDir = join(outdir, 'vendor', 'audio-capture')
await cp('vendor/audio-capture', vendorDir, { recursive: true })
console.log(`Copied vendor/audio-capture/ → ${vendorDir}/`)

// Step 5: Bundle download-ripgrep script as standalone JS for postinstall
const rgScript = await Bun.build({
  entrypoints: ['scripts/download-ripgrep.ts'],
  outdir,
  target: 'node',
})
if (!rgScript.success) {
  console.error('Failed to bundle download-ripgrep script:')
  for (const log of rgScript.logs) {
    console.error(log)
  }
  // Non-fatal — postinstall fallback to bun run scripts/download-ripgrep.ts
} else {
  console.log(`Bundled download-ripgrep script to ${outdir}/`)
}

// Step 6: Generate cli-bun and cli-node executable entry points
const cliBun = join(outdir, 'cli-bun.js')
const cliNode = join(outdir, 'cli-node.js')

await writeFile(cliBun, '#!/usr/bin/env bun\nimport "./cli.js"\n')

// Node.js entry needs a Bun API polyfill because Bun.build({ target: 'bun' })
// emits globalThis.Bun references (e.g. Bun.$ shell tag in computer-use-input,
// Bun.which in chunk-ys6smqg9) that crash at import time under plain Node.js.
const NODE_BUN_POLYFILL = `#!/usr/bin/env node
// Bun API polyfill for Node.js runtime
if (typeof globalThis.Bun === "undefined") {
  const { execFileSync } = await import("child_process");
  const { resolve, delimiter } = await import("path");
  const { accessSync, constants: { X_OK } } = await import("fs");
  function which(bin) {
    const isWin = process.platform === "win32";
    const pathExt = isWin ? (process.env.PATHEXT || ".EXE").split(";") : [""];
    for (const dir of (process.env.PATH || "").split(delimiter)) {
      for (const ext of pathExt) {
        const candidate = resolve(dir, bin + ext);
        try { accessSync(candidate, X_OK); return candidate; } catch {}
      }
    }
    return null;
  }
  // Bun.$ is the shell template tag (e.g. $\`osascript ...\`). Only used by
  // computer-use-input/darwin — stub it so the top-level destructuring
  // \`var { $ } = globalThis.Bun\` doesn't crash.
  function $(parts, ...args) {
    throw new Error("Bun.$ shell API is not available in Node.js. Use Bun runtime for this feature.");
  }
  globalThis.Bun = { which, $ };
}
import "./cli.js"
`
await writeFile(cliNode, NODE_BUN_POLYFILL)
// NOTE: when new Bun-specific globals appear in bundled output, add them here.

// Make both executable
const { chmodSync } = await import('fs')
chmodSync(cliBun, 0o755)
chmodSync(cliNode, 0o755)

console.log(`Generated ${cliBun} (shebang: bun) and ${cliNode} (shebang: node)`)
