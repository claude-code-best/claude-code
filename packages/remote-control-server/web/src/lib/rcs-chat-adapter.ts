import type { SetStateAction } from 'react'
import {
  apiBind,
  apiFetchSessionHistory,
  apiInterrupt,
  apiSendControl,
  apiSendControlRequest,
  apiSendEvent,
  getUuid,
} from '../api/client'
import type {
  EventPayload,
  SessionEvent,
  SessionInitInfo,
  TokenUsageTotals,
} from '../types'
import {
  createSessionEventState,
  reduceSessionEvent,
} from './session-event-reducer'
import type {
  PendingPermission,
  SessionRuntimeState,
  SessionEventState,
  ThreadEntry,
  ToolCallStatus,
  UserMessageImage,
} from './types'
import { generateMessageUuid } from './utils'
import { toTransientSessionEvent } from './live-session-event'

/** Result of an SDK control request (set_model / set_permission_mode …). */
export type ControlRequestResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }

const CONTROL_REQUEST_TIMEOUT_MS = 15_000

interface AdapterOptions {
  onStatusChange?: (status: string) => void
  onError?: (error: string) => void
  onPermissionRequest?: (permission: PendingPermission) => void
  onPermissionsChange?: (permissions: PendingPermission[]) => void
  /** Fired when system/init metadata arrives or changes. */
  onSessionInfo?: (info: SessionInitInfo) => void
  /** Fired when the server accepts an automatic session title. */
  onSessionTitle?: (title: string) => void
  /** Fired when cumulative token usage changes. */
  onUsage?: (usage: TokenUsageTotals, lastModel: string | null) => void
  /** Fired when authoritative turn/task/tool runtime signals change. */
  onRuntimeChange?: (runtime: SessionRuntimeState) => void
}

