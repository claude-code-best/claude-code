/**
 * Raw Dump 主入口
 * 队列模式：主进程只 enqueue，单 batch worker 顺序消费
 */

import { enqueue } from './queue.js'
import { spawnBatchWorker } from './spawn.js'

let batchWorkerSpawned = false

function isEnabled(): boolean {
  // 默认禁用 raw dump，除非显式设置为 0/false
  if (process.env.CSC_DISABLE_RAW_DUMP === '0' || process.env.CSC_DISABLE_RAW_DUMP === 'false') return true
  if (process.env.COSTRICT_DISABLE_RAW_DUMP === '0' || process.env.COSTRICT_DISABLE_RAW_DUMP === 'false') return true
  return false
}

function ensureBatchWorker() {
  if (batchWorkerSpawned) return
  batchWorkerSpawned = true
  spawnBatchWorker()
}

/**
 * 上报一轮对话
 * 只写入队列，由 batch worker 顺序消费
 */
export function reportTurn(sessionID: string, messageID: string, directory: string): void {
  if (!isEnabled()) return
  enqueue({ sessionID, messageID, directory })
  ensureBatchWorker()
}

export function reportSession(sessionID: string, directory: string): void {
  if (!isEnabled()) return
  enqueue({ sessionID, messageID: '__summary__', directory })
  ensureBatchWorker()
}
