import { readdir, readFile, unlink } from 'fs/promises'
import { join, sep } from 'path'
import { randomUUID } from 'crypto'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isProcessRunning } from '../utils/genericProcessUtils.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'
import { selectEngine } from './bg/engines/index.js'
import type { SessionEntry } from './bg/engine.js'

export type { SessionEntry } from './bg/engine.js'

function getSessionsDir(): string {
  return join(getClaudeConfigHomeDir(), 'sessions')
}

export interface ListSessionsOptions {
  /** Also include entries whose process has exited (completed background
   * sessions). When false (default) exited entries are swept from disk. */
  includeExited?: boolean
}

/**
 * Read session registry entries from `~/.claude/sessions/<pid>.json`.
 *
 * Default: live sessions only — entries whose PID is no longer running are
 * treated as stale and swept from disk (crashed sessions leak their file
 * since cleanup never ran).
 *
 * `includeExited: true` keeps exited entries in the result instead of
 * sweeping them. Used by `claude agents --all` (completed background
 * sessions), `claude rm` and `claude respawn` (both operate on sessions
 * that have already exited).
 */
export async function listSessions(
  opts: ListSessionsOptions = {},
): Promise<SessionEntry[]> {
  const dir = getSessionsDir()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }

  const sessions: SessionEntry[] = []
  for (const file of files) {
    if (!/^\d+\.json$/.test(file)) continue
    const pid = parseInt(file.slice(0, -5), 10)

    if (!isProcessRunning(pid)) {
      if (opts.includeExited) {
        // Keep the entry — but a corrupt file is still skipped below.
      } else {
        void unlink(join(dir, file)).catch(() => {})
        continue
      }
    }

    try {
      const raw = await readFile(join(dir, file), 'utf-8')
      const entry = jsonParse(raw) as SessionEntry
      sessions.push(entry)
    } catch {
      // Corrupt file — skip
    }
  }

  return sessions
}

/** Live sessions only (sweeps stale entries). Backcompat wrapper. */
export async function listLiveSessions(): Promise<SessionEntry[]> {
  return listSessions()
}

/**
 * Resolve a `<id|name>` target against a list of sessions.
 *
 * Match order (official `attach <id|name>` semantics — "Part of the session
 * name works too"):
 *  1. Exact: sessionId, pid, or name
 *  2. Unique prefix/substring match on sessionId or name
 *
 * Ambiguous partial matches resolve to undefined (caller prints the
 * candidates); no match also resolves to undefined.
 */
export function findSession(
  sessions: SessionEntry[],
  target: string,
): SessionEntry | undefined {
  const asNum = parseInt(target, 10)
  const exact = sessions.find(
    s =>
      s.sessionId === target ||
      s.pid === asNum ||
      (s.name && s.name === target),
  )
  if (exact) return exact

  // Partial match: part of the session name (or session id) works too.
  const partial = sessions.filter(
    s =>
      s.sessionId.startsWith(target) ||
      (s.name !== undefined && s.name.includes(target)),
  )
  return partial.length === 1 ? partial[0] : undefined
}

/**
 * `claude agents --json` / `claude agents --all` — print sessions as a JSON
 * array and exit (for scripts; works without a terminal).
 *
 * `cwd` filters to sessions started in that directory (or beneath it) —
 * the `--cwd <path>` option.
 *
 * The write uses the completion callback so callers can safely exit right
 * after awaiting this — a bare write + process.exit can truncate output
 * when stdout is a pipe.
 */
export async function printSessionsJson(opts: {
  all?: boolean
  cwd?: string
}): Promise<SessionEntry[]> {
  const all = await listSessions({ includeExited: opts.all })
  const sessions = opts.cwd
    ? all.filter(s => isUnderCwd(s.cwd, opts.cwd!))
    : all
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(`${jsonStringify(sessions)}\n`, error => {
      if (error) reject(error)
      else resolve()
    })
  })
  return sessions
}

