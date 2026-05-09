/**
 * Thin HTTP client for the /v1/memory_stores endpoint.
 *
 * Key spec facts (from binary reverse-engineering of v2.1.123):
 *   - list stores:    GET    /v1/memory_stores
 *   - create store:   POST   /v1/memory_stores
 *   - get store:      GET    /v1/memory_stores/{id}
 *   - archive store:  POST   /v1/memory_stores/{id}/archive  ← POST not DELETE
 *   - list memories:  GET    /v1/memory_stores/{id}/memories
 *   - create memory:  POST   /v1/memory_stores/{id}/memories
 *   - get memory:     GET    /v1/memory_stores/{id}/memories/{mid}
 *   - update memory:  PATCH  /v1/memory_stores/{id}/memories/{mid}  ← PATCH not POST
 *   - delete memory:  DELETE /v1/memory_stores/{id}/memories/{mid}
 *   - list versions:  GET    /v1/memory_stores/{id}/memory_versions
 *   - redact version: POST   /v1/memory_stores/{id}/memory_versions/{vid}/redact
 *
 * CRITICAL INVARIANT: updateMemory uses PATCH (not POST).
 * Binary evidence: "PATCH /v1/memory_stores/{memory_store_id}/memories"
 *
 * Reuses the same base-URL + auth-header pattern as triggersApi.ts / agentsApi.ts.
 */

import axios from 'axios'
import { getOauthConfig } from '../../constants/oauth.js'
import { assertWorkspaceHost } from '../../services/auth/hostGuard.js'
import { prepareWorkspaceApiRequest } from '../../utils/teleport/api.js'

export type MemoryStore = {
  memory_store_id: string
  name: string
  namespace?: string
  archived_at?: string | null
  created_at?: string
}

export type Memory = {
  memory_id: string
  memory_store_id: string
  content: string
  created_at?: string
  updated_at?: string
}

export type MemoryVersion = {
  version_id: string
  memory_store_id: string
  created_at?: string
  redacted_at?: string | null
}

export type CreateStoreBody = {
  name: string
  namespace?: string
}

export type CreateMemoryBody = {
  content: string
}

export type UpdateMemoryBody = {
  content: string
}

type ListStoresResponse = {
  data: MemoryStore[]
}

type ListMemoriesResponse = {
  data: Memory[]
}

type ListVersionsResponse = {
  data: MemoryVersion[]
}

// Server requires this exact beta header — confirmed from runtime error
// "this API is in beta: add `managed-agents-2026-04-01`". Memory stores share
// the managed-agents beta umbrella with /v1/agents and /v1/code/triggers.
const MEMORY_STORES_BETA_HEADER = 'managed-agents-2026-04-01'
const MAX_RETRIES = 3

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class MemoryStoresApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'MemoryStoresApiError'
  }
}

async function buildHeaders(): Promise<Record<string, string>> {
  // /v1/memory_stores requires a workspace-scoped API key (sk-ant-api03-*).
  // Server explicitly returns: "memory stores require a workspace-scoped API key or session"
  // (probed 2026-05-03). Subscription OAuth bearer tokens always 401 here.
  // Guard the host before sending the key to prevent credential leakage.
  let apiKey: string
  try {
    const prepared = await prepareWorkspaceApiRequest()
    apiKey = prepared.apiKey
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new MemoryStoresApiError(msg, 501)
  }
  assertWorkspaceHost(memoryStoresBaseUrl())
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': MEMORY_STORES_BETA_HEADER,
    'content-type': 'application/json',
  }
}

function memoryStoresBaseUrl(): string {
  return `${getOauthConfig().BASE_API_URL}/v1/memory_stores`
}

function classifyError(err: unknown): MemoryStoresApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0
    if (status === 401) {
      return new MemoryStoresApiError(
        'Authentication failed. Please run /login to re-authenticate.',
        401,
      )
    }
    if (status === 403) {
      return new MemoryStoresApiError(
        'Subscription required. Memory stores require a Claude Pro/Max/Team subscription.',
        403,
      )
    }
    if (status === 404) {
      return new MemoryStoresApiError('Memory store or memory not found.', 404)
    }
    if (status === 429) {
      const retryAfter =
        (err.response?.headers as Record<string, string> | undefined)?.[
          'retry-after'
        ] ?? ''
      const detail = retryAfter ? ` Retry after ${retryAfter}s.` : ''
      return new MemoryStoresApiError(`Rate limit exceeded.${detail}`, 429)
    }
    const msg =
      (err.response?.data as { error?: { message?: string } } | undefined)
        ?.error?.message ?? err.message
    return new MemoryStoresApiError(msg, status)
  }
  if (err instanceof MemoryStoresApiError) return err
  return new MemoryStoresApiError(
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
  let lastErr: MemoryStoresApiError | undefined
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
  throw lastErr ?? new MemoryStoresApiError('Request failed after retries', 0)
}

