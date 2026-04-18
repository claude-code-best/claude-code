import { setProviderBalance } from '../store.js'
import { deepseekBalanceProvider } from './deepseek.js'
import { genericBalanceProvider } from './generic.js'
import type { BalanceProvider } from './types.js'

const DEFAULT_INTERVAL_MIN = 10

// Registration order = priority. First enabled wins. Generic (user-supplied
// URL) comes first so operators can override the built-in DeepSeek detection.
const PROVIDERS: BalanceProvider[] = [
  genericBalanceProvider,
  deepseekBalanceProvider,
]

function selectProvider(): BalanceProvider | null {
  if (process.env.CLAUDE_CODE_BALANCE_PROVIDER === 'none') return null
  return PROVIDERS.find(p => p.isEnabled()) ?? null
}

function intervalMs(): number {
  const raw = process.env.CLAUDE_CODE_BALANCE_POLL_INTERVAL_MINUTES
  const n = raw ? Number(raw) : DEFAULT_INTERVAL_MIN
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MIN * 60_000
  return Math.floor(n * 60_000)
}

let timer: ReturnType<typeof setInterval> | null = null
let inflight: AbortController | null = null
let active: BalanceProvider | null = null

const FETCH_TIMEOUT_MS = 10_000

async function tick(): Promise<void> {
  if (!active) return
  inflight?.abort()
  inflight = new AbortController()
  const timeout = setTimeout(() => inflight?.abort(), FETCH_TIMEOUT_MS)
  try {
    const balance = await active.fetchBalance(inflight.signal)
    setProviderBalance(active.providerId, balance)
  } catch {
    // Never bubble into the host process.
  } finally {
    clearTimeout(timeout)
  }
}

/** Start polling if a provider is configured. Idempotent. */
export function startBalancePolling(): void {
  if (timer !== null) return
  active = selectProvider()
  if (!active) return
  // Kick off immediately, then on interval.
  void tick()
  timer = setInterval(() => {
    void tick()
  }, intervalMs())
  // Don't keep the event loop alive just for the poller.
  if (
    typeof (timer as unknown as { unref?: () => void }).unref === 'function'
  ) {
    ;(timer as unknown as { unref: () => void }).unref()
  }
}

export function stopBalancePolling(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  inflight?.abort()
  inflight = null
  active = null
}

export function getActiveBalanceProviderId(): string | null {
  return active?.providerId ?? null
}
