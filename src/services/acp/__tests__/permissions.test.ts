import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import type { AgentSideConnection } from '@agentclientprotocol/sdk'
import type { Tool as ToolType, ToolUseContext } from '../../../Tool.js'
import type { AssistantMessage } from '../../../types/message.js'

const askDecision = {
  behavior: 'ask',
  message: 'approval required',
  decisionReason: { type: 'mode', mode: 'default' },
} as const

const hasPermissionsMock = mock(async (): Promise<unknown> => askDecision)
const toolInfoMock = mock(() => ({
  title: 'Bash',
  kind: 'execute',
  content: [],
  locations: [],
}))

const permissionsModuleSnapshot = {
  ...(require('../../../utils/permissions/permissions.ts') as Record<
    string,
    unknown
  >),
}
const bridgeModuleSnapshot = {
  ...(require('../bridge.ts') as Record<string, unknown>),
}

afterAll(() => {
  mock.module('../bridge.js', () => bridgeModuleSnapshot)
  mock.module(
    '../../../utils/permissions/permissions.js',
    () => permissionsModuleSnapshot,
  )
})

mock.module('../../../utils/permissions/permissions.js', () => ({
  ...permissionsModuleSnapshot,
  hasPermissionsToUseTool: hasPermissionsMock,
}))

mock.module('../bridge.js', () => ({
  ...bridgeModuleSnapshot,
  toolInfoFromToolUse: toolInfoMock,
}))

const { createAcpCanUseTool } = await import('../permissions.js')

type PermissionResponse =
  | { outcome: { outcome: 'cancelled' } }
  | { outcome: { outcome: 'selected'; optionId: string } }

function makeConn(
  permissionResponse: PermissionResponse = {
    outcome: { outcome: 'selected', optionId: 'allow' },
  },
): AgentSideConnection {
  return {
    requestPermission: mock(async () => permissionResponse),
    sessionUpdate: mock(async () => {}),
  } as unknown as AgentSideConnection
}

function makeTool(name: string): ToolType {
  return { name } as unknown as ToolType
}

const dummyContext = {} as unknown as ToolUseContext
const dummyMsg = {} as unknown as AssistantMessage

