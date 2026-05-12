/**
 * Thin HTTP client for the /v1/code/triggers endpoint.
 *
 * Key spec facts (from binary reverse-engineering of v2.1.123):
 *   - list:   GET  /v1/code/triggers
 *   - get:    GET  /v1/code/triggers/{trigger_id}
 *   - create: POST /v1/code/triggers
 *   - update: POST /v1/code/triggers/{trigger_id}  ← POST not PATCH
 *   - run:    POST /v1/code/triggers/{trigger_id}/run
 *   - delete: DELETE /v1/code/triggers/{trigger_id}
 *
 * Reuses the same base-URL + auth-header pattern as agentsApi.ts.
 */

import axios from 'axios'
import { getOauthConfig } from '../../constants/oauth.js'
import { assertSubscriptionBaseUrl } from '../../services/auth/hostGuard.js'
import { getOAuthHeaders, prepareApiRequest } from '../../utils/teleport/api.js'

export type Trigger = {
  trigger_id: string
  cron_expression: string
  enabled: boolean
  prompt: string
  agent_id?: string
  last_run?: string | null
  next_run?: string | null
  created_at?: string
}

export type CreateTriggerBody = {
  cron_expression: string
  prompt: string
  agent_id?: string
  enabled?: boolean
}

export type UpdateTriggerBody = Partial<{
  cron_expression: string
  prompt: string
  enabled: boolean
  agent_id: string
}>

type ListTriggersResponse = {
  data: Trigger[]
}

type TriggerRunResponse = {
  run_id: string
}

// Reverse-engineered from claude.exe v2.1.123: the only beta value the
// triggers endpoint actually accepts on the subscription auth plane is
// `ccr-triggers-2026-01-30`. The earlier umbrella value
// `managed-agents-2026-04-01` only appears in documentation strings, never
// in actual request construction.
const TRIGGERS_BETA_HEADER = 'ccr-triggers-2026-01-30'
const MAX_RETRIES = 3

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class TriggersApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'TriggersApiError'
  }
}

async function buildHeaders(): Promise<Record<string, string>> {
  let accessToken: string
  let orgUUID: string
  try {
    const prepared = await prepareApiRequest()
    accessToken = prepared.accessToken
    orgUUID = prepared.orgUUID
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new TriggersApiError(
      `Not authenticated: ${msg}. Run /login to re-authenticate.`,
      401,
    )
  }
  // Guard the host before sending OAuth credentials to prevent token leakage.
  assertSubscriptionBaseUrl(triggersBaseUrl())
  return {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': TRIGGERS_BETA_HEADER,
    'x-organization-uuid': orgUUID,
  }
}

function triggersBaseUrl(): string {
  return `${getOauthConfig().BASE_API_URL}/v1/code/triggers`
}

function classifyError(err: unknown): TriggersApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0
    if (status === 401) {
      return new TriggersApiError(
        'Authentication failed. Please run /login to re-authenticate.',
        401,
      )
    }
    if (status === 403) {
      return new TriggersApiError(
        'Subscription required. Scheduled triggers require a Claude Pro/Max/Team subscription.',
        403,
      )
    }
    if (status === 404) {
      return new TriggersApiError('Trigger not found.', 404)
    }
    if (status === 429) {
      const retryAfter =
        (err.response?.headers as Record<string, string> | undefined)?.[
          'retry-after'
        ] ?? ''
      const detail = retryAfter ? ` Retry after ${retryAfter}s.` : ''
      return new TriggersApiError(`Rate limit exceeded.${detail}`, 429)
    }
    const msg =
      (err.response?.data as { error?: { message?: string } } | undefined)
        ?.error?.message ?? err.message
    return new TriggersApiError(msg, status)
  }
  if (err instanceof TriggersApiError) return err
  return new TriggersApiError(
    err instanceof Error ? err.message : String(err),
    0,
  )
}

/**
 * Parses the Retry-After header value into milliseconds.
 * Accepts both integer-seconds (e.g. "30") and HTTP-date strings.
 * Returns null when the header is absent or unparseable.
 */
function parseRetryAfterMs(header: string | undefined): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (!Number.isNaN(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(header)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  return null
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: TriggersApiError | undefined
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const classified = classifyError(err)
      // Only retry 5xx errors
      if (classified.statusCode >= 500) {
        lastErr = classified
        if (attempt < MAX_RETRIES - 1) {
          const retryAfterHeader = axios.isAxiosError(err)
            ? (err.response?.headers as Record<string, string> | undefined)?.[
                'retry-after'
              ]
            : undefined
          const waitMs =
            parseRetryAfterMs(retryAfterHeader) ?? 500 * 2 ** attempt
          await sleep(waitMs)
        }
        continue
      }
      throw classified
    }
  }
  throw lastErr ?? new TriggersApiError('Request failed after retries', 0)
}

export async function listTriggers(): Promise<Trigger[]> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<ListTriggersResponse>(triggersBaseUrl(), {
      headers,
    })
    return response.data.data ?? []
  })
}

export async function getTrigger(id: string): Promise<Trigger> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<Trigger>(`${triggersBaseUrl()}/${id}`, {
      headers,
    })
    return response.data
  })
}

export async function createTrigger(body: CreateTriggerBody): Promise<Trigger> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.post<Trigger>(triggersBaseUrl(), body, {
      headers,
    })
    return response.data
  })
}

/**
 * Update a trigger.
 *
 * IMPORTANT: The upstream API uses POST (not PATCH/PUT) for updates.
 * Binary literal evidence: "update: POST /v1/code/triggers/{trigger_id}"
 */
export async function updateTrigger(
  id: string,
  body: UpdateTriggerBody,
): Promise<Trigger> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.post<Trigger>(
      `${triggersBaseUrl()}/${id}`,
      body,
      { headers },
    )
    return response.data
  })
}

export async function deleteTrigger(id: string): Promise<void> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    await axios.delete(`${triggersBaseUrl()}/${id}`, { headers })
  })
}

export async function runTrigger(id: string): Promise<TriggerRunResponse> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.post<TriggerRunResponse>(
      `${triggersBaseUrl()}/${id}/run`,
      {},
      { headers },
    )
    return response.data
  })
}
