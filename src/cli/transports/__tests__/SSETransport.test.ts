import { describe, expect, test } from 'bun:test'
import { parseSSEFrames } from '../SSETransport.js'

describe('parseSSEFrames', () => {
  test('parses LF-delimited frames', () => {
    const input = 'event: client_event\ndata: {"ok":true}\n\n'
    const { frames, remaining } = parseSSEFrames(input)

    expect(remaining).toBe('')
    expect(frames).toEqual([
      {
        event: 'client_event',
        data: '{"ok":true}',
      },
    ])
  })

  test('parses CRLF-delimited frames and strips trailing carriage returns', () => {
    const input =
      'event: client_event\r\ndata: {"ok":true}\r\nid: 7\r\n\r\nevent: keepalive\r\ndata: ping\r\n\r\n'
    const { frames, remaining } = parseSSEFrames(input)

    expect(remaining).toBe('')
    expect(frames).toEqual([
      {
        event: 'client_event',
        data: '{"ok":true}',
        id: '7',
      },
      {
        event: 'keepalive',
        data: 'ping',
      },
    ])
  })

  test('keeps incomplete trailing frame in remaining buffer for CRLF streams', () => {
    const input = 'event: client_event\r\ndata: {"ok":true}\r\n\r\ndata: {"tail":1}\r\n'
    const { frames, remaining } = parseSSEFrames(input)

    expect(frames).toEqual([
      {
        event: 'client_event',
        data: '{"ok":true}',
      },
    ])
    expect(remaining).toBe('data: {"tail":1}\r\n')
  })
})
