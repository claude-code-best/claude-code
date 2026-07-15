import { describe, expect, test } from 'bun:test'
import { getWebSocketKeepaliveIntervalMs } from '../webSocketKeepalivePolicy.js'

describe('getWebSocketKeepaliveIntervalMs', () => {
  test('keeps remote legacy WebSockets below the RCS inactivity window', () => {
    expect(getWebSocketKeepaliveIntervalMs(true)).toBe(20_000)
  })

  test('preserves the existing non-remote WebSocket interval', () => {
    expect(getWebSocketKeepaliveIntervalMs(false)).toBe(120_000)
  })
})
