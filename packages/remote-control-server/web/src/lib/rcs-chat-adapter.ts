import type { SetStateAction } from 'react'
import {
  apiFetchSession,
  apiFetchSessionHistory,
  apiBind,
  apiSendEvent,
  apiSendControl,
  apiInterrupt,
  getUuid,
} from '../api/client'
import { generateMessageUuid } from './utils'
import type { SessionEvent, EventPayload } from '../types'
import type {
  ThreadEntry,
  ToolCallData,
  ToolCallStatus,
  UserMessageEntry,
  AssistantMessageEntry,
  ToolCallEntry,
  UserMessageImage,
  PendingPermission,
} from './types'

// SSE Event Bus — 复用自 rcs-transport.ts，仅保留连接管理
type SSEEventHandler = (event: SessionEvent) => void

class SSEBus {
  private listeners: Set<SSEEventHandler> = new Set()
  private eventSource: EventSource | null = null

  onEvent(handler: SSEEventHandler): () => void {
    this.listeners.add(handler)
    return () => this.listeners.delete(handler)
  }

  connect(sessionId: string): void {
    this.disconnect()
    const uuid = getUuid()
    const url = `/web/sessions/${sessionId}/events?uuid=${encodeURIComponent(uuid)}`
    const es = new EventSource(url)
    this.eventSource = es

    es.addEventListener('message', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SessionEvent
        for (const handler of this.listeners) {
          handler(data)
        }
      } catch {
        // ignore parse errors
      }
    })
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }
}

// 全局 SSE bus 实例
export const sseBus = new SSEBus()

// =============================================================================
// RCS Chat Adapter — 将 SSE 事件转为 ThreadEntry
// =============================================================================

function mapToolStatus(status: string): ToolCallStatus {
  if (status === 'completed') return 'complete'
  if (status === 'failed') return 'error'
  return 'running'
}

function extractEventText(payload: EventPayload): string {
  if (typeof payload.content === 'string') return payload.content
  if (payload.message && typeof payload.message === 'object') {
    const msg = payload.message as Record<string, unknown>
    if (typeof msg.content === 'string') return msg.content
    if (Array.isArray(msg.content)) {
      return (msg.content as Array<Record<string, unknown>>)
        .filter(b => b.type === 'text' && typeof b.text === 'string')
        .map(b => b.text as string)
        .join('')
    }
  }
  return ''
}

function findToolCallIndex(entries: ThreadEntry[], toolCallId: string): number {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (
      entry &&
      entry.type === 'tool_call' &&
      entry.toolCall.id === toolCallId
    ) {
      return i
    }
  }
  return -1
}

export class RCSChatAdapter {
  private sessionId: string
  private setEntries: React.Dispatch<SetStateAction<ThreadEntry[]>>
  private unsub: (() => void) | null = null
  private onStatusChange?: (status: string) => void
  private onError?: (error: string) => void
  private onPermissionRequest?: (permission: PendingPermission) => void

  constructor(
    sessionId: string,
    setEntries: React.Dispatch<SetStateAction<ThreadEntry[]>>,
    options?: {
      onStatusChange?: (status: string) => void
      onError?: (error: string) => void
      onPermissionRequest?: (permission: PendingPermission) => void
    },
  ) {
    this.sessionId = sessionId
    this.setEntries = setEntries
    this.onStatusChange = options?.onStatusChange
    this.onError = options?.onError
    this.onPermissionRequest = options?.onPermissionRequest
  }

  /** 初始化：绑定会话、加载历史、连接 SSE */
  async init(): Promise<void> {
    try {
      await apiBind(this.sessionId)
    } catch {
      // may already be bound
    }

    await this.loadHistory()
    this.connectSSE()
  }

