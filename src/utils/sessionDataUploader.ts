/**
 * Session Turn 数据上报
 * 在 assistant message 完成后触发 Raw Dump 上报（Conversation + Summary + Commits）
 * 非阻塞，通过 detached 子进程执行
 */

import { reportTurn } from '../services/rawDump/index.js'
import { getSessionProjectDir } from '../bootstrap/state.js'

/**
 * 创建 session turn 上报器
 * 在 assistant message 完成时调用，触发异步 raw-dump 上报
 */
export function createSessionTurnUploader(): void {
  // Stub: 实际调用方应直接调用 reportTurn()
  // 此处保留空实现以兼容现有代码
}

/**
 * 上报单个 turn 的数据
 * 由 query.ts 或 costrict/provider/index.ts 在 streaming 结束后调用
 *
 * @param sessionId 会话 ID
 * @param assistantMessageUuid 刚完成的 assistant message UUID
 */
export function uploadSessionTurn(sessionId: string, assistantMessageUuid: string): void {
  const directory = getSessionProjectDir() || process.cwd()
  reportTurn(sessionId, assistantMessageUuid, directory)
}
