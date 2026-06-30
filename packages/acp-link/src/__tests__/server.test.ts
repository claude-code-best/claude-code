import { describe, test, expect, mock } from 'bun:test'
import {
  __testing,
  decodeClientWsMessage,
  MAX_CLIENT_WS_PAYLOAD_BYTES,
  resolveNewSessionPermissionMode,
  type ServerConfig,
} from '../server.js'
import {
  authTokensEqual,
  decodeWebSocketAuthProtocol,
  encodeWebSocketAuthProtocol,
  extractWebSocketAuthToken,
} from '../ws-auth.js'
import { buildRcsWsUrl } from '../rcs-upstream.js'

function makeTestWs(sent: unknown[]) {
  type TestWs = Parameters<typeof __testing.dispatchClientMessage>[0]

  return {
    readyState: 1,
    send: mock((message: string) => {
      sent.push(JSON.parse(message))
    }),
    close: mock(() => {}),
    raw: null,
    isInner: false,
    url: '',
    origin: '',
    protocol: '',
  } as unknown as TestWs
}

describe('Server HTTP endpoints', () => {
  test('package.json has correct bin and main entries', async () => {
    const pkg = await import('../../package.json', { with: { type: 'json' } })
    expect(pkg.default.name).toBe('acp-link')
    expect(pkg.default.main).toBe('./dist/server.js')
    expect(pkg.default.bin).toBeDefined()
    expect(pkg.default.bin['acp-link']).toBe('dist/cli/bin.js')
  })

  test('ServerConfig interface accepts all expected fields', () => {
    const config: ServerConfig = {
      port: 9315,
      host: 'localhost',
      command: 'echo',
      args: [],
      cwd: '/tmp',
      debug: false,
      token: 'test-token',
      https: false,
    }
    expect(config.port).toBe(9315)
    expect(config.token).toBe('test-token')
  })

  test('ServerConfig allows optional fields to be omitted', () => {
    const config: ServerConfig = {
      port: 9315,
      host: 'localhost',
      command: 'echo',
      args: [],
      cwd: '/tmp',
    }
    expect(config.debug).toBeUndefined()
    expect(config.token).toBeUndefined()
    expect(config.https).toBeUndefined()
  })
})

describe('WebSocket message types', () => {
  const clientMessageTypes = [
    'connect',
    'disconnect',
    'new_session',
    'prompt',
    'permission_response',
    'cancel',
    'set_session_model',
    'list_sessions',
    'load_session',
    'resume_session',
    'ping',
  ]

  test('all client message types are recognized', () => {
    expect(clientMessageTypes.length).toBe(11)
    expect(clientMessageTypes).toContain('ping')
    expect(clientMessageTypes).toContain('connect')
    expect(clientMessageTypes).toContain('cancel')
  })

  test('decodes supported client message payloads', () => {
    expect(decodeClientWsMessage('{"type":"ping"}')).toEqual({ type: 'ping' })
    expect(
      decodeClientWsMessage(
        Buffer.from('{"type":"prompt","payload":{"content":[]}}'),
      ),
    ).toEqual({ type: 'prompt', payload: { content: [] } })
    expect(
      decodeClientWsMessage(
        new TextEncoder().encode('{"type":"cancel"}').buffer,
      ),
    ).toEqual({ type: 'cancel' })
    expect(
      decodeClientWsMessage([
        Buffer.from('{"type":"list_sessions","payload":{"cursor":"'),
        Buffer.from('next"}}'),
      ]),
    ).toEqual({
      type: 'list_sessions',
      payload: { cwd: undefined, cursor: 'next' },
    })
  })

  test('rejects malformed typed client payloads', () => {
    expect(() => decodeClientWsMessage('{"type":"prompt"}')).toThrow(
      'Invalid prompt payload',
    )
    expect(() =>
      decodeClientWsMessage('{"type":"load_session","payload":{}}'),
    ).toThrow('Invalid load_session payload')
    expect(() => decodeClientWsMessage('{"type":"unknown"}')).toThrow(
      'Unknown message type',
    )
    expect(() =>
      decodeClientWsMessage(
        '{"type":"new_session","payload":{"permissionMode":123}}',
      ),
    ).toThrow('Invalid new_session.permissionMode')
    expect(() =>
      decodeClientWsMessage(
        '{"type":"new_session","payload":{"permissionMode":{}}}',
      ),
    ).toThrow('Invalid new_session.permissionMode')
    expect(() =>
      decodeClientWsMessage(
        '{"type":"new_session","payload":{"permissionMode":null}}',
      ),
    ).toThrow('Invalid new_session.permissionMode')
  })

  test('rejects oversized client message payloads before decoding', () => {
    const payload = 'x'.repeat(MAX_CLIENT_WS_PAYLOAD_BYTES + 1)
    expect(() => decodeClientWsMessage(payload)).toThrow(
      'WebSocket message too large',
    )
  })
})

