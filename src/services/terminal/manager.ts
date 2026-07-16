import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import stripAnsi from 'strip-ansi'
import { getCwdState } from '../../bootstrap/state.js'
import { registerCleanup } from '../../utils/cleanupRegistry.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { type PtyProcess, resolveDefaultShell, spawnPty } from './ptyBackend.js'

/**
 * TerminalManager — 会话级持久 PTY 终端管理器（单例）。
 *
 * 命名终端 + 环形输出缓冲 + 读游标 + 等待原语（prompt/silence/pattern/exit）。
 * 提示符检测基于 OSC 133 shell 集成（open 时注入 rc 文件），无集成时
 * 自动降级 silence 策略。设计文档：docs/features/session-terminals.md
 */

const MAX_RAW_BUFFER = 512 * 1024
const MAX_PLAIN_BUFFER = 512 * 1024
const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30
const DEFAULT_SILENCE_MS = 2000

export type WaitSpec = {
  until: 'prompt' | 'silence' | 'pattern' | 'exit'
  pattern?: string
  silenceMs?: number
  timeoutS: number
}

export type WaitOutcome = 'prompt' | 'silence' | 'pattern' | 'exit' | 'timeout'

export type WaitResult = {
  outcome: WaitOutcome
  /** pattern 命中的文本 */
  matched?: string
  /** 等待期间的新增输出（纯文本） */
  output: string
  durationMs: number
  /** OSC 133 采集到的最近一次命令退出码 */
  exitCode?: number
  /** 前台命令是否疑似仍在运行（无 OSC 集成时为 undefined） */
  stillRunning?: boolean
}

export type TerminalInfo = {
  id: string
  name: string
  purpose?: string
  cwd: string
  cols: number
  rows: number
  alive: boolean
  exitCode?: number
  fgCommand?: string
  lastActivityAt: number
  /** 末两行纯文本预览 */
  preview: string
}

export type TerminalEvent =
  | { kind: 'output'; termId: string; data: string }
  | { kind: 'state' }

export const TERMINAL_KEYS = {
  enter: '\r',
  tab: '\t',
  esc: '\x1b',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  space: ' ',
  backspace: '\x7f',
  'ctrl-c': '\x03',
  'ctrl-d': '\x04',
  'ctrl-z': '\x1a',
  'ctrl-r': '\x12',
  'ctrl-l': '\x0c',
} as const

export type TerminalKey = keyof typeof TERMINAL_KEYS

/** 追加式流缓冲：绝对偏移单调递增，超限从头部裁剪 */
type StreamBuffer = {
  text: string
  baseOffset: number
}

function appendBuffer(buf: StreamBuffer, data: string, max: number): void {
  buf.text += data
  if (buf.text.length > max) {
    const drop = buf.text.length - Math.floor(max / 2)
    buf.baseOffset += drop
    buf.text = buf.text.slice(drop)
  }
}

function bufferTotal(buf: StreamBuffer): number {
  return buf.baseOffset + buf.text.length
}

function bufferSlice(buf: StreamBuffer, fromOffset: number): string {
  const start = Math.max(fromOffset, buf.baseOffset)
  return buf.text.slice(start - buf.baseOffset)
}

/** 规范化纯文本：去 ANSI、\r\n→\n、丢弃裸 \r（进度条重绘） */
function toPlainText(data: string): string {
  return stripAnsi(data).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

type ManagedTerminal = {
  id: string
  name: string
  purpose?: string
  cwd: string
  cols: number
  rows: number
  pty: PtyProcess
  raw: StreamBuffer
  plain: StreamBuffer
  /** OSC 解析用的跨块残留 */
  oscCarry: string
  /** OSC 133;A 计数（提示符出现次数） */
  promptSeq: number
  /** OSC 133;D;<code> 最近退出码 */
  lastCmdExitCode?: number
  hasOscIntegration: boolean
  fgCommand?: string
  fgCommandPromptSeq: number
  lastActivityAt: number
  alive: boolean
  exitCode?: number
  cursors: Map<string, number>
  outputListeners: Set<() => void>
  exitListeners: Set<() => void>
}

// OSC 133 序列：\x1b]133;A\x07（提示符开始）/ \x1b]133;D;<code>\x07（命令结束）
// 控制字符是终端转义序列的必要组成，故抑制 lint。
// biome-ignore lint/suspicious/noControlCharactersInRegex: OSC 133 terminal escape sequences require raw control chars
const OSC_RE = /\x1b\]133;(A|D(?:;(\d+))?)(?:\x07|\x1b\\)/g

