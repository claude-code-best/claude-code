import { useCallback, useEffect, useRef, useState } from 'react'
import { apiSendLiveEvent, getUuid } from '../api/client'
import {
  applyTerminalStreamFrame,
  applyTerminalTransportState,
  type TerminalStreamCursor,
} from './streamState'

/**
 * 会话终端 hook — 独立 EventSource 订阅同一 /events 流，只消费 terminal_*。
 *
 * 事件形状（RCS ingestBridgeMessage 的 else 分支把整条消息塞进 payload）：
 *   { type:'terminal_output',   payload:{ term_id, seq, data } }
 *   { type:'terminal_state',    payload:{ terminals:[...] } }
 *   { type:'terminal_snapshot', payload:{ term_id, data } }
 * 协议见 docs/features/session-terminals.md §4。
 */

export interface TerminalMeta {
  id: string
  name: string
  purpose?: string
  cwd: string
  cols: number
  rows: number
  alive: boolean
  fg_command?: string
  last_activity: number
  stream_id?: string
}

type Subscriber = {
  onData: (data: string) => void
  onReset: () => void
}

export interface SessionTerminalsApi {
  terminals: TerminalMeta[]
  connected: boolean
  /** 挂载 xterm 时订阅某终端：立即回放缓冲，之后流式接收 */
  subscribe: (termId: string, sub: Subscriber) => () => void
  sendInput: (termId: string, data: string) => void
  sendResize: (termId: string, cols: number, rows: number) => void
  openTerminal: (name?: string) => void
  closeTerminal: (termId: string) => void
  requestSync: () => void
}

