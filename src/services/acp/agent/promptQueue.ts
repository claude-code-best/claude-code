import type { AcpSession, PendingPrompt } from './sessionTypes.js'

export function popNextPendingPrompt(
  session: AcpSession,
): PendingPrompt | undefined {
  while (session.pendingQueueHead < session.pendingQueue.length) {
    const nextId = session.pendingQueue[session.pendingQueueHead++]
    if (!nextId) continue
    const next = session.pendingMessages.get(nextId)
    if (!next) continue
    session.pendingMessages.delete(nextId)
    compactPendingQueue(session)
    return next
  }

  compactPendingQueue(session)
  return undefined
}

function compactPendingQueue(session: AcpSession): void {
  if (session.pendingQueueHead === 0) return

  if (session.pendingQueueHead >= session.pendingQueue.length) {
    session.pendingQueue = []
    session.pendingQueueHead = 0
    return
  }

  if (
    session.pendingQueueHead > 1024 &&
    session.pendingQueueHead * 2 > session.pendingQueue.length
  ) {
    session.pendingQueue = session.pendingQueue.slice(session.pendingQueueHead)
    session.pendingQueueHead = 0
  }
}
