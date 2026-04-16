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
