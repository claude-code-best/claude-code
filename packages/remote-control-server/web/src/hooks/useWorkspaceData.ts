import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  apiFetchChatProjects,
  apiFetchChatSessions,
  apiFetchCodeProjects,
  apiFetchCodeSessions,
  apiFetchEnvironments,
} from '../api/client'
import type { Environment, ProductWorkspaceData, Session } from '../types'
import { sessionTimestamp } from '../shell/format'

const EMPTY_PRODUCT_DATA: ProductWorkspaceData = {
  sessions: [],
  projects: [],
  environments: [],
}

/**
 * 工作区数据 — 会话 + 环境列表，10s 轮询（与旧 Dashboard 一致）。
 * 新外壳的侧边栏与各页面共享这一份数据。
 */
export function useWorkspaceData(pollMs = 10_000) {
  const [chat, setChat] = useState<ProductWorkspaceData>(EMPTY_PRODUCT_DATA)
  const [code, setCode] = useState<ProductWorkspaceData>(EMPTY_PRODUCT_DATA)
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [chatSessions, chatProjects, codeSessions, codeProjects, envs] =
        await Promise.all([
          apiFetchChatSessions(true),
          apiFetchChatProjects(),
          apiFetchCodeSessions(true),
          apiFetchCodeProjects(true),
          apiFetchEnvironments(),
        ])
      setChat({
        sessions: chatSessions || [],
        projects: chatProjects || [],
        environments: envs || [],
      })
      setCode({
        sessions: codeSessions || [],
        projects: codeProjects || [],
        environments: envs || [],
      })
      setEnvironments(envs || [])
      setLoaded(true)
    } catch (err) {
      console.error('[useWorkspaceData] refresh failed:', err)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, pollMs)
    return () => clearInterval(timer)
  }, [refresh, pollMs])

  // Legacy pages still consume `sessions`; expose only active product sessions.
  const sessions = useMemo<Session[]>(
    () =>
      [...chat.sessions, ...code.sessions]
        .filter(session => session.status !== 'archived')
        .sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a)),
    [chat.sessions, code.sessions],
  )

  return { chat, code, sessions, environments, loaded, refresh }
}