export function useSessionTerminals(
  sessionId: string | null,
  enabled: boolean,
): SessionTerminalsApi {
  const [terminals, setTerminals] = useState<TerminalMeta[]>([])
  const [webConnected, setWebConnected] = useState(false)
  const [workerReady, setWorkerReady] = useState(false)

  const buffers = useRef(new Map<string, string>())
  const streamCursors = useRef(new Map<string, TerminalStreamCursor>())
  const subscribers = useRef(new Map<string, Set<Subscriber>>())
  const esRef = useRef<EventSource | null>(null)
  const workerReadyRef = useRef(false)
  const workerGenerationRef = useRef<string | null>(null)
  // SSE is durable and browsers normally resume with Last-Event-ID, but a
  // proxy/browser can still deliver a frame twice during reconnect. Keep a
  // local high-water mark so a replayed terminal snapshot/output cannot be
  // rendered twice by xterm.
  const lastEventSeq = useRef(0)

  const send = useCallback(
    (body: Record<string, unknown>) => {
      if (!sessionId || !workerReadyRef.current) return
      const commandId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      apiSendLiveEvent(sessionId, { ...body, command_id: commandId }).catch(
        err => {
          // Live commands are one-shot and never retried. A transient HTTP
          // failure does not prove the worker SSE is gone; readiness changes
          // only through terminal_transport_state.
          console.warn('[terminal] live command was not sent:', err)
        },
      )
    },
    [sessionId],
  )

  useEffect(() => {
    if (!sessionId || !enabled) return

    const uuid = getUuid()
    const url = `/web/sessions/${encodeURIComponent(sessionId)}/events?uuid=${encodeURIComponent(uuid)}`
    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('open', () => {
      setWebConnected(true)
    })
    es.addEventListener('error', () => {
      setWebConnected(false)
      workerReadyRef.current = false
      workerGenerationRef.current = null
      setWorkerReady(false)
    })

    const consumeEvent = (message: MessageEvent) => {
      let event: {
        type?: string
        payload?: Record<string, unknown>
        seqNum?: number
      }
      try {
        event = JSON.parse(message.data)
      } catch {
        return
      }
      const seq = Number(event.seqNum)
      if (Number.isFinite(seq) && seq > 0) {
        if (seq <= lastEventSeq.current) return
        lastEventSeq.current = seq
      }
      const type = event.type
      if (typeof type !== 'string' || !type.startsWith('terminal_')) return
      // RCS 把入站事件规范化成 { content, raw, uuid }，原始字段在 raw 里。
      // 兜底：若无 raw（未来协议变化）则直接用 payload。
      const outer = event.payload ?? {}
      const raw = (outer as { raw?: Record<string, unknown> }).raw
      const payload = raw && typeof raw === 'object' ? raw : outer

      if (type === 'terminal_transport_state') {
        const ready = payload.ready === true
        const generation =
          typeof payload.generation === 'string' ? payload.generation : null
        const transition = applyTerminalTransportState(
          {
            ready: workerReadyRef.current,
            generation: workerGenerationRef.current,
          },
          ready,
          generation,
        )
        workerReadyRef.current = transition.state.ready
        workerGenerationRef.current = transition.state.generation
        setWorkerReady(transition.state.ready)
        if (transition.shouldSync) send({ type: 'terminal_sync' })
        return
      }

      if (type === 'terminal_state') {
        const list = Array.isArray(payload.terminals)
          ? (payload.terminals as TerminalMeta[])
          : []
        setTerminals(list)
        return
      }
      if (type === 'terminal_output') {
        const termId = String(payload.term_id ?? '')
        const data = typeof payload.data === 'string' ? payload.data : ''
        if (!termId || !data) return
        const streamId = String(payload.stream_id ?? 'legacy')
        const current = streamCursors.current.get(termId) ?? {
          streamId: null,
          lastOutputSeq: 0,
          buffer: '',
        }
        const rawOutputSeq = Number(payload.output_seq)
        const update = applyTerminalStreamFrame(current, {
          type: 'terminal_output',
          streamId,
          outputSeq: Number.isFinite(rawOutputSeq)
            ? rawOutputSeq
            : current.lastOutputSeq + 1,
          data,
        })
        if (update.action === 'ignore') return
        streamCursors.current.set(termId, update.cursor)
        buffers.current.set(termId, update.cursor.buffer)
        const subs = subscribers.current.get(termId)
        if (subs) {
          for (const s of subs) {
            if (update.action === 'reset') s.onReset()
            if (update.data) s.onData(update.data)
          }
        }
        return
      }
      if (type === 'terminal_snapshot') {
        const termId = String(payload.term_id ?? '')
        const data = typeof payload.data === 'string' ? payload.data : ''
        if (!termId) return
        const streamId = String(payload.stream_id ?? 'legacy')
        const current = streamCursors.current.get(termId) ?? {
          streamId: null,
          lastOutputSeq: 0,
          buffer: '',
        }
        const rawWatermark = Number(payload.through_output_seq)
        const update = applyTerminalStreamFrame(current, {
          type: 'terminal_snapshot',
          streamId,
          throughOutputSeq: Number.isFinite(rawWatermark)
            ? rawWatermark
            : current.lastOutputSeq,
          data,
        })
        if (update.action === 'ignore') return
        streamCursors.current.set(termId, update.cursor)
        buffers.current.set(termId, update.cursor.buffer)
        const subs = subscribers.current.get(termId)
        if (subs) {
          for (const s of subs) {
            s.onReset()
            if (update.data) s.onData(update.data)
          }
        }
        return
      }
    }

    es.addEventListener('message', consumeEvent)
    es.addEventListener('live_event', consumeEvent)

    return () => {
      es.close()
      esRef.current = null
      setWebConnected(false)
      setWorkerReady(false)
      workerReadyRef.current = false
      workerGenerationRef.current = null
      lastEventSeq.current = 0
      buffers.current.clear()
      streamCursors.current.clear()
      setTerminals([])
    }
  }, [sessionId, enabled, send])

  const subscribe = useCallback((termId: string, sub: Subscriber) => {
    let set = subscribers.current.get(termId)
    if (!set) {
      set = new Set()
      subscribers.current.set(termId, set)
    }
    set.add(sub)
    // 立即回放已有缓冲
    const buffered = buffers.current.get(termId)
    if (buffered) sub.onData(buffered)
    return () => {
      set?.delete(sub)
    }
  }, [])

  const sendInput = useCallback(
    (termId: string, data: string) =>
      send({ type: 'terminal_input', term_id: termId, data }),
    [send],
  )
  const sendResize = useCallback(
    (termId: string, cols: number, rows: number) =>
      send({ type: 'terminal_resize', term_id: termId, cols, rows }),
    [send],
  )
  const openTerminal = useCallback(
    (name?: string) =>
      send({ type: 'terminal_open', ...(name ? { name } : {}) }),
    [send],
  )
  const closeTerminal = useCallback(
    (termId: string) => send({ type: 'terminal_close', term_id: termId }),
    [send],
  )
  const requestSync = useCallback(() => send({ type: 'terminal_sync' }), [send])

  return {
    terminals,
    connected: webConnected && workerReady,
    subscribe,
    sendInput,
    sendResize,
    openTerminal,
    closeTerminal,
    requestSync,
  }
}
