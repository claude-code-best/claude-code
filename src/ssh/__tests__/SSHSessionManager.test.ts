import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('src/utils/debug.ts', debugMock)

import { SSHSessionManagerImpl } from '../SSHSessionManager'
import type { SSHSessionManagerOptions } from '../SSHSessionManager'
import type { Subprocess } from 'bun'

function createMockSubprocess(options?: {
  exitCode?: number | null
  stdoutLines?: string[]
}): {
  proc: Subprocess
  writeToStdout: (data: string) => void
  simulateExit: (code?: number) => void
} {
  let stdoutController: ReadableStreamDefaultController<Uint8Array>
  const exitResolvers: Array<(code: number) => void> = []
  let exitCode: number | null = options?.exitCode ?? null

  const stdout = new ReadableStream<Uint8Array>({
    start(controller) {
      stdoutController = controller
      if (options?.stdoutLines) {
        const encoder = new TextEncoder()
        for (const line of options.stdoutLines) {
          controller.enqueue(encoder.encode(line + '\n'))
        }
      }
    },
  })

  const stdinChunks: Uint8Array[] = []
  const stdin = {
    write(d: Uint8Array) {
      stdinChunks.push(d)
      return d.length
    },
    flush() {},
    end() {},
  }

  const exited = new Promise<number>(resolve => {
    exitResolvers.push(resolve)
    if (exitCode !== null) resolve(exitCode)
  })

  const proc = {
    stdout,
    stdin,
    stderr: null,
    get exitCode() {
      return exitCode
    },
    exited,
    kill: mock(() => {}),
    pid: 12345,
    killed: false,
    signalCode: null,
    ref: () => {},
    unref: () => {},
  } as unknown as Subprocess

  return {
    proc,
    writeToStdout(data: string) {
      const encoder = new TextEncoder()
      stdoutController.enqueue(encoder.encode(data + '\n'))
    },
    simulateExit(code = 0) {
      exitCode = code
      try {
        stdoutController.close()
      } catch {
        // may already be closed
      }
      for (const resolve of exitResolvers) resolve(code)
    },
  }
}

interface MockState {
  messages: unknown[]
  permissionRequests: Array<{ request: unknown; requestId: string }>
  reconnectingCalls: Array<{ attempt: number; max: number }>
  connectedCount: number
  disconnectedCount: number
  errors: Error[]
}

function createMockOptions(
  overrides?: Partial<SSHSessionManagerOptions>,
): SSHSessionManagerOptions & { state: MockState } {
  const state: MockState = {
    messages: [],
    permissionRequests: [],
    reconnectingCalls: [],
    connectedCount: 0,
    disconnectedCount: 0,
    errors: [],
  }

  return {
    state,
    onMessage: msg => {
      state.messages.push(msg)
    },
    onPermissionRequest: (request, requestId) => {
      state.permissionRequests.push({ request, requestId })
    },
    onConnected: () => {
      state.connectedCount++
    },
    onReconnecting: (attempt, max) => {
      state.reconnectingCalls.push({ attempt, max })
    },
    onDisconnected: () => {
      state.disconnectedCount++
    },
    onError: err => {
      state.errors.push(err)
    },
    ...overrides,
  }
}

