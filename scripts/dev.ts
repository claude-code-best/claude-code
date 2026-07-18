#!/usr/bin/env bun
/**
 * Dev entrypoint — launches cli.tsx with MACRO.* defines injected
 * via Bun's -d flag (bunfig.toml [define] doesn't propagate to
 * dynamically imported modules at runtime).
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMacroDefines, DEFAULT_BUILD_FEATURES } from './defines.ts'
import { resolveEnabledFeatures } from './feature-resolution.ts'

// Resolve project root from this script's location
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')
const cliPath = join(projectRoot, 'src/entrypoints/cli.tsx')

// Bun --feature flags: enable feature() gates at runtime.
// Uses the shared DEFAULT_BUILD_FEATURES list from defines.ts.

// FEATURE_<NAME> supports explicit true and false values. False values remove
// defaults, which makes FEATURE_X=0 behave like an actual off switch.
const allFeatures = resolveEnabledFeatures(DEFAULT_BUILD_FEATURES, process.env)
const featureArgs = allFeatures.flatMap(name => ['--feature', name])

const defines = {
  ...getMacroDefines(allFeatures),
  // React production mode — prevents 6,889+ _debugStack Error objects
  // (12MB) from accumulating during long-running sessions.
  // dev 模式使用 development 模式
  'process.env.NODE_ENV': JSON.stringify('production'),
}

const defineArgs = Object.entries(defines).flatMap(([k, v]) => [
  '-d',
  `${k}:${v}`,
])

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
