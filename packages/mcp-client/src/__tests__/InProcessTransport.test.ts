import { describe, expect, test } from 'bun:test'
import { createLinkedTransportPair } from '../transport/InProcessTransport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

describe('InProcessTransport', () => {
  test('creates linked pair', () => {
    const [client, server] = createLinkedTransportPair()
    expect(client).toBeDefined()
    expect(server).toBeDefined()
  })

  test('delivers messages from client to server', async () => {
    const [client, server] = createLinkedTransportPair()

    let received: JSONRPCMessage | null = null
    server.onmessage = (msg) => { received = msg }

    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      method: 'test',
      params: {},
      id: 1,
    }

    await client.send(message)

    // Wait for queueMicrotask to deliver
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(received).not.toBeNull()
    expect(received!.jsonrpc).toBe('2.0')
    expect((received as any).method).toBe('test')
  })

  test('delivers messages from server to client', async () => {
    const [client, server] = createLinkedTransportPair()

    let received: JSONRPCMessage | null = null
    client.onmessage = (msg) => { received = msg }

    await server.send({ jsonrpc: '2.0', result: 42, id: 1 } as any)

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(received).not.toBeNull()
  })

  test('close triggers onclose on both sides', async () => {
    const [client, server] = createLinkedTransportPair()

    let clientClosed = false
    let serverClosed = false
    client.onclose = () => { clientClosed = true }
    server.onclose = () => { serverClosed = true }

    await client.close()

    expect(clientClosed).toBe(true)
    expect(serverClosed).toBe(true)
  })

  test('close is idempotent', async () => {
    const [client] = createLinkedTransportPair()

    let closeCount = 0
    client.onclose = () => { closeCount++ }

    await client.close()
    await client.close()

    expect(closeCount).toBe(1)
  })

  test('send after close throws', async () => {
    const [client] = createLinkedTransportPair()
    await client.close()

    expect(client.send({ jsonrpc: '2.0', method: 'test' } as any)).rejects.toThrow('Transport is closed')
  })
})
