import { beforeEach, describe, expect, test } from 'bun:test'
import { storeCreateSession, storeReset } from '../store'
import { publishSessionEvent } from '../services/transport'
import {
  EventBus,
  getAllEventBuses,
  getEventBus,
  removeEventBus,
  removeIdleEventBus,
} from '../transport/event-bus'

describe('structural memory bounds', () => {
  beforeEach(() => {
    storeReset()
    for (const [sessionId] of getAllEventBuses()) removeEventBus(sessionId)
  })

  test('10,000 committed events do not allocate an idle live bus', () => {
    const session = storeCreateSession({})
    for (let index = 0; index < 10_000; index++) {
      publishSessionEvent(
        session.id,
        'assistant',
        { content: `event-${index}`, uuid: `event-${index}` },
        'inbound',
        { producer: 'v2-worker', sourceEventId: `event-${index}` },
      )
    }

    expect(getAllEventBuses().has(session.id)).toBe(false)
  })

  test('oversized live payloads are delivered without exceeding the ring cap', () => {
    const bus = new EventBus()
    let delivered = 0
    bus.subscribe(() => delivered++)
    bus.publish({
      id: 'oversized',
      sessionId: 'session-1',
      type: 'assistant',
      payload: { content: 'x'.repeat(5 * 1024 * 1024) },
      direction: 'inbound',
    })

    expect(delivered).toBe(1)
    expect(bus.retainedBytes).toBeLessThanOrEqual(4 * 1024 * 1024)
    expect(bus.retainedEventCount).toBe(0)
  })

  test('1,000 subscribe/unsubscribe cycles return the registry to idle', () => {
    const bus = getEventBus('session-cycles')
    for (let index = 0; index < 1_000; index++) {
      const unsubscribe = bus.subscribe(() => {})
      unsubscribe()
    }

    expect(bus.subscriberCount()).toBe(0)
    expect(removeIdleEventBus('session-cycles')).toBe(true)
    expect(getAllEventBuses().has('session-cycles')).toBe(false)
  })
})
