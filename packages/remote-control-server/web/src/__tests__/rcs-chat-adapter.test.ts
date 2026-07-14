import { beforeEach, describe, expect, test } from 'bun:test'
import type { Dispatch, SetStateAction } from 'react'
import { RCSChatAdapter } from '../lib/rcs-chat-adapter'
import type {
  PendingPermission,
  SessionRuntimeState,
  ThreadEntry,
} from '../lib/types'
import type { SessionEvent, SessionHistoryResponse } from '../types'

class FakeEventSource {
  static instances: FakeEventSource[] = []

  readonly url: string
  closed = false
  private listeners = new Set<(event: MessageEvent) => void>()

  constructor(url: string | URL) {
    this.url = String(url)
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type !== 'message') return
    this.listeners.add(listener as (event: MessageEvent) => void)
  }

  close() {
    this.closed = true
  }

  emit(event: SessionEvent) {
    for (const listener of this.listeners) {
      listener(new MessageEvent('message', { data: JSON.stringify(event) }))
    }
  }
}

function event(seqNum: number, content: string, uuid: string): SessionEvent {
  return {
    id: `event-${seqNum}`,
    sessionId: 'session-1',
    type: 'assistant',
    payload: { content, uuid },
    direction: 'inbound',
    seqNum,
    createdAt: 1_700_000_000_000 + seqNum,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function emptyHistory(cursor = 0): SessionHistoryResponse {
  return {
    events: [],
    next_cursor: cursor,
    has_more: false,
    oldest_available_seq: null,
    truncated: false,
  }
}

function createHarness(
  sessionId = 'session-1',
  onRuntimeChange?: (runtime: SessionRuntimeState) => void,
  onPermissionRequest?: (permission: PendingPermission) => void,
) {
  let entries: ThreadEntry[] = []
  const setEntries = ((action: SetStateAction<ThreadEntry[]>) => {
    entries = typeof action === 'function' ? action(entries) : action
  }) as Dispatch<SetStateAction<ThreadEntry[]>>
  const adapter = new RCSChatAdapter(sessionId, setEntries, {
    onRuntimeChange,
    onPermissionRequest,
  })
  return { adapter, getEntries: () => entries }
}

function assistantText(entries: ThreadEntry[]): string {
  return entries
    .filter(entry => entry.type === 'assistant_message')
    .flatMap(entry => entry.chunks)
    .filter(chunk => chunk.type === 'message')
    .map(chunk => chunk.text)
    .join('')
}

describe('RCSChatAdapter lifecycle', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      value: FakeEventSource,
    })
    const storage = new Map<string, string>([['rcs_uuid', 'owner-1']])
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
    })
  })

  test('double init leaves one owned source and delivers one copy', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      return jsonResponse(url.includes('/history') ? emptyHistory() : {})
    }) as typeof fetch
    const harness = createHarness()

    await harness.adapter.init()
    await harness.adapter.init()

    expect(FakeEventSource.instances).toHaveLength(2)
    expect(FakeEventSource.instances[0]?.closed).toBe(true)
    expect(FakeEventSource.instances[1]?.closed).toBe(false)
    FakeEventSource.instances[1]!.emit(event(1, 'X', 'assistant-1'))
    expect(assistantText(harness.getEntries())).toBe('X')
  })

  test('disconnecting an older adapter cannot close a newer adapter source', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      jsonResponse(
        String(input).includes('/history') ? emptyHistory() : {},
      )) as typeof fetch
    const older = createHarness('session-old')
    const newer = createHarness('session-new')

    await older.adapter.init()
    await newer.adapter.init()
    older.adapter.disconnect()

    expect(FakeEventSource.instances[0]?.closed).toBe(true)
    expect(FakeEventSource.instances[1]?.closed).toBe(false)
  })

  test('disconnect aborts delayed history and prevents a late source', async () => {
    let historyStarted!: () => void
    const started = new Promise<void>(resolve => {
      historyStarted = resolve
    })
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes('/history')) {
        return Promise.resolve(jsonResponse({}))
      }
      historyStarted()
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })
    }) as typeof fetch
    const harness = createHarness()

    const initializing = harness.adapter.init()
    await started
    harness.adapter.disconnect()
    await initializing

    expect(FakeEventSource.instances).toHaveLength(0)
  })

  test('pages history, resumes from the final cursor, and folds a boundary replay', async () => {
    const first = event(1, 'X', 'assistant-1')
    const second = event(2, 'Y', 'assistant-2')
    const historyUrls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (!url.includes('/history')) return jsonResponse({})
      historyUrls.push(url)
      return jsonResponse(
        historyUrls.length === 1
          ? {
              events: [first],
              next_cursor: 1,
              has_more: true,
              oldest_available_seq: 1,
              truncated: false,
            }
          : {
              events: [second],
              next_cursor: 2,
              has_more: false,
              oldest_available_seq: 1,
              truncated: false,
            },
      )
    }) as typeof fetch
    const harness = createHarness()

    await harness.adapter.init()

    expect(historyUrls[0]).toContain('after=0')
    expect(historyUrls[1]).toContain('after=1')
    expect(FakeEventSource.instances[0]?.url).toContain('from_sequence_num=2')
    FakeEventSource.instances[0]!.emit(second)
    FakeEventSource.instances[0]!.emit(event(3, 'Z', 'assistant-3'))
    expect(assistantText(harness.getEntries())).toBe('XYZ')
  })

  test('publishes deduped runtime changes from history and live task events', async () => {
    const started: SessionEvent = {
      id: 'task-started',
      sessionId: 'session-1',
      type: 'system',
      payload: {
        subtype: 'task_started',
        uuid: 'task-started-uuid',
        raw: {
          subtype: 'task_started',
          task_id: 'task-1',
          description: 'Inspect runtime state',
          task_type: 'local_agent',
        },
      },
      direction: 'inbound',
      seqNum: 1,
      createdAt: 1_700_000_000_001,
    }
    const progress: SessionEvent = {
      id: 'task-progress',
      sessionId: 'session-1',
      type: 'system',
      payload: {
        subtype: 'task_progress',
        uuid: 'task-progress-uuid',
        raw: {
          subtype: 'task_progress',
          task_id: 'task-1',
          description: 'Inspect runtime state',
          usage: { total_tokens: 50, tool_uses: 2, duration_ms: 1000 },
          last_tool_name: 'Read',
        },
      },
      direction: 'inbound',
      seqNum: 2,
      createdAt: 1_700_000_000_002,
    }
    const runtimeChanges: SessionRuntimeState[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      jsonResponse(
        String(input).includes('/history')
          ? {
              events: [started],
              next_cursor: 1,
              has_more: false,
              oldest_available_seq: 1,
              truncated: false,
            }
          : {},
      )) as typeof fetch
    const harness = createHarness('session-1', runtime =>
      runtimeChanges.push(runtime),
    )

    await harness.adapter.init()
    expect(runtimeChanges).toHaveLength(1)
    expect(runtimeChanges[0]?.tasks['task-1']?.status).toBe('running')

    FakeEventSource.instances[0]!.emit(progress)
    FakeEventSource.instances[0]!.emit(progress)
    expect(runtimeChanges).toHaveLength(2)
    expect(runtimeChanges[1]?.tasks['task-1']?.lastToolName).toBe('Read')
  })

  test('restores a pending permission panel and waiting tool from history', async () => {
    const historyEvents: SessionEvent[] = [
      {
        id: 'tool-use-1',
        sessionId: 'session-1',
        type: 'tool_use',
        payload: {
          tool_call_id: 'tool-1',
          tool_name: 'Bash',
          tool_input: { command: 'bun test' },
        },
        direction: 'inbound',
        seqNum: 1,
        createdAt: 1_700_000_000_001,
      },
      {
        id: 'permission-1',
        sessionId: 'session-1',
        type: 'control_request',
        payload: {
          request_id: 'request-1',
          request: {
            subtype: 'can_use_tool',
            tool_use_id: 'tool-1',
            tool_name: 'Bash',
            input: { command: 'bun test' },
          },
        },
        direction: 'inbound',
        seqNum: 2,
        createdAt: 1_700_000_000_002,
      },
    ]
    const permissions: PendingPermission[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      jsonResponse(
        String(input).includes('/history')
          ? {
              events: historyEvents,
              next_cursor: 2,
              has_more: false,
              oldest_available_seq: 1,
              truncated: false,
            }
          : {},
      )) as typeof fetch
    const harness = createHarness('session-1', undefined, permission =>
      permissions.push(permission),
    )

    await harness.adapter.init()

    expect(permissions).toEqual([
      expect.objectContaining({ requestId: 'request-1', toolName: 'Bash' }),
    ])
    expect(
      harness.getEntries().find(entry => entry.type === 'tool_call'),
    ).toEqual(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          status: 'waiting_for_confirmation',
        }),
      }),
    )
  })

  test('does not bind a permission request to an unrelated running tool when tool_use_id is missing locally', () => {
    const permissions: PendingPermission[] = []
    const harness = createHarness('session-1', undefined, permission =>
      permissions.push(permission),
    )

    harness.adapter.handleEvent({
      id: 'tool-use-1',
      sessionId: 'session-1',
      type: 'tool_use',
      payload: {
        tool_call_id: 'tool-1',
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/example' },
      },
      direction: 'inbound',
      seqNum: 1,
      createdAt: 1_700_000_000_001,
    })
    harness.adapter.handleEvent({
      id: 'permission-1',
      sessionId: 'session-1',
      type: 'control_request',
      payload: {
        request_id: 'request-1',
        request: {
          subtype: 'can_use_tool',
          tool_use_id: 'tool-not-in-history',
          tool_name: 'Bash',
          input: { command: 'bun test' },
        },
      },
      direction: 'inbound',
      seqNum: 2,
      createdAt: 1_700_000_000_002,
    })

    const toolEntry = harness
      .getEntries()
      .find(entry => entry.type === 'tool_call')
    expect(toolEntry?.type === 'tool_call' && toolEntry.toolCall.status).toBe(
      'running',
    )
    expect(permissions).toHaveLength(1)
    expect(permissions[0]?.toolName).toBe('Bash')
  })

  test('rolls back optimistic message and runtime state when sending fails', async () => {
    const runtimeChanges: SessionRuntimeState[] = []
    globalThis.fetch = (async () =>
      jsonResponse({ error: 'offline' }, 503)) as typeof fetch
    const harness = createHarness('session-1', runtime =>
      runtimeChanges.push(runtime),
    )

    await expect(harness.adapter.sendMessage('will fail')).rejects.toThrow()

    expect(harness.getEntries()).toEqual([])
    expect(runtimeChanges.map(runtime => runtime.turnState)).toEqual([
      'running',
      'unknown',
    ])
    expect(harness.adapter.runtime.turnState).toBe('unknown')
  })

  test('resolves a control request from a legacy raw control_response payload', async () => {
    let requestId = ''
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        request_id?: string
      }
      requestId = body.request_id ?? ''
      return jsonResponse({})
    }) as typeof fetch
    const harness = createHarness()

    const resultPromise = harness.adapter.sendControlRequest(
      'set_model',
      { model: 'sonnet' },
      1000,
    )
    await Promise.resolve()
    expect(requestId).not.toBe('')
    harness.adapter.handleEvent({
      id: 'control-response-1',
      sessionId: 'session-1',
      type: 'control_response',
      payload: {
        raw: {
          response: { subtype: 'success', request_id: requestId },
        },
      },
      direction: 'inbound',
      seqNum: 1,
      createdAt: 1_700_000_000_001,
    })

    expect(await resultPromise).toEqual({ ok: true })
  })

  test('passes the control_response payload data through to the caller', async () => {
    let requestId = ''
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        request_id?: string
      }
      requestId = body.request_id ?? ''
      return jsonResponse({})
    }) as typeof fetch
    const harness = createHarness()

    const resultPromise = harness.adapter.sendControlRequest(
      'get_system_prompt',
      {},
      1000,
    )
    await Promise.resolve()
    expect(requestId).not.toBe('')
    const sections = [
      { id: 'system_prompt', title: 'System prompt', text: 'You are…' },
      { id: 'claude_md', title: 'Project context (CLAUDE.md)', text: '# 项目' },
    ]
    harness.adapter.handleEvent({
      id: 'control-response-2',
      sessionId: 'session-1',
      type: 'control_response',
      payload: {
        response: {
          subtype: 'success',
          request_id: requestId,
          response: { sections },
        },
      },
      direction: 'inbound',
      seqNum: 1,
      createdAt: 1_700_000_000_001,
    })

    expect(await resultPromise).toEqual({ ok: true, data: { sections } })
  })
})
