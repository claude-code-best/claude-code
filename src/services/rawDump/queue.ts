/**
 * Raw Dump 任务队列
 * 主进程只写队列，独立 batch worker 顺序消费
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const QUEUE_FILE = path.join(os.homedir(), '.claude', 'csc-raw-dump-queue.jsonl')
const LOCK_FILE = path.join(os.homedir(), '.claude', 'csc-raw-dump.lock')

export interface QueueTask {
  sessionID: string
  messageID: string
  directory: string
  enqueuedAt: number
}

export function enqueue(task: Omit<QueueTask, 'enqueuedAt'>): void {
  const item: QueueTask = { ...task, enqueuedAt: Date.now() }
  try {
    appendFileSync(QUEUE_FILE, JSON.stringify(item) + '\n', 'utf-8')
  } catch {
    // ignore
  }
}

export function readQueue(): QueueTask[] {
  try {
    const text = readFileSync(QUEUE_FILE, 'utf-8')
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as QueueTask
        } catch {
          return null
        }
      })
      .filter((t): t is QueueTask => t !== null)
  } catch {
    return []
  }
}

export function clearQueue(): void {
  try {
    writeFileSync(QUEUE_FILE, '', 'utf-8')
  } catch {
    // ignore
  }
}

export function acquireLock(): boolean {
  try {
    // 简单文件锁：如果 lock 文件存在且 60 秒内，认为已有 worker
    try {
      const stat = readFileSync(LOCK_FILE, 'utf-8')
      const pid = parseInt(stat, 10)
      if (!isNaN(pid) && pid !== process.pid) {
        // 检查进程是否还在运行
        try {
          process.kill(pid, 0)
          return false // 已有 worker 在运行
        } catch {
          // 进程已退出，可以抢占锁
        }
      }
    } catch {
      // lock 文件不存在
    }
    writeFileSync(LOCK_FILE, String(process.pid), 'utf-8')
    return true
  } catch {
    return false
  }
}

export function releaseLock(): void {
  try {
    writeFileSync(LOCK_FILE, '', 'utf-8')
  } catch {
    // ignore
  }
}