describe('createAcpCanUseTool', () => {
  beforeEach(() => {
    hasPermissionsMock.mockReset()
    hasPermissionsMock.mockResolvedValue(askDecision)
    toolInfoMock.mockClear()
  })

  test('returns pipeline allow without client delegation', async () => {
    const conn = makeConn()
    const input = { command: 'ls' }
    hasPermissionsMock.mockResolvedValueOnce({
      behavior: 'allow',
      updatedInput: input,
    })

    const canUseTool = createAcpCanUseTool(conn, 'sess-1', () => 'default')
    const result = await canUseTool(
      makeTool('Bash'),
      input,
      dummyContext,
      dummyMsg,
      'tu_1',
    )

    expect(result).toEqual({ behavior: 'allow', updatedInput: input })
    expect(
      (conn.requestPermission as ReturnType<typeof mock>).mock.calls,
    ).toHaveLength(0)
  })

  test('returns pipeline deny without client delegation', async () => {
    const conn = makeConn()
    hasPermissionsMock.mockResolvedValueOnce({
      behavior: 'deny',
      message: 'blocked by policy',
      decisionReason: { type: 'other', reason: 'blocked by policy' },
    })

    const canUseTool = createAcpCanUseTool(conn, 'sess-1', () => 'default')
    const result = await canUseTool(
      makeTool('Bash'),
      { command: 'rm -rf /' },
      dummyContext,
      dummyMsg,
      'tu_2',
    )

    expect(result.behavior).toBe('deny')
    expect(
      (conn.requestPermission as ReturnType<typeof mock>).mock.calls,
    ).toHaveLength(0)
  })

  test('denies when the permission pipeline throws', async () => {
    const conn = makeConn()
    hasPermissionsMock.mockRejectedValueOnce(new Error('rule loader failed'))
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})

    try {
      const canUseTool = createAcpCanUseTool(conn, 'sess-1', () => 'default')
      const result = await canUseTool(
        makeTool('Edit'),
        { file_path: '/tmp/x' },
        dummyContext,
        dummyMsg,
        'tu_3',
      )

      expect(result).toMatchObject({
        behavior: 'deny',
        decisionReason: { type: 'other', reason: 'Permission pipeline failed' },
        toolUseID: 'tu_3',
      })
      if (result.behavior !== 'deny') {
        throw new Error('expected deny result')
      }
      expect(result.message).toBe('Permission pipeline failed')
      expect(
        (conn.requestPermission as ReturnType<typeof mock>).mock.calls,
      ).toHaveLength(0)
    } finally {
      errorSpy.mockRestore()
    }
  })

  test('delegates ask decisions to the ACP client', async () => {
    const conn = makeConn({
      outcome: { outcome: 'selected', optionId: 'allow' },
    })
    const input = { command: 'ls' }
    const canUseTool = createAcpCanUseTool(conn, 'sess-1', () => 'default')
    const result = await canUseTool(
      makeTool('Bash'),
      input,
      dummyContext,
      dummyMsg,
      'tu_4',
    )

    expect(result).toEqual({ behavior: 'allow', updatedInput: input })
    const callArgs = (conn.requestPermission as ReturnType<typeof mock>).mock
      .calls[0][0] as Record<string, unknown>
    expect(callArgs.sessionId).toBe('sess-1')
    expect((callArgs.toolCall as Record<string, unknown>).toolCallId).toBe(
      'tu_4',
    )
  })

  test('returns deny when the client rejects or cancels', async () => {
    const rejectConn = makeConn({
      outcome: { outcome: 'selected', optionId: 'reject' },
    })
    const cancelConn = makeConn({ outcome: { outcome: 'cancelled' } })

    const rejectResult = await createAcpCanUseTool(
      rejectConn,
      'sess-1',
      () => 'default',
    )(makeTool('Bash'), {}, dummyContext, dummyMsg, 'tu_5')
    const cancelResult = await createAcpCanUseTool(
      cancelConn,
      'sess-1',
      () => 'default',
    )(makeTool('Read'), {}, dummyContext, dummyMsg, 'tu_6')

    expect(rejectResult.behavior).toBe('deny')
    expect(cancelResult.behavior).toBe('deny')
  })

  test('returns deny when client permission request fails', async () => {
    const conn = {
      requestPermission: mock(async () => {
        throw new Error('connection lost')
      }),
      sessionUpdate: mock(async () => {}),
    } as unknown as AgentSideConnection
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})

    try {
      const result = await createAcpCanUseTool(conn, 'sess-1', () => 'default')(
        makeTool('Write'),
        {},
        dummyContext,
        dummyMsg,
        'tu_7',
      )

      expect(result.behavior).toBe('deny')
      if (result.behavior !== 'deny') {
        throw new Error('expected deny result')
      }
      expect(result.message).toContain('Permission request failed')
    } finally {
      errorSpy.mockRestore()
    }
  })

  test('options include allow always, allow once, reject once, and reject always', async () => {
    const conn = makeConn({ outcome: { outcome: 'cancelled' } })
    const canUseTool = createAcpCanUseTool(conn, 'sess-3', () => 'default')
    await canUseTool(makeTool('Write'), {}, dummyContext, dummyMsg, 'tu_8')

    const { options } = (conn.requestPermission as ReturnType<typeof mock>).mock
      .calls[0][0] as Record<string, unknown>
    const opts = options as Array<Record<string, unknown>>
    expect(opts.find(option => option.kind === 'allow_always')).toBeTruthy()
    expect(opts.find(option => option.kind === 'allow_once')).toBeTruthy()
    expect(opts.find(option => option.kind === 'reject_once')).toBeTruthy()
    expect(opts.find(option => option.kind === 'reject_always')).toBeTruthy()
  })

  test('ExitPlanMode omits bypass option when the session does not expose it', async () => {
    const conn = makeConn({ outcome: { outcome: 'cancelled' } })
    const canUseTool = createAcpCanUseTool(
      conn,
      'sess-4',
      () => 'plan',
      undefined,
      undefined,
      undefined,
      () => false,
    )

    await canUseTool(
      makeTool('ExitPlanMode'),
      {},
      dummyContext,
      dummyMsg,
      'tu_9',
    )

    const { options } = (conn.requestPermission as ReturnType<typeof mock>).mock
      .calls[0][0] as Record<string, unknown>
    const opts = options as Array<Record<string, unknown>>
    expect(opts.some(option => option.optionId === 'bypassPermissions')).toBe(
      false,
    )
  })

  test('ExitPlanMode includes bypass option when the session exposes it', async () => {
    const conn = makeConn({ outcome: { outcome: 'cancelled' } })
    const canUseTool = createAcpCanUseTool(
      conn,
      'sess-5',
      () => 'plan',
      undefined,
      undefined,
      undefined,
      () => true,
    )

    await canUseTool(
      makeTool('ExitPlanMode'),
      {},
      dummyContext,
      dummyMsg,
      'tu_10',
    )

    const { options } = (conn.requestPermission as ReturnType<typeof mock>).mock
      .calls[0][0] as Record<string, unknown>
    const opts = options as Array<Record<string, unknown>>
    expect(opts.some(option => option.optionId === 'bypassPermissions')).toBe(
      true,
    )
  })

  test('ExitPlanMode rejects a bypass selection that was not offered', async () => {
    const conn = makeConn({
      outcome: { outcome: 'selected', optionId: 'bypassPermissions' },
    })
    const onModeChange = mock(() => {})
    const canUseTool = createAcpCanUseTool(
      conn,
      'sess-6',
      () => 'plan',
      undefined,
      undefined,
      onModeChange,
      () => false,
    )

    const result = await canUseTool(
      makeTool('ExitPlanMode'),
      {},
      dummyContext,
      dummyMsg,
      'tu_11',
    )

    expect(result.behavior).toBe('deny')
    expect(onModeChange).not.toHaveBeenCalled()
    expect(
      (conn.sessionUpdate as ReturnType<typeof mock>).mock.calls,
    ).toHaveLength(0)
  })

  test('checkTerminalOutput honors standard clientCapabilities.terminal', async () => {
    // Standard ACP v1 client advertises terminal: true without any _meta hint.
    const conn = makeConn({ outcome: { outcome: 'cancelled' } })
    const capabilities = { terminal: true } as any
    const canUseTool = createAcpCanUseTool(
      conn,
      'sess-term',
      () => 'default',
      capabilities,
    )
    await canUseTool(makeTool('Bash'), {}, dummyContext, dummyMsg, 'tu_term')

    const { toolCall } = (conn.requestPermission as ReturnType<typeof mock>)
      .mock.calls[0][0] as Record<string, unknown>
    // toolInfoFromToolUse is mocked; we only assert the standard capability is
    // respected (no crash, request delegated). The legacy _meta path is
    // exercised separately below.
    expect(toolCall).toBeDefined()
  })

  test('checkTerminalOutput falls back to legacy _meta.terminal_output', async () => {
    const conn = makeConn({ outcome: { outcome: 'cancelled' } })
    const capabilities = { _meta: { terminal_output: true } } as any
    const canUseTool = createAcpCanUseTool(
      conn,
      'sess-term-legacy',
      () => 'default',
      capabilities,
    )
    await canUseTool(makeTool('Bash'), {}, dummyContext, dummyMsg, 'tu_term2')

    expect(
      (conn.requestPermission as ReturnType<typeof mock>).mock.calls,
    ).toHaveLength(1)
  })

  test('cancelled permission outcome invokes onPermissionCancelled callback', async () => {
    const conn = makeConn({ outcome: { outcome: 'cancelled' } })
    const onPermissionCancelled = mock(() => {})
    const canUseTool = createAcpCanUseTool(
      conn,
      'sess-cancel',
      () => 'default',
      undefined,
      undefined,
      undefined,
      undefined,
      onPermissionCancelled,
    )

    const result = await canUseTool(
      makeTool('Bash'),
      {},
      dummyContext,
      dummyMsg,
      'tu_cancel',
    )

    expect(result.behavior).toBe('deny')
    expect(onPermissionCancelled).toHaveBeenCalledTimes(1)
  })

  test('ExitPlanMode cancelled outcome invokes onPermissionCancelled callback', async () => {
    const conn = makeConn({ outcome: { outcome: 'cancelled' } })
    const onPermissionCancelled = mock(() => {})
    const canUseTool = createAcpCanUseTool(
      conn,
      'sess-cancel-plan',
      () => 'plan',
      undefined,
      undefined,
      undefined,
      undefined,
      onPermissionCancelled,
    )

    const result = await canUseTool(
      makeTool('ExitPlanMode'),
      {},
      dummyContext,
      dummyMsg,
      'tu_cancel_plan',
    )

    expect(result.behavior).toBe('deny')
    expect(onPermissionCancelled).toHaveBeenCalledTimes(1)
  })
})
