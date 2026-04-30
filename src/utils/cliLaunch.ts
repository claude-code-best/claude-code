import { type ChildProcess, spawn, type SpawnOptions } from 'child_process'
import { isInBundledMode } from './bundledMode.js'
import { quote } from './bash/shellQuote.js'

/**
 * CliLaunchSpec — normalized descriptor for spawning a child CLI process.
 *
 * Every site that re-execs the CLI (daemon workers, bg sessions, bridge
 * sessions, assistant/RCS daemon launchers) should use this instead of
 * manually assembling `[...process.execArgv, process.argv[1]!, ...]`.
 *
 * Centralizing the bootstrap contract prevents the class of bugs where
 * individual spawn sites forget execArgv, windowsHide, or env propagation.
 */
export interface CliLaunchSpec {
  /** Runtime binary path (e.g. bun, node). */
  execPath: string
  /** Full argument list including bootstrap args and CLI args. */
  args: string[]
  /** Environment for the child process. */
  env: NodeJS.ProcessEnv
  /** Whether to hide the console window on Windows. */
  windowsHide: boolean
}

// ---------------------------------------------------------------------------
// Frozen bootstrap snapshot — computed once at module load time.
//
// Bun quirk (https://github.com/oven-sh/bun/issues/11673): in single-file
// executables, app arguments from process.argv can leak into process.execArgv.
// We snapshot and filter once, so every child gets a clean, stable set of
// runtime flags regardless of when buildCliLaunch is called.
// ---------------------------------------------------------------------------

/**
 * Filter out leaked application arguments from process.execArgv.
 * Only keep known runtime flags: -d (defines), --feature, --inspect variants.
 */
function sanitizeExecArgv(raw: readonly string[]): string[] {
  const result: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i]!
    // Bun define flags: -d KEY:VALUE or -dKEY:VALUE
    if (arg === '-d' || arg.startsWith('-d ') || arg.startsWith('-d\t')) {
      result.push(arg)
      if (arg === '-d' && i + 1 < raw.length) {
        result.push(raw[++i]!)
      }
      continue
    }
    if (arg.startsWith('-d') && arg.includes(':')) {
      result.push(arg)
      continue
    }
    // Bun feature flags: --feature NAME
    if (arg === '--feature') {
      result.push(arg)
      if (i + 1 < raw.length) {
        result.push(raw[++i]!)
      }
      continue
    }
    // Node/Bun inspect flags
    if (/^--inspect(-brk)?(=|$)/.test(arg)) {
      result.push(arg)
      continue
    }
    // Keep other known runtime flags (e.g. --conditions, --experimental-*)
    if (arg.startsWith('--') && !arg.includes('=') && i + 1 < raw.length) {
      // Unknown two-part flag — skip conservatively in bundled mode only
      if (isInBundledMode()) continue
      result.push(arg)
      result.push(raw[++i]!)
      continue
    }
    if (arg.startsWith('-') && !isInBundledMode()) {
      result.push(arg)
    }
  }
  return result
}

const BOOTSTRAP_ARGS: readonly string[] = Object.freeze(
  sanitizeExecArgv(process.execArgv),
)
const SCRIPT_PATH: string | undefined = process.argv[1]
const EXEC_PATH: string = process.execPath
const IS_WINDOWS = process.platform === 'win32'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a normalized launch spec for spawning a child CLI process.
 *
 * @param cliArgs  Arguments to pass to the CLI entrypoint (e.g. ['daemon', 'start'])
 * @param opts.env Override environment (defaults to process.env)
 */
export function buildCliLaunch(
  cliArgs: string[],
  opts?: { env?: NodeJS.ProcessEnv },
): CliLaunchSpec {
  const baseEnv = opts?.env ?? process.env

  // In bundled mode the execPath IS the CLI binary — no script path needed.
  // In script mode (dev / npm) we need the script path between runtime flags
  // and CLI args so the runtime knows which file to execute.
  const args: string[] =
    isInBundledMode() || !SCRIPT_PATH
      ? [...BOOTSTRAP_ARGS, ...cliArgs]
      : [...BOOTSTRAP_ARGS, SCRIPT_PATH, ...cliArgs]

  // Ensure Windows children can discover git-bash without shelling out
  const env: NodeJS.ProcessEnv = { ...baseEnv }
  if (IS_WINDOWS) {
    if (
      process.env.CLAUDE_CODE_GIT_BASH_PATH &&
      !env.CLAUDE_CODE_GIT_BASH_PATH
    ) {
      env.CLAUDE_CODE_GIT_BASH_PATH = process.env.CLAUDE_CODE_GIT_BASH_PATH
    }
    if (process.env.SHELL && !env.SHELL) {
      env.SHELL = process.env.SHELL
    }
  }

  return {
    execPath: EXEC_PATH,
    args,
    env,
    windowsHide: IS_WINDOWS,
  }
}

/**
 * Spawn a child CLI process from a launch spec.
 *
 * Callers provide transport-level options (stdio, detached, cwd) while the
 * spec handles bootstrap concerns (execPath, args, env, windowsHide).
 *
 * Windows note: `detached: true` on Windows creates a new console window
 * (unlike Unix where it only creates a new process group). Node.js uses
 * `windowsHide` to pass CREATE_NO_WINDOW, but Bun may not implement it.
 * As a fallback, we always set both `windowsHide: true` and keep
 * `detached` as-is — the child needs `detached` to outlive the parent.
 */
export function spawnCli(
  spec: CliLaunchSpec,
  spawnOpts: Omit<SpawnOptions, 'windowsHide'>,
): ChildProcess {
  return spawn(spec.execPath, spec.args, {
    ...spawnOpts,
    env: { ...spec.env, ...(spawnOpts.env as NodeJS.ProcessEnv) },
    windowsHide: spec.windowsHide,
  })
}

/**
 * Quote a launch spec into a single shell command string (for tmux).
 */
export function quoteCliLaunch(spec: CliLaunchSpec): string {
  return quote([spec.execPath, ...spec.args])
}

/**
 * Get the frozen bootstrap args snapshot.
 * Useful for call sites that need the raw args (e.g. bridgeMain deps).
 */
export function getBootstrapArgs(): readonly string[] {
  return BOOTSTRAP_ARGS
}

/**
 * Get the script path (process.argv[1] at startup).
 * Returns undefined in bundled mode.
 */
export function getScriptPath(): string | undefined {
  return SCRIPT_PATH
}
