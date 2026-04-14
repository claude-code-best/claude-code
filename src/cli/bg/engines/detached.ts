import { spawn } from 'child_process'
import { openSync, closeSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { BgEngine, BgStartOptions, BgStartResult, SessionEntry } from '../engine.js'
import { tailLog } from '../tail.js'

export class DetachedEngine implements BgEngine {
  readonly name = 'detached' as const

  async available(): Promise<boolean> {
    return true
  }

  async start(opts: BgStartOptions): Promise<BgStartResult> {
    mkdirSync(dirname(opts.logPath), { recursive: true })

    const logFd = openSync(opts.logPath, 'a')
    const entrypoint = process.argv[1]!

    const child = spawn(process.execPath, [entrypoint, ...opts.args], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...opts.env,
        CLAUDE_CODE_SESSION_KIND: 'bg',
        CLAUDE_CODE_SESSION_NAME: opts.sessionName,
        CLAUDE_CODE_SESSION_LOG: opts.logPath,
      } as Record<string, string>,
      cwd: opts.cwd,
    })

    child.unref()
    closeSync(logFd)

    const pid = child.pid ?? 0

    return {
      pid,
      sessionName: opts.sessionName,
      logPath: opts.logPath,
      engineUsed: 'detached',
    }
  }

  async attach(session: SessionEntry): Promise<void> {
    if (!session.logPath) {
      throw new Error(`Session ${session.sessionId} has no log path.`)
    }
    await tailLog(session.logPath)
  }
}
