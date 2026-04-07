import { resolve } from 'path'
import {
  type HeadlessBridgeOpts,
  BridgeHeadlessPermanentError,
  runBridgeHeadless,
} from '../bridge/bridgeMain.js'
import { getClaudeAIOAuthTokens } from '../utils/auth.js'
import { errorMessage } from '../utils/errors.js'

/**
 * Exit codes the supervisor uses to decide retry vs park.
 * Permanent errors (trust not accepted, no git repo for worktree) use
 * EXIT_CODE_PERMANENT so the supervisor doesn't waste cycles retrying.
 */
const EXIT_CODE_PERMANENT = 78 // EX_CONFIG from sysexits.h
const EXIT_CODE_TRANSIENT = 1

/**
 * Daemon worker entry point. Called from `cli.tsx` via:
 *   `claude --daemon-worker=<kind>`
 *
 * The supervisor spawns this as a child process. Each `kind` maps to a
 * different long-running task. Currently only `remoteControl` is implemented
 * — it runs the headless bridge loop that accepts remote sessions.
 */
export async function runDaemonWorker(kind?: string): Promise<void> {
  if (!kind) {
    console.error('Error: --daemon-worker requires a worker kind')
    process.exitCode = EXIT_CODE_PERMANENT
    return
  }

  switch (kind) {
    case 'remoteControl':
      await runRemoteControlWorker()
      break
    default:
      console.error(`Error: unknown daemon worker kind '${kind}'`)
      process.exitCode = EXIT_CODE_PERMANENT
  }
}

/**
 * Remote Control worker — runs `runBridgeHeadless()` with config from
 * environment variables set by the daemon supervisor.
 *
 * Environment variables (set by daemonMain):
 *   DAEMON_WORKER_DIR          — working directory
 *   DAEMON_WORKER_NAME         — optional session name
 *   DAEMON_WORKER_SPAWN_MODE   — 'same-dir' | 'worktree'
 *   DAEMON_WORKER_CAPACITY     — max concurrent sessions
 *   DAEMON_WORKER_PERMISSION   — permission mode
 *   DAEMON_WORKER_SANDBOX      — '1' for sandbox mode
 *   DAEMON_WORKER_TIMEOUT_MS   — session timeout in ms
 *   DAEMON_WORKER_CREATE_SESSION — '1' to pre-create session on start
 */
async function runRemoteControlWorker(): Promise<void> {
  const dir = process.env.DAEMON_WORKER_DIR || resolve('.')
  const name = process.env.DAEMON_WORKER_NAME || undefined
  const spawnMode =
    (process.env.DAEMON_WORKER_SPAWN_MODE as 'same-dir' | 'worktree') ||
    'same-dir'
  const capacity = parseInt(process.env.DAEMON_WORKER_CAPACITY || '4', 10)
  const permissionMode = process.env.DAEMON_WORKER_PERMISSION || undefined
  const sandbox = process.env.DAEMON_WORKER_SANDBOX === '1'
  const sessionTimeoutMs = process.env.DAEMON_WORKER_TIMEOUT_MS
    ? parseInt(process.env.DAEMON_WORKER_TIMEOUT_MS, 10)
    : undefined
  const createSessionOnStart = process.env.DAEMON_WORKER_CREATE_SESSION !== '0'

  const controller = new AbortController()

  // Graceful shutdown on SIGTERM/SIGINT from supervisor
  const onSignal = () => controller.abort()
  process.on('SIGTERM', onSignal)
  process.on('SIGINT', onSignal)

  const opts: HeadlessBridgeOpts = {
    dir,
    name,
    spawnMode,
    capacity,
    permissionMode,
    sandbox,
    sessionTimeoutMs,
    createSessionOnStart,
    getAccessToken: () => getClaudeAIOAuthTokens()?.accessToken,
    onAuth401: async (_failedToken: string) => {
      // In daemon context, re-check auth — supervisor may have refreshed token.
      const tokens = getClaudeAIOAuthTokens()
      return !!tokens?.accessToken
    },
    log: (s: string) => {
      console.log(`[remoteControl] ${s}`)
    },
  }

  try {
    await runBridgeHeadless(opts, controller.signal)
  } catch (err) {
    if (err instanceof BridgeHeadlessPermanentError) {
      console.error(`[remoteControl] permanent error: ${err.message}`)
      process.exitCode = EXIT_CODE_PERMANENT
    } else {
      console.error(`[remoteControl] transient error: ${errorMessage(err)}`)
      process.exitCode = EXIT_CODE_TRANSIENT
    }
  } finally {
    process.off('SIGTERM', onSignal)
    process.off('SIGINT', onSignal)
  }
}