interface InitOptions {
  live?: boolean
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function isBridgeNoise(event: SessionEvent): boolean {
  return /Remote Control connecting/i.test(JSON.stringify(event))
}

export class RCSChatAdapter {
  private readonly sessionId: string
  private readonly setEntries: React.Dispatch<SetStateAction<ThreadEntry[]>>
  private readonly onStatusChange?: (status: string) => void
  private readonly onError?: (error: string) => void
  private readonly onPermissionRequest?: (permission: PendingPermission) => void
  private readonly onPermissionsChange?: (
    permissions: PendingPermission[],
  ) => void
  private readonly onSessionInfo?: (info: SessionInitInfo) => void
  private readonly onSessionTitle?: (title: string) => void
  private readonly onUsage?: (
    usage: TokenUsageTotals,
    lastModel: string | null,
  ) => void
  private readonly onRuntimeChange?: (runtime: SessionRuntimeState) => void
  private state: SessionEventState = createSessionEventState()
  private eventSource: EventSource | null = null
  private abortController: AbortController | null = null
  private generation = 0
  private readonly pendingControls = new Map<
    string,
    {
      resolve: (result: ControlRequestResult) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  constructor(
    sessionId: string,
    setEntries: React.Dispatch<SetStateAction<ThreadEntry[]>>,
    options?: AdapterOptions,
  ) {
    this.sessionId = sessionId
    this.setEntries = setEntries
    this.onStatusChange = options?.onStatusChange
    this.onError = options?.onError
    this.onPermissionRequest = options?.onPermissionRequest
    this.onPermissionsChange = options?.onPermissionsChange
    this.onSessionInfo = options?.onSessionInfo
    this.onSessionTitle = options?.onSessionTitle
    this.onUsage = options?.onUsage
    this.onRuntimeChange = options?.onRuntimeChange
  }

  /** Bind, page durable history, then resume live events from the final cursor. */
  async init(
    signal?: AbortSignal,
    options: InitOptions = {},
  ): Promise<boolean> {
    const generation = ++this.generation
    this.abortController?.abort()
    this.abortController = new AbortController()
    this.closeEventSource()
    this.state = createSessionEventState()
    this.setEntries([])

    const controller = this.abortController
    const abortFromCaller = () => controller.abort()
    if (signal?.aborted) controller.abort()
    else signal?.addEventListener('abort', abortFromCaller, { once: true })

    try {
      try {
        await apiBind(this.sessionId, controller.signal)
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return false
        // A session may already be bound. History ownership is authoritative.
      }

      const cursor = await this.loadHistory(controller.signal, generation)
      if (
        options.live !== false &&
        !controller.signal.aborted &&
        generation === this.generation
      ) {
        this.connectSSE(cursor, generation)
      }
      return !controller.signal.aborted && generation === this.generation
    } catch (error) {
      if (
        controller.signal.aborted ||
        generation !== this.generation ||
        isAbortError(error)
      ) {
        return false
      }
      throw error
    } finally {
      signal?.removeEventListener('abort', abortFromCaller)
      if (this.abortController === controller) this.abortController = null
    }
  }

  /** Load every durable history page through the same reducer used for SSE. */
  async loadHistory(
    signal?: AbortSignal,
    generation = this.generation,
  ): Promise<number> {
    let cursor = 0

    while (!signal?.aborted && generation === this.generation) {
      const page = await apiFetchSessionHistory(this.sessionId, {
        after: cursor,
        limit: 500,
        signal,
      })
      if (signal?.aborted || generation !== this.generation) return cursor

      const beforePage = this.state
      for (const event of page.events) {
        if (isBridgeNoise(event)) continue
        this.state = reduceSessionEvent(this.state, event)
      }
      this.setEntries(this.state.entries)
      this.notifyDerivedState(beforePage)

      const nextCursor = page.next_cursor
      if (!page.has_more) return nextCursor
      if (nextCursor <= cursor) {
        throw new Error('Session history cursor did not advance')
      }
      cursor = nextCursor
    }

    return cursor
  }

  /** Replace this adapter's own EventSource without affecting other adapters. */
  connectSSE(
    fromSequenceNum = this.state.highWaterSeq,
    generation = this.generation,
  ): void {
    this.closeEventSource()
    const params = new URLSearchParams({
      uuid: getUuid(),
      from_sequence_num: String(fromSequenceNum),
    })
    const source = new EventSource(
      `/web/sessions/${encodeURIComponent(this.sessionId)}/events?${params.toString()}`,
    )
    this.eventSource = source

    source.addEventListener('message', (message: MessageEvent) => {
      if (generation !== this.generation || this.eventSource !== source) return
      try {
        this.handleEvent(JSON.parse(message.data) as SessionEvent)
      } catch {
        // Ignore malformed frames; EventSource remains usable.
      }
    })
    source.addEventListener('live_event', (message: MessageEvent) => {
      if (generation !== this.generation || this.eventSource !== source) return
      try {
        const event = toTransientSessionEvent(
          JSON.parse(message.data) as unknown,
          this.sessionId,
        )
        if (event) this.handleEvent(event)
      } catch {
        // Ignore malformed transient frames; EventSource remains usable.
      }
    })
  }

  /** Abort in-flight history and close only the stream owned by this adapter. */
  disconnect(): void {
    this.generation++
    this.abortController?.abort()
    this.abortController = null
    this.closeEventSource()
    for (const [requestId, pending] of this.pendingControls) {
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, error: 'Session disconnected' })
      this.pendingControls.delete(requestId)
    }
  }

  /** Latest session metadata announced by the CLI (system/init). */
  get sessionInfo(): SessionInitInfo | null {
    return this.state.sessionInfo
  }

  /** Cumulative token usage aggregated from assistant events. */
  get usage(): TokenUsageTotals {
    return this.state.usage
  }

  get runtime(): SessionRuntimeState {
    return this.state.runtime
  }

