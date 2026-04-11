import { afterEach, describe, expect, test } from 'bun:test'
import {
  addSlaveClient,
  applyPipeEntryToSlaveState,
  getConnectedSlaveTargets,
  resetSlaveClientsForTesting,
  subscribePipeEntries,
} from '../useMasterMonitor.js'

afterEach(() => {
  resetSlaveClientsForTesting()
})

describe('useMasterMonitor registry helpers', () => {
  test('returns only attached and connected targets from a selection list', () => {
    addSlaveClient('cli-a', { connected: true } as any)
    addSlaveClient('cli-b', { connected: false } as any)

    const targets = getConnectedSlaveTargets(['cli-a', 'cli-b', 'cli-c'])

    expect(targets).toHaveLength(1)
    expect(targets[0]?.name).toBe('cli-a')
    expect(targets[0]?.client.connected).toBe(true)
  })

  test('returns an empty array when no selected targets are connected', () => {
    addSlaveClient('cli-a', { connected: false } as any)

    expect(getConnectedSlaveTargets(['cli-a', 'cli-missing'])).toEqual([])
  })

  test('applies prompt_ack as busy activity with a summary', () => {
    const next = applyPipeEntryToSlaveState(
      {
        name: 'cli-a',
        connectedAt: '2026-04-08T00:00:00.000Z',
        status: 'idle',
        unreadCount: 0,
        history: [],
      },
      {
        type: 'prompt_ack',
        content: 'accepted',
        from: 'cli-a',
        timestamp: '2026-04-08T00:00:01.000Z',
      },
    )

    expect(next.status).toBe('busy')
    expect(next.lastEventType).toBe('prompt_ack')
    expect(next.lastSummary).toBe('accepted')
    expect(next.unreadCount).toBe(1)
  })

  test('applies done and error entries to terminal slave states', () => {
    const doneState = applyPipeEntryToSlaveState(
      {
        name: 'cli-a',
        connectedAt: '2026-04-08T00:00:00.000Z',
        status: 'busy',
        unreadCount: 1,
        history: [],
      },
      {
        type: 'done',
        content: 'completed',
        from: 'cli-a',
        timestamp: '2026-04-08T00:00:02.000Z',
      },
    )

    expect(doneState.status).toBe('idle')
    expect(doneState.lastSummary).toBe('completed')

    const errorState = applyPipeEntryToSlaveState(doneState, {
      type: 'error',
      content: 'failed',
      from: 'cli-a',
      timestamp: '2026-04-08T00:00:03.000Z',
    })

    expect(errorState.status).toBe('error')
    expect(errorState.lastEventType).toBe('error')
    expect(errorState.lastSummary).toBe('failed')
    expect(errorState.unreadCount).toBe(3)
  })

  test('emits pipe entries immediately when connected clients receive messages', () => {
    const handlers = new Map<string, (msg: any) => void>()
    const client = {
      connected: true,
      on(event: string, handler: (msg: any) => void) {
        handlers.set(event, handler)
      },
      removeListener(event: string) {
        handlers.delete(event)
      },
    }
    const seen: Array<{ name: string; type: string; content: string }> = []
    const unsubscribe = subscribePipeEntries((name, entry) => {
      seen.push({ name, type: entry.type, content: entry.content })
    })

    addSlaveClient('cli-a', client as any)
    handlers.get('message')?.({
      type: 'stream',
      data: 'hello',
      from: 'cli-a',
      ts: '2026-04-08T00:00:04.000Z',
    })

    expect(seen).toEqual([{ name: 'cli-a', type: 'stream', content: 'hello' }])

    unsubscribe()
  })
})
