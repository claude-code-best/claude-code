import { afterEach, describe, expect, test } from 'bun:test'
import {
  getCodexConfigurationError,
  normalizeCodexError,
} from '../errors.js'

const originalCodexApiKey = process.env.CODEX_API_KEY

afterEach(() => {
  if (originalCodexApiKey === undefined) {
    delete process.env.CODEX_API_KEY
  } else {
    process.env.CODEX_API_KEY = originalCodexApiKey
  }
})

describe('getCodexConfigurationError', () => {
  test('reports missing CODEX_API_KEY clearly', () => {
    delete process.env.CODEX_API_KEY

    expect(getCodexConfigurationError()).toEqual({
      content:
        'Missing CODEX_API_KEY. Configure it in settings or your environment before using the codex provider.',
      error: 'authentication_failed',
    })
  })

  test('returns null when CODEX_API_KEY is present', () => {
    process.env.CODEX_API_KEY = 'test-key'

    expect(getCodexConfigurationError()).toBeNull()
  })
})

describe('normalizeCodexError', () => {
  test('maps authentication failures', () => {
    expect(
      normalizeCodexError({
        status: 401,
        message: 'invalid_api_key',
      }),
    ).toEqual({
      content:
        'Codex authentication failed (401). Verify CODEX_API_KEY and CODEX_BASE_URL.',
      error: 'authentication_failed',
    })
  })

  test('maps missing endpoint failures', () => {
    expect(
      normalizeCodexError({
        status: 404,
        message: 'Not Found',
      }),
    ).toEqual({
      content:
        'Codex endpoint not found (404). Verify CODEX_BASE_URL points to a Responses API root.',
      error: 'invalid_request',
    })
  })

  test('maps rate limits', () => {
    expect(
      normalizeCodexError({
        status: 429,
        message: 'Too Many Requests',
      }),
    ).toEqual({
      content:
        'Codex rate limit reached (429). Retry shortly or reduce request volume.',
      error: 'rate_limit',
    })
  })

  test('maps upstream gateway 502 errors', () => {
    expect(
      normalizeCodexError({
        status: 502,
        message: 'Upstream request failed',
      }),
    ).toEqual({
      content:
        'Codex gateway returned 502 Upstream request failed. This usually means a transient gateway issue or incomplete Responses API compatibility during tool replay.',
      error: 'server_error',
    })
  })

  test('passes through Codex preflight errors as invalid requests', () => {
    expect(
      normalizeCodexError(new Error('Codex preflight: input must be an array.')),
    ).toEqual({
      content: 'Codex preflight: input must be an array.',
      error: 'invalid_request',
    })
  })

  test('falls back to generic API error text', () => {
    expect(normalizeCodexError(new Error('socket hang up'))).toEqual({
      content: 'API Error: socket hang up',
      error: 'unknown',
    })
  })
})