  /** Fire onSessionInfo/onUsage when the reducer changed those slices. */
  private notifyDerivedState(previous: SessionEventState): void {
    if (
      this.state.sessionInfo &&
      this.state.sessionInfo !== previous.sessionInfo
    ) {
      this.onSessionInfo?.(this.state.sessionInfo)
    }
    if (
      this.state.usage !== previous.usage ||
      this.state.lastAssistantModel !== previous.lastAssistantModel
    ) {
      this.onUsage?.(this.state.usage, this.state.lastAssistantModel)
    }
    if (this.state.runtime !== previous.runtime) {
      this.onRuntimeChange?.(this.state.runtime)
    }
    if (this.state.pendingPermissions !== previous.pendingPermissions) {
      const nextPermissions = Object.values(this.state.pendingPermissions)
      this.onPermissionsChange?.(nextPermissions)
      for (const permission of nextPermissions) {
        if (!previous.pendingPermissions[permission.requestId]) {
          this.onPermissionRequest?.(permission)
        }
      }
    }
  }

  private closeEventSource(): void {
    const source = this.eventSource
    this.eventSource = null
    source?.close()
  }

  private replaceEntries(
    update: (entries: ThreadEntry[]) => ThreadEntry[],
  ): void {
    const entries = update(this.state.entries)
    if (entries === this.state.entries) return
    this.state = { ...this.state, entries }
    this.setEntries(entries)
  }

  /** Reduce a canonical history/live/optimistic event exactly once. */
  handleEvent(event: SessionEvent): void {
    if (isBridgeNoise(event)) return

    const wasSeen = this.state.seenEventIds.has(event.id)
    const previousState = this.state
    this.state = reduceSessionEvent(this.state, event)
    if (this.state.entries !== previousState.entries) {
      this.setEntries(this.state.entries)
    }
    this.notifyDerivedState(previousState)
    if (wasSeen) return

    const payload = event.payload ?? ({} as EventPayload)
    const rawPayload =
      payload.raw && typeof payload.raw === 'object' ? payload.raw : undefined
    if (event.type === 'session_status' && typeof payload.status === 'string') {
      this.onStatusChange?.(payload.status)
      return
    }
    if (event.type === 'session_title' && typeof payload.title === 'string') {
      this.onSessionTitle?.(payload.title)
      return
    }
    if (event.type === 'session_start_failed') {
      const code =
        typeof payload.code === 'string' ? payload.code : 'session_start_failed'
      const message =
        typeof payload.message === 'string' ? payload.message : code
      this.onError?.(`${code}: ${message}`)
      return
    }
    if (event.type === 'control_response') {
      const response =
        payload.response ??
        (rawPayload?.response as EventPayload['response'] | undefined)
      const requestId = response?.request_id
      if (requestId) {
        const pending = this.pendingControls.get(requestId)
        if (pending) {
          this.pendingControls.delete(requestId)
          clearTimeout(pending.timer)
          pending.resolve(
            response?.subtype === 'error'
              ? { ok: false, error: response.error || '操作失败' }
              : { ok: true, data: response?.response },
          )
        }
      }
      return
    }
    if (event.type === 'error') {
      const message = String(
        payload.message || payload.content || 'Unknown error',
      )
      this.onError?.(message)
      return
    }
  }

  /** Send one stable UUID for both the optimistic entry and durable request. */
  async sendMessage(text: string, images?: UserMessageImage[]): Promise<void> {
    if (!text.trim() && (!images || images.length === 0)) return

    const uuid = generateMessageUuid()
    const optimisticEventId = `optimistic:${uuid}`
    const previousRuntime = this.state.runtime
    this.handleEvent({
      id: optimisticEventId,
      sessionId: this.sessionId,
      type: 'user',
      payload: {
        uuid,
        content: text,
        message: { content: text },
        ...(images && images.length > 0 ? { images } : {}),
      },
      direction: 'outbound',
      seqNum: this.state.highWaterSeq,
      createdAt: Date.now(),
    })
    const optimisticRuntime = this.state.runtime

    try {
      await apiSendEvent(this.sessionId, {
        type: 'user',
        uuid,
        content: text,
        message: { content: text },
      })
    } catch (error) {
      const optimisticIndex = this.state.entries.findIndex(
        entry => entry.type === 'user_message' && entry.id === uuid,
      )
      const hasResponseAfterOptimistic =
        optimisticIndex >= 0 && optimisticIndex < this.state.entries.length - 1
      if (optimisticIndex >= 0 && !hasResponseAfterOptimistic) {
        const previousState = this.state
        const seenEventIds = new Set(this.state.seenEventIds)
        seenEventIds.delete(optimisticEventId)
        const seenMessageKeys = new Set(this.state.seenMessageKeys)
        seenMessageKeys.delete(`user:${uuid}`)
        this.state = {
          ...this.state,
          entries: this.state.entries.filter(
            (_entry, index) => index !== optimisticIndex,
          ),
          seenEventIds,
          seenMessageKeys,
          runtime:
            this.state.runtime === optimisticRuntime
              ? previousRuntime
              : this.state.runtime,
        }
        this.setEntries(this.state.entries)
        this.notifyDerivedState(previousState)
      }
      throw error
    }
  }

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

