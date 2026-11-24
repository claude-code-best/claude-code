import { feature } from 'bun:bundle'
import { chmod, mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  getOriginalCwd,
  getSessionId,
  onSessionSwitch,
} from '../bootstrap/state.js'
import { registerCleanup } from './cleanupRegistry.js'
import { logForDebugging } from './debug.js'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { errorMessage, isFsInaccessible } from './errors.js'
import { isProcessRunning } from './genericProcessUtils.js'
import { getPlatform } from './platform.js'
import { jsonParse, jsonStringify } from './slowOperations.js'
import { getAgentId } from './teammate.js'
import { getCurrentWorktreeSession } from './worktree.js'

export type SessionKind = 'interactive' | 'bg' | 'daemon' | 'daemon-worker'
export type SessionStatus = 'busy' | 'idle' | 'waiting'

function getSessionsDir(): string {
  return join(getClaudeConfigHomeDir(), 'sessions')
}

/**
 * Kind override from env. Set by the spawner (`claude --bg`, daemon
 * supervisor) so the child can register without the parent having to
 * write the file for it — cleanup-on-exit wiring then works for free.
 * Gated so the env-var string is DCE'd from external builds.
 */
function envSessionKind(): SessionKind | undefined {
  if (feature('BG_SESSIONS')) {
    const k = process.env.CLAUDE_CODE_SESSION_KIND
    if (k === 'bg' || k === 'daemon' || k === 'daemon-worker') return k
  }
  return undefined
}

/**
 * True when this REPL is running inside a `claude --bg` tmux session.
 * Exit paths (/exit, ctrl+c, ctrl+d) should detach the attached client
 * instead of killing the process.
 */
export function isBgSession(): boolean {
  return envSessionKind() === 'bg'
}

/**
 * True when this session registered as a plain interactive session (not a
 * `--bg` / daemon / daemon-worker spawn). The bg-session notification
 * scanner (bgSessionNotifications.ts) only runs in interactive sessions —
 * bg/daemon sessions must not notify about each other (the notified-sessions
 * dedup would race across processes).
 */
export function isInteractiveSession(): boolean {
  return envSessionKind() === undefined
}

/** How a background session ended (see SessionEntry.outcome). */
export type SessionOutcome = 'success' | 'failure' | 'stopped'

/**
 * Exit outcome override for this session's registry entry (see
 * `registerSession`'s cleanup). `'stopped'` is normally pre-written directly
 * into the pidFile by the stopper (stopSession) before signaling — this is
 * the in-process escape hatch for paths that know their own outcome before
 * graceful shutdown starts. A pre-written pidFile outcome always wins.
 */
let sessionOutcomeOverride: SessionOutcome | undefined

export function setSessionOutcome(outcome: SessionOutcome): void {
  sessionOutcomeOverride = outcome
}

/**
 * Resolve the outcome to persist for a bg session at exit.
 *
 * Priority: a pidFile outcome pre-written by the stopper (`'stopped'`)
 * → an in-process override (setSessionOutcome)
 * → the process exit code (gracefulShutdown sets `process.exitCode` before
 *   cleanup functions run, so a non-zero exit — failed -p query, fatal error
 *   — records `'failure'`)
 * → `'success'`.
 */
function resolveExitOutcome(pidFileOutcome: unknown): SessionOutcome {
  if (
    pidFileOutcome === 'success' ||
    pidFileOutcome === 'failure' ||
    pidFileOutcome === 'stopped'
  ) {
    return pidFileOutcome
  }
  if (sessionOutcomeOverride !== undefined) return sessionOutcomeOverride
  return process.exitCode && process.exitCode !== 0 ? 'failure' : 'success'
}

/**
 * Finalize this session's registry entry at exit (registered as the
 * cleanup callback by registerSession; extracted so the lifecycle is
 * unit-testable without the BG_SESSIONS feature gate).
 *
 * Official 2.1.330 (tmux-verified): completed bg session entries PERSIST
 * after exit — the agents view Completed group, `claude agents --all`,
 * `rm` and `respawn` all read them (a session dispatched yesterday still
 * shows in today's Completed group). So a bg session records how it ended
 * (outcome + endTime) instead of unlinking. A pidFile outcome pre-written
 * by the stopper (`'stopped'`, see stopSession) wins over the locally
 * computed one — the stopper writes before signaling, and a SIGKILLed
 * session never runs this cleanup at all. Every other session kind keeps
 * the drop-the-entry behavior.
 */
