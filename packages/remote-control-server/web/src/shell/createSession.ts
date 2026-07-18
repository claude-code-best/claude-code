import {
  apiCreateChatSession,
  apiCreateCodeSession,
  apiCreateSession,
} from '../api/client'
import type { Session } from '../types'

const PENDING_KEY_PREFIX = 'ccb:pending-message:'
const PENDING_MODEL_KEY_PREFIX = 'ccb:pending-model:'

/** 新会话希望激活的（非默认）供应商模型 — 会话创建时按环境目录选定 */
export interface PendingModelSelection {
  providerId: string
  modelProfileId: string
}

/**
 * 从首条消息创建会话：标题取消息前 40 字，首条消息暂存 sessionStorage，
 * 由 SessionDetail 在 adapter 就绪后自动发送。
 */
export async function createSessionWithFirstMessage(options: {
  text: string
  environmentId: string
  permissionMode?: string
  directory?: string
}): Promise<Session> {
  const text = options.text.trim()
  const title = text.length > 40 ? `${text.slice(0, 40)}…` : text
  const session = await apiCreateSession({
    title: title || '新对话',
    environment_id: options.environmentId,
    permission_mode: options.permissionMode,
    ...(options.directory?.trim()
      ? { directory: options.directory.trim() }
      : {}),
  })
  storePendingMessage(session.id, text)
  return session
}

export async function createChatSessionWithFirstMessage(options: {
  text: string
  projectId?: string | null
}): Promise<Session> {
  const text = options.text.trim()
  const title = text.length > 40 ? `${text.slice(0, 40)}…` : text
  const session = await apiCreateChatSession({
    title: title || '新对话',
    project_id: options.projectId ?? null,
  })
  storePendingMessage(session.id, text)
  return session
}

export async function createCodeSessionWithFirstMessage(options: {
  text: string
  environmentId: string
  permissionMode?: string
  directory?: string
  /** 非默认模型时暂存，由 SessionDetail 在会话就绪后切换 */
  model?: PendingModelSelection | null
}): Promise<Session> {
  const text = options.text.trim()
  const title = text.length > 40 ? `${text.slice(0, 40)}…` : text
  const session = await apiCreateCodeSession({
    title: title || '新会话',
    environment_id: options.environmentId,
    requested_directory: options.directory?.trim() || '',
    permission_mode: options.permissionMode,
  })
  storePendingMessage(session.id, text)
  if (options.model) storePendingModel(session.id, options.model)
  return session
}

function storePendingMessage(sessionId: string, text: string) {
  if (!text) return
  try {
    sessionStorage.setItem(PENDING_KEY_PREFIX + sessionId, text)
  } catch {
    // sessionStorage 不可用时忽略，用户可手动重发
  }
}

/** 取出并清除暂存的首条消息 */
export function takePendingMessage(sessionId: string): string | null {
  try {
    const key = PENDING_KEY_PREFIX + sessionId
    const value = sessionStorage.getItem(key)
    if (value !== null) sessionStorage.removeItem(key)
    return value
  } catch {
    return null
  }
}

function storePendingModel(sessionId: string, model: PendingModelSelection) {
  try {
    sessionStorage.setItem(
      PENDING_MODEL_KEY_PREFIX + sessionId,
      JSON.stringify(model),
    )
  } catch {
    // sessionStorage 不可用时忽略，会话将使用环境默认模型
  }
}

/** 取出并清除暂存的目标模型 */
export function takePendingModel(
  sessionId: string,
): PendingModelSelection | null {
  try {
    const key = PENDING_MODEL_KEY_PREFIX + sessionId
    const value = sessionStorage.getItem(key)
    if (value === null) return null
    sessionStorage.removeItem(key)
    const parsed = JSON.parse(value) as Partial<PendingModelSelection>
    if (
      typeof parsed?.providerId === 'string' &&
      typeof parsed?.modelProfileId === 'string'
    ) {
      return {
        providerId: parsed.providerId,
        modelProfileId: parsed.modelProfileId,
      }
    }
    return null
  } catch {
    return null
  }
}
