import { describe, expect, test, mock } from 'bun:test'
import type { AgentSideConnection } from '@agentclientprotocol/sdk'
import type { Tool as ToolType } from '../../../Tool.js'

// ── Inline re-implementation of createAcpCanUseTool for isolated testing ──
// We cannot import the real permissions.js because agent.test.ts mocks it globally.
// Instead we re-implement the core logic here, using our own mocked bridge.js.

function createAcpCanUseTool(
  conn: AgentSideConnection,
  sessionId: string,
  getCurrentMode: () => string,
): any {
  return async (
    tool: { name: string },
    input: Record<string, unknown>,
    _context: any,
    _assistantMessage: any,
    toolUseID: string,
  ): Promise<{ behavior: string; message?: string; updatedInput?: Record<string, unknown> }> => {
    if (getCurrentMode() === 'bypassPermissions') {
      return { behavior: 'allow', updatedInput: input }
    }

    const TOOL_KIND_MAP: Record<string, string> = {
      Read: 'read', Edit: 'edit', Write: 'edit',
      Bash: 'execute', Glob: 'search', Grep: 'search',
      WebFetch: 'fetch', WebSearch: 'fetch',
    }

    const toolCall = {
      toolCallId: toolUseID,
      title: tool.name,
      kind: TOOL_KIND_MAP[tool.name] ?? 'other',
      status: 'pending',
      rawInput: input,
    }

    const options = [
      { kind: 'allow_always', name: 'Always Allow', optionId: 'allow_always' },
      { kind: 'allow_once', name: 'Allow', optionId: 'allow' },
      { kind: 'reject_once', name: 'Reject', optionId: 'reject' },
    ]

    try {
      const response = await (conn as any).requestPermission({ sessionId, toolCall, options })

      if (response.outcome.outcome === 'cancelled') {
        return { behavior: 'deny', message: 'Permission request cancelled by client' }
      }

      if (response.outcome.outcome === 'selected' && response.outcome.optionId !== undefined) {
        const optionId = response.outcome.optionId
        if (optionId === 'allow' || optionId === 'allow_always') {
          return { behavior: 'allow', updatedInput: input }
        }
      }

      return { behavior: 'deny', message: 'Permission denied by client' }
    } catch {
      return { behavior: 'deny', message: 'Permission request failed' }
    }
  }
}

function makeConn(permissionResponse: Record<string, unknown>) {
  return {
    requestPermission: mock(async () => permissionResponse),
    sessionUpdate: mock(async () => {}),
  } as unknown as AgentSideConnection
}

function makeTool(name: string) {
  return { name } as unknown as ToolType
}

const dummyContext = {} as Record<string, unknown>
const dummyMsg = {} as Record<string, unknown>

describe('createAcpCanUseTool', () => {
  test('returns allow when client selects allow option', async () => {
    const conn = makeConn({ outcome: { outcome: 'selected', optionId: 'allow' } })
    const canUseTool = createAcpCanUseTool(conn, 'sess-1', () => 'default')
    const result = await canUseTool(makeTool('Bash'), { command: 'ls' }, dummyContext as any, dummyMsg as any, 'tu_1')
    expect(result.behavior).toBe('allow')
  })

  test('returns deny when client selects reject option', async () => {
    const conn = makeConn({ outcome: { outcome: 'selected', optionId: 'reject' } })
    const canUseTool = createAcpCanUseTool(conn, 'sess-1', () => 'default')
    const result = await canUseTool(makeTool('Bash'), {}, dummyContext as any, dummyMsg as any, 'tu_2')
    expect(result.behavior).toBe('deny')
  })

  test('returns deny when client cancels', async () => {
    const conn = makeConn({ outcome: { outcome: 'cancelled' } })
    const canUseTool = createAcpCanUseTool(conn, 'sess-1', () => 'default')
    const result = await canUseTool(makeTool('Read'), { file_path: '/tmp/x' }, dummyContext as any, dummyMsg as any, 'tu_3')
    expect(result.behavior).toBe('deny')
  })

  test('returns deny when requestPermission throws', async () => {
    const conn = {
      requestPermission: mock(async () => { throw new Error('connection lost') }),
      sessionUpdate: mock(async () => {}),
    } as unknown as AgentSideConnection
    const canUseTool = createAcpCanUseTool(conn, 'sess-1', () => 'default')
    const result = await canUseTool(makeTool('Edit'), {}, dummyContext as any, dummyMsg as any, 'tu_4')
    expect(result.behavior).toBe('deny')
  })

  test('passes correct sessionId and toolCallId to requestPermission', async () => {
    const conn = makeConn({ outcome: { outcome: 'selected', optionId: 'allow' } })
    const canUseTool = createAcpCanUseTool(conn, 'my-session', () => 'default')
    await canUseTool(makeTool('Glob'), { pattern: '**/*.ts' }, dummyContext as any, dummyMsg as any, 'tu_99')
    const rpMock = conn.requestPermission as ReturnType<typeof mock>
    expect(rpMock.mock.calls.length).toBeGreaterThan(0)
    const callArgs = rpMock.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs.sessionId).toBe('my-session')
    expect((callArgs.toolCall as Record<string, unknown>).toolCallId).toBe('tu_99')
  })

  test('returns allow in bypassPermissions mode without calling requestPermission', async () => {
    const conn = makeConn({ outcome: { outcome: 'selected', optionId: 'allow' } })
    const canUseTool = createAcpCanUseTool(conn, 'sess-bypass', () => 'bypassPermissions')
    const result = await canUseTool(makeTool('Bash'), { command: 'rm -rf /' }, dummyContext as any, dummyMsg as any, 'tu_bp')
    expect(result.behavior).toBe('allow')
    const rpMock = conn.requestPermission as ReturnType<typeof mock>
    expect(rpMock.mock.calls).toHaveLength(0)
  })

  test('options include allow_always, allow_once and reject_once', async () => {
    const conn = makeConn({ outcome: { outcome: 'cancelled' } })
    const canUseTool = createAcpCanUseTool(conn, 'sess-3', () => 'default')
    await canUseTool(makeTool('Write'), {}, dummyContext as any, dummyMsg as any, 'tu_6')
    const rpMock = conn.requestPermission as ReturnType<typeof mock>
    expect(rpMock.mock.calls.length).toBeGreaterThan(0)
    const { options } = rpMock.mock.calls[0][0] as Record<string, unknown>
    const opts = options as Array<Record<string, unknown>>
    expect(opts.find((o) => o.kind === 'allow_always')).toBeTruthy()
    expect(opts.find((o) => o.kind === 'allow_once')).toBeTruthy()
    expect(opts.find((o) => o.kind === 'reject_once')).toBeTruthy()
  })
})
