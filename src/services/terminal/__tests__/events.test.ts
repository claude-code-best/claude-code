import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug'
import { logMock } from '../../../../tests/mocks/log'

mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)

import { publishTerminalSync, setTerminalEventWriter } from '../events.js'
import { getTerminalManager, resetTerminalManagerForTests } from '../manager.js'

afterEach(() => {
  setTerminalEventWriter(null)
  resetTerminalManagerForTests()
})

describe('terminal event stream consistency', () => {
  test('flushes output before a snapshot and includes its output watermark', () => {
    const manager = getTerminalManager()
    let subscriber:
      | ((event: { kind: 'output'; termId: string; data: string }) => void)
      | undefined
    spyOn(manager, 'subscribe').mockImplementation(callback => {
      subscriber = callback as typeof subscriber
      return () => {}
    })
    spyOn(manager, 'list').mockReturnValue([
      {
        id: 'term-1',
        name: 'main',
        cwd: '/tmp',
        cols: 80,
        rows: 24,
        alive: true,
        lastActivityAt: 1,
        preview: '',
      },
    ])
    spyOn(manager, 'rawSnapshot').mockReturnValue('snapshot-with-A')
    const messages: Array<Record<string, unknown>> = []
    setTerminalEventWriter(message => messages.push(message))
    messages.length = 0

    subscriber?.({ kind: 'output', termId: 'term-1', data: 'A' })
    publishTerminalSync()

    expect(messages.map(message => message.type)).toEqual([
      'terminal_output',
      'terminal_snapshot',
    ])
    const output = messages[0]!
    const snapshot = messages[1]!
    expect(output.output_seq).toBe(1)
    expect(snapshot.through_output_seq).toBe(1)
    expect(output.stream_id).toBeString()
    expect(snapshot.stream_id).toBe(output.stream_id)
  })

  test('splits oversized output into ordered frames without dropping data', () => {
    const manager = getTerminalManager()
    let subscriber:
      | ((event: { kind: 'output'; termId: string; data: string }) => void)
      | undefined
    spyOn(manager, 'subscribe').mockImplementation(callback => {
      subscriber = callback as typeof subscriber
      return () => {}
    })
    spyOn(manager, 'list').mockReturnValue([
      {
        id: 'term-large',
        name: 'main',
        cwd: '/tmp',
        cols: 80,
        rows: 24,
        alive: true,
        lastActivityAt: 1,
        preview: '',
      },
    ])
    spyOn(manager, 'rawSnapshot').mockReturnValue('snapshot')
    const messages: Array<Record<string, unknown>> = []
    setTerminalEventWriter(message => messages.push(message))
    messages.length = 0

    const output = 'A'.repeat(16 * 1024 + 17)
    subscriber?.({ kind: 'output', termId: 'term-large', data: output })
    publishTerminalSync()

    const frames = messages.filter(
      message => message.type === 'terminal_output',
    )
    expect(frames).toHaveLength(2)
    expect(frames.map(frame => frame.output_seq)).toEqual([1, 2])
    expect(frames.map(frame => String(frame.data)).join('')).toBe(output)
    expect(messages.at(-1)?.through_output_seq).toBe(2)
  })
})