  /** 加载历史事件并转为 ThreadEntry */
  async loadHistory(): Promise<void> {
    const { events } = await apiFetchSessionHistory(this.sessionId)
    if (!events || events.length === 0) return

    const historyEntries: ThreadEntry[] = []
    let currentAssistant: AssistantMessageEntry | null = null

    const flushAssistant = () => {
      if (currentAssistant) {
        historyEntries.push(currentAssistant)
        currentAssistant = null
      }
    }

    for (const event of events) {
      const payload = event.payload || ({} as EventPayload)

      if (event.type === 'user') {
        if (event.direction === 'outbound') continue // skip echoed user messages
        flushAssistant()
        const text = extractEventText(payload)
        if (text) {
          historyEntries.push({
            type: 'user_message',
            id: event.id || `hist-user-${historyEntries.length}`,
            content: text,
          })
        }
      } else if (event.type === 'assistant') {
        flushAssistant()
        const text = extractEventText(payload)
        const toolParts: ThreadEntry[] = []

        const msg = payload.message as Record<string, unknown> | undefined
        if (msg && typeof msg === 'object' && Array.isArray(msg.content)) {
          for (const block of msg.content as Array<Record<string, unknown>>) {
            if (block.type === 'tool_use') {
              toolParts.push({
                type: 'tool_call',
                toolCall: {
                  id:
                    (block.id as string) ||
                    `hist-tool-${historyEntries.length}`,
                  title: (block.name as string) || 'tool',
                  status: 'complete',
                  rawInput: (block.input as Record<string, unknown>) || {},
                },
              })
            }
          }
        }

        if (text || toolParts.length > 0) {
          currentAssistant = {
            type: 'assistant_message',
            id: event.id || `hist-asst-${historyEntries.length}`,
            chunks: text ? [{ type: 'message', text }] : [],
          }
          historyEntries.push(currentAssistant)
          // Push tool calls after assistant message
          for (const tp of toolParts) {
            historyEntries.push(tp)
          }
          currentAssistant = null // Tool calls are separate entries
        }
      } else if (event.type === 'tool_use') {
        const p = payload as Record<string, unknown>
        const tc: ToolCallEntry = {
          type: 'tool_call',
          toolCall: {
            id:
              (p.tool_call_id as string) ||
              `hist-tool-${historyEntries.length}`,
            title: (p.tool_name as string) || 'tool',
            status: 'complete',
            rawInput: (p.tool_input as Record<string, unknown>) || {},
          },
        }
        historyEntries.push(tc)
      } else if (event.type === 'tool_result') {
        const p = payload as Record<string, unknown>
        // Find last tool call and update with output
        const idx = findToolCallIndex(
          historyEntries,
          (p.tool_call_id as string) || '',
        )
        if (idx >= 0) {
          const entry = historyEntries[idx] as ToolCallEntry
          historyEntries[idx] = {
            type: 'tool_call',
            toolCall: {
              ...entry.toolCall,
              rawOutput: { output: p.content || p.output || '' },
            },
          }
        }
      }
    }

    flushAssistant()
    this.setEntries(historyEntries)
  }

  /** 连接 SSE 事件流 */
  connectSSE(): void {
    sseBus.connect(this.sessionId)
    this.unsub = sseBus.onEvent(event => this.handleEvent(event))
  }

  /** 断开 SSE */
  disconnect(): void {
    if (this.unsub) {
      this.unsub()
      this.unsub = null
    }
    sseBus.disconnect()
  }