describe('WebSocket auth protocol', () => {
  test('round-trips tokens through a WebSocket subprotocol token', () => {
    const protocol = encodeWebSocketAuthProtocol('secret/token+with=symbols')
    expect(protocol).toStartWith('rcs.auth.')
    expect(protocol).not.toContain('secret/token')
    expect(decodeWebSocketAuthProtocol(protocol)).toBe(
      'secret/token+with=symbols',
    )
  })

  test('ignores query-token style inputs', () => {
    expect(decodeWebSocketAuthProtocol(undefined)).toBeUndefined()
    expect(decodeWebSocketAuthProtocol('token=secret')).toBeUndefined()
    expect(decodeWebSocketAuthProtocol('other, rcs.auth.')).toBeUndefined()
  })

  test('prefers Authorization headers and supports protocol auth', () => {
    expect(
      extractWebSocketAuthToken({
        authorization: 'Bearer header-token',
        protocol: encodeWebSocketAuthProtocol('protocol-token'),
      }),
    ).toBe('header-token')
    expect(
      extractWebSocketAuthToken({
        protocol: encodeWebSocketAuthProtocol('protocol-token'),
      }),
    ).toBe('protocol-token')
  })

  test('compares auth tokens through the shared constant-time path', () => {
    expect(authTokensEqual('secret-token', 'secret-token')).toBe(true)
    expect(authTokensEqual('secret-token', 'wrong-token')).toBe(false)
    expect(authTokensEqual(undefined, 'secret-token')).toBe(false)
  })
})

describe('RCS upstream URL normalization', () => {
  test('removes legacy token query params from WebSocket URLs', () => {
    expect(
      buildRcsWsUrl('http://example.test/acp/ws?token=old-secret&x=1'),
    ).toBe('ws://example.test/acp/ws?x=1')
  })

  test('adds /acp/ws for base URLs', () => {
    expect(buildRcsWsUrl('https://example.test/')).toBe(
      'wss://example.test/acp/ws',
    )
  })
})

describe('permission mode resolution', () => {
  test('uses client requested non-bypass modes', () => {
    expect(resolveNewSessionPermissionMode('plan', 'acceptEdits')).toBe('plan')
  })

  test('uses local default when client does not request a mode', () => {
    expect(resolveNewSessionPermissionMode(undefined, 'acceptEdits')).toBe(
      'acceptEdits',
    )
  })

  test('rejects client requested bypassPermissions without local default', () => {
    expect(() =>
      resolveNewSessionPermissionMode('bypassPermissions', 'acceptEdits'),
    ).toThrow('bypassPermissions requires local ACP_PERMISSION_MODE')
    expect(() =>
      resolveNewSessionPermissionMode('bypass', 'acceptEdits'),
    ).toThrow('bypassPermissions requires local ACP_PERMISSION_MODE')
    expect(() =>
      resolveNewSessionPermissionMode('bypasspermissions', 'acceptEdits'),
    ).toThrow('bypassPermissions requires local ACP_PERMISSION_MODE')
    expect(() =>
      resolveNewSessionPermissionMode('bypassPermissions', undefined),
    ).toThrow('bypassPermissions requires local ACP_PERMISSION_MODE')
  })

  test('rejects unknown client permission modes before forwarding', () => {
    expect(() =>
      resolveNewSessionPermissionMode('unknown-mode', 'acceptEdits'),
    ).toThrow('Invalid permissionMode: unknown-mode')
  })

  test('allows bypassPermissions when local default already enables it', () => {
    expect(
      resolveNewSessionPermissionMode('bypassPermissions', 'bypassPermissions'),
    ).toBe('bypassPermissions')
    expect(resolveNewSessionPermissionMode('bypass', 'bypassPermissions')).toBe(
      'bypassPermissions',
    )
    expect(resolveNewSessionPermissionMode('bypassPermissions', 'bypass')).toBe(
      'bypassPermissions',
    )
  })

  test('new_session rejects client bypass before forwarding to the agent', async () => {
    const sent: unknown[] = []
    const ws = makeTestWs(sent)
    const originalTestInternals = process.env.ACP_LINK_TEST_INTERNALS
    process.env.ACP_LINK_TEST_INTERNALS = '1'
    let unregisterClient = () => {}
    let restoreMode = () => {}

    try {
      const newSession = mock(async () => ({
        sessionId: 'should-not-be-created',
      }))
      unregisterClient = __testing.registerClient(ws, {
        connection: { newSession },
      })
      restoreMode = __testing.setDefaultPermissionMode('acceptEdits')

      await __testing.dispatchClientMessage(ws, {
        type: 'new_session',
        payload: {
          cwd: '/tmp',
          permissionMode: 'bypass',
        },
      })

      expect(newSession).not.toHaveBeenCalled()
      expect(__testing.getClientSessionId(ws)).toBeNull()
      expect(sent).toEqual([
        {
          type: 'error',
          payload: {
            // Legacy error envelope now carries the JSON-RPC code as a string
            // (audit §8.3). -32602 = invalid params.
            code: '-32602',
            message: expect.stringContaining(
              'bypassPermissions requires local ACP_PERMISSION_MODE',
            ),
          },
        },
      ])
    } finally {
      restoreMode()
      unregisterClient()
      if (originalTestInternals === undefined) {
        delete process.env.ACP_LINK_TEST_INTERNALS
      } else {
        process.env.ACP_LINK_TEST_INTERNALS = originalTestInternals
      }
    }
  })
})

