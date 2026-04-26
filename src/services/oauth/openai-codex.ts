/**
 * OpenAI Codex (ChatGPT) OAuth flow
 *
 * Implements the browser-based OAuth login for ChatGPT subscription access.
 * Based on the official OpenAI Codex CLI implementation (codex-rs/login/src/server.rs).
 *
 * Flow:
 * 1. Generate PKCE codes + state
 * 2. Start local HTTP server on port 1455
 * 3. Open browser to OpenAI authorize URL
 * 4. Handle callback → exchange code for tokens
 * 5. Token exchange: id_token → API key
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { generateCodeVerifier, generateCodeChallenge, generateState } from './crypto.js'
import { openBrowser } from '../../utils/browser.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
const TOKEN_URL = 'https://auth.openai.com/oauth/token'
const DEFAULT_PORT = 1455
const CALLBACK_PATH = '/auth/callback'
const REDIRECT_URI = `http://localhost:${DEFAULT_PORT}${CALLBACK_PATH}`
const SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke'
const JWT_CLAIM_PATH = 'https://api.openai.com/auth'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CodexOAuthResult = {
  apiKey: string | null
  accessToken: string
  refreshToken: string
  accountId: string
}

type TokenResponse = {
  id_token: string
  access_token: string
  refresh_token: string
  expires_in?: number
}

type ExchangeResponse = {
  access_token: string
}

type JwtPayload = {
  [JWT_CLAIM_PATH]?: {
    chatgpt_account_id?: string
  }
  [key: string]: unknown
}

// ─── JWT helpers ─────────────────────────────────────────────────────────────

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1] ?? ''
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8')
    return JSON.parse(decoded) as JwtPayload
  } catch {
    return null
  }
}

function getAccountId(token: string): string | null {
  const payload = decodeJwt(token)
  const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id
  return typeof accountId === 'string' && accountId.length > 0 ? accountId : null
}

// ─── URL building ────────────────────────────────────────────────────────────

function buildAuthorizeUrl(
  codeChallenge: string,
  state: string,
  redirectUri: string = REDIRECT_URI,
): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  url.searchParams.set('id_token_add_organizations', 'true')
  url.searchParams.set('codex_cli_simplified_flow', 'true')
  url.searchParams.set('originator', 'claude-code')
  return url.toString()
}

// ─── Token exchange ──────────────────────────────────────────────────────────

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string = REDIRECT_URI,
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Token exchange failed (${response.status}): ${text}`)
  }

  const json = (await response.json()) as TokenResponse
  if (!json.access_token || !json.refresh_token) {
    throw new Error('Token response missing required fields')
  }
  return json
}

async function obtainApiKey(idToken: string): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: CLIENT_ID,
      requested_token: 'openai-api-key',
      subject_token: idToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`API key exchange failed (${response.status}): ${text}`)
  }

  const json = (await response.json()) as ExchangeResponse
  if (!json.access_token) {
    throw new Error('API key exchange response missing access_token')
  }
  return json.access_token
}

// ─── HTML responses ──────────────────────────────────────────────────────────

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Login Successful</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:#eee}
.card{text-align:center;padding:2rem;border-radius:12px;background:#16213e;box-shadow:0 4px 24px rgba(0,0,0,.3)}
h1{color:#4ade80;font-size:1.5rem}p{color:#94a3b8;margin-top:.5rem}</style></head>
<body><div class="card"><h1>Authentication Complete</h1><p>You can close this window.</p></div></body></html>`

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Login Error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:#eee}
.card{text-align:center;padding:2rem;border-radius:12px;background:#16213e;box-shadow:0 4px 24px rgba(0,0,0,.3)}
h1{color:#f87171;font-size:1.5rem}p{color:#94a3b8;margin-top:.5rem}</style></head>
<body><div class="card"><h1>Authentication Failed</h1><p>${msg}</p></div></body></html>`

// ─── Local callback server ──────────────────────────────────────────────────

function startCallbackServer(
  state: string,
  port: number,
): Promise<{
  waitForCode: () => Promise<string>
  close: () => void
}> {
  let settlePromise: ((code: string) => void) | ((error: Error) => void) | null = null

  const codePromise = new Promise<string>((resolve, reject) => {
    settlePromise = resolve
    // Also store reject for error cases
    ;(settlePromise as any).__reject = reject
  })

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url || '', `http://localhost:${port}`)

      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(ERROR_HTML('Not found'))
        return
      }

      // Check for OAuth error
      const error = url.searchParams.get('error')
      if (error) {
        const desc = url.searchParams.get('error_description') ?? error
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(ERROR_HTML(desc))
        ;((settlePromise as any).__reject as (e: Error) => void)?.(new Error(`OAuth error: ${desc}`))
        return
      }

      if (url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(ERROR_HTML('State mismatch'))
        ;((settlePromise as any).__reject as (e: Error) => void)?.(new Error('State mismatch'))
        return
      }

      const code = url.searchParams.get('code')
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(ERROR_HTML('Missing authorization code'))
        ;((settlePromise as any).__reject as (e: Error) => void)?.(new Error('Missing authorization code'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(SUCCESS_HTML)
      ;(settlePromise as (code: string) => void)?.(code)
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(ERROR_HTML('Internal error'))
    }
  })

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        waitForCode: () => codePromise,
        close: () => {
          server.close()
          server.removeAllListeners()
        },
      })
    })
    server.on('error', (err: Error & { code?: string }) => {
      reject(new Error(`Failed to start callback server on port ${port}: ${err.message}`))
    })
  })
}

// ─── Manual code parsing ────────────────────────────────────────────────────

/**
 * Parse manual user input to extract an authorization code.
 * Accepts:
 * - A full redirect URL: http://localhost:1455/auth/callback?code=XXX&state=YYY
 * - A raw authorization code: XXX
 * - code#state format: XXX#YYY
 */
