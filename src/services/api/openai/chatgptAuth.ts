import { chmod, mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { logForDebugging } from 'src/utils/debug.js'

const ISSUER = 'https://auth.openai.com'
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTH_FILE = 'openai-chatgpt-auth.json'
const REFRESH_SKEW_MS = 5 * 60 * 1000

export type ChatGPTDeviceCode = {
  verificationUrl: string
  userCode: string
  deviceAuthId: string
  intervalSeconds: number
}

export type ChatGPTAuthTokens = {
  idToken: string
  accessToken: string
  refreshToken: string
  accountId?: string
  lastRefresh?: string
}

export type ChatGPTAuth = {
  accessToken: string
  accountId?: string
}

type StoredAuthFile = {
  auth_mode?: string
  tokens?: {
    id_token?: string
    access_token?: string
    refresh_token?: string
    account_id?: string
  }
  last_refresh?: string
}

function authFilePath(): string {
  return join(getClaudeConfigHomeDirLocal(), AUTH_FILE)
}

function getClaudeConfigHomeDirLocal(): string {
  return (
    process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  ).normalize('NFC')
}

function codexAuthFilePath(): string {
  return join(
    process.env.CODEX_HOME ?? join(process.env.HOME ?? '', '.codex'),
    'auth.json',
  )
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseJSONRecord(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split('.')
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    )
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return parseJSONRecord(json)
  } catch {
    return null
  }
}

function getOpenAIAuthClaims(token: string): Record<string, unknown> {
  const payload = decodeJwtPayload(token)
  const nested = payload?.['https://api.openai.com/auth']
  if (nested && typeof nested === 'object') {
    return nested as Record<string, unknown>
  }
  return payload ?? {}
}

function getTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  return typeof exp === 'number' ? exp * 1000 : null
}

function extractAccountId(tokens: {
  idToken?: string
  accessToken?: string
  accountId?: string
}): string | undefined {
  if (tokens.accountId) return tokens.accountId
  for (const token of [tokens.idToken, tokens.accessToken]) {
    if (!token) continue
    const claims = getOpenAIAuthClaims(token)
    const accountId =
      asString(claims.chatgpt_account_id) ??
      asString(claims.chatgpt_account_user_id) ??
      asString(claims.account_id)
    if (accountId) return accountId
  }
  return undefined
}

async function readStoredAuth(path: string): Promise<ChatGPTAuthTokens | null> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as StoredAuthFile
    const tokens = parsed.tokens
    const idToken = tokens?.id_token
    const accessToken = tokens?.access_token
    const refreshToken = tokens?.refresh_token
    if (!idToken || !accessToken || !refreshToken) return null
    return {
      idToken,
      accessToken,
      refreshToken,
      accountId: extractAccountId({
        idToken,
        accessToken,
        accountId: tokens.account_id,
      }),
      lastRefresh: parsed.last_refresh,
    }
  } catch {
    return null
  }
}

async function saveStoredAuth(tokens: ChatGPTAuthTokens): Promise<void> {
  const path = authFilePath()
  await mkdir(getClaudeConfigHomeDirLocal(), { recursive: true })
  const body: StoredAuthFile = {
    auth_mode: 'chatgpt',
    tokens: {
      id_token: tokens.idToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      account_id: extractAccountId(tokens),
    },
    last_refresh: new Date().toISOString(),
  }
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, {
    mode: 0o600,
  })
  await chmod(path, 0o600).catch(() => undefined)
}

async function postJSON<T>(
  url: string,
  body: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`ChatGPT auth request failed (${res.status})`)
  }
  return (await res.json()) as T
}

async function postForm<T>(url: string, body: URLSearchParams): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `ChatGPT token request failed (${res.status})${text ? `: ${text}` : ''}`,
    )
  }
  return (await res.json()) as T
}

export async function requestChatGPTDeviceCode(): Promise<ChatGPTDeviceCode> {
  type UserCodeResponse = {
    device_auth_id: string
    user_code?: string
    usercode?: string
    interval?: string | number
  }
  const data = await postJSON<UserCodeResponse>(
    `${ISSUER}/api/accounts/deviceauth/usercode`,
    { client_id: CLIENT_ID },
  )
  const userCode = data.user_code ?? data.usercode
  if (!data.device_auth_id || !userCode) {
    throw new Error('ChatGPT auth response did not include a device code')
  }
  const interval =
    typeof data.interval === 'number'
      ? data.interval
      : Number.parseInt(data.interval ?? '5', 10)
  return {
    verificationUrl: `${ISSUER}/codex/device`,
    userCode,
    deviceAuthId: data.device_auth_id,
    intervalSeconds: Number.isFinite(interval) && interval > 0 ? interval : 5,
  }
}

