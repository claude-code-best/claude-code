#!/usr/bin/env bun
/**
 * Dev entrypoint — launches cli.tsx with MACRO.* defines injected
 * via Bun's -d flag (bunfig.toml [define] doesn't propagate to
 * dynamically imported modules at runtime).
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMacroDefines, DEFAULT_BUILD_FEATURES } from './defines.ts'
import { readFileSync } from 'node:fs'

// Resolve project root from this script's location
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')
const cliPath = join(projectRoot, 'src/entrypoints/cli.tsx')

const defines = {
  ...getMacroDefines(),
  // React production mode — prevents 6,889+ _debugStack Error objects
  // (12MB) from accumulating during long-running sessions.
  // dev 模式使用 development 模式
  'process.env.NODE_ENV': JSON.stringify('production'),
}

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

/**
 * 修复：Windows下自动拿到bun.exe，避开bun.cmd，Mac/Linux保持 "bun"
 */
function resolveBunExecutable(): string {
  if (process.platform !== 'win32') {
    return 'bun'
  }

  const bunPath = Bun.which('bun')
  if (!bunPath) {
    throw new Error('环境变量 PATH 中未找到 bun')
  }

  // 已经是 bun.exe，直接返回
  if (!bunPath.endsWith('.cmd')) {
    return bunPath
  }

  try {
    const cmdContent = readFileSync(bunPath, 'utf8')
    // Match pattern: "%dp0%path\to\bun.exe"
    const execMatch = cmdContent.match(/"%dp0%([^"]+)"/)
    if (execMatch) {
      const cmdDirectory = dirname(bunPath)
      return join(cmdDirectory, execMatch[1])
    }
  } catch {
    // 解析失败，降级回原始 cmd 路径（回到原来的报错，不会直接崩溃）
  }
  return bunPath
}

const bunCmd = resolveBunExecutable()

const result = Bun.spawnSync(
  [
    bunCmd,
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
