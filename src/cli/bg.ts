import { readdir, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { spawnSync } from 'child_process'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isProcessRunning } from '../utils/genericProcessUtils.js'
import { jsonParse } from '../utils/slowOperations.js'
import { execFileNoThrow } from '../utils/execFileNoThrow.js'
import { quote } from '../utils/bash/shellQuote.js'

interface SessionEntry {
  pid: number
  sessionId: string
  cwd: string
  startedAt: number
  kind: string
  name?: string
  logPath?: string
  entrypoint?: string
  status?: string
  waitingFor?: string
  updatedAt?: number
  bridgeSessionId?: string
  agent?: string
  tmuxSessionName?: string
}

function getSessionsDir(): string {
  return join(getClaudeConfigHomeDir(), 'sessions')
}

async function listLiveSessions(): Promise<SessionEntry[]> {
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
      void unlink(join(dir, file)).catch(() => {})
      continue
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

function findSession(
  sessions: SessionEntry[],
  target: string,
): SessionEntry | undefined {
  const asNum = parseInt(target, 10)
  return sessions.find(
    s =>
      s.sessionId === target ||
      s.pid === asNum ||
      (s.name && s.name === target),
  )
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

/**
 * `claude ps` — list live sessions.
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
    const parts: string[] = [
      `  PID: ${s.pid}`,
      `  Kind: ${s.kind}`,
      `  Session: ${s.sessionId}`,
      `  CWD: ${s.cwd}`,
    ]

    if (s.name) parts.push(`  Name: ${s.name}`)
    if (s.startedAt) parts.push(`  Started: ${formatTime(s.startedAt)}`)
    if (s.status) parts.push(`  Status: ${s.status}`)
    if (s.waitingFor) parts.push(`  Waiting for: ${s.waitingFor}`)
    if (s.bridgeSessionId) parts.push(`  Bridge: ${s.bridgeSessionId}`)
    if (s.tmuxSessionName) parts.push(`  Tmux: ${s.tmuxSessionName}`)

    console.log(parts.join('\n'))
    console.log()
  }
}

/**
 * `claude logs <target>` — show logs for a session.
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

  if (!session.logPath) {
    console.log(`No log path recorded for session ${session.sessionId}`)
    return
  }

  try {
    const content = await readFile(session.logPath, 'utf-8')
    process.stdout.write(content)
  } catch (e) {
    console.error(`Failed to read log file: ${session.logPath}`)
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  }
}

/**
 * `claude attach <target>` — attach to a background tmux session.
 */
export async function attachHandler(target: string | undefined): Promise<void> {
  // Check tmux availability
  const { code: tmuxCode } = await execFileNoThrow('tmux', ['-V'])
  if (tmuxCode !== 0) {
    console.error(
      'tmux is required for attach. Install tmux to use background sessions.',
    )
    console.error(getTmuxHint())
    process.exitCode = 1
    return
  }

  const sessions = await listLiveSessions()

  if (!target) {
    // Find bg sessions with tmux metadata
    const bgSessions = sessions.filter(s => s.tmuxSessionName)
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
        console.log(`  ${label}  PID=${s.pid}  tmux=${s.tmuxSessionName}`)
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

  if (!session.tmuxSessionName) {
    console.error(
      `Session ${session.sessionId} was not started with --bg (no tmux session).`,
    )
    process.exitCode = 1
    return
  }

  // tmux attach is a blocking call — replaces this process's terminal
  const result = spawnSync(
    'tmux',
    ['attach-session', '-t', session.tmuxSessionName],
    {
      stdio: 'inherit',
    },
  )

  if (result.status !== 0) {
    console.error(
      `Failed to attach to tmux session '${session.tmuxSessionName}'.`,
    )
    process.exitCode = 1
  }
}

/**
 * `claude kill <target>` — kill a session.
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

  try {
    process.kill(session.pid, 'SIGTERM')
  } catch {
    console.log('Session already exited.')
    return
  }

  await new Promise(resolve => setTimeout(resolve, 2000))

  if (isProcessRunning(session.pid)) {
    try {
      process.kill(session.pid, 'SIGKILL')
      console.log('Session force-killed.')
    } catch {
      console.log('Session exited during grace period.')
    }
  } else {
    console.log('Session stopped.')
  }

  const pidFile = join(getSessionsDir(), `${session.pid}.json`)
  void unlink(pidFile).catch(() => {})
}

/**
 * `claude --bg [args]` — start a session in a background tmux pane.
 */
export async function handleBgFlag(args: string[]): Promise<void> {
  // Check tmux availability
  const { code: tmuxCode } = await execFileNoThrow('tmux', ['-V'])
  if (tmuxCode !== 0) {
    console.error(
      'tmux is required for --bg. Install tmux to use background sessions.',
    )
    console.error(getTmuxHint())
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

  // Strip --bg/--background from args
  const filteredArgs = args.filter(a => a !== '--bg' && a !== '--background')

  // Build the command to run inside tmux — use array form to avoid shell injection
  const entrypoint = process.argv[1]!
  const tmuxEnv = {
    ...process.env,
    CLAUDE_CODE_SESSION_KIND: 'bg',
    CLAUDE_CODE_SESSION_NAME: sessionName,
    CLAUDE_CODE_SESSION_LOG: logPath,
    CLAUDE_CODE_TMUX_SESSION: sessionName,
  }
  const cmd = quote([process.execPath, entrypoint, ...filteredArgs])

  const result = spawnSync(
    'tmux',
    ['new-session', '-d', '-s', sessionName, cmd],
    { stdio: 'inherit', env: tmuxEnv },
  )

  if (result.status !== 0) {
    console.error('Failed to create tmux session.')
    process.exitCode = 1
    return
  }

  console.log(`Background session started: ${sessionName}`)
  console.log(`  tmux session: ${sessionName}`)
  console.log(`  log: ${logPath}`)
  console.log()
  console.log(`Use \`claude attach ${sessionName}\` to reconnect.`)
  console.log(`Use \`claude ps\` to check status.`)
  console.log(`Use \`claude kill ${sessionName}\` to stop.`)
}

function getTmuxHint(): string {
  if (process.platform === 'darwin') {
    return 'Install with: brew install tmux'
  }
  if (process.platform === 'win32') {
    return 'tmux is not natively available on Windows. Consider using WSL.'
  }
  return 'Install with: sudo apt install tmux  (or your package manager)'
}
