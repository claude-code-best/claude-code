import type {
  ProviderBalance,
  ProviderUsage,
  ProviderUsageBucket,
} from './types.js'

type Listener = (snapshot: ProviderUsage) => void

let current: ProviderUsage = {
  providerId: 'unknown',
  buckets: [],
}

const listeners: Set<Listener> = new Set()

export function getProviderUsage(): ProviderUsage {
  return current
}

/**
 * Replace buckets for a provider. Passing an empty array is valid — it records
 * that the latest response carried no usable quota header.
 */
export function updateProviderBuckets(
  providerId: string,
  buckets: ProviderUsageBucket[],
): void {
  current = {
    ...current,
    providerId,
    buckets,
  }
  emit()
}

export function setProviderBalance(
  providerId: string,
  balance: ProviderBalance | null,
): void {
  current = {
    ...current,
    providerId,
    ...(balance === null ? { balance: undefined } : { balance }),
  }
  emit()
}

export function subscribeProviderUsage(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetProviderUsage(): void {
  current = { providerId: 'unknown', buckets: [] }
  emit()
}

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(current)
    } catch {
      // Listener errors must not break the publish loop.
    }
  }
}
