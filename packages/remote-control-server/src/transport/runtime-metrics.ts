import { log } from '../logger'

export type TransportMetricName =
  | 'worker_sse_reconnects'
  | 'durable_event_replays'
  | 'durable_event_deduplications'
  | 'live_commands_rejected_worker_offline'
  | 'terminal_snapshot_sync_requests'

const counters = new Map<TransportMetricName, number>()

export function incrementTransportMetric(
  name: TransportMetricName,
  amount = 1,
): void {
  const value = (counters.get(name) ?? 0) + amount
  counters.set(name, value)
  log(`[RCS-METRIC] ${name}=${value}`)
}

export function getTransportMetrics(): Record<TransportMetricName, number> {
  return {
    worker_sse_reconnects: counters.get('worker_sse_reconnects') ?? 0,
    durable_event_replays: counters.get('durable_event_replays') ?? 0,
    durable_event_deduplications:
      counters.get('durable_event_deduplications') ?? 0,
    live_commands_rejected_worker_offline:
      counters.get('live_commands_rejected_worker_offline') ?? 0,
    terminal_snapshot_sync_requests:
      counters.get('terminal_snapshot_sync_requests') ?? 0,
  }
}

export function resetTransportMetricsForTests(): void {
  counters.clear()
}
