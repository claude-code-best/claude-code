import type { ProviderBalance } from '../types.js'
import type { BalanceProvider } from './types.js'

/**
 * DeepSeek exposes balance at `GET /user/balance`.
 *
 * Enabled when:
 *   - OPENAI_BASE_URL points at api.deepseek.com, OR
 *   - DEEPSEEK_API_KEY is set (explicit opt-in).
 *
 * Response shape:
 *   { is_available: true, balance_infos: [{ currency:"USD", total_balance:"5.00", ... }, ...] }
 */

function getBaseUrl(): string | null {
  const url = process.env.OPENAI_BASE_URL
  if (url && /\bapi\.deepseek\.com\b/i.test(url)) return url.replace(/\/+$/, '')
  if (process.env.DEEPSEEK_API_KEY) return 'https://api.deepseek.com'
  return null
}

function getApiKey(): string | null {
  return process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || null
}

export const deepseekBalanceProvider: BalanceProvider = {
  providerId: 'deepseek',

  isEnabled(): boolean {
    return getBaseUrl() !== null && getApiKey() !== null
  },

  async fetchBalance(signal?: AbortSignal): Promise<ProviderBalance | null> {
    const base = getBaseUrl()
    const key = getApiKey()
    if (!base || !key) return null

    let res: Response
    try {
      res = await fetch(`${base}/user/balance`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
        },
        signal,
      })
    } catch {
      return null
    }
    if (!res.ok) return null

    let data: unknown
    try {
      data = await res.json()
    } catch {
      return null
    }

    const infos = (data as { balance_infos?: unknown })?.balance_infos
    if (!Array.isArray(infos)) return null

    // Prefer USD; fall back to the first entry.
    const usd = infos.find(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        (e as { currency?: unknown }).currency === 'USD',
    ) as Record<string, unknown> | undefined
    const pick = usd ?? (infos[0] as Record<string, unknown>) ?? null
    if (!pick) return null

    const currency = typeof pick.currency === 'string' ? pick.currency : 'USD'
    const remainingRaw = pick.total_balance
    const remaining =
      typeof remainingRaw === 'number' ? remainingRaw : Number(remainingRaw)
    if (!Number.isFinite(remaining)) return null

    return {
      currency,
      remaining,
      updatedAt: Math.floor(Date.now() / 1000),
    }
  },
}