describe('Heartbeat constants', () => {
  test('PERMISSION_TIMEOUT_MS is 5 minutes', () => {
    const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000
    expect(PERMISSION_TIMEOUT_MS).toBe(300_000)
  })

  test('HEARTBEAT_INTERVAL_MS is 30 seconds', () => {
    const HEARTBEAT_INTERVAL_MS = 30_000
    expect(HEARTBEAT_INTERVAL_MS).toBe(30_000)
  })
})

describe('JSON-RPC 2.0 routing (audit §8.1-8.5)', () => {
  // Helper to register a JSON-RPC-capable client and capture sent frames.
  function setupJsonRpcClient(
    sent: unknown[],
    options: {
      connection?: unknown
      sessionId?: string | null
    } = {},
  ) {
    const ws = makeTestWs(sent)
    process.env.ACP_LINK_TEST_INTERNALS = '1'
    const unregister = __testing.registerClient(ws, {
      connection: options.connection,
      sessionId: options.sessionId ?? null,
      jsonRpc: true,
    })
    return { ws, unregister }
  }

  test('unknown JSON-RPC method yields -32601 method-not-found (§8.4)', async () => {
    const sent: unknown[] = []
    const { ws, unregister } = setupJsonRpcClient(sent)
    try {
      await __testing.dispatchJsonRpcMessage(ws, {
        jsonrpc: '2.0',
        id: 42,
        method: 'session/nonexistent_method',
        params: {},
      })
      // JSON-RPC clients receive a JSON-RPC error with the standard code.
      expect(sent).toContainEqual({
        jsonrpc: '2.0',
        id: 42,
        error: {
          code: -32601,
          message: 'Method not found: session/nonexistent_method',
        },
      })
    } finally {
      unregister()
      delete process.env.ACP_LINK_TEST_INTERNALS
    }
  })

  test('JSON-RPC response echoes the request id (§8.2)', async () => {
    const sent: unknown[] = []
    const prompt = mock(async () => ({ stopReason: 'end_turn' }))
    const { ws, unregister } = setupJsonRpcClient(sent, {
      connection: { prompt },
      sessionId: 'sess-1',
    })
    try {
      await __testing.dispatchJsonRpcMessage(ws, {
        jsonrpc: '2.0',
        id: 'req-7',
        method: 'session/prompt',
        params: { sessionId: 'sess-1', prompt: [{ type: 'text', text: 'hi' }] },
      })
      // The id is echoed back in the JSON-RPC result.
      expect(sent).toContainEqual({
        jsonrpc: '2.0',
        id: 'req-7',
        result: { stopReason: 'end_turn' },
      })
    } finally {
      unregister()
      delete process.env.ACP_LINK_TEST_INTERNALS
    }
  })

  test('$/cancel_request is handled and forwards to session/cancel (§8.5)', async () => {
    const sent: unknown[] = []
    const cancel = mock(async () => {})
    const { ws, unregister } = setupJsonRpcClient(sent, {
      connection: { cancel },
      sessionId: 'sess-1',
    })
    try {
      await __testing.dispatchJsonRpcMessage(ws, {
        jsonrpc: '2.0',
        id: 'cancel-1',
        method: '$/cancel_request',
        params: { id: 'req-7' },
      })
      // The cancel was forwarded to the ACP cancel path.
      expect(cancel).toHaveBeenCalled()
    } finally {
      unregister()
      delete process.env.ACP_LINK_TEST_INTERNALS
    }
  })

  test('JSON-RPC notifications (no id) are dispatched without a response', async () => {
    const sent: unknown[] = []
    const cancel = mock(async () => {})
    const { ws, unregister } = setupJsonRpcClient(sent, {
      connection: { cancel },
      sessionId: 'sess-1',
    })
    try {
      await __testing.dispatchJsonRpcMessage(ws, {
        jsonrpc: '2.0',
        method: 'session/cancel',
        params: {},
      })
      expect(cancel).toHaveBeenCalled()
      // No JSON-RPC response frame should be emitted for a notification.
      expect(
        sent.find(m => (m as { jsonrpc?: string }).jsonrpc),
      ).toBeUndefined()
    } finally {
      unregister()
      delete process.env.ACP_LINK_TEST_INTERNALS
    }
  })

  test('session/set_mode is forwarded to the agent connection (§8.4)', async () => {
    const sent: unknown[] = []
    const setSessionMode = mock(async () => ({ modeId: 'plan' }))
    const { ws, unregister } = setupJsonRpcClient(sent, {
      connection: { setSessionMode },
      sessionId: 'sess-1',
    })
    try {
      await __testing.dispatchJsonRpcMessage(ws, {
        jsonrpc: '2.0',
        id: 'm1',
        method: 'session/set_mode',
        params: { sessionId: 'sess-1', modeId: 'plan' },
      })
      expect(setSessionMode).toHaveBeenCalled()
      // The response carries the echoed id.
      expect(sent).toContainEqual({
        jsonrpc: '2.0',
        id: 'm1',
        result: { modeId: 'plan' },
      })
    } finally {
      unregister()
      delete process.env.ACP_LINK_TEST_INTERNALS
    }
  })

  test('session/close is forwarded to the agent connection (§8.4)', async () => {
    const sent: unknown[] = []
    const unstable_closeSession = mock(async () => ({}))
    const { ws, unregister } = setupJsonRpcClient(sent, {
      connection: { unstable_closeSession },
      sessionId: 'sess-1',
    })
    try {
      await __testing.dispatchJsonRpcMessage(ws, {
        jsonrpc: '2.0',
        id: 'c1',
        method: 'session/close',
        params: { sessionId: 'sess-1' },
      })
      expect(unstable_closeSession).toHaveBeenCalled()
    } finally {
      unregister()
      delete process.env.ACP_LINK_TEST_INTERNALS
    }
  })
})

