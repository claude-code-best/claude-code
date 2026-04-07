import { spawn, type ChildProcess } from 'child_process'
import { resolve } from 'path'
import { errorMessage } from '../utils/errors.js'

/**
 * Exit code used by workers for permanent (non-retryable) failures.
 * @see workerRegistry.ts EXIT_CODE_PERMANENT
 */
const EXIT_CODE_PERMANENT = 78

/**
 * Backoff config for restarting crashed workers.
 */
const BACKOFF_INITIAL_MS = 2_000
const BACKOFF_CAP_MS = 120_000
const BACKOFF_MULTIPLIER = 2
const MAX_RAPID_FAILURES = 5 // Park worker after this many fast crashes

interface WorkerState {
  kind: string
  process: ChildProcess | null
  backoffMs: number
  failureCount: number
  parked: boolean
  lastStartTime: number
}

/**
 * Daemon supervisor entry point. Called from `cli.tsx` via:
 *   `claude daemon [subcommand]`
 *
 * Starts and supervises long-running workers. Currently spawns one
 * `remoteControl` worker that runs the headless bridge server.
 *
 * Subcommands:
 *   (none)  — start the supervisor with default workers
 *   start   — same as no subcommand
 *   status  — print worker status (TODO: IPC)
 *   stop    — send SIGTERM to supervisor (TODO: PID file)
 */
export async function daemonMain(args: string[]): Promise<void> {
  const subcommand = args[0] || 'start'

  switch (subcommand) {
    case 'start':
      await runSupervisor(args.slice(1))
      break
    case 'status':
      console.log('daemon status: not yet implemented (requires IPC)')
      break
    case 'stop':
      console.log('daemon stop: not yet implemented (requires PID file)')
      break
    case '--help':
    case '-h':
      printHelp()
      break
    default:
      console.error(`Unknown daemon subcommand: ${subcommand}`)
      printHelp()
      process.exitCode = 1
  }
}

function printHelp(): void {
  console.log(`
Claude Code Daemon — persistent background supervisor

USAGE
  claude daemon [subcommand] [options]

SUBCOMMANDS
  start       Start the daemon supervisor (default)
  status      Show worker status
  stop        Stop the daemon

OPTIONS
  --dir <path>              Working directory (default: current)
  --spawn-mode <mode>       Worker spawn mode: same-dir | worktree (default: same-dir)
  --capacity <N>            Max concurrent sessions per worker (default: 4)
  --permission-mode <mode>  Permission mode for spawned sessions
  --sandbox                 Enable sandbox mode
  --name <name>             Session name
  -h, --help                Show this help
`)
}

/**
 * Parse supervisor arguments from CLI.
 */
function parseSupervisorArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--dir' && i + 1 < args.length) {
      result.dir = resolve(args[++i]!)
    } else if (arg.startsWith('--dir=')) {
      result.dir = resolve(arg.slice('--dir='.length))
    } else if (arg === '--spawn-mode' && i + 1 < args.length) {
      result.spawnMode = args[++i]!
    } else if (arg.startsWith('--spawn-mode=')) {
      result.spawnMode = arg.slice('--spawn-mode='.length)
    } else if (arg === '--capacity' && i + 1 < args.length) {
      result.capacity = args[++i]!
    } else if (arg.startsWith('--capacity=')) {
      result.capacity = arg.slice('--capacity='.length)
    } else if (arg === '--permission-mode' && i + 1 < args.length) {
      result.permissionMode = args[++i]!
    } else if (arg.startsWith('--permission-mode=')) {
      result.permissionMode = arg.slice('--permission-mode='.length)
    } else if (arg === '--sandbox') {
      result.sandbox = '1'
    } else if (arg === '--name' && i + 1 < args.length) {
      result.name = args[++i]!
    } else if (arg.startsWith('--name=')) {
      result.name = arg.slice('--name='.length)
    }
  }
  return result
}

/**
 * Run the daemon supervisor loop. Spawns workers and restarts them
 * on crash with exponential backoff.
 */
