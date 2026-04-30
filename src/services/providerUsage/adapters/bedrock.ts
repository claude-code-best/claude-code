import type { ProviderUsageAdapter, ProviderUsageBucket } from '../types.js'

/**
 * AWS Bedrock rate-limit / throttling headers.
 *
 * Bedrock does not expose a precise per-minute quota the way OpenAI or
 * Anthropic do — the only reliably-present signal is `x-amzn-bedrock-*`
 * metadata on the response. We surface *throttle pressure* as a bucket
 * only when we can derive a meaningful 0..1 signal; otherwise return [].
 *
 *   x-amzn-bedrock-quota-remaining  (0..1 fraction, when present on some models)
 *   x-amzn-bedrock-quota-reset      (unix seconds)
 *   retry-after                     (seconds, present on 429)
 */
export const bedrockAdapter: ProviderUsageAdapter = {
  providerId: 'bedrock',
  parseHeaders(headers): ProviderUsageBucket[] {
    const buckets: ProviderUsageBucket[] = []

    const remainingRaw = headers.get('x-amzn-bedrock-quota-remaining')
    const resetRaw = headers.get('x-amzn-bedrock-quota-reset')

    if (remainingRaw !== null) {
      const remaining = Number(remainingRaw)
      if (Number.isFinite(remaining) && remaining >= 0 && remaining <= 1) {
        const resetsAt = resetRaw !== null ? Number(resetRaw) : 0
        buckets.push({
          kind: 'throttle',
          label: 'Throttle',
          utilization: 1 - remaining,
          ...(Number.isFinite(resetsAt) && resetsAt > 0 ? { resetsAt } : {}),
        })
      }
    }

    return buckets
  },
}
