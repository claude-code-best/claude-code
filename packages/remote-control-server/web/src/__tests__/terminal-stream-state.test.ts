import { describe, expect, test } from 'bun:test'
import {
  applyTerminalStreamFrame,
  applyTerminalTransportState,
  type TerminalStreamCursor,
} from '../terminal/streamState'
import { createTerminalResizeScheduler } from '../terminal/resizeScheduler'

describe('terminal stream state', () => {
  test('snapshot watermark prevents overlapping output from being appended again', () => {
    const initial: TerminalStreamCursor = {
      streamId: null,
      lastOutputSeq: 0,
      buffer: '',
    }
    const snapshot = applyTerminalStreamFrame(initial, {
      type: 'terminal_snapshot',
      streamId: 'stream-1',
      throughOutputSeq: 4,
      data: 'snapshot',
    })
    const duplicate = applyTerminalStreamFrame(snapshot.cursor, {
      type: 'terminal_output',
      streamId: 'stream-1',
      outputSeq: 4,
      data: '-duplicate',
    })
    const duplicateSnapshot = applyTerminalStreamFrame(duplicate.cursor, {
      type: 'terminal_snapshot',
      streamId: 'stream-1',
      throughOutputSeq: 4,
      data: 'snapshot',
    })
    const next = applyTerminalStreamFrame(duplicateSnapshot.cursor, {
      type: 'terminal_output',
      streamId: 'stream-1',
      outputSeq: 5,
      data: '-next',
    })

    expect(snapshot.action).toBe('reset')
    expect(duplicate.action).toBe('ignore')
    expect(duplicateSnapshot.action).toBe('ignore')
    expect(next.action).toBe('append')
    expect(next.cursor.buffer).toBe('snapshot-next')
  })

  test('coalesces an animated drawer resize to the final dimensions', async () => {
    const sent: Array<{ cols: number; rows: number }> = []
    const scheduler = createTerminalResizeScheduler(size => sent.push(size))

    for (const cols of [45, 46, 52, 68, 79, 90, 93]) {
      scheduler.schedule({ cols, rows: 37 })
    }
    expect(sent).toEqual([])
    await new Promise(resolve => setTimeout(resolve, 180))

    expect(sent).toEqual([{ cols: 93, rows: 37 }])
    expect(scheduler.getCoalescedCount()).toBe(6)
    scheduler.dispose()
  })

  test('requests a fresh snapshot when the worker generation changes', () => {
    const initial = { ready: false, generation: null }
    const connected = applyTerminalTransportState(initial, true, 'generation-1')
    const duplicate = applyTerminalTransportState(
      connected.state,
      true,
      'generation-1',
    )
    const replaced = applyTerminalTransportState(
      duplicate.state,
      true,
      'generation-2',
    )

    expect(connected.shouldSync).toBe(true)
    expect(duplicate.shouldSync).toBe(false)
    expect(replaced.shouldSync).toBe(true)
  })

  test('resends the current dimensions after reconnect reset', async () => {
    const sent: Array<{ cols: number; rows: number }> = []
    const scheduler = createTerminalResizeScheduler(size => sent.push(size))

    scheduler.schedule({ cols: 93, rows: 37 })
    await new Promise(resolve => setTimeout(resolve, 180))
    scheduler.reset()
    scheduler.schedule({ cols: 93, rows: 37 })
    await new Promise(resolve => setTimeout(resolve, 180))

    expect(sent).toEqual([
      { cols: 93, rows: 37 },
      { cols: 93, rows: 37 },
    ])
    scheduler.dispose()
  })
})