export async function finalizeSessionEntry(
  pidFile: string,
  kind: SessionKind,
): Promise<void> {
  if (kind === 'bg') {
    try {
      const data = jsonParse(await readFile(pidFile, 'utf8')) as Record<
        string,
        unknown
      >
      await writeFile(
        pidFile,
        jsonStringify({
          ...data,
          outcome: resolveExitOutcome(data.outcome),
          endTime: Date.now(),
        }),
      )
      return
    } catch {
      // ENOENT (rm'd mid-run) / corrupt — fall through to unlink below so
      // we never leave a half-written entry behind.
    }
  }
  try {
    await unlink(pidFile)
  } catch {
    // ENOENT is fine (already deleted or never written)
  }
}

/**
 * Write a PID file for this session and register cleanup.
 *
 * Registers all top-level sessions — interactive CLI, SDK (vscode, desktop,
 * typescript, python, -p), bg/daemon spawns — so `claude ps` sees everything
 * the user might be running. Skips only teammates/subagents, which would
 * conflate swarm usage with genuine concurrency and pollute ps with noise.
 *
 * Returns true if registered, false if skipped.
 * Errors logged to debug, never thrown.
 */
export async function registerSession(): Promise<boolean> {
  if (getAgentId() != null) return false

  const kind: SessionKind = envSessionKind() ?? 'interactive'
  const dir = getSessionsDir()
  const pidFile = join(dir, `${process.pid}.json`)

  registerCleanup(() => finalizeSessionEntry(pidFile, kind))

  try {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await chmod(dir, 0o700)
    await writeFile(
      pidFile,
      jsonStringify({
        pid: process.pid,
        sessionId: getSessionId(),
        cwd: getOriginalCwd(),
        startedAt: Date.now(),
        kind,
        entrypoint: process.env.CLAUDE_CODE_ENTRYPOINT,
        ...(feature('UDS_INBOX')
          ? { messagingSocketPath: process.env.CLAUDE_CODE_MESSAGING_SOCKET }
          : {}),
        ...(feature('BG_SESSIONS')
          ? {
              name: process.env.CLAUDE_CODE_SESSION_NAME,
              logPath: process.env.CLAUDE_CODE_SESSION_LOG,
              agent: process.env.CLAUDE_CODE_AGENT,
              // Launch args (JSON) — recorded so `claude respawn` can relaunch
              // this session with the same args after it exits.
              args: parseSessionArgs(process.env.CLAUDE_CODE_SESSION_ARGS),
              // Worktree isolation (`--worktree`): setup() creates the
              // worktree before this runs, so the path is available here.
              // `claude rm` uses it to delete the worktree safely.
              worktreePath: getCurrentWorktreeSession()?.worktreePath,
              worktreeBranch: getCurrentWorktreeSession()?.worktreeBranch,
            }
          : {}),
      }),
    )
    // --resume / /resume mutates getSessionId() via switchSession. Without
    // this, the PID file's sessionId goes stale and `claude ps` sparkline
    // reads the wrong transcript.
    onSessionSwitch(id => {
      void updatePidFile({ sessionId: id })
    })
    return true
  } catch (e) {
    logForDebugging(`[concurrentSessions] register failed: ${errorMessage(e)}`)
    return false
  }
}

/**
 * Parse CLAUDE_CODE_SESSION_ARGS (JSON string array) into a string[].
 * Best-effort: undefined when unset or malformed.
 */
function parseSessionArgs(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = jsonParse(raw)
    if (Array.isArray(parsed) && parsed.every(a => typeof a === 'string')) {
      return parsed
    }
  } catch {
    // Malformed — treat as absent
  }
  return undefined
}

