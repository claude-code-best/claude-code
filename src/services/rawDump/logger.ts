/**
 * Raw Dump 日志模块
 * 通过环境变量开关控制，默认关闭，与业务逻辑完全解耦
 */

import { appendFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LOG_FILE = path.join(os.homedir(), '.claude', 'csc-raw-dump.log')

function isDebugEnabled(): boolean {
  const v = process.env.CSC_RAW_DUMP_DEBUG
  return v === '1' || v === 'true'
}

export function createLogger(prefix: string) {
  const enabled = isDebugEnabled()

  function write(level: string, msg: string, meta?: Record<string, unknown>) {
    if (!enabled) return
    const timestamp = new Date().toISOString()
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
    const line = `[${timestamp}] [${prefix}:${level}] ${msg}${metaStr}\n`
    console.error(line.trimEnd())
    try {
      appendFileSync(LOG_FILE, line)
    } catch {
      // ignore
    }
  }

  return {
    debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
  }
}
