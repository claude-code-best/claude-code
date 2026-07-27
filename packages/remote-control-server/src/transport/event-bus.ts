import { log, error as logError } from '../logger'
import type { PersistedSessionEvent } from '../persistence/types'

export interface SessionEvent {
  id: string
  sessionId: string
  type: string
  payload: unknown
  direction: 'inbound' | 'outbound'
  seqNum: number
  createdAt: number
}

export function projectSessionEvent(
  event: PersistedSessionEvent | SessionEvent,
): SessionEvent {
  return {
    id: event.id,
    sessionId: event.sessionId,
    type: event.type,
    payload: event.payload,
    direction: event.direction,
    seqNum: event.seqNum,
    createdAt: event.createdAt,
  }
}

type Subscriber = (event: SessionEvent) => void

export interface EventBusOptions {
  maxEvents?: number
  maxBytes?: number
}

interface RetainedEvent {
  event: SessionEvent
  payloadBytes: number
}

const DEFAULT_MAX_EVENTS = 256
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024
const utf8Encoder = new TextEncoder()

function validateLimit(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`)
  }
  return value
}

function getPayloadBytes(payload: unknown): number {
  const serialized = JSON.stringify(payload)
  if (serialized === undefined) {
    throw new TypeError('Event payload must be JSON-serializable')
  }
  return utf8Encoder.encode(serialized).byteLength
}

export class EventBus {
  private subscribers = new Set<Subscriber>()
  private events: RetainedEvent[] = []
  private retainedPayloadBytes = 0
  private seqNum = 0
  private closed = false
  private readonly maxEvents: number
  private readonly maxBytes: number

  constructor(options: EventBusOptions = {}) {
    this.maxEvents = validateLimit(
      options.maxEvents ?? DEFAULT_MAX_EVENTS,
      'maxEvents',
    )
    this.maxBytes = validateLimit(
      options.maxBytes ?? DEFAULT_MAX_BYTES,
      'maxBytes',
    )
  }

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  subscriberCount(): number {
    return this.subscribers.size
  }

  get retainedEventCount(): number {
    return this.events.length
  }

  get retainedBytes(): number {
    return this.retainedPayloadBytes
  }

  publish(event: Omit<SessionEvent, 'seqNum' | 'createdAt'>): SessionEvent {
    if (this.closed) throw new Error('EventBus is closed')
    const payloadBytes = getPayloadBytes(event.payload)
    const full: SessionEvent = {
      ...event,
      seqNum: ++this.seqNum,
      createdAt: Date.now(),
    }
    return this.record(full, payloadBytes)
  }

  publishCommitted(event: PersistedSessionEvent): SessionEvent {
    if (this.closed) throw new Error('EventBus is closed')
    const projected = projectSessionEvent(event)
    const payloadBytes = getPayloadBytes(projected.payload)
    this.seqNum = Math.max(this.seqNum, projected.seqNum)
    return this.record(projected, payloadBytes)
  }

  private record(event: SessionEvent, payloadBytes: number): SessionEvent {
    this.events.push({ event, payloadBytes })
    this.retainedPayloadBytes += payloadBytes
    while (
      this.events.length > this.maxEvents ||
      this.retainedPayloadBytes > this.maxBytes
    ) {
      const removed = this.events.shift()
      if (!removed) break
      this.retainedPayloadBytes -= removed.payloadBytes
    }
    log(
      `[RC-DEBUG] bus publish: sessionId=${event.sessionId} type=${event.type} dir=${event.direction} seq=${event.seqNum} subscribers=${this.subscribers.size}`,
      event.type === 'error' ? `payload=${JSON.stringify(event.payload)}` : '',
    )
    for (const cb of this.subscribers) {
      try {
        cb(event)
      } catch (err) {
        logError(`[RC-DEBUG] bus subscriber error:`, err)
      }
    }
    return event
  }

  getLastSeqNum(): number {
    return this.seqNum
  }

  getEventsSince(seqNum: number): SessionEvent[] {
    const idx = this.events.findIndex(({ event }) => event.seqNum > seqNum)
    if (idx === -1) return []
    return this.events.slice(idx).map(({ event }) => event)
  }

  close() {
    this.closed = true
    this.subscribers.clear()
    this.events = []
    this.retainedPayloadBytes = 0
  }
}

/** Global registry of per-session event buses */
const buses = new Map<string, EventBus>()

export function getEventBus(sessionId: string): EventBus {
  let bus = buses.get(sessionId)
  if (!bus) {
    bus = new EventBus()
    buses.set(sessionId, bus)
  }
  return bus
}

export function getExistingEventBus(sessionId: string): EventBus | undefined {
  return buses.get(sessionId)
}

export function removeEventBus(sessionId: string): boolean {
  const bus = buses.get(sessionId)
  if (!bus) return false
  bus.close()
  buses.delete(sessionId)
  return true
}

export function removeIdleEventBus(sessionId: string): boolean {
  const bus = buses.get(sessionId)
  if (!bus || bus.subscriberCount() > 0) return false
  return removeEventBus(sessionId)
}

export function getAllEventBuses(): Map<string, EventBus> {
  return buses
}

/** Global registry of per-channel-group ACP event buses */
const acpBuses = new Map<string, EventBus>()

export function getAcpEventBus(channelGroupId: string): EventBus {
  let bus = acpBuses.get(channelGroupId)
  if (!bus) {
    bus = new EventBus()
    acpBuses.set(channelGroupId, bus)
  }
  return bus
}

export function removeAcpEventBus(channelGroupId: string): boolean {
  const bus = acpBuses.get(channelGroupId)
  if (!bus) return false
  bus.close()
  acpBuses.delete(channelGroupId)
  return true
}

export function removeIdleAcpEventBus(channelGroupId: string): boolean {
  const bus = acpBuses.get(channelGroupId)
  if (!bus || bus.subscriberCount() > 0) return false
  return removeAcpEventBus(channelGroupId)
}

export function getAllAcpEventBuses(): Map<string, EventBus> {
  return acpBuses
}
