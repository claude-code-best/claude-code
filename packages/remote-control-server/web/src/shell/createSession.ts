import {
  apiCreateChatSession,
  apiCreateCodeSession,
  apiCreateSession,
} from '../api/client'
import type { Session } from '../types'

const PENDING_KEY_PREFIX = 'ccb:pending-message:'
const PENDING_MODEL_KEY_PREFIX = 'ccb:pending-model:'
const NEW_SESSION_WORKSPACE_KEY = 'ccb:new-session-workspace'

/**
 * Workspace context carried into Code Home when starting a new conversation
 * from a project or from within a project's session, so the composer defaults
 * to that project's environment + directory instead of a blank picker.
 */
export interface NewSessionWorkspace {
  environmentId?: string | null
  directory?: string | null
}

export function stashNewSessionWorkspace(context: NewSessionWorkspace): void {
  try {
    sessionStorage.setItem(NEW_SESSION_WORKSPACE_KEY, JSON.stringify(context))
  } catch {
    // sessionStorage 不可用时忽略，退回空白 Code 首页。
  }
}

/** Read and clear the stashed workspace context (one-shot). */
export function takeNewSessionWorkspace(): NewSessionWorkspace | null {
  try {
    const value = sessionStorage.getItem(NEW_SESSION_WORKSPACE_KEY)
    if (value === null) return null
    sessionStorage.removeItem(NEW_SESSION_WORKSPACE_KEY)
    const parsed = JSON.parse(value) as NewSessionWorkspace
    if (parsed && typeof parsed === 'object') {
      return {
        environmentId:
          typeof parsed.environmentId === 'string'
            ? parsed.environmentId
            : null,
        directory:
          typeof parsed.directory === 'string' ? parsed.directory : null,
      }
    }
    return null
  } catch {
    return null
  }
}

/** 新会话希望激活的（非默认）供应商模型 — 会话创建时按环境目录选定 */
export interface PendingModelSelection {
  providerId: string
  modelProfileId: string
}

/**
 * 从首条消息创建会话。标题由桥接层在首条真实用户消息到达后异步生成，
 * 首条消息暂存 sessionStorage，由 SessionDetail 在 adapter 就绪后自动发送。
 */
export async function createSessionWithFirstMessage(options: {
  text: string
  environmentId: string
  permissionMode?: string
  directory?: string
}): Promise<Session> {
  const text = options.text.trim()
  const session = await apiCreateSession({
    title: null,
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
  const session = await apiCreateChatSession({
    title: null,
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
  const session = await apiCreateCodeSession({
    title: null,
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
