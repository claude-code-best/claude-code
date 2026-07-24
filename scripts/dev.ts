#!/usr/bin/env bun
/**
 * Dev entrypoint — launches cli.tsx with MACRO.* defines injected
 * via Bun's -d flag (bunfig.toml [define] doesn't propagate to
 * dynamically imported modules at runtime).
 */
import { buildSourceCliLaunchSpec } from './cli-launch.ts'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const launch = buildSourceCliLaunchSpec(projectRoot)

// If BUN_INSPECT is set, pass --inspect-wait to the child process
const inspectArgs = process.env.BUN_INSPECT
  ? ['--inspect-wait=' + process.env.BUN_INSPECT]
  : []

const result = Bun.spawnSync(
  [
    launch.execPath,
    ...inspectArgs,
    ...launch.scriptArgs,
    ...process.argv.slice(2),
  ],
  { stdio: ['inherit', 'inherit', 'inherit'], cwd: projectRoot },
)

process.exit(result.exitCode ?? 0)