/** True when `dir` is `root` itself or lives somewhere beneath it. */
function isUnderCwd(dir: string, root: string): boolean {
  if (dir === root) return true
  return dir.startsWith(root.endsWith(sep) ? root : root + sep)
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

/**
 * Resolve the engine type for an existing session.
 * Backward-compatible: sessions without an `engine` field are inferred
 * from the presence of `tmuxSessionName`.
 */
export function resolveSessionEngine(
  session: SessionEntry,
): 'tmux' | 'detached' {
  if (session.engine) return session.engine
  return session.tmuxSessionName ? 'tmux' : 'detached'
}

/**
 * `claude daemon status` / `claude ps` — list live sessions.
 */
export async function psHandler(_args: string[]): Promise<void> {
  const sessions = await listLiveSessions()

  if (sessions.length === 0) {
    console.log('No active sessions.')
    return
  }

  console.log(
    `${sessions.length} active session${sessions.length > 1 ? 's' : ''}:\n`,
  )

  for (const s of sessions) {
    const engineType = resolveSessionEngine(s)
    const parts: string[] = [
      `  PID: ${s.pid}`,
      `  Kind: ${s.kind}`,
      `  Engine: ${engineType}`,
      `  Session: ${s.sessionId}`,
      `  CWD: ${s.cwd}`,
    ]

    if (s.name) parts.push(`  Name: ${s.name}`)
    if (s.startedAt) parts.push(`  Started: ${formatTime(s.startedAt)}`)
    if (s.status) parts.push(`  Status: ${s.status}`)
    if (s.waitingFor) parts.push(`  Waiting for: ${s.waitingFor}`)
    if (s.bridgeSessionId) parts.push(`  Bridge: ${s.bridgeSessionId}`)
    if (s.tmuxSessionName) parts.push(`  Tmux: ${s.tmuxSessionName}`)
    if (s.logPath) parts.push(`  Log: ${s.logPath}`)

    console.log(parts.join('\n'))
    console.log()
  }
}

/**
 * `claude daemon logs <target>` — show logs for a session.
 */
export async function logsHandler(target: string | undefined): Promise<void> {
  const sessions = await listLiveSessions()

  if (!target) {
    if (sessions.length === 0) {
      console.log('No active sessions.')
      return
    }
    if (sessions.length === 1) {
      target = sessions[0]!.sessionId
    } else {
      console.log('Multiple sessions active. Specify one:')
      for (const s of sessions) {
        const label = s.name ? `${s.name} (${s.sessionId})` : s.sessionId
        console.log(`  ${label}  PID=${s.pid}`)
      }
      return
    }
  }

  const session = findSession(sessions, target)
  if (!session) {
    console.error(`Session not found: ${target}`)
    process.exitCode = 1
    return
  }

  try {
    const content = await readSessionLog(session)
    process.stdout.write(content)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  }
}

/**
 * Read a session's recorded log output (whole file). Shared by `claude logs`
 * and the agents view. Throws when no log path is recorded or the file
 * can't be read — callers decide how to surface that.
 */
export async function readSessionLog(session: SessionEntry): Promise<string> {
  if (!session.logPath) {
    throw new Error(`No log path recorded for session ${session.sessionId}`)
  }
  return readFile(session.logPath, 'utf-8')
}

/**
 * `claude daemon attach <target>` — attach to a background session.
 *
 * Engine-aware: tmux sessions use tmux attach, detached sessions use log tail.
 */
export async function attachHandler(target: string | undefined): Promise<void> {
  const sessions = await listLiveSessions()

  if (!target) {
    // Find bg sessions (tmux or detached)
    const bgSessions = sessions.filter(
      s => s.tmuxSessionName || s.engine === 'detached',
    )
    if (bgSessions.length === 0) {
      console.log(
        'No background sessions to attach to. Start one with `claude --bg`.',
      )
      return
    }
    if (bgSessions.length === 1) {
      target = bgSessions[0]!.sessionId
    } else {
      console.log('Multiple background sessions. Specify one:')
      for (const s of bgSessions) {
        const label = s.name ? `${s.name} (${s.sessionId})` : s.sessionId
        const engineType = resolveSessionEngine(s)
        console.log(`  ${label}  PID=${s.pid}  engine=${engineType}`)
      }
      return
    }
  }

  const session = findSession(sessions, target)
  if (!session) {
    console.error(`Session not found: ${target}`)
    process.exitCode = 1
    return
  }

  const engineType = resolveSessionEngine(session)

  try {
    if (engineType === 'tmux') {
      const { TmuxEngine } = await import('./bg/engines/tmux.js')
      const tmux = new TmuxEngine()
      if (!(await tmux.available())) {
        console.error(
          'tmux is no longer available. Cannot attach to tmux session.',
        )
        process.exitCode = 1
        return
      }
      await tmux.attach(session)
    } else {
      const { DetachedEngine } = await import('./bg/engines/detached.js')
      const detached = new DetachedEngine()
      await detached.attach(session)
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  }
}

/**
 * `claude daemon kill <target>` — kill a session.
 */
export async function killHandler(target: string | undefined): Promise<void> {
  const sessions = await listLiveSessions()

  if (!target) {
    if (sessions.length === 0) {
      console.log('No active sessions to kill.')
      return
    }
    console.log('Specify a session to kill:')
    for (const s of sessions) {
      const label = s.name ? `${s.name} (${s.sessionId})` : s.sessionId
      console.log(`  ${label}  PID=${s.pid}`)
    }
    return
  }

  const session = findSession(sessions, target)
  if (!session) {
    console.error(`Session not found: ${target}`)
    process.exitCode = 1
    return
  }

  console.log(`Killing session ${session.sessionId} (PID: ${session.pid})...`)

  const result = await stopSession(session)
  switch (result) {
    case 'already-exited':
      console.log('Session already exited.')
      break
    case 'force-killed':
      console.log('Session force-killed.')
      break
    case 'exited-during-grace':
      console.log('Session exited during grace period.')
      break
    default:
      console.log('Session stopped.')
  }
}

export type StopSessionResult =
  | 'stopped'
  | 'force-killed'
  | 'exited-during-grace'
  | 'already-exited'

/**
 * Stop a session — the silent core behind `claude stop`/`claude kill` and the
 * agents view's `x` key. No console output (the interactive agents view must
 * not print raw lines into the Ink TUI); callers decide what to report.
 *
 * Policy (same as the CLI handler): SIGTERM, 2s grace period, SIGKILL if the
 * process is still running, then drop the registry entry.
 */
export async function stopSession(
  session: SessionEntry,
): Promise<StopSessionResult> {
  const pidFile = join(getSessionsDir(), `${session.pid}.json`)

  try {
    process.kill(session.pid, 'SIGTERM')
  } catch {
    // Already exited — still clean up the registry entry.
    void unlink(pidFile).catch(() => {})
    return 'already-exited'
  }

  await new Promise(resolve => setTimeout(resolve, 2000))

  let result: StopSessionResult = 'stopped'
  if (isProcessRunning(session.pid)) {
    try {
      process.kill(session.pid, 'SIGKILL')
      result = 'force-killed'
    } catch {
      result = 'exited-during-grace'
    }
  }

  void unlink(pidFile).catch(() => {})
  return result
}

/**
 * `claude rm <id>` — if it's safe (session not running), remove a background
 * session from the list and delete its worktree. Its conversation is kept:
 * `claude --resume` lists it. Works on sessions that have already exited.
 */
export async function rmHandler(target: string | undefined): Promise<void> {
  // Exited sessions must be found too — read the registry without sweeping.
  const sessions = await listSessions({ includeExited: true })

  if (!target) {
    const bgSessions = sessions.filter(s => s.kind === 'bg')
    if (bgSessions.length === 0) {
      console.log('No background sessions to remove.')
      return
    }
    console.log('Specify a session to remove:')
    for (const s of bgSessions) {
      const label = s.name ? `${s.name} (${s.sessionId})` : s.sessionId
      console.log(`  ${label}  PID=${s.pid}`)
    }
    return
  }

  const session = findSession(sessions, target)
  if (!session) {
    console.error(`Session not found: ${target}`)
    process.exitCode = 1
    return
  }

  // "If it's safe" — never remove a session that is still running.
  if (isProcessRunning(session.pid)) {
    console.error(
      `Session ${session.sessionId} is still running. Stop it first with \`claude stop ${session.sessionId}\`.`,
    )
    process.exitCode = 1
    return
  }

  // Best-effort tmux session cleanup (exited process usually took the tmux
  // session with it; a leftover one is removed here).
  if (session.tmuxSessionName) {
    try {
      const { TmuxEngine } = await import('./bg/engines/tmux.js')
      const tmux = new TmuxEngine()
      if (await tmux.available()) {
        const { execFileNoThrow } = await import('../utils/execFileNoThrow.js')
        await execFileNoThrow('tmux', [
          'kill-session',
          '-t',
          session.tmuxSessionName,
        ])
      }
    } catch {
      // tmux cleanup is best-effort — the entry removal below is the point
    }
  }

  const pidFile = join(getSessionsDir(), `${session.pid}.json`)
  await unlink(pidFile).catch(() => {})

  console.log(
    `Removed session ${session.sessionId}. Its conversation is kept: \`claude --resume\` lists it.`,
  )
}

/**
 * `claude respawn [id]` / `claude respawn --all` — restart a background
 * session (or all of them), so it runs the current Claude Code version.
 *
 * Relaunch uses the launch args recorded in the session entry
 * (CLAUDE_CODE_SESSION_ARGS). Sessions started before that field existed
 * have no args recorded — respawn then asks the user to restart manually.
 */
export async function respawnHandler(args: string[]): Promise<void> {
  const all = args.includes('--all')
  const target = args.find(a => !a.startsWith('-'))

  // Exited sessions must be found too — respawn is mainly for those.
  const sessions = await listSessions({ includeExited: true })
  const bgSessions = sessions.filter(s => s.kind === 'bg')

  if (all) {
    const exited = bgSessions.filter(s => !isProcessRunning(s.pid))
    if (exited.length === 0) {
      console.log('No exited background sessions to respawn.')
      return
    }
    for (const session of exited) {
      await respawnSession(session)
    }
    return
  }

  if (!target) {
    if (bgSessions.length === 0) {
      console.log('No background sessions to respawn.')
      return
    }
    console.log('Specify a session to respawn (or use --all):')
    for (const s of bgSessions) {
      const label = s.name ? `${s.name} (${s.sessionId})` : s.sessionId
      const state = isProcessRunning(s.pid) ? 'running' : 'exited'
      console.log(`  ${label}  PID=${s.pid}  ${state}`)
    }
    return
  }

  const session =
    findSession(bgSessions, target) ?? findSession(sessions, target)
  if (!session) {
    console.error(`Session not found: ${target}`)
    process.exitCode = 1
    return
  }

  await respawnSession(session)
}

export type RespawnSessionResult =
  | { ok: true; sessionName: string; engineUsed: string; logPath: string }
  | { ok: false; reason: 'running' | 'no-args' | 'error'; message: string }

/**
 * Respawn a single session — the silent core behind `claude respawn` and the
 * agents view's `r` key. No console output; callers decide what to report.
 */
export async function respawnSessionCore(
  session: SessionEntry,
): Promise<RespawnSessionResult> {
  if (isProcessRunning(session.pid)) {
    return {
      ok: false,
      reason: 'running',
      message: `Session ${session.sessionId} is still running. Stop it first with \`claude stop ${session.sessionId}\` (or respawn after it exits).`,
    }
  }

  if (!session.args) {
    // TODO: backfill launch args for pre-args sessions by reconstructing them
    // from the session transcript / entrypoint, so respawn works everywhere.
    return {
      ok: false,
      reason: 'no-args',
      message:
        `Session ${session.sessionId} was started without recorded launch args (older Claude Code version). ` +
        `Restart it manually with \`claude --bg <args>\` (its cwd was ${session.cwd}).`,
    }
  }

  const engine = await selectEngine()
  const sessionName = `claude-bg-${randomUUID().slice(0, 8)}`
  const logPath = join(
    getClaudeConfigHomeDir(),
    'sessions',
    'logs',
    `${sessionName}.log`,
  )

  try {
    const result = await engine.start({
      sessionName,
      args: session.args,
      env: {
        ...process.env,
        CLAUDE_CODE_SESSION_ARGS: jsonStringify(session.args),
      },
      logPath,
      cwd: session.cwd,
    })

    // The old entry's PID is dead — remove it so the registry (and agents
    // view) doesn't list the session twice.
    const pidFile = join(getSessionsDir(), `${session.pid}.json`)
    await unlink(pidFile).catch(() => {})

    return {
      ok: true,
      sessionName: result.sessionName,
      engineUsed: result.engineUsed,
      logPath: result.logPath,
    }
  } catch (e) {
    return {
      ok: false,
      reason: 'error',
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

async function respawnSession(session: SessionEntry): Promise<void> {
  const result = await respawnSessionCore(session)
  if (result.ok) {
    console.log(
      `Respawned session ${session.sessionId} as ${result.sessionName}`,
    )
    console.log(`  Engine: ${result.engineUsed}`)
    console.log(`  Log: ${result.logPath}`)
  } else {
    console.log(result.message)
    if (result.reason === 'error') process.exitCode = 1
  }
}

/**
 * `claude daemon bg [args]` — start a background session.
 *
 * Cross-platform: uses TmuxEngine on macOS/Linux when tmux is available,
 * falls back to DetachedEngine on Windows or when tmux is absent.
 */
export async function handleBgStart(args: string[]): Promise<void> {
  const engine = await selectEngine()

  // Strip --bg/--background from args (for backward-compat shortcut)
  const filteredArgs = args.filter(a => a !== '--bg' && a !== '--background')

  // Engines without interactive TTY input (e.g. detached) require -p/--print
  // or piped input. Tmux provides a virtual terminal so it works without -p.
  if (
    !engine.supportsInteractiveInput &&
    !filteredArgs.some(a => a === '-p' || a === '--print' || a === '--pipe')
  ) {
    console.error(
      'Error: Background sessions with detached engine require -p/--print flag.\n' +
        'The detached engine has no terminal for interactive input.\n\n' +
        'Usage:\n' +
        '  claude daemon bg -p "your prompt here"\n' +
        '  echo "prompt" | claude daemon bg --pipe',
    )
    if (process.platform !== 'win32') {
      console.error(
        '\nAlternatively, install tmux for interactive background sessions:\n' +
          `  ${process.platform === 'darwin' ? 'brew install tmux' : 'sudo apt install tmux'}`,
      )
    }
    process.exitCode = 1
    return
  }

  const sessionName = `claude-bg-${randomUUID().slice(0, 8)}`
  const logPath = join(
    getClaudeConfigHomeDir(),
    'sessions',
    'logs',
    `${sessionName}.log`,
  )

  try {
    const result = await engine.start({
      sessionName,
      args: filteredArgs,
      env: {
        ...process.env,
        // Recorded in the session entry (concurrentSessions.registerSession)
        // so `claude respawn` can relaunch this session with the same args.
        CLAUDE_CODE_SESSION_ARGS: jsonStringify(filteredArgs),
      },
      logPath,
      cwd: process.cwd(),
    })

    console.log(`Background session started: ${result.sessionName}`)
    console.log(`  Engine: ${result.engineUsed}`)
    console.log(`  Log: ${result.logPath}`)
    console.log()
    console.log(`Use \`claude attach ${result.sessionName}\` to reconnect.`)
    console.log(`Use \`claude agents\` to manage sessions.`)
    console.log(`Use \`claude stop ${result.sessionName}\` to stop.`)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  }
}