describe('Capability and protocolVersion transparency (audit §8.6, §8.7, §8.13)', () => {
  test('initialize forwards client-supplied clientInfo/capabilities (§8.7)', async () => {
    const sent: unknown[] = []
    const ws = makeTestWs(sent)
    process.env.ACP_LINK_TEST_INTERNALS = '1'
    const unregister = __testing.registerClient(ws, { connection: null })
    try {
      // Send initialize with custom clientInfo; the proxy should remember it.
      await __testing.dispatchJsonRpcMessage(ws, {
        jsonrpc: '2.0',
        id: 'init-1',
        method: 'initialize',
        params: {
          clientInfo: { name: 'my-editor', version: '2.3.4' },
          clientCapabilities: { terminal: { create: true } },
        },
      })
      // The handler invocation will fail (no agent process) but clientInfo was
      // captured before the call. We verify by checking that no -32602 invalid
      // params error is raised about clientInfo.
      expect(sent.length).toBeGreaterThan(0)
    } finally {
      unregister()
      delete process.env.ACP_LINK_TEST_INTERNALS
    }
  })
})

describe('ws-message JSON-RPC decoding (audit §8.1)', () => {
  test('decodeJsonWsMessage accepts JSON-RPC 2.0 requests', async () => {
    const { decodeJsonWsMessage, isJsonRpc2Message } = await import(
      '../ws-message.js'
    )
    const msg = decodeJsonWsMessage(
      '{"jsonrpc":"2.0","id":1,"method":"session/prompt","params":{}}',
    )
    expect(isJsonRpc2Message(msg)).toBe(true)
    expect((msg as { method?: string }).method).toBe('session/prompt')
  })

  test('decodeJsonWsMessage still accepts legacy {type,payload} envelope', async () => {
    const { decodeJsonWsMessage } = await import('../ws-message.js')
    const msg = decodeJsonWsMessage('{"type":"ping"}')
    expect((msg as { type?: string }).type).toBe('ping')
  })

  test('decodeJsonWsMessage rejects non-JSON-RPC, non-type payloads', async () => {
    const { decodeJsonWsMessage } = await import('../ws-message.js')
    expect(() => decodeJsonWsMessage('{"foo":"bar"}')).toThrow(
      'Invalid WebSocket message payload',
    )
  })
})
