#!/usr/bin/env bun
/**
 * Dev entrypoint — launches cli.tsx with MACRO.* defines injected
 * via Bun's -d flag (bunfig.toml [define] doesn't propagate to
 * dynamically imported modules at runtime).
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMacroDefines, DEFAULT_BUILD_FEATURES } from './defines.ts'

// Resolve project root from this script's location
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')
const cliPath = join(projectRoot, 'src/entrypoints/cli.tsx')

const defines = getMacroDefines()

const defineArgs = Object.entries(defines).flatMap(([k, v]) => [
  '-d',
  `${k}:${v}`,
])

// Bun --feature flags: enable feature() gates at runtime.
// Uses the shared DEFAULT_BUILD_FEATURES list from defines.ts.

// Any env var matching FEATURE_<NAME>=1 will also enable that feature.
// e.g. FEATURE_PROACTIVE=1 bun run dev
const envFeatures = Object.entries(process.env)
  .filter(([k]) => k.startsWith('FEATURE_'))
  .map(([k]) => k.replace('FEATURE_', ''))

const allFeatures = [...new Set([...DEFAULT_BUILD_FEATURES, ...envFeatures])]
const featureArgs = allFeatures.flatMap(name => ['--feature', name])

// If BUN_INSPECT is set, pass --inspect-wait to the child process
const inspectArgs = process.env.BUN_INSPECT
  ? ['--inspect-wait=' + process.env.BUN_INSPECT]
  : []

const result = Bun.spawnSync(
  [
    'bun',
    ...inspectArgs,
    'run',
    ...defineArgs,
    ...featureArgs,
    cliPath,
    ...process.argv.slice(2),
  ],
  { stdio: ['inherit', 'inherit', 'inherit'], cwd: projectRoot },
)

process.exit(result.exitCode ?? 0)
