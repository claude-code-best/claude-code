import { log, error as logError } from "../logger";

export interface SessionEvent {
  id: string;
  sessionId: string;
  type: string;
  payload: unknown;
  direction: "inbound" | "outbound";
  seqNum: number;
  createdAt: number;
}

type Subscriber = (event: SessionEvent) => void;

export class EventBus {
  private subscribers = new Set<Subscriber>();
  private events: SessionEvent[] = [];
  private seqNum = 0;
  private closed = false;

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  publish(event: Omit<SessionEvent, "seqNum" | "createdAt">): SessionEvent {
    if (this.closed) throw new Error("EventBus is closed");
    const full: SessionEvent = {
      ...event,
      seqNum: ++this.seqNum,
      createdAt: Date.now(),
    };
    this.events.push(full);
    log(`[RC-DEBUG] bus publish: sessionId=${event.sessionId} type=${event.type} dir=${event.direction} seq=${full.seqNum} subscribers=${this.subscribers.size}`);
    for (const cb of this.subscribers) {
      try {
        cb(full);
      } catch (err) {
        logError(`[RC-DEBUG] bus subscriber error:`, err);
      }
    }
    return full;
  }

  getLastSeqNum(): number {
    return this.seqNum;
  }

  getEventsSince(seqNum: number): SessionEvent[] {
    const idx = this.events.findIndex((e) => e.seqNum > seqNum);
    if (idx === -1) return [];
    return this.events.slice(idx);
  }

  close() {
    this.closed = true;
    this.subscribers.clear();
  }
}

/** Global registry of per-session event buses */
const buses = new Map<string, EventBus>();

export function getEventBus(sessionId: string): EventBus {
  let bus = buses.get(sessionId);
  if (!bus) {
    bus = new EventBus();
    buses.set(sessionId, bus);
  }
  return bus;
}

export function removeEventBus(sessionId: string) {
  const bus = buses.get(sessionId);
  if (bus) {
    bus.close();
    buses.delete(sessionId);
  }
}

export function getAllEventBuses(): Map<string, EventBus> {
  return buses;
}