// ── Store CRUD ─────────────────────────────────────────────────────────────

export async function listStores(): Promise<MemoryStore[]> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<ListStoresResponse>(
      memoryStoresBaseUrl(),
      {
        headers,
      },
    )
    return response.data.data ?? []
  })
}

export async function createStore(
  name: string,
  namespace?: string,
): Promise<MemoryStore> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const body: CreateStoreBody = { name }
    if (namespace) body.namespace = namespace
    const response = await axios.post<MemoryStore>(
      memoryStoresBaseUrl(),
      body,
      {
        headers,
      },
    )
    return response.data
  })
}

export async function getStore(id: string): Promise<MemoryStore> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<MemoryStore>(
      `${memoryStoresBaseUrl()}/${id}`,
      { headers },
    )
    return response.data
  })
}

/**
 * Archive a memory store (soft delete).
 *
 * IMPORTANT: The upstream API uses POST (not DELETE) for archiving.
 * Binary literal evidence: "POST /v1/memory_stores/{memory_store_id}/archive"
 */
export async function archiveStore(id: string): Promise<MemoryStore> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.post<MemoryStore>(
      `${memoryStoresBaseUrl()}/${id}/archive`,
      {},
      { headers },
    )
    return response.data
  })
}

// ── Memory CRUD ────────────────────────────────────────────────────────────

export async function listMemories(storeId: string): Promise<Memory[]> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<ListMemoriesResponse>(
      `${memoryStoresBaseUrl()}/${storeId}/memories`,
      { headers },
    )
    return response.data.data ?? []
  })
}

export async function createMemory(
  storeId: string,
  content: string,
): Promise<Memory> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const body: CreateMemoryBody = { content }
    const response = await axios.post<Memory>(
      `${memoryStoresBaseUrl()}/${storeId}/memories`,
      body,
      { headers },
    )
    return response.data
  })
}

export async function getMemory(
  storeId: string,
  memoryId: string,
): Promise<Memory> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<Memory>(
      `${memoryStoresBaseUrl()}/${storeId}/memories/${memoryId}`,
      { headers },
    )
    return response.data
  })
}

/**
 * Update a memory's content.
 *
 * CRITICAL INVARIANT: This endpoint uses PATCH (not POST/PUT).
 * Binary literal evidence: "PATCH /v1/memory_stores/{memory_store_id}/memories"
 * Test name: "updateMemory calls PATCH /v1/memory_stores/{id}/memories/{mid} (not POST)"
 */
export async function updateMemory(
  storeId: string,
  memoryId: string,
  content: string,
): Promise<Memory> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const body: UpdateMemoryBody = { content }
    const response = await axios.patch<Memory>(
      `${memoryStoresBaseUrl()}/${storeId}/memories/${memoryId}`,
      body,
      { headers },
    )
    return response.data
  })
}

export async function deleteMemory(
  storeId: string,
  memoryId: string,
): Promise<void> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    await axios.delete(
      `${memoryStoresBaseUrl()}/${storeId}/memories/${memoryId}`,
      { headers },
    )
  })
}

// ── Versions ───────────────────────────────────────────────────────────────

export async function listVersions(storeId: string): Promise<MemoryVersion[]> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<ListVersionsResponse>(
      `${memoryStoresBaseUrl()}/${storeId}/memory_versions`,
      { headers },
    )
    return response.data.data ?? []
  })
}

/**
 * Redact a memory version (PII removal).
 *
 * IMPORTANT: Uses POST (not DELETE) for redaction.
 * Binary literal evidence: "POST /v1/memory_stores/{id}/memory_versions/{vid}/redact"
 */
export async function redactVersion(
  storeId: string,
  versionId: string,
): Promise<MemoryVersion> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.post<MemoryVersion>(
      `${memoryStoresBaseUrl()}/${storeId}/memory_versions/${versionId}/redact`,
      {},
      { headers },
    )
    return response.data
  })
}