/**
 * Update this session's name in its PID registry file so ListPeers
 * can surface it. Best-effort: silently no-op if name is falsy, the
 * file doesn't exist (session not registered), or read/write fails.
 */
async function updatePidFile(patch: Record<string, unknown>): Promise<void> {
  const pidFile = join(getSessionsDir(), `${process.pid}.json`)
  try {
    const data = jsonParse(await readFile(pidFile, 'utf8')) as Record<
      string,
      unknown
    >
    await writeFile(pidFile, jsonStringify({ ...data, ...patch }))
  } catch (e) {
    logForDebugging(
      `[concurrentSessions] updatePidFile failed: ${errorMessage(e)}`,
    )
  }
}

export async function updateSessionName(
  name: string | undefined,
): Promise<void> {
  if (!name) return
  await updatePidFile({ name })
}

/**
 * Record this session's Remote Control session ID so peer enumeration can
 * dedup: a session reachable over both UDS and bridge should only appear
 * once (local wins). Cleared on bridge teardown so stale IDs don't
 * suppress a legitimately-remote session after reconnect.
 */
export async function updateSessionBridgeId(
  bridgeSessionId: string | null,
): Promise<void> {
  await updatePidFile({ bridgeSessionId })
}

/**
 * Push live activity state for `claude ps`. Fire-and-forget from REPL's
 * status-change effect — a dropped write just means ps falls back to
 * transcript-tail derivation for one refresh.
 */
export async function updateSessionActivity(patch: {
  status?: SessionStatus
  waitingFor?: string
}): Promise<void> {
  if (!feature('BG_SESSIONS')) return
  await updatePidFile({ ...patch, updatedAt: Date.now() })
}

/**
 * Count live concurrent CLI sessions (including this one).
 * Filters out stale PID files (crashed sessions) and deletes them — EXCEPT
 * completed bg session entries (kind 'bg' + outcome), which are preserved
 * on disk (official keeps them across days for the agents view Completed
 * group / `--all` / `rm` / `respawn`) but NOT counted: a completed session
 * is not concurrent usage.
 * Returns 0 on any error (conservative).
 */
export async function countConcurrentSessions(): Promise<number> {
  const dir = getSessionsDir()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch (e) {
    if (!isFsInaccessible(e)) {
      logForDebugging(`[concurrentSessions] readdir failed: ${errorMessage(e)}`)
    }
    return 0
  }

  let count = 0
  for (const file of files) {
    // Strict filename guard: only `<pid>.json` is a candidate. parseInt's
    // lenient prefix-parsing means `2026-03-14_notes.md` would otherwise
    // parse as PID 2026 and get swept as stale — silent user data loss.
    // See anthropics/claude-code#34210.
    if (!/^\d+\.json$/.test(file)) continue
    const pid = parseInt(file.slice(0, -5), 10)
    if (pid === process.pid) {
      count++
      continue
    }
    if (isProcessRunning(pid)) {
      count++
      continue
    }
    // Dead PID. Completed bg sessions (outcome written at exit) are kept
    // on disk but not counted — see the doc comment.
    if (await isCompletedBgEntry(join(dir, file))) continue
    if (getPlatform() !== 'wsl') {
      // Stale file from a crashed session — sweep it. Skip on WSL: if
      // ~/.claude/sessions/ is shared with Windows-native Claude (symlink
      // or CLAUDE_CONFIG_DIR), a Windows PID won't be probeable from WSL
      // and we'd falsely delete a live session's file. This is just
      // telemetry so conservative undercount is acceptable.
      void unlink(join(dir, file)).catch(() => {})
    }
  }
  return count
}

/**
 * True when the PID file at `path` is a completed bg session entry
 * (kind 'bg' with an `outcome` — written by the session's exit cleanup or
 * pre-written by the stopper). These entries are preserved on disk instead
 * of swept. Best-effort: unreadable/corrupt files read as false (swept).
 */
async function isCompletedBgEntry(path: string): Promise<boolean> {
  try {
    const data = jsonParse(await readFile(path, 'utf8')) as Record<
      string,
      unknown
    >
    return data.kind === 'bg' && typeof data.outcome === 'string'
  } catch {
    return false
  }
}
