import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { PTY_WRAPPER_SOURCE } from './ptyWrapper.py.js'

/**
 * PTY 后端 — python3 pty 包装（见 ptyWrapper.py.ts 顶部说明）。
 * 抽象为 PtyProcess 接口，将来 node-pty/Bun 原生可无缝替换。
 */

export type PtySpawnOptions = {
  cwd: string
  env?: Record<string, string | undefined>
  cols: number
  rows: number
  /** shell 与参数；缺省用 resolveDefaultShell() */
  command?: string[]
}

export type PtyProcess = {
  readonly pid: number | undefined
  write(data: string): void
  resize(cols: number, rows: number): void
  /** 向前台进程组发信号（SIGINT 通过 ^C 线路规程，最可靠） */
  signalForeground(sig: 'SIGINT' | 'SIGTERM' | 'SIGKILL'): void
  /** 终止整个终端（wrapper + shell） */
  kill(): void
  onData(cb: (data: string) => void): void
  onExit(cb: (exitCode: number | null) => void): void
  readonly alive: boolean
}

let wrapperPath: string | null = null
let wrapperDir: string | null = null

function ensureWrapper(): { script: string; dir: string } {
  if (wrapperPath && wrapperDir) return { script: wrapperPath, dir: wrapperDir }
  const dir = join(tmpdir(), 'ccb-terminal')
  mkdirSync(dir, { recursive: true })
  const script = join(dir, 'pty-wrapper.py')
  writeFileSync(script, PTY_WRAPPER_SOURCE, 'utf8')
  wrapperPath = script
  wrapperDir = dir
  return { script, dir }
}

export function resolveDefaultShell(): string {
  const fromEnv = process.env.SHELL
  if (fromEnv?.startsWith('/')) return fromEnv
  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'
}

export function spawnPty(opts: PtySpawnOptions): PtyProcess {
  const { script, dir } = ensureWrapper()
  const sizeFile = join(dir, `size-${randomUUID()}`)
  writeFileSync(sizeFile, `${opts.rows} ${opts.cols}`, 'utf8')

  const command = opts.command ?? [resolveDefaultShell(), '-l']
  const dataCallbacks: Array<(data: string) => void> = []
  const exitCallbacks: Array<(exitCode: number | null) => void> = []
  let alive = true

  const proc = Bun.spawn(['python3', script, ...command], {
    cwd: opts.cwd,
    env: {
      ...process.env,
      ...opts.env,
      CCB_PTY_SIZE_FILE: sizeFile,
      TERM: 'xterm-256color',
      // 避免子 CLI 递归打开终端功能
      CCB_SESSION_TERMINAL: '1',
    },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const decoder = new TextDecoder()
  void (async () => {
    try {
      for await (const chunk of proc.stdout) {
        const text = decoder.decode(chunk, { stream: true })
        for (const cb of dataCallbacks) cb(text)
      }
    } catch (err) {
      logForDebugging(`[terminal] stdout loop ended: ${errorMessage(err)}`)
    }
  })()
  void (async () => {
    try {
      for await (const chunk of proc.stderr) {
        // wrapper 自身错误（罕见）也并入输出流，方便诊断
        const text = decoder.decode(chunk, { stream: true })
        for (const cb of dataCallbacks) cb(text)
      }
    } catch {
      // ignore
    }
  })()
  void proc.exited.then(code => {
    alive = false
    for (const cb of exitCallbacks) cb(code)
  })

  return {
    get pid() {
      return proc.pid
    },
    get alive() {
      return alive
    },
    write(data: string) {
      if (!alive) return
      try {
        proc.stdin.write(data)
        void proc.stdin.flush()
      } catch (err) {
        logForDebugging(`[terminal] write failed: ${errorMessage(err)}`)
      }
    },
    resize(cols: number, rows: number) {
      if (!alive) return
      try {
        writeFileSync(sizeFile, `${rows} ${cols}`, 'utf8')
        proc.kill('SIGWINCH')
      } catch (err) {
        logForDebugging(`[terminal] resize failed: ${errorMessage(err)}`)
      }
    },
    signalForeground(sig) {
      if (!alive) return
      try {
        if (sig === 'SIGINT') {
          // \x03 经 tty 线路规程投递 SIGINT 给前台进程组 — 最可靠
          proc.stdin.write('\x03')
          void proc.stdin.flush()
        } else if (sig === 'SIGTERM') {
          proc.kill('SIGUSR1')
        } else {
          proc.kill('SIGUSR2')
        }
      } catch (err) {
        logForDebugging(`[terminal] signal failed: ${errorMessage(err)}`)
      }
    },
    kill() {
      if (!alive) return
      try {
        proc.kill('SIGKILL')
      } catch {
        // already dead
      }
    },
    onData(cb) {
      dataCallbacks.push(cb)
    },
    onExit(cb) {
      exitCallbacks.push(cb)
    },
  }
}
