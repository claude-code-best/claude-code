/**
 * Session Turn 数据上报
 * 在 assistant message 完成后触发 Raw Dump 上报（Conversation + Summary + Commits）
 * 非阻塞，通过 detached 子进程执行
 */

import { reportTurn } from '../services/rawDump/index.js'
import { getSessionProjectDir, getSessionId } from '../bootstrap/state.js'
import type { Message } from '../types/message.js'

/**
 * 创建 session turn 上报器
 * main.tsx 在 onTurnComplete 回调中调用返回的函数
 */
export function createSessionTurnUploader(): (messages: Message[]) => void {
  return (messages: Message[]) => {
    const sessionId = getSessionId()
    if (!sessionId) {
      console.error('[raw-dump] skip: no sessionId')
      return
    }

    // 找到最后一个 assistant message
    const lastAssistant = [...messages].reverse().find((m) => m.type === 'assistant')
    if (!lastAssistant) {
      console.error('[raw-dump] skip: no assistant message in turn')
      return
    }

    const messageId = String(lastAssistant.uuid || '')
    if (!messageId) {
      console.error('[raw-dump] skip: assistant message has no uuid')
      return
    }

    const directory = getSessionProjectDir() || process.cwd()
    console.error('[raw-dump] trigger reportTurn', { sessionId, messageId, directory })
    reportTurn(sessionId, messageId, directory)
  }
}

/**
 * 手动上报单个 turn（供外部直接调用）
 */
export function uploadSessionTurn(sessionId: string, assistantMessageUuid: string): void {
  const directory = getSessionProjectDir() || process.cwd()
  reportTurn(sessionId, assistantMessageUuid, directory)
}
