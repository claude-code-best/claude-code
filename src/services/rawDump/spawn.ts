/**
 * Raw Dump Worker 进程启动器
 * 使用 detached 子进程，确保不阻塞主业务流程
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAW_DUMP_EVENT_ENV_KEY, type RawDumpEventPayload } from './types.js'

export function getRawDumpEventEnvKey(): string {
  return RAW_DUMP_EVENT_ENV_KEY
}

export function spawnRawDumpWorker(payload: RawDumpEventPayload): void {
  const entry = process.execPath
  const isDev = path.basename(entry).toLowerCase().startsWith('bun')

  // 计算 worker.ts 的绝对路径
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const workerPath = path.resolve(__dirname, 'worker.ts')

  const args = isDev
    ? ['run', workerPath]
    : [workerPath]

  const child = spawn(entry, args, {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      [RAW_DUMP_EVENT_ENV_KEY]: JSON.stringify(payload),
    },
  })

  child.on('error', (err) => {
    // 静默处理，不影响主进程
    console.error('[raw-dump] spawn error:', err.message)
  })

  child.unref()
}