export function parseManualCodeInput(input: string): string | null {
  const value = input.trim()
  if (!value) return null

  // Try as URL
  try {
    const url = new URL(value)
    const code = url.searchParams.get('code')
    return code ?? null
  } catch {
    // Not a URL, continue
  }

  // Try code#state format — return just the code part
  if (value.includes('#')) {
    const [code] = value.split('#', 2)
    return code ?? null
  }

  // Return as raw code
  return value
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type CodexLoginOptions = {
  /** Called with the authorize URL when the flow starts */
  onUrl: (url: string) => void
  /** Optional: provide a manual authorization code (headless fallback) */
  manualCode?: Promise<string>
}

/**
 * Perform the complete OpenAI Codex OAuth login flow.
 *
 * 1. Starts local callback server on port 1455
 * 2. Opens browser to OpenAI authorize URL
 * 3. Exchanges authorization code for tokens
 * 4. Performs token exchange to obtain an API key
 * 5. Returns the API key and token information
 */
export async function performOpenAICodexLogin(
  options: CodexLoginOptions,
): Promise<CodexOAuthResult> {
  const { onUrl, manualCode } = options

  // Step 1: Generate PKCE + state
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  // Step 2: Build authorize URL
  const authUrl = buildAuthorizeUrl(codeChallenge, state)
  onUrl(authUrl)

  // Step 3: Start callback server
  const server = await startCallbackServer(state, DEFAULT_PORT)

  try {
    // Step 4: Open browser
    await openBrowser(authUrl)

    // Step 5: Wait for code (from callback or manual input)
    let code: string

    if (manualCode) {
      // Race between browser callback and manual input
      const result = await Promise.race([
        server.waitForCode().then(c => ({ source: 'callback' as const, code: c })),
        manualCode.then(c => ({ source: 'manual' as const, code: c })),
      ])
      code = result.code
    } else {
      code = await server.waitForCode()
    }

    // Step 6: Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, codeVerifier)

    // Step 7: Extract account ID
    const accountId = getAccountId(tokens.id_token)
    if (!accountId) {
      throw new Error('Failed to extract ChatGPT account ID from token')
    }

    // Step 8: Exchange id_token for API key (non-fatal: some accounts lack org, returning null)
    let apiKey: string | null = null
    try {
      apiKey = await obtainApiKey(tokens.id_token)
    } catch {
      // API key exchange may fail if the ID token lacks organization_id.
      // This is expected for some account types — login still succeeds.
    }

    return {
      apiKey,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accountId,
    }
  } finally {
    server.close()
  }
}

// Export helpers for testing
export const _internal = {
  CLIENT_ID,
  AUTHORIZE_URL,
  TOKEN_URL,
  REDIRECT_URI,
  SCOPE,
  buildAuthorizeUrl,
  decodeJwt,
  getAccountId,
  exchangeCodeForTokens,
  obtainApiKey,
}
