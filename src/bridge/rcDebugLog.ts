/**
 * File-based debug logger for Remote Control bridge diagnostics.
 * Writes [RC-DEBUG] lines to ~/.claude/rc-debug.log so they survive
 * Ink's stdout capture in the REPL / bridge UI.
 */
import { appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LOG_PATH = join(homedir(), '.claude', 'rc-debug.log')

function ensureLogDir() {
  const dir = join(homedir(), '.claude')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

let headerWritten = false

export function rcLog(msg: string): void {
  try {
    if (!headerWritten) {
      ensureLogDir()
      appendFileSync(LOG_PATH, `\n===== RC-DEBUG session ${new Date().toISOString()} =====\n`)
      headerWritten = true
    }
    const ts = new Date().toISOString().slice(11, 23) // HH:mm:ss.SSS
    appendFileSync(LOG_PATH, `[${ts}] ${msg}\n`)
  } catch {
    // best-effort — never crash the bridge
  }
}

/** Clear the log file at session start. */
export function rcLogClear(): void {
  try {
    ensureLogDir()
    appendFileSync(LOG_PATH, '')
  } catch {}
}
