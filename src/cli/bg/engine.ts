/**
 * BgEngine — cross-platform background session engine abstraction.
 *
 * Implementations:
 *   TmuxEngine    — macOS/Linux with tmux installed
 *   DetachedEngine — Windows, or macOS/Linux without tmux (fallback)
 */

export interface SessionEntry {
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
  engine?: 'tmux' | 'detached'
  /** Launch args the session was started with (JSON via CLAUDE_CODE_SESSION_ARGS).
   * Stored so `claude respawn` can relaunch exited sessions. Absent on
   * sessions started before this field existed — respawn then asks the
   * user to restart manually. */
  args?: string[]
  /** Isolated worktree this session runs in (`--worktree`). Recorded so
   * `claude rm` can delete the worktree once the session has exited. */
  worktreePath?: string
  /** Branch created for the worktree (kept after `claude rm`). */
  worktreeBranch?: string
  /** Pinned to the top of the agents view list (agents:togglePin). */
  pinned?: boolean
  /**
   * How a background session ended (official 2.1.330, tmux-verified: bg
   * session entries persist after exit — the agents view Completed group,
   * `claude agents --all`, `rm` and `respawn` all read them across days).
   * Written by the session's own exit cleanup; `'stopped'` is pre-written by
   * the stopper (`claude stop` / stopSession) before signaling so a SIGKILLed
   * session still records it. Interactive sessions keep unlinking their
   * entry on exit and never set this.
   *
   * Scanner semantics (official L927692): `'stopped'` sessions generate NO
   * completion notification; `'failure'` notifies `${label} failed`, anything
   * else notifies `${label} finished`.
   */
  outcome?: 'success' | 'failure' | 'stopped'
  /** Epoch ms — when the session exited (written together with `outcome`). */
  endTime?: number
  /**
   * Epoch ms — when the user last opened/read this session (agents view
   * enter/attach). Unread completed sessions keep the `✻` icon; read ones
   * show `∙` (official 2.1.330, tmux-verified: the unread marker persists
   * across sessions; awaiting-input sessions are always `✻`).
   */
  readAt?: number
  /**
   * Self-driving sessions (official scan exclusion, L927692): never generate
   * completion / needs_input notifications. Nothing sets this yet — the
   * scanner honors it for alignment.
   */
  selfDriving?: boolean
}

export interface BgStartOptions {
  sessionName: string
  args: string[]
  env: Record<string, string | undefined>
  logPath: string
  cwd: string
}

export interface BgStartResult {
  pid: number
  sessionName: string
  logPath: string
  engineUsed: 'tmux' | 'detached'
}

export interface BgEngine {
  readonly name: 'tmux' | 'detached'
  /** Whether the engine provides a TTY for interactive REPL input. */
  readonly supportsInteractiveInput: boolean
  available(): Promise<boolean>
  start(opts: BgStartOptions): Promise<BgStartResult>
  attach(session: SessionEntry): Promise<void>
}