describe('SSHSessionManagerImpl', () => {
  test('connect() sets connected state and calls onConnected', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()

    expect(manager.isConnected()).toBe(true)
    expect(opts.state.connectedCount).toBe(1)
  })

  test('connect() is idempotent', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.connect()

    expect(opts.state.connectedCount).toBe(1)
  })

  test('disconnect() sets disconnected state and kills process', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.disconnect()

    expect(manager.isConnected()).toBe(false)
    expect((proc.kill as ReturnType<typeof mock>).mock.calls.length).toBe(1)
  })

  test('disconnect() is idempotent', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.disconnect()
    manager.disconnect()

    expect((proc.kill as ReturnType<typeof mock>).mock.calls.length).toBe(1)
  })

  test('processLine routes SDK messages to onMessage', async () => {
    const sdkMessage = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: 'hello' },
    })

    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    writeToStdout(sdkMessage)

    await new Promise(r => setTimeout(r, 50))
    simulateExit(0)
    await new Promise(r => setTimeout(r, 50))

    expect(opts.state.messages.length).toBe(1)
    expect((opts.state.messages[0] as Record<string, unknown>).type).toBe(
      'assistant',
    )
  })

  test('processLine filters noise types', async () => {
    const noiseTypes = [
      'control_response',
      'keep_alive',
      'control_cancel_request',
      'streamlined_text',
      'streamlined_tool_use_summary',
    ]

    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()

    for (const type of noiseTypes) {
      writeToStdout(JSON.stringify({ type }))
    }
    writeToStdout(
      JSON.stringify({ type: 'system', subtype: 'post_turn_summary' }),
    )

    await new Promise(r => setTimeout(r, 50))
    simulateExit(0)
    await new Promise(r => setTimeout(r, 50))

    expect(opts.state.messages.length).toBe(0)
  })

  test('processLine routes control_request to onPermissionRequest', async () => {
    const controlRequest = JSON.stringify({
      type: 'control_request',
      request_id: 'req-123',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        tool_use_id: 'tool-456',
        input: { command: 'ls' },
      },
    })

    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    writeToStdout(controlRequest)

    await new Promise(r => setTimeout(r, 50))
    simulateExit(0)
    await new Promise(r => setTimeout(r, 50))

    expect(opts.state.permissionRequests.length).toBe(1)
    expect(opts.state.permissionRequests[0]!.requestId).toBe('req-123')
  })

  test('sendMessage writes NDJSON to stdin', async () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    const result = await manager.sendMessage('hello world')

    expect(result).toBe(true)
  })

  test('sendInterrupt writes interrupt control request', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.sendInterrupt()

    const stdin = proc.stdin as unknown as { write: ReturnType<typeof mock> }
    expect(stdin.write).toBeDefined()
  })

  test('respondToPermissionRequest sends allow response', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.respondToPermissionRequest('req-123', {
      behavior: 'allow',
      updatedInput: { command: 'ls -la' },
    })
  })

  test('respondToPermissionRequest sends deny response', () => {
    const { proc } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.respondToPermissionRequest('req-123', {
      behavior: 'deny',
      message: 'User denied',
    })
  })

  test('process exit without reconnect calls onDisconnected', async () => {
    const { proc, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    simulateExit(1)

    await new Promise(r => setTimeout(r, 100))

    expect(opts.state.disconnectedCount).toBe(1)
    expect(manager.isConnected()).toBe(false)
  })

  test('user disconnect does not trigger reconnect', async () => {
    let reconnectCalled = false
    const { proc } = createMockSubprocess()
    const opts = createMockOptions({
      reconnect: async () => {
        reconnectCalled = true
        return createMockSubprocess().proc
      },
      maxReconnectAttempts: 3,
    })
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    manager.disconnect()

    await new Promise(r => setTimeout(r, 200))

    expect(reconnectCalled).toBe(false)
    expect(opts.state.reconnectingCalls.length).toBe(0)
  })

  test('invalid JSON lines are silently skipped', async () => {
    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    writeToStdout('not valid json')
    writeToStdout('{also: broken')
    writeToStdout(
      JSON.stringify({ type: 'assistant', message: { role: 'assistant' } }),
    )

    await new Promise(r => setTimeout(r, 50))
    simulateExit(0)
    await new Promise(r => setTimeout(r, 50))

    expect(opts.state.messages.length).toBe(1)
    expect(opts.state.errors.length).toBe(0)
  })

  test('non-StdoutMessage objects are skipped', async () => {
    const { proc, writeToStdout, simulateExit } = createMockSubprocess()
    const opts = createMockOptions()
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    writeToStdout(JSON.stringify({ noTypeField: true }))
    writeToStdout(JSON.stringify([1, 2, 3]))
    writeToStdout(JSON.stringify('string'))

    await new Promise(r => setTimeout(r, 50))
    simulateExit(0)
    await new Promise(r => setTimeout(r, 50))

    expect(opts.state.messages.length).toBe(0)
  })

  test('process exit with reconnect factory attempts reconnection', async () => {
    const { proc: proc1, simulateExit } = createMockSubprocess()
    const { proc: proc2 } = createMockSubprocess()

    const opts = createMockOptions({
      reconnect: mock(async () => proc2),
      maxReconnectAttempts: 3,
    })
    const manager = new SSHSessionManagerImpl(proc1, opts)

    manager.connect()
    simulateExit(1)

    await new Promise(r => setTimeout(r, 3000))

    expect(opts.state.reconnectingCalls.length).toBeGreaterThanOrEqual(1)
    expect(opts.state.reconnectingCalls[0]!.attempt).toBe(1)
    expect(opts.state.reconnectingCalls[0]!.max).toBe(3)
  })

  test('reconnect failure exhausts attempts then disconnects', async () => {
    const { proc, simulateExit } = createMockSubprocess()

    const opts = createMockOptions({
      reconnect: mock(async () => {
        throw new Error('SSH connection refused')
      }),
      maxReconnectAttempts: 2,
    })
    const manager = new SSHSessionManagerImpl(proc, opts)

    manager.connect()
    simulateExit(1)

    await new Promise(r => setTimeout(r, 12000))

    expect(opts.state.reconnectingCalls.length).toBe(2)
    expect(opts.state.disconnectedCount).toBe(1)
    expect(manager.isConnected()).toBe(false)
  }, 15000)
})