    this.replaceEntries(entries =>
      entries.map(entry => {
        if (entry.type !== 'tool_call') return entry
        if (entry.toolCall.permissionRequest?.requestId !== requestId) {
          return entry
        }
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

  /**
   * Send an SDK control request to the CLI and await its control_response
   * (matched by request_id via the SSE stream). Resolves { ok: false } on
   * timeout so callers can surface a friendly error instead of hanging.
   */
  async sendControlRequest(
    subtype: string,
    params: Record<string, unknown> = {},
    timeoutMs = CONTROL_REQUEST_TIMEOUT_MS,
  ): Promise<ControlRequestResult> {
    const requestId = generateMessageUuid()
    const result = new Promise<ControlRequestResult>(resolve => {
      const timer = setTimeout(() => {
        this.pendingControls.delete(requestId)
        resolve({ ok: false, error: '等待 CLI 响应超时，请确认会话在线' })
      }, timeoutMs)
      this.pendingControls.set(requestId, { resolve, timer })
    })

    try {
      const accepted = await apiSendControlRequest(this.sessionId, requestId, {
        subtype,
        ...params,
      })
      // Offline/deferred model changes are durable intent updates. There is
      // intentionally no worker response to wait for in that case.
      if (
        accepted.deferred === true ||
        accepted.awaiting_worker_confirmation === false
      ) {
        const pending = this.pendingControls.get(requestId)
        if (pending) {
          this.pendingControls.delete(requestId)
          clearTimeout(pending.timer)
          pending.resolve({ ok: true, data: accepted })
        }
      }
    } catch (err) {
      const pending = this.pendingControls.get(requestId)
      if (pending) {
        this.pendingControls.delete(requestId)
        clearTimeout(pending.timer)
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : '发送控制请求失败',
      }
    }

    return result
  }

  /** Switch the session model; null/undefined restores the default. */
  setModel(model: string | null): Promise<ControlRequestResult> {
    return this.sendControlRequest('set_model', { model: model ?? 'default' })
  }

  /** Atomically activate one catalog model and wait for Worker confirmation. */
  setProviderModel(input: {
    providerId: string
    modelProfileId: string
    providerConfigRevision: number
  }): Promise<ControlRequestResult> {
    return this.sendControlRequest('set_session_model', {
      provider_id: input.providerId,
      model_profile_id: input.modelProfileId,
      expected_provider_config_revision: input.providerConfigRevision,
      operation_id: generateMessageUuid(),
    })
  }

  /** Switch permission mode (default / acceptEdits / plan / bypassPermissions). */
  setPermissionMode(mode: string): Promise<ControlRequestResult> {
    return this.sendControlRequest('set_permission_mode', { mode })
  }

  /** Toggle extended thinking; null disables, a number sets the budget. */
  setMaxThinkingTokens(
    maxTokens: number | null,
  ): Promise<ControlRequestResult> {
    return this.sendControlRequest('set_max_thinking_tokens', {
      max_thinking_tokens: maxTokens,
    })
  }

  async interrupt(): Promise<void> {
    this.replaceEntries(entries =>
      entries.map(entry => {
        if (entry.type !== 'tool_call') return entry
        if (
          entry.toolCall.status !== 'running' &&
          entry.toolCall.status !== 'waiting_for_confirmation'
        ) {
          return entry
        }
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
