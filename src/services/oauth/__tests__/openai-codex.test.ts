import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import {
  _internal,
  performOpenAICodexLogin,
} from '../openai-codex.js'

describe('openai-codex OAuth', () => {
  describe('constants', () => {
    test('has correct OAuth endpoints', () => {
      expect(_internal.CLIENT_ID).toBe('app_EMoamEEZ73f0CkXaXp7hrann')
      expect(_internal.AUTHORIZE_URL).toBe('https://auth.openai.com/oauth/authorize')
      expect(_internal.TOKEN_URL).toBe('https://auth.openai.com/oauth/token')
      expect(_internal.REDIRECT_URI).toBe('http://localhost:1455/auth/callback')
      expect(_internal.SCOPE).toBe('openid profile email offline_access api.connectors.read api.connectors.invoke')
    })
  })

  describe('buildAuthorizeUrl', () => {
    test('builds correct authorize URL with all parameters', () => {
      const url = _internal.buildAuthorizeUrl('test-challenge', 'test-state')
      const parsed = new URL(url)

      expect(parsed.origin + parsed.pathname).toBe('https://auth.openai.com/oauth/authorize')
      expect(parsed.searchParams.get('response_type')).toBe('code')
      expect(parsed.searchParams.get('client_id')).toBe(_internal.CLIENT_ID)
      expect(parsed.searchParams.get('redirect_uri')).toBe(_internal.REDIRECT_URI)
      expect(parsed.searchParams.get('scope')).toBe(_internal.SCOPE)
      expect(parsed.searchParams.get('code_challenge')).toBe('test-challenge')
      expect(parsed.searchParams.get('code_challenge_method')).toBe('S256')
      expect(parsed.searchParams.get('state')).toBe('test-state')
      expect(parsed.searchParams.get('id_token_add_organizations')).toBe('true')
      expect(parsed.searchParams.get('codex_cli_simplified_flow')).toBe('true')
      expect(parsed.searchParams.get('originator')).toBe('claude-code')
    })

    test('uses custom redirect URI when provided', () => {
      const url = _internal.buildAuthorizeUrl('challenge', 'state', 'http://localhost:9999/custom')
      const parsed = new URL(url)
      expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:9999/custom')
    })
  })

  describe('decodeJwt', () => {
    test('decodes valid JWT payload', () => {
      // Create a minimal JWT: header.payload.signature
      const payload = Buffer.from(
        JSON.stringify({
          'https://api.openai.com/auth': { chatgpt_account_id: 'acc_12345' },
          sub: 'user_123',
        }),
      ).toString('base64url')
      const token = `eyJhbGciOiJSUzI1NiJ9.${payload}.signature`

      const result = _internal.decodeJwt(token)
      expect(result).not.toBeNull()
      expect(result?.['https://api.openai.com/auth']?.chatgpt_account_id).toBe('acc_12345')
    })

    test('returns null for invalid JWT', () => {
      expect(_internal.decodeJwt('not-a-jwt')).toBeNull()
      expect(_internal.decodeJwt('a.b')).toBeNull()
      expect(_internal.decodeJwt('')).toBeNull()
    })
  })

  describe('getAccountId', () => {
    test('extracts account ID from valid token', () => {
      const payload = Buffer.from(
        JSON.stringify({
          'https://api.openai.com/auth': { chatgpt_account_id: 'acc_test123' },
        }),
      ).toString('base64url')
      const token = `header.${payload}.sig`

      expect(_internal.getAccountId(token)).toBe('acc_test123')
    })

    test('returns null when account ID is missing', () => {
      const payload = Buffer.from(JSON.stringify({ sub: 'user_123' })).toString('base64url')
      const token = `header.${payload}.sig`

      expect(_internal.getAccountId(token)).toBeNull()
    })

    test('returns null for empty account ID', () => {
      const payload = Buffer.from(
        JSON.stringify({
          'https://api.openai.com/auth': { chatgpt_account_id: '' },
        }),
      ).toString('base64url')
      const token = `header.${payload}.sig`

      expect(_internal.getAccountId(token)).toBeNull()
    })

    test('returns null for invalid token', () => {
      expect(_internal.getAccountId('invalid')).toBeNull()
    })
  })

  describe('exchangeCodeForTokens', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    test('exchanges code for tokens successfully', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id_token: 'id_token_value',
              access_token: 'access_value',
              refresh_token: 'refresh_value',
              expires_in: 3600,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ) as any

      const result = await _internal.exchangeCodeForTokens('auth_code', 'verifier')
      expect(result.access_token).toBe('access_value')
      expect(result.refresh_token).toBe('refresh_value')
      expect(result.id_token).toBe('id_token_value')
    })

    test('throws on non-200 response', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response('Unauthorized', { status: 401 }),
        ),
      ) as any

      await expect(
        _internal.exchangeCodeForTokens('bad_code', 'verifier'),
      ).rejects.toThrow('Token exchange failed (401)')
    })

    test('throws when response missing fields', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ access_token: 'only_access' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ) as any

      await expect(
        _internal.exchangeCodeForTokens('code', 'verifier'),
      ).rejects.toThrow('missing required fields')
    })

    test('sends correct request body', async () => {
      let capturedBody: string | null = null
      globalThis.fetch = mock((url: string, opts: any) => {
        capturedBody = opts.body
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id_token: 'id',
              access_token: 'acc',
              refresh_token: 'ref',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }) as any

      await _internal.exchangeCodeForTokens('test_code', 'test_verifier', 'http://localhost:1455/auth/callback')

      const params = new URLSearchParams(capturedBody!)
      expect(params.get('grant_type')).toBe('authorization_code')
      expect(params.get('client_id')).toBe(_internal.CLIENT_ID)
      expect(params.get('code')).toBe('test_code')
      expect(params.get('code_verifier')).toBe('test_verifier')
      expect(params.get('redirect_uri')).toBe('http://localhost:1455/auth/callback')
    })
  })

  describe('obtainApiKey', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    test('exchanges id_token for API key', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ access_token: 'sk-api-key-12345' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ) as any

      const apiKey = await _internal.obtainApiKey('id_token_value')
      expect(apiKey).toBe('sk-api-key-12345')
    })

    test('throws on non-200 response', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response('Forbidden', { status: 403 }),
        ),
      ) as any

      await expect(
        _internal.obtainApiKey('bad_token'),
      ).rejects.toThrow('API key exchange failed (403)')
    })

    test('sends correct token exchange parameters', async () => {
      let capturedBody: string | null = null
      globalThis.fetch = mock((url: string, opts: any) => {
        capturedBody = opts.body
        return Promise.resolve(
          new Response(
            JSON.stringify({ access_token: 'key' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }) as any

      await _internal.obtainApiKey('test_id_token')

      const params = new URLSearchParams(capturedBody!)
      expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange')
      expect(params.get('client_id')).toBe(_internal.CLIENT_ID)
      expect(params.get('requested_token')).toBe('openai-api-key')
      expect(params.get('subject_token')).toBe('test_id_token')
      expect(params.get('subject_token_type')).toBe('urn:ietf:params:oauth:token-type:id_token')
    })
  })
})
