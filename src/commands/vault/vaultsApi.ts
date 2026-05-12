/**
 * Thin HTTP client for the /v1/vaults endpoint.
 *
 * Key spec facts (from binary reverse-engineering of v2.1.123):
 *   - list vaults:         GET    /v1/vaults
 *   - create vault:        POST   /v1/vaults
 *   - get vault:           GET    /v1/vaults/{id}
 *   - archive vault:       POST   /v1/vaults/{id}/archive      ← POST not DELETE
 *   - list credentials:    GET    /v1/vaults/{id}/credentials
 *   - add credential:      POST   /v1/vaults/{id}/credentials  (inferred)
 *   - archive credential:  POST   /v1/vaults/{id}/credentials/{cid}/archive  ← POST not DELETE
 *
 * SECURITY INVARIANTS:
 *   - Credential `secret` value is NEVER logged or included in URLs
 *   - Error messages expose only the first 8 chars of any vault/credential ID
 *   - Zero tengu_vault_* telemetry (matches upstream: security-sensitive path)
 *
 * Reuses the same base-URL + auth-header pattern as memoryStoresApi.ts / triggersApi.ts.
 */

import axios from 'axios'
import { getOauthConfig } from '../../constants/oauth.js'
import { assertWorkspaceHost } from '../../services/auth/hostGuard.js'
import { prepareWorkspaceApiRequest } from '../../utils/teleport/api.js'
import { sanitizeId } from '../../utils/sanitizeId.js'

export type Vault = {
  vault_id: string
  name: string
  archived_at?: string | null
  created_at?: string
}

export type Credential = {
  credential_id: string
  vault_id: string
  kind?: string
  archived_at?: string | null
  created_at?: string
  // NOTE: 'secret' field intentionally absent — server never returns secret in responses
}

export type CreateVaultBody = {
  name: string
}

export type AddCredentialBody = {
  key: string
  secret: string
  kind?: string
}

type ListVaultsResponse = {
  data: Vault[]
}

type ListCredentialsResponse = {
  data: Credential[]
}

// Vaults share the managed-agents umbrella beta header.
const VAULTS_BETA_HEADER = 'managed-agents-2026-04-01'
const MAX_RETRIES = 3

// sanitizeId imported from ../../utils/sanitizeId.js (H3: single source of truth)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class VaultsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'VaultsApiError'
  }
}

async function buildHeaders(): Promise<Record<string, string>> {
  // /v1/vaults requires a workspace-scoped API key (sk-ant-api03-*).
  // Subscription OAuth bearer tokens always 401 here (server-enforced plane separation).
  // Guard the host before sending the key to prevent credential leakage.
  let apiKey: string
  try {
    const prepared = await prepareWorkspaceApiRequest()
    apiKey = prepared.apiKey
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new VaultsApiError(msg, 501)
  }
  assertWorkspaceHost(vaultsBaseUrl())
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': VAULTS_BETA_HEADER,
    'content-type': 'application/json',
  }
}

function vaultsBaseUrl(): string {
  return `${getOauthConfig().BASE_API_URL}/v1/vaults`
}

function classifyError(err: unknown, id?: string): VaultsApiError {
  const safeId = id ? ` (${sanitizeId(id)})` : ''
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0
    if (status === 401) {
      return new VaultsApiError(
        'Authentication failed. Please run /login to re-authenticate.',
        401,
      )
    }
    if (status === 403) {
      return new VaultsApiError(
        'Subscription required. Vault management requires a Claude Pro/Max/Team subscription.',
        403,
      )
    }
    if (status === 404) {
      return new VaultsApiError(`Vault or credential not found${safeId}.`, 404)
    }
    if (status === 429) {
      const retryAfter =
        (err.response?.headers as Record<string, string> | undefined)?.[
          'retry-after'
        ] ?? ''
      const detail = retryAfter ? ` Retry after ${retryAfter}s.` : ''
      return new VaultsApiError(`Rate limit exceeded.${detail}`, 429)
    }
    const msg =
      (err.response?.data as { error?: { message?: string } } | undefined)
        ?.error?.message ?? err.message
    return new VaultsApiError(msg, status)
  }
  if (err instanceof VaultsApiError) return err
  return new VaultsApiError(err instanceof Error ? err.message : String(err), 0)
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

async function withRetry<T>(fn: () => Promise<T>, id?: string): Promise<T> {
  let lastErr: VaultsApiError | undefined
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const classified = classifyError(err, id)
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
  throw lastErr ?? new VaultsApiError('Request failed after retries', 0)
}

// ── Vault CRUD ─────────────────────────────────────────────────────────────

export async function listVaults(): Promise<Vault[]> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<ListVaultsResponse>(vaultsBaseUrl(), {
      headers,
    })
    return response.data.data ?? []
  })
}

export async function createVault(name: string): Promise<Vault> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const body: CreateVaultBody = { name }
    const response = await axios.post<Vault>(vaultsBaseUrl(), body, {
      headers,
    })
    return response.data
  })
}

export async function getVault(id: string): Promise<Vault> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<Vault>(`${vaultsBaseUrl()}/${id}`, {
      headers,
    })
    return response.data
  }, id)
}

/**
 * Archive a vault (soft delete).
 *
 * IMPORTANT: The upstream API uses POST (not DELETE) for archiving.
 * Binary literal evidence: "POST /v1/vaults/{vault_id}/archive"
 */
export async function archiveVault(id: string): Promise<Vault> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.post<Vault>(
      `${vaultsBaseUrl()}/${id}/archive`,
      {},
      { headers },
    )
    return response.data
  }, id)
}

// ── Credential CRUD ────────────────────────────────────────────────────────

export async function listCredentials(vaultId: string): Promise<Credential[]> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.get<ListCredentialsResponse>(
      `${vaultsBaseUrl()}/${vaultId}/credentials`,
      { headers },
    )
    return response.data.data ?? []
  }, vaultId)
}

/**
 * Add a credential to a vault.
 *
 * SECURITY: The `secret` value is passed in the request body only.
 * It is NEVER included in URL parameters or logged.
 */
export async function addCredential(
  vaultId: string,
  key: string,
  secret: string,
): Promise<Credential> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const body: AddCredentialBody = { key, secret }
    const response = await axios.post<Credential>(
      `${vaultsBaseUrl()}/${vaultId}/credentials`,
      body,
      { headers },
    )
    return response.data
  }, vaultId)
}

/**
 * Archive a credential (soft delete).
 *
 * IMPORTANT: Uses POST (not DELETE) for archiving.
 * Binary literal evidence: "POST /v1/vaults/{vault_id}/credentials/{credential_id}/archive"
 */
export async function archiveCredential(
  vaultId: string,
  credentialId: string,
): Promise<Credential> {
  return withRetry(async () => {
    const headers = await buildHeaders()
    const response = await axios.post<Credential>(
      `${vaultsBaseUrl()}/${vaultId}/credentials/${credentialId}/archive`,
      {},
      { headers },
    )
    return response.data
  }, vaultId)
}