async function pollForAuthorizationCode(
  deviceCode: ChatGPTDeviceCode,
  signal?: AbortSignal,
): Promise<{ authorizationCode: string; codeVerifier: string }> {
  type TokenPollResponse = {
    authorization_code: string
    code_verifier: string
  }
  const started = Date.now()
  while (Date.now() - started < 15 * 60 * 1000) {
    if (signal?.aborted) throw new Error('ChatGPT login cancelled')
    const res = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_auth_id: deviceCode.deviceAuthId,
        user_code: deviceCode.userCode,
      }),
      signal,
    })
    if (res.ok) {
      const data = (await res.json()) as TokenPollResponse
      return {
        authorizationCode: data.authorization_code,
        codeVerifier: data.code_verifier,
      }
    }
    if (res.status !== 403 && res.status !== 404) {
      throw new Error(`ChatGPT device auth failed (${res.status})`)
    }
    await new Promise(resolve =>
      setTimeout(resolve, deviceCode.intervalSeconds * 1000),
    )
  }
  throw new Error('ChatGPT device auth timed out after 15 minutes')
}

async function exchangeAuthorizationCode(params: {
  authorizationCode: string
  codeVerifier: string
}): Promise<ChatGPTAuthTokens> {
  type TokenResponse = {
    id_token: string
    access_token: string
    refresh_token: string
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.authorizationCode,
    redirect_uri: `${ISSUER}/deviceauth/callback`,
    client_id: CLIENT_ID,
    code_verifier: params.codeVerifier,
  })
  const data = await postForm<TokenResponse>(`${ISSUER}/oauth/token`, body)
  return {
    idToken: data.id_token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accountId: extractAccountId({
      idToken: data.id_token,
      accessToken: data.access_token,
    }),
  }
}

async function refreshTokens(
  tokens: ChatGPTAuthTokens,
): Promise<ChatGPTAuthTokens> {
  type TokenResponse = {
    id_token: string
    access_token: string
    refresh_token?: string
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: CLIENT_ID,
    scope:
      'openid profile email offline_access api.connectors.read api.connectors.invoke',
  })
  const data = await postForm<TokenResponse>(`${ISSUER}/oauth/token`, body)
  return {
    idToken: data.id_token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    accountId: extractAccountId({
      idToken: data.id_token,
      accessToken: data.access_token,
      accountId: tokens.accountId,
    }),
  }
}

export async function completeChatGPTDeviceLogin(
  deviceCode: ChatGPTDeviceCode,
  signal?: AbortSignal,
): Promise<ChatGPTAuthTokens> {
  const code = await pollForAuthorizationCode(deviceCode, signal)
  const tokens = await exchangeAuthorizationCode(code)
  await saveStoredAuth(tokens)
  return tokens
}

export function isChatGPTAuthEnabled(): boolean {
  return process.env.OPENAI_AUTH_MODE === 'chatgpt'
}

export async function removeChatGPTAuth(): Promise<void> {
  await unlink(authFilePath()).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  })
}

export async function getValidChatGPTAuth(): Promise<ChatGPTAuth> {
  let tokens = await readStoredAuth(authFilePath())
  if (!tokens) {
    tokens = await readStoredAuth(codexAuthFilePath())
    if (tokens) {
      logForDebugging('[OpenAI] Using ChatGPT auth from Codex auth.json')
    }
  }
  if (!tokens) {
    throw new Error(
      'ChatGPT account is not logged in. Run /login and select ChatGPT account with subscription.',
    )
  }
  const expiresAt = getTokenExpiryMs(tokens.accessToken)
  if (expiresAt !== null && expiresAt <= Date.now() + REFRESH_SKEW_MS) {
    tokens = await refreshTokens(tokens)
    await saveStoredAuth(tokens)
  }
  return {
    accessToken: tokens.accessToken,
    accountId: tokens.accountId ?? extractAccountId(tokens),
  }
}
