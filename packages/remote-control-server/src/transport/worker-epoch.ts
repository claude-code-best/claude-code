import { storeGetSession } from '../store'

export function parseWorkerEpoch(value: unknown): number | undefined {
  const epoch = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : undefined
}

export function isCurrentWorkerEpoch(
  sessionId: string,
  value: unknown,
): boolean {
  const epoch = parseWorkerEpoch(value)
  return (
    epoch !== undefined && storeGetSession(sessionId)?.workerEpoch === epoch
  )
}

export function workerEpochMismatchError() {
  return {
    error: {
      type: 'worker_epoch_mismatch',
      message: 'Worker epoch is missing or stale',
    },
  }
}
