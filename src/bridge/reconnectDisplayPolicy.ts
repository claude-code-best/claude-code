const RECONNECT_DISPLAY_FAILURE_THRESHOLD = 2

export function shouldSurfaceReconnect(consecutiveFailures: number): boolean {
  return consecutiveFailures >= RECONNECT_DISPLAY_FAILURE_THRESHOLD
}

export function shouldLogReconnected(reconnectStatusVisible: boolean): boolean {
  return reconnectStatusVisible
}
