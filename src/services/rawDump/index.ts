/**
 * Raw Dump 主入口
 * 提供非阻塞的上报 API，与框架解耦
 */

import { spawnRawDumpWorker } from './spawn.js'

const SPAWNED_LIMIT = 1024
const spawned = new Set<string>()

function rememberSpawned(key: string) {
  if (spawned.size >= SPAWNED_LIMIT) {
    const target = Math.floor(SPAWNED_LIMIT / 2)
    let dropped = 0
    for (const k of spawned) {
      if (dropped >= target) break
      spawned.delete(k)
      dropped++
    }
  }
  spawned.add(key)
}

function isEnabled(): boolean {
  if (process.env.CSC_DISABLE_RAW_DUMP === '1' || process.env.CSC_DISABLE_RAW_DUMP === 'true') {
    return false
  }
  if (process.env.COSTRICT_DISABLE_RAW_DUMP === '1' || process.env.COSTRICT_DISABLE_RAW_DUMP === 'true') {
    return false
  }
  return true
}

/**
 * 上报一轮对话的 Conversation + Summary + Commits
 * 非阻塞：通过 spawn detached 子进程执行，主进程立即返回
 *
 * @param sessionID 会话 ID
 * @param messageID 当前 assistant message 的 UUID
 * @param directory 工作目录（用于 git diff 和 repo 信息）
 */
export function reportTurn(sessionID: string, messageID: string, directory: string): void {
  if (!isEnabled()) return

  const key = `${sessionID}:${messageID}`
  if (spawned.has(key)) return
  rememberSpawned(key)

  spawnRawDumpWorker({
    sessionID,
    messageID,
    directory,
  })
}

/**
 * 批量上报（用于会话结束时补报）
 * 非阻塞
 */
export function reportSession(sessionID: string, directory: string): void {
  if (!isEnabled()) return
  // 使用一个特殊 messageID 表示 summary + commits 上报
  spawnRawDumpWorker({
    sessionID,
    messageID: '__summary__',
    directory,
  })
}
