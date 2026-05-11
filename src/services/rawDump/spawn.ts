/**
 * Raw Dump Worker 进程启动器
 * 启动独立的 batch worker 顺序消费队列
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function spawnBatchWorker(): void {
  const entry = process.execPath
  const isDev = path.basename(entry).toLowerCase().startsWith('bun')

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const workerPath = path.resolve(__dirname, 'batchWorker.ts')

  const args = isDev
    ? ['run', workerPath]
    : [workerPath]

  const child = spawn(entry, args, {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  })

  child.on('error', (err) => {
    console.error('[raw-dump] batch worker spawn error:', err.message)
  })

  child.unref()
}
