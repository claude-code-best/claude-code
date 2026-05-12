import { describe, test, expect, beforeEach } from 'bun:test'
import {
  EventBus,
  getEventBus,
  removeEventBus,
  getAllEventBuses,
} from '../transport/event-bus'

describe('EventBus', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus()
  })

  describe('publish', () => {
    test('publishes event with seqNum starting at 1', () => {
      const event = bus.publish({
        id: 'e1',
        sessionId: 's1',
        type: 'user',
        payload: { content: 'hello' },
        direction: 'outbound',
      })
      expect(event.seqNum).toBe(1)
      expect(event.createdAt).toBeGreaterThan(0)
    })

    test('increments seqNum on each publish', () => {
      bus.publish({
        id: 'e1',
        sessionId: 's1',
        type: 'user',
        payload: {},
        direction: 'outbound',
      })
      bus.publish({
        id: 'e2',
        sessionId: 's1',
        type: 'assistant',
        payload: {},
        direction: 'inbound',
      })
      const event = bus.publish({
        id: 'e3',
        sessionId: 's1',
        type: 'result',
        payload: {},
        direction: 'inbound',
      })
      expect(event.seqNum).toBe(3)
    })

    test('throws when publishing to a closed bus', () => {
      bus.close()
      expect(() =>
        bus.publish({
          id: 'e1',
          sessionId: 's1',
          type: 'user',
          payload: {},
          direction: 'outbound',
        }),
      ).toThrow('EventBus is closed')
    })
  })

  describe('subscribe', () => {
    test('receives published events', () => {
      const received: unknown[] = []
      bus.subscribe(event => received.push(event))

      bus.publish({
        id: 'e1',
        sessionId: 's1',
        type: 'user',
        payload: { content: 'hi' },
        direction: 'outbound',
      })
      expect(received).toHaveLength(1)
      expect((received[0] as any).payload).toEqual({ content: 'hi' })
    })

    test('unsubscribe stops receiving events', () => {
      const received: unknown[] = []
      const unsub = bus.subscribe(event => received.push(event))
      unsub()
      bus.publish({
        id: 'e1',
        sessionId: 's1',
        type: 'user',
        payload: {},
        direction: 'outbound',
      })
      expect(received).toHaveLength(0)
    })

    test('multiple subscribers all receive events', () => {
      const r1: unknown[] = []
      const r2: unknown[] = []
      bus.subscribe(e => r1.push(e))
      bus.subscribe(e => r2.push(e))
      bus.publish({
        id: 'e1',
        sessionId: 's1',
        type: 'user',
        payload: {},
        direction: 'outbound',
      })
      expect(r1).toHaveLength(1)
      expect(r2).toHaveLength(1)
    })

    test('subscriber error does not affect other subscribers', () => {
      const received: unknown[] = []
      bus.subscribe(() => {
        throw new Error('boom')
      })
      bus.subscribe(e => received.push(e))
      bus.publish({
        id: 'e1',
        sessionId: 's1',
        type: 'user',
        payload: {},
        direction: 'outbound',
      })
      expect(received).toHaveLength(1)
    })

    test('subscriberCount', () => {
      expect(bus.subscriberCount()).toBe(0)
      const unsub1 = bus.subscribe(() => {})
      expect(bus.subscriberCount()).toBe(1)
      const unsub2 = bus.subscribe(() => {})
      expect(bus.subscriberCount()).toBe(2)
      unsub1()
      expect(bus.subscriberCount()).toBe(1)
    })
  })

  describe('getEventsSince', () => {
    test('returns events after given seqNum', () => {
      bus.publish({
        id: 'e1',
        sessionId: 's1',
        type: 'user',
        payload: {},
        direction: 'outbound',
      })
      bus.publish({
        id: 'e2',
        sessionId: 's1',
        type: 'assistant',
        payload: {},
        direction: 'inbound',
      })
      bus.publish({
        id: 'e3',
        sessionId: 's1',
        type: 'result',
        payload: {},
        direction: 'inbound',
      })

      const events = bus.getEventsSince(1)
      expect(events).toHaveLength(2)
      expect(events[0].seqNum).toBe(2)
      expect(events[1].seqNum).toBe(3)
    })

    test('returns empty for seqNum beyond last', () => {
      bus.publish({
        id: 'e1',
        sessionId: 's1',
        type: 'user',
        payload: {},
        direction: 'outbound',
      })
      expect(bus.getEventsSince(1)).toHaveLength(0)
    })

    test('returns all events when seqNum is 0', () => {
      bus.publish({
        id: 'e1',
        sessionId: 's1',
        type: 'user',
        payload: {},
        direction: 'outbound',
      })
      bus.publish({
        id: 'e2',
        sessionId: 's1',
        type: 'assistant',
        payload: {},
        direction: 'inbound',
      })
      expect(bus.getEventsSince(0)).toHaveLength(2)
    })
  })

  describe('getLastSeqNum', () => {
    test('returns 0 for empty bus', () => {
      expect(bus.getLastSeqNum()).toBe(0)
    })

    test('returns last seqNum after publishes', () => {
      bus.publish({
        id: 'e1',
        sessionId: 's1',
        type: 'user',
        payload: {},
        direction: 'outbound',
      })
      bus.publish({
        id: 'e2',
        sessionId: 's1',
        type: 'user',
        payload: {},
        direction: 'outbound',
      })
      expect(bus.getLastSeqNum()).toBe(2)
    })
  })

  describe('close', () => {
    test('clears subscribers and prevents publishing', () => {
      bus.subscribe(() => {})
      bus.close()
      expect(bus.subscriberCount()).toBe(0)
      expect(() =>
        bus.publish({
          id: 'e1',
          sessionId: 's1',
          type: 'user',
          payload: {},
          direction: 'outbound',
        }),
      ).toThrow()
    })
  })
})

describe('EventBus registry', () => {
  beforeEach(() => {
    // Clean up global registry
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
  })

  describe('getEventBus', () => {
    test('creates new bus for unknown session', () => {
      const bus = getEventBus('s1')
      expect(bus).toBeInstanceOf(EventBus)
      expect(getAllEventBuses().has('s1')).toBe(true)
    })

    test('returns same bus for same session', () => {
      const bus1 = getEventBus('s1')
      const bus2 = getEventBus('s1')
      expect(bus1).toBe(bus2)
    })
  })

  describe('removeEventBus', () => {
    test('removes and closes bus', () => {
      const bus = getEventBus('s2')
      removeEventBus('s2')
      expect(getAllEventBuses().has('s2')).toBe(false)
      expect(() =>
        bus.publish({
          id: 'e1',
          sessionId: 's2',
          type: 'user',
          payload: {},
          direction: 'outbound',
        }),
      ).toThrow()
    })

    test('no-op for non-existent bus', () => {
      expect(() => removeEventBus('nonexistent')).not.toThrow()
    })
  })

  describe('getAllEventBuses', () => {
    test('returns all registered buses', () => {
      getEventBus('a')
      getEventBus('b')
      expect(getAllEventBuses().size).toBeGreaterThanOrEqual(2)
    })
  })
})
