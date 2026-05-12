/**
 * Thin HTTP client for the /v1/skills endpoint.
 *
 * Key spec facts (from binary reverse-engineering of v2.1.123):
 *   - list skills:        GET    /v1/skills?beta=true
 *   - get skill:          GET    /v1/skills/{id}?beta=true
 *   - list versions:      GET    /v1/skills/{id}/versions?beta=true
 *   - get version:        GET    /v1/skills/{id}/versions/{v}?beta=true
 *   - create skill:       POST   /v1/skills?beta=true
 *   - delete skill:       DELETE /v1/skills/{id}?beta=true
 *
 * CRITICAL INVARIANT: Every request MUST include ?beta=true query parameter.
 * Binary evidence: `?beta=true` gate on all /v1/skills paths.
 *
 * Reuses the same base-URL + auth-header pattern as memoryStoresApi.ts.
 */

import axios from 'axios'
import { getOauthConfig } from '../../constants/oauth.js'
import { assertWorkspaceHost } from '../../services/auth/hostGuard.js'
import { prepareWorkspaceApiRequest } from '../../utils/teleport/api.js'

export type Skill = {
  skill_id: string
  name: string
  owner: string
  owner_symbol?: string
  deprecated: boolean
  allowed_tools?: string[]
  created_at?: string
}

export type SkillVersion = {
  version: string
  skill_id: string
  body: string
  created_at?: string
}

export type CreateSkillBody = {
  name: string
  body: string
}

type ListSkillsResponse = {
  data: Skill[]
}

type ListVersionsResponse = {
  data: SkillVersion[]
}

const MAX_RETRIES = 3

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class SkillsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'SkillsApiError'
  }
}

async function buildHeaders(): Promise<Record<string, string>> {
  // /v1/skills requires a workspace-scoped API key (sk-ant-api03-*).
  // Subscription OAuth bearer tokens 404 here (endpoint not on subscription plane).
  // Guard the host before sending the key to prevent credential leakage.
  let apiKey: string
  try {
    const prepared = await prepareWorkspaceApiRequest()
    apiKey = prepared.apiKey
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new SkillsApiError(msg, 501)
  }
  assertWorkspaceHost(skillsBaseUrl())
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  }
}

/**
 * Returns the base URL for /v1/skills with mandatory ?beta=true query.
 * CRITICAL INVARIANT: always append beta=true.
 */
function skillsBaseUrl(): string {
  return `${getOauthConfig().BASE_API_URL}/v1/skills?beta=true`
}

/**
 * Returns the URL for a specific skill with mandatory ?beta=true query.
 */
function skillUrl(id: string): string {
  return `${getOauthConfig().BASE_API_URL}/v1/skills/${id}?beta=true`
}

/**
 * Returns the URL for skill versions with mandatory ?beta=true query.
 */
function skillVersionsUrl(id: string): string {
  return `${getOauthConfig().BASE_API_URL}/v1/skills/${id}/versions?beta=true`
}

/**
 * Returns the URL for a specific skill version with mandatory ?beta=true query.
 */
function skillVersionUrl(id: string, version: string): string {
  return `${getOauthConfig().BASE_API_URL}/v1/skills/${id}/versions/${version}?beta=true`
}

function classifyError(err: unknown): SkillsApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0
    if (status === 401) {
      return new SkillsApiError(
        'Authentication failed. Please run /login to re-authenticate.',
        401,
      )
    }
    if (status === 403) {
      return new SkillsApiError(
        'Subscription required. Skill store requires a Claude Pro/Max/Team subscription.',
        403,
      )
    }
    if (status === 404) {
      return new SkillsApiError('Skill or version not found.', 404)
    }
    if (status === 429) {
      const retryAfter =
        (err.response?.headers as Record<string, string> | undefined)?.[
          'retry-after'
        ] ?? ''
      const detail = retryAfter ? ` Retry after ${retryAfter}s.` : ''
      return new SkillsApiError(`Rate limit exceeded.${detail}`, 429)
    }
    const msg =
      (err.response?.data as { error?: { message?: string } } | undefined)
        ?.error?.message ?? err.message
    return new SkillsApiError(msg, status)
  }
  if (err instanceof SkillsApiError) return err
  return new SkillsApiError(err instanceof Error ? err.message : String(err), 0)
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
  let lastErr: SkillsApiError | undefined
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
  throw lastErr ?? new SkillsApiError('Request failed after retries', 0)
}

// ── Skills CRUD ─────────────────────────────────────────────────────────────

export async function listSkills(): Promise<Skill[]> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<ListSkillsResponse>(skillsBaseUrl(), {
      headers,
    })
    return response.data.data ?? []
  })
}

export async function getSkill(id: string): Promise<Skill> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<Skill>(skillUrl(id), { headers })
    return response.data
  })
}

export async function getSkillVersions(id: string): Promise<SkillVersion[]> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<ListVersionsResponse>(
      skillVersionsUrl(id),
      { headers },
    )
    return response.data.data ?? []
  })
}

export async function getSkillVersion(
  id: string,
  version: string,
): Promise<SkillVersion> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<SkillVersion>(
      skillVersionUrl(id, version),
      { headers },
    )
    return response.data
  })
}

export async function createSkill(name: string, body: string): Promise<Skill> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const requestBody: CreateSkillBody = { name, body }
    const response = await axios.post<Skill>(skillsBaseUrl(), requestBody, {
      headers,
    })
    return response.data
  })
}

export async function deleteSkill(id: string): Promise<void> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    await axios.delete(skillUrl(id), { headers })
  })
}
