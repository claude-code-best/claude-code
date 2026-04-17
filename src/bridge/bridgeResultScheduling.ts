export function hasPendingBridgeMessages(
  lastWrittenIndex: number,
  messageCount: number,
): boolean {
  return lastWrittenIndex < messageCount
}

export function isTranscriptResetResultReady(
  transcriptResetPending: boolean,
  messageCount: number,
): boolean {
  return transcriptResetPending && messageCount === 0
}

export function shouldDeferBridgeResult({
  hasHandle,
  isConnected,
  lastWrittenIndex,
  messageCount,
}: {
  hasHandle: boolean
  isConnected: boolean
  lastWrittenIndex: number
  messageCount: number
}): boolean {
  if (!hasHandle || !isConnected) return true
  return hasPendingBridgeMessages(lastWrittenIndex, messageCount)
}
