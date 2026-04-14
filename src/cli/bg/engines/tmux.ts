import { spawnSync } from 'child_process'
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js'
import { quote } from '../../../utils/bash/shellQuote.js'
import type { BgEngine, BgStartOptions, BgStartResult, SessionEntry } from '../engine.js'

export class TmuxEngine implements BgEngine {
  readonly name = 'tmux' as const

  async available(): Promise<boolean> {
    const { code } = await execFileNoThrow('tmux', ['-V'], { useCwd: false })
    return code === 0
  }

  async start(opts: BgStartOptions): Promise<BgStartResult> {
    const entrypoint = process.argv[1]!
    const cmd = quote([process.execPath, entrypoint, ...opts.args])

    const tmuxEnv: Record<string, string | undefined> = {
      ...opts.env,
      CLAUDE_CODE_SESSION_KIND: 'bg',
      CLAUDE_CODE_SESSION_NAME: opts.sessionName,
      CLAUDE_CODE_SESSION_LOG: opts.logPath,
      CLAUDE_CODE_TMUX_SESSION: opts.sessionName,
    }

    const result = spawnSync(
      'tmux',
      ['new-session', '-d', '-s', opts.sessionName, cmd],
      { stdio: 'inherit', env: tmuxEnv },
    )

    if (result.status !== 0) {
      throw new Error('Failed to create tmux session.')
    }

    // tmux doesn't directly report the child PID; we return 0.
    // The actual session process writes its own PID file.
    return {
      pid: 0,
      sessionName: opts.sessionName,
      logPath: opts.logPath,
      engineUsed: 'tmux',
    }
  }

  async attach(session: SessionEntry): Promise<void> {
    if (!session.tmuxSessionName) {
      throw new Error(`Session ${session.sessionId} has no tmux session name.`)
    }

    const result = spawnSync(
      'tmux',
      ['attach-session', '-t', session.tmuxSessionName],
      { stdio: 'inherit' },
    )

    if (result.status !== 0) {
      throw new Error(
        `Failed to attach to tmux session '${session.tmuxSessionName}'.`,
      )
    }
  }
}

export function getTmuxInstallHint(): string {
  if (process.platform === 'darwin') {
    return 'Install with: brew install tmux'
  }
  if (process.platform === 'win32') {
    return 'tmux is not natively available on Windows. Consider using WSL.'
  }
  return 'Install with: sudo apt install tmux  (or your package manager)'
}
