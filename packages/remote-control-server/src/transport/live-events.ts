import { randomUUID } from 'node:crypto'
import { incrementTransportMetric } from './runtime-metrics'

export interface WorkerLiveCommand {
  commandId: string
  sessionId: string
  generation: string
  type: string
  payload: Record<string, unknown>
  createdAt: number
}

export interface WebLiveEvent {
  eventId: string
  sessionId: string
  type: string
  payload: Record<string, unknown>
  createdAt: number
}

type WorkerSender = (command: WorkerLiveCommand) => boolean
type WebSubscriber = (event: WebLiveEvent) => void

interface WorkerChannel {
  generation: string
  workerEpoch: number
  send: WorkerSender
  close: () => void
}

const workerChannels = new Map<string, WorkerChannel>()
const webSubscribers = new Map<string, Set<WebSubscriber>>()

function workerStatusEvent(
  sessionId: string,
  ready: boolean,
  generation?: string,
): WebLiveEvent {
  return {
    eventId: randomUUID(),
    sessionId,
    type: 'terminal_transport_state',
    payload: { ready, generation: generation ?? null },
    createdAt: Date.now(),
  }
}

export function registerWorkerLiveChannel(
  sessionId: string,
  workerEpoch: number,
  send: WorkerSender,
  close: () => void,
): () => void {
  const previous = workerChannels.get(sessionId)
  if (previous) {
    incrementTransportMetric('worker_sse_reconnects')
  }
  const channel: WorkerChannel = {
    generation: randomUUID(),
    workerEpoch,
    send,
    close,
  }
  workerChannels.set(sessionId, channel)
  previous?.close()
  publishWebLiveEvent(workerStatusEvent(sessionId, true, channel.generation))
  return () => {
    if (workerChannels.get(sessionId) === channel) {
      workerChannels.delete(sessionId)
      publishWebLiveEvent(workerStatusEvent(sessionId, false))
    }
  }
}

export function publishWorkerLiveCommand(
  sessionId: string,
  expectedWorkerEpoch: number,
  commandId: string,
  type: string,
  payload: Record<string, unknown>,
): { accepted: boolean; generation?: string } {
  const channel = workerChannels.get(sessionId)
  if (!channel || channel.workerEpoch !== expectedWorkerEpoch) {
    incrementTransportMetric('live_commands_rejected_worker_offline')
    return { accepted: false }
  }
  const accepted = channel.send({
    commandId,
    sessionId,
    generation: channel.generation,
    type,
    payload,
    createdAt: Date.now(),
  })
  if (!accepted && workerChannels.get(sessionId) === channel) {
    incrementTransportMetric('live_commands_rejected_worker_offline')
    workerChannels.delete(sessionId)
    publishWebLiveEvent(workerStatusEvent(sessionId, false))
  }
  if (accepted && type === 'terminal_sync') {
    incrementTransportMetric('terminal_snapshot_sync_requests')
  }
  return accepted
    ? { accepted: true, generation: channel.generation }
    : { accepted: false }
}

/** Fence a stale worker immediately when the server advances its epoch. */
export function fenceWorkerLiveChannel(
  sessionId: string,
  currentWorkerEpoch: number,
): void {
  const channel = workerChannels.get(sessionId)
  if (!channel || channel.workerEpoch === currentWorkerEpoch) return
  workerChannels.delete(sessionId)
  channel.close()
  publishWebLiveEvent(workerStatusEvent(sessionId, false))
}

export function getWorkerLiveStatusEvent(sessionId: string): WebLiveEvent {
  const channel = workerChannels.get(sessionId)
  return workerStatusEvent(sessionId, !!channel, channel?.generation)
}

export function subscribeWebLiveEvents(
  sessionId: string,
  subscriber: WebSubscriber,
): () => void {
  let subscribers = webSubscribers.get(sessionId)
  if (!subscribers) {
    subscribers = new Set()
    webSubscribers.set(sessionId, subscribers)
  }
  subscribers.add(subscriber)
  return () => {
    subscribers?.delete(subscriber)
    if (subscribers?.size === 0) webSubscribers.delete(sessionId)
  }
}

export function publishWebLiveEvent(event: WebLiveEvent): void {
  const subscribers = webSubscribers.get(event.sessionId)
  if (!subscribers) return
  for (const subscriber of subscribers) subscriber(event)
}

export function resetLiveEventsForTests(): void {
  workerChannels.clear()
  webSubscribers.clear()
}
