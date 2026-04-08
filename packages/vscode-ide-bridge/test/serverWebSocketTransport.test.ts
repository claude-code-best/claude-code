import { EventEmitter } from 'node:events'
import { describe, expect, test } from 'bun:test'
import { ServerWebSocketTransport } from '../src/server/serverWebSocketTransport.js'

class FakeWebSocket extends EventEmitter {
  readyState = 1
  sent: string[] = []
  closed = false

  send(data: string, callback?: (error?: Error) => void) {
    this.sent.push(data)
    callback?.()
  }

  close() {
    this.closed = true
    this.emit('close')
  }
}

describe('server web socket transport', () => {
  test('forwards incoming JSON-RPC messages to the MCP server', async () => {
    const socket = new FakeWebSocket()
    const transport = new ServerWebSocketTransport(socket)
    const messages: unknown[] = []

    transport.onmessage = message => {
      messages.push(message)
    }

    await transport.start()
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'ping',
          params: {},
        }),
      ),
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
      params: {},
    })
  })

  test('serializes outgoing JSON-RPC messages back to the websocket', async () => {
    const socket = new FakeWebSocket()
    const transport = new ServerWebSocketTransport(socket)

    await transport.start()
    await transport.send({
      jsonrpc: '2.0',
      id: 2,
      result: {},
    })

    expect(socket.sent).toHaveLength(1)
    expect(JSON.parse(socket.sent[0] ?? 'null')).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: {},
    })
  })
})
