/**
 * Raw Dump Batch Worker
 * 顺序消费队列，避免并发 429
 * 独立进程，通过自循环 setTimeout 严格串行执行
 */

import { uploadConversation, uploadSummary, uploadCommits, auth } from './worker.js'
import { readQueue, clearQueue, acquireLock, releaseLock, type QueueTask } from './queue.js'
import { readState, writeState } from './state.js'
import { getSessionDirectory, loadSessionMessages } from './worker.js'
import { getRepoInfo, getWorkingTreeDiff } from './git.js'
import { createLogger } from './logger.js'

const log = createLogger('raw-dump-batch')

const BATCH_INTERVAL_MS = 30_000 // 每轮间隔
// 进程内重入保护：文件锁不防同进程重入，必须用内存 flag 兜底
let isRunning = false

async function processTask(task: QueueTask) {
  log('info', 'processing task', { sessionID: task.sessionID, messageID: task.messageID })

  const sessionDir = getSessionDirectory(task.directory, task.sessionID)
  const messages = await loadSessionMessages(sessionDir, task.sessionID, task.messageID)

  if (messages.length === 0) {
    log('warn', 'no messages found', { sessionDir, sessionID: task.sessionID })
  }

  const authData = await auth()
  const state = await readState()

  // 预加载 git 信息，三次上传共享，避免每个 task 重复 spawn 8+ 个 git 进程
  const repoInfo = await getRepoInfo(task.directory)
  const workingTreeDiff = await getWorkingTreeDiff(task.directory)

  try {
    // conversation
    const conversationUploaded = await uploadConversation(
      { sessionID: task.sessionID, messageID: task.messageID, directory: task.directory, messages },
      authData,
      state,
      { workingTreeDiff },
    )

    // summary（每个 turn 都报，但内容会累积）
    await uploadSummary(
      { sessionID: task.sessionID, directory: task.directory, messages },
      authData,
      { repoInfo, workingTreeDiff },
    )

    // commits（限制频率，避免重复上报）
    await uploadCommits({ directory: task.directory }, authData, state, { repoInfo })

    log('info', 'task completed', { sessionID: task.sessionID, conversationUploaded })
  } finally {
    // 无论成功或失败，都写入 state（commits 已逐条更新）
    await writeState(state)
  }
}

async function runBatch() {
  // 第一道防线：同进程重入保护
  if (isRunning) {
    log('debug', 'runBatch already running in-process, skip')
    return
  }
  isRunning = true

  try {
    // 第二道防线：跨进程文件锁
    if (!acquireLock()) {
      log('debug', 'another worker process holds the lock, skip')
      return
    }

    try {
      const tasks = readQueue()
      if (tasks.length === 0) {
        log('debug', 'queue empty')
        return
      }

      // 第三道防线：读完立刻清空队列
      // - 处理期间新进来的任务会在下一轮处理
      // - 即使有意外的并发 runBatch 拿到锁，也只会看到空队列直接返回
      clearQueue()

      log('info', `processing ${tasks.length} tasks`)

      // 去重：同一个 session 的多个 task，只保留最新的一个
      const deduped = new Map<string, QueueTask>()
      for (const task of tasks) {
        const key = `${task.sessionID}:${task.messageID}`
        const existing = deduped.get(key)
        if (!existing || task.enqueuedAt > existing.enqueuedAt) {
          deduped.set(key, task)
        }
      }

      const uniqueTasks = Array.from(deduped.values()).sort((a, b) => a.enqueuedAt - b.enqueuedAt)
      log('info', `deduped to ${uniqueTasks.length} unique tasks`)

      for (const task of uniqueTasks) {
        try {
          await processTask(task)
        } catch (err) {
          log('error', 'task failed', {
            error: err instanceof Error ? err.message : String(err),
            sessionID: task.sessionID,
          })
        }
      }

      log('info', 'batch completed')
    } finally {
      releaseLock()
    }
  } finally {
    isRunning = false
  }
}

export function startBatchWorker() {
  log('info', 'batch worker started', { interval: BATCH_INTERVAL_MS })

  // 自循环 setTimeout：上一轮跑完才安排下一轮，从源头消除并发
  // 即便 runBatch 抛错也确保下一轮被排上，避免 worker 卡死
  const scheduleNext = (delay: number) => {
    setTimeout(async () => {
      try {
        await runBatch()
      } catch (err) {
        log('error', 'runBatch threw', { error: err instanceof Error ? err.message : String(err) })
      }
      const jitter = Math.floor(Math.random() * 5_000)
      scheduleNext(BATCH_INTERVAL_MS + jitter)
    }, delay)
  }

  // 启动时随机抖动 0~10s，避免多个 csc 实例同时起 worker 撞 API
  scheduleNext(Math.floor(Math.random() * 10_000))
}

// 如果直接运行此文件
if (process.argv[1]?.includes('batchWorker')) {
  startBatchWorker()
}