async function runSupervisor(args: string[]): Promise<void> {
  const config = parseSupervisorArgs(args)
  const dir = config.dir || resolve('.')

  console.log(`[daemon] supervisor starting in ${dir}`)

  const workers: WorkerState[] = [
    {
      kind: 'remoteControl',
      process: null,
      backoffMs: BACKOFF_INITIAL_MS,
      failureCount: 0,
      parked: false,
      lastStartTime: 0,
    },
  ]

  const controller = new AbortController()

  // Graceful shutdown
  const shutdown = () => {
    console.log('[daemon] supervisor shutting down...')
    controller.abort()
    for (const w of workers) {
      if (w.process && !w.process.killed) {
        w.process.kill('SIGTERM')
      }
    }
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // Spawn and supervise workers
  for (const worker of workers) {
    if (!controller.signal.aborted) {
      spawnWorker(worker, dir, config, controller.signal)
    }
  }

  // Wait for abort signal
  await new Promise<void>(resolve => {
    if (controller.signal.aborted) {
      resolve()
      return
    }
    controller.signal.addEventListener('abort', () => resolve(), { once: true })
  })

  // Wait for all workers to exit
  await Promise.all(
    workers
      .filter(w => w.process && !w.process.killed)
      .map(
        w =>
          new Promise<void>(resolve => {
            if (!w.process) {
              resolve()
              return
            }
            w.process.on('exit', () => resolve())
            // Force kill after grace period
            setTimeout(() => {
              if (w.process && !w.process.killed) {
                w.process.kill('SIGKILL')
              }
              resolve()
            }, 30_000)
          }),
      ),
  )

  console.log('[daemon] supervisor stopped')
}

/**
 * Spawn a worker child process with the appropriate env vars.
 */
function spawnWorker(
  worker: WorkerState,
  dir: string,
  config: Record<string, string>,
  signal: AbortSignal,
): void {
  if (signal.aborted || worker.parked) return

  worker.lastStartTime = Date.now()

  const env: Record<string, string | undefined> = {
    ...process.env,
    DAEMON_WORKER_DIR: dir,
    DAEMON_WORKER_NAME: config.name,
    DAEMON_WORKER_SPAWN_MODE: config.spawnMode || 'same-dir',
    DAEMON_WORKER_CAPACITY: config.capacity || '4',
    DAEMON_WORKER_PERMISSION: config.permissionMode,
    DAEMON_WORKER_SANDBOX: config.sandbox || '0',
    DAEMON_WORKER_CREATE_SESSION: '1',
    CLAUDE_CODE_SESSION_KIND: 'daemon-worker',
  }

  // Build the worker command: reuse the same entrypoint with --daemon-worker flag
  const execArgs = [
    ...process.execArgv,
    process.argv[1]!,
    `--daemon-worker=${worker.kind}`,
  ]

  console.log(`[daemon] spawning worker '${worker.kind}'`)

  const child = spawn(process.execPath, execArgs, {
    env,
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  worker.process = child

  // Pipe worker stdout/stderr to supervisor with prefix
  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().trimEnd().split('\n')
    for (const line of lines) {
      console.log(`  ${line}`)
    }
  })
  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().trimEnd().split('\n')
    for (const line of lines) {
      console.error(`  ${line}`)
    }
  })

  child.on('exit', (code, sig) => {
    worker.process = null

    if (signal.aborted) {
      // Supervisor is shutting down, don't restart
      return
    }

    if (code === EXIT_CODE_PERMANENT) {
      console.error(
        `[daemon] worker '${worker.kind}' exited with permanent error — parking`,
      )
      worker.parked = true
      return
    }

    // Check for rapid failure (crashed within 10s of starting)
    const runDuration = Date.now() - worker.lastStartTime
    if (runDuration < 10_000) {
      worker.failureCount++
      if (worker.failureCount >= MAX_RAPID_FAILURES) {
        console.error(
          `[daemon] worker '${worker.kind}' failed ${worker.failureCount} times rapidly — parking`,
        )
        worker.parked = true
        return
      }
    } else {
      // Ran for a reasonable time, reset failure count
      worker.failureCount = 0
      worker.backoffMs = BACKOFF_INITIAL_MS
    }

    console.log(
      `[daemon] worker '${worker.kind}' exited (code=${code}, signal=${sig}), restarting in ${worker.backoffMs}ms`,
    )

    setTimeout(() => {
      if (!signal.aborted && !worker.parked) {
        spawnWorker(worker, dir, config, signal)
      }
    }, worker.backoffMs)

    // Exponential backoff
    worker.backoffMs = Math.min(
      worker.backoffMs * BACKOFF_MULTIPLIER,
      BACKOFF_CAP_MS,
    )
  })
}