function writeShellIntegrationFiles(dir: string): void {
  mkdirSync(dir, { recursive: true })
  const osc = String.raw`printf '\033]133;D;%s\007\033]133;A\007' "$?"`
  writeFileSync(
    join(dir, 'bashrc'),
    [
      '[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"',
      `PROMPT_COMMAND='${osc}'"\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"`,
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(dir, '.zprofile'),
    '[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile"\n',
    'utf8',
  )
  writeFileSync(
    join(dir, '.zshrc'),
    [
      '[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc"',
      `_ccb_term_precmd() { ${osc} }`,
      'typeset -ga precmd_functions',
      'precmd_functions+=( _ccb_term_precmd )',
      '',
    ].join('\n'),
    'utf8',
  )
}

export class TerminalManager {
  private terminals = new Map<string, ManagedTerminal>()
  private subscribers = new Set<(ev: TerminalEvent) => void>()
  private integrationDir: string | null = null

  private ensureIntegrationDir(): string {
    if (this.integrationDir) return this.integrationDir
    const dir = join(tmpdir(), 'ccb-terminal', `shell-${randomUUID()}`)
    writeShellIntegrationFiles(dir)
    this.integrationDir = dir
    return dir
  }

  subscribe(cb: (ev: TerminalEvent) => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private emit(ev: TerminalEvent): void {
    for (const cb of this.subscribers) {
      try {
        cb(ev)
      } catch (err) {
        logForDebugging(`[terminal] subscriber error: ${errorMessage(err)}`)
      }
    }
  }

  /** 按名称或 id 查找 */
  private find(ref: string): ManagedTerminal | undefined {
    const byId = this.terminals.get(ref)
    if (byId) return byId
    for (const t of this.terminals.values()) {
      if (t.name === ref) return t
    }
    return undefined
  }

  private mustFind(ref: string): ManagedTerminal {
    const t = this.find(ref)
    if (!t) {
      const names = [...this.terminals.values()].map(x => x.name).join(', ')
      throw new Error(
        `Terminal "${ref}" not found. Existing: ${names || '(none)'}`,
      )
    }
    return t
  }

  open(opts: {
    name: string
    cwd?: string
    purpose?: string
    cols?: number
    rows?: number
  }): { info: TerminalInfo; alreadyExisted: boolean } {
    const existing = this.find(opts.name)
    if (existing?.alive) {
      return { info: this.toInfo(existing), alreadyExisted: true }
    }
    if (existing) this.terminals.delete(existing.id)

    const cwd = opts.cwd || getCwdState() || homedir()
    const cols = opts.cols ?? DEFAULT_COLS
    const rows = opts.rows ?? DEFAULT_ROWS
    const shell = resolveDefaultShell()
    const integrationDir = this.ensureIntegrationDir()
    const isZsh = shell.endsWith('zsh')
    const command = isZsh
      ? [shell, '-il']
      : [shell, '--rcfile', join(integrationDir, 'bashrc'), '-i']

    const pty = spawnPty({
      cwd,
      cols,
      rows,
      command,
      env: isZsh ? { ZDOTDIR: integrationDir } : {},
    })

    const term: ManagedTerminal = {
      id: `term_${randomUUID().slice(0, 8)}`,
      name: opts.name,
      purpose: opts.purpose,
      cwd,
      cols,
      rows,
      pty,
      raw: { text: '', baseOffset: 0 },
      plain: { text: '', baseOffset: 0 },
      oscCarry: '',
      promptSeq: 0,
      hasOscIntegration: false,
      fgCommandPromptSeq: 0,
      lastActivityAt: Date.now(),
      alive: true,
      cursors: new Map(),
      outputListeners: new Set(),
      exitListeners: new Set(),
    }

    pty.onData(data => this.handleData(term, data))
    pty.onExit(code => {
      term.alive = false
      term.exitCode = code ?? undefined
      term.lastActivityAt = Date.now()
      for (const l of term.exitListeners) l()
      this.emit({ kind: 'state' })
    })

    this.terminals.set(term.id, term)
    this.emit({ kind: 'state' })
    logForDebugging(
      `[terminal] opened "${term.name}" (${term.id}) shell=${shell} cwd=${cwd}`,
    )
    return { info: this.toInfo(term), alreadyExisted: false }
  }

  private handleData(term: ManagedTerminal, data: string): void {
    term.lastActivityAt = Date.now()
    appendBuffer(term.raw, data, MAX_RAW_BUFFER)

    // OSC 133 解析（带跨块残留，残留窗口 64 字节足够容纳半截序列）
    const scan = term.oscCarry + data
    OSC_RE.lastIndex = 0
    let m = OSC_RE.exec(scan)
    while (m) {
      if (m[1] === 'A') {
        term.promptSeq += 1
        term.hasOscIntegration = true
      } else if (m[1]?.startsWith('D')) {
        const code = m[2]
        if (code !== undefined) term.lastCmdExitCode = Number(code)
        term.hasOscIntegration = true
      }
      m = OSC_RE.exec(scan)
    }
    term.oscCarry = scan.slice(-64)

    appendBuffer(term.plain, toPlainText(data), MAX_PLAIN_BUFFER)
    for (const l of term.outputListeners) l()
    this.emit({ kind: 'output', termId: term.id, data })
  }

  private toInfo(term: ManagedTerminal): TerminalInfo {
    const lines = term.plain.text.split('\n').filter(l => l.trim().length > 0)
    return {
      id: term.id,
      name: term.name,
      purpose: term.purpose,
      cwd: term.cwd,
      cols: term.cols,
      rows: term.rows,
      alive: term.alive,
      exitCode: term.exitCode,
      fgCommand: term.fgCommand,
      lastActivityAt: term.lastActivityAt,
      preview: lines.slice(-2).join('\n').slice(0, 300),
    }
  }

  list(): TerminalInfo[] {
    return [...this.terminals.values()].map(t => this.toInfo(t))
  }

  info(ref: string): TerminalInfo {
    return this.toInfo(this.mustFind(ref))
  }

  has(ref: string): boolean {
    return this.find(ref) !== undefined
  }

  write(ref: string, data: string): void {
    const term = this.mustFind(ref)
    if (!term.alive) throw new Error(`Terminal "${term.name}" has exited`)
    term.pty.write(data)
  }

  sendKeys(ref: string, keys: TerminalKey[]): void {
    const term = this.mustFind(ref)
    if (!term.alive) throw new Error(`Terminal "${term.name}" has exited`)
    for (const key of keys) {
      const seq = TERMINAL_KEYS[key]
      if (seq === undefined) throw new Error(`Unknown key: ${key}`)
      term.pty.write(seq)
    }
  }

  signal(ref: string, sig: 'SIGINT' | 'SIGTERM' | 'SIGKILL'): void {
    const term = this.mustFind(ref)
    if (!term.alive) throw new Error(`Terminal "${term.name}" has exited`)
    term.pty.signalForeground(sig)
  }

  resize(ref: string, cols: number, rows: number): void {
    const term = this.mustFind(ref)
    // Browsers can emit the same ResizeObserver measurement several times
    // while a drawer is opening. Re-sending SIGWINCH for an unchanged size
    // makes zsh redraw its prompt and looks like a terminal error to users.
    if (term.cols === cols && term.rows === rows) return
    term.cols = cols
    term.rows = rows
    term.pty.resize(cols, rows)
    this.emit({ kind: 'state' })
  }

  close(ref: string): void {
    const term = this.mustFind(ref)
    term.pty.kill()
    this.terminals.delete(term.id)
    this.emit({ kind: 'state' })
  }

  closeAll(): void {
    for (const term of this.terminals.values()) {
      term.pty.kill()
    }
    this.terminals.clear()
  }

  /** 增量读取（每个 consumer 独立游标），返回纯文本 */
  readNew(ref: string, consumer: string): string {
    const term = this.mustFind(ref)
    const cursor = term.cursors.get(consumer) ?? term.plain.baseOffset
    const out = bufferSlice(term.plain, cursor)
    term.cursors.set(consumer, bufferTotal(term.plain))
    return out
  }

  readTail(ref: string, lines: number): string {
    const term = this.mustFind(ref)
    const all = term.plain.text.split('\n')
    return all.slice(-Math.max(1, lines)).join('\n')
  }

  readFull(ref: string): string {
    return this.mustFind(ref).plain.text
  }

  /** 原始 ANSI 快照（Web 重连恢复） */
  rawSnapshot(ref: string, maxBytes = 64 * 1024): string {
    const term = this.mustFind(ref)
    return term.raw.text.slice(-maxBytes)
  }

  /** 等待原语：条件满足或超时（超时非错误） */
  async wait(
    ref: string,
    spec: WaitSpec,
    consumer: string,
    options: { startOffset?: number } = {},
  ): Promise<WaitResult> {
    const term = this.mustFind(ref)
    const startedAt = Date.now()
    const startPromptSeq = term.promptSeq
    const startOffset =
      options.startOffset ??
      term.cursors.get(consumer) ??
      bufferTotal(term.plain)
    const silenceMs = spec.silenceMs ?? DEFAULT_SILENCE_MS
    const pattern =
      spec.until === 'pattern' && spec.pattern
        ? new RegExp(spec.pattern, 'm')
        : null
    if (spec.until === 'pattern' && !pattern) {
      throw new Error('wait until "pattern" requires a pattern')
    }

    const finish = (outcome: WaitOutcome, matched?: string): WaitResult => {
      const output = bufferSlice(term.plain, startOffset)
      term.cursors.set(consumer, bufferTotal(term.plain))
      return {
        outcome,
        matched,
        output,
        durationMs: Date.now() - startedAt,
        exitCode: term.lastCmdExitCode,
        stillRunning: term.hasOscIntegration
          ? term.alive && term.promptSeq <= term.fgCommandPromptSeq
          : undefined,
      }
    }

    return new Promise<WaitResult>(resolve => {
      let done = false
      let silenceTimer: ReturnType<typeof setTimeout> | null = null
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null

      const cleanup = () => {
        term.outputListeners.delete(onOutput)
        term.exitListeners.delete(onExit)
        if (silenceTimer) clearTimeout(silenceTimer)
        if (timeoutTimer) clearTimeout(timeoutTimer)
      }
      const settle = (outcome: WaitOutcome, matched?: string) => {
        if (done) return
        done = true
        cleanup()
        resolve(finish(outcome, matched))
      }

      const armSilence = () => {
        if (silenceTimer) clearTimeout(silenceTimer)
        silenceTimer = setTimeout(() => settle('silence'), silenceMs)
        silenceTimer.unref?.()
      }

      const check = () => {
        if (spec.until === 'prompt') {
          if (term.promptSeq > startPromptSeq) {
            settle('prompt')
            return
          }
          // Shell integration may only become visible after slow user startup
          // hooks finish. Do not treat a completely quiet startup as a ready
          // prompt; otherwise a command can be written into a shell that is
          // still sourcing rc files. For shells without OSC integration, fall
          // back to silence only after at least one output chunk was observed.
          if (
            !term.hasOscIntegration &&
            bufferTotal(term.plain) > startOffset
          ) {
            armSilence()
          }
          return
        }
        if (pattern) {
          const newText = bufferSlice(term.plain, startOffset)
          const m = pattern.exec(newText)
          if (m) {
            settle('pattern', m[0])
            return
          }
        }
        if (spec.until === 'silence') armSilence()
      }

      const onOutput = () => check()
      const onExit = () => {
        // 终端进程没了，其余等待条件也不可能再满足。
        settle('exit')
      }

      term.outputListeners.add(onOutput)
      term.exitListeners.add(onExit)

      timeoutTimer = setTimeout(
        () => settle('timeout'),
        Math.max(1, spec.timeoutS) * 1000,
      )
      timeoutTimer.unref?.()

      if (!term.alive) {
        settle('exit')
        return
      }
      check()
    })
  }

  /** run = 写入整行命令 + 等待。记录前台命令用于 still_running 判断 */
  async run(
    ref: string,
    command: string,
    spec: WaitSpec,
    consumer: string,
  ): Promise<WaitResult> {
    const term = this.mustFind(ref)
    if (!term.alive) throw new Error(`Terminal "${term.name}" has exited`)
    // shell 尚未出过提示符（启动中）→ 先等就绪，否则 silence 等待会把
    // 启动耗时误判成命令完成。OSC 133 集成下首个提示符即 promptSeq>=1。
    if (term.promptSeq === 0) {
      await this.wait(
        ref,
        { until: 'prompt', timeoutS: Math.min(10, spec.timeoutS) },
        `${consumer}:startup`,
      )
    }
    // 在写入前固定起点。快速命令可能在 pty.write() 返回前就已经输出，
    // 如果 wait() 事后再取游标，会把这段结果误判成“没有输出”。
    const startOffset = bufferTotal(term.plain)
    term.cursors.set(consumer, startOffset)
    term.fgCommand = command
    term.fgCommandPromptSeq = term.promptSeq
    term.pty.write(`${command}\r`)
    // Bun's FileSink flush is asynchronous. Under CPU load, starting a
    // silence timer before the command reaches the PTY can report completion
    // after seeing only the input echo. Keep the pre-write offset above, but
    // do not begin waiting until the input pipe has actually been flushed.
    await term.pty.flush()
    return this.wait(ref, spec, consumer, { startOffset })
  }
}

let managerSingleton: TerminalManager | null = null

export function getTerminalManager(): TerminalManager {
  if (!managerSingleton) {
    managerSingleton = new TerminalManager()
    registerCleanup(async () => {
      managerSingleton?.closeAll()
    })
  }
  return managerSingleton
}

/** 仅用于测试 */
export function resetTerminalManagerForTests(): void {
  managerSingleton?.closeAll()
  managerSingleton = null
}
