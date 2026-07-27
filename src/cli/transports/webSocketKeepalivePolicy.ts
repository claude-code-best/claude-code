const STANDARD_KEEPALIVE_INTERVAL_MS = 120_000
const REMOTE_KEEPALIVE_INTERVAL_MS = 20_000

export function getWebSocketKeepaliveIntervalMs(isRemote: boolean): number {
  return isRemote
    ? REMOTE_KEEPALIVE_INTERVAL_MS
    : STANDARD_KEEPALIVE_INTERVAL_MS
}