  /** 处理 SSE 事件 */
  handleEvent(event: SessionEvent): void {
    const type = event.type
    const payload = event.payload || ({} as EventPayload)

    // Skip bridge init noise
    const serialized = JSON.stringify(event)
    if (/Remote Control connecting/i.test(serialized)) return

    switch (type) {
      // ---- 助手消息 ----
      case 'assistant': {
        const content =
          typeof payload.content === 'string' ? payload.content : ''
        this.setEntries(prev => {
          const lastEntry = prev[prev.length - 1]

          // If last entry is AssistantMessage, append to it
          if (lastEntry?.type === 'assistant_message') {
            const lastChunk = lastEntry.chunks[lastEntry.chunks.length - 1]
            if (lastChunk?.type === 'message') {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastEntry,
                  chunks: [
                    ...lastEntry.chunks.slice(0, -1),
                    { type: 'message', text: lastChunk.text + content },
                  ],
                },
              ]
            }
            return [
              ...prev.slice(0, -1),
              {
                ...lastEntry,
                chunks: [
                  ...lastEntry.chunks,
                  { type: 'message', text: content },
                ],
              },
            ]
          }

          // Create new AssistantMessage
          if (content && content.trim()) {
            const newEntry: AssistantMessageEntry = {
              type: 'assistant_message',
              id: `assistant-${Date.now()}`,
              chunks: [{ type: 'message', text: content }],
            }
            return [...prev, newEntry]
          }
          return prev
        })

        // Check for embedded tool_use blocks
        const msg = payload.message as Record<string, unknown> | undefined
        if (msg && typeof msg === 'object' && Array.isArray(msg.content)) {
          const toolBlocks = (
            msg.content as Array<Record<string, unknown>>
          ).filter(b => b.type === 'tool_use')
          for (const block of toolBlocks) {
            const toolCallId =
              (block.id as string) ||
              `call-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
            const toolData: ToolCallData = {
              id: toolCallId,
              title: (block.name as string) || 'tool',
              status: 'running',
              rawInput: (block.input as Record<string, unknown>) || {},
            }
            this.setEntries(prev => [
              ...prev,
              { type: 'tool_call', toolCall: toolData },
            ])
          }
        }
        break
      }

      // ---- 工具调用 ----
      case 'tool_use': {
        const p = payload as Record<string, unknown>
        const toolCallId = (p.tool_call_id as string) || `call-${Date.now()}`
        const toolData: ToolCallData = {
          id: toolCallId,
          title: (p.tool_name as string) || 'tool',
          status: 'running',
          rawInput: (p.tool_input as Record<string, unknown>) || {},
        }
        this.setEntries(prev => [
          ...prev,
          { type: 'tool_call', toolCall: toolData },
        ])
        break
      }

      // ---- 工具结果 ----
      case 'tool_result': {
        const p = payload as Record<string, unknown>
        const callId = (p.tool_call_id as string) || ''
        this.setEntries(prev => {
          const idx = findToolCallIndex(prev, callId)
          if (idx < 0) return prev
          const entry = prev[idx] as ToolCallEntry
          return prev.map((e, i) =>
            i === idx
              ? {
                  type: 'tool_call',
                  toolCall: {
                    ...entry.toolCall,
                    status: 'complete' as ToolCallStatus,
                    rawOutput: { output: p.content || p.output || '' },
                  },
                }
              : e,
          )
        })
        break
      }

      // ---- 权限请求 ----
      case 'control_request':
      case 'permission_request': {
        const req = payload.request as Record<string, unknown> | undefined
        if (req && req.subtype === 'can_use_tool') {
          const requestId = payload.request_id || ''
          const toolName = (req.tool_name as string) || 'unknown'
          const toolInput = (req.input || req.tool_input || {}) as Record<
            string,
            unknown
          >
          const description = (req.description as string) || ''

          // Update tool call status
          this.setEntries(prev => {
            // Find matching tool call
            const idx = [...prev]
              .reverse()
              .findIndex(e => e.type === 'tool_call')
            if (idx >= 0) {
              const realIdx = prev.length - 1 - idx
              const entry = prev[realIdx] as ToolCallEntry
              if (entry.toolCall.status === 'running') {
                return prev.map((e, i) =>
                  i === realIdx
                    ? {
                        type: 'tool_call',
                        toolCall: {
                          ...entry.toolCall,
                          status: 'waiting_for_confirmation' as ToolCallStatus,
                          permissionRequest: { requestId, options: [] },
                        },
                      }
                    : e,
                )
              }
            }
            return prev
          })

          // Notify parent
          this.onPermissionRequest?.({
            requestId,
            toolName,
            toolInput,
            description,
          })
        }
        break
      }

      // ---- 会话状态 ----
      case 'session_status': {
        if (typeof payload.status === 'string') {
          this.onStatusChange?.(payload.status)
        }
        break
      }

      // ---- 错误 ----
      case 'error': {
        const errorMsg = String(
          payload.message || payload.content || 'Unknown error',
        )
        this.onError?.(errorMsg)
        break
      }

      // ---- 忽略的事件类型 ----
      case 'partial_assistant':
      case 'result':
      case 'result_success':
      case 'control_response':
      case 'permission_response':
      case 'system':
      case 'task_state':
      case 'automation_state':
      case 'status':
        break
    }
  }

  /** 发送用户消息 */
  async sendMessage(text: string, images?: UserMessageImage[]): Promise<void> {
    if (!text.trim() && (!images || images.length === 0)) return

    // Add user message to entries
    const userEntry: UserMessageEntry = {
      type: 'user_message',
      id: `user-${Date.now()}`,
      content: text,
      images: images && images.length > 0 ? images : undefined,
    }
    this.setEntries(prev => [...prev, userEntry])

    // Send to backend
    await apiSendEvent(this.sessionId, {
      type: 'user',
      uuid: generateMessageUuid(),
      content: text,
      message: { content: text },
    })
  }

  /** 响应权限请求 */
  async respondPermission(
    requestId: string,
    approved: boolean,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    await apiSendControl(this.sessionId, {
      type: 'permission_response',
      approved,
      request_id: requestId,
      ...extra,
    })

    // Update tool call status
    this.setEntries(prev =>
      prev.map(entry => {
        if (entry.type !== 'tool_call') return entry
        if (entry.toolCall.permissionRequest?.requestId !== requestId)
          return entry
        return {
          type: 'tool_call',
          toolCall: {
            ...entry.toolCall,
            status: approved ? 'running' : ('rejected' as ToolCallStatus),
            permissionRequest: undefined,
          },
        }
      }),
    )
  }

  /** 中断当前操作 */
  async interrupt(): Promise<void> {
    // Mark running tools as canceled
    this.setEntries(prev =>
      prev.map(entry => {
        if (entry.type !== 'tool_call') return entry
        if (
          entry.toolCall.status !== 'running' &&
          entry.toolCall.status !== 'waiting_for_confirmation'
        )
          return entry
        return {
          type: 'tool_call',
          toolCall: {
            ...entry.toolCall,
            status: 'canceled' as ToolCallStatus,
            permissionRequest: undefined,
          },
        }
      }),
    )

    await apiInterrupt(this.sessionId)
  }
}
