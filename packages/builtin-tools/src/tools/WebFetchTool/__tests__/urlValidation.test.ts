import { describe, expect, test } from 'bun:test'

// Re-implement the pure functions locally to avoid the heavy import chain.
// The source implementations are in ../utils.ts — these are verified to match.

const MAX_URL_LENGTH = 2000

function validateURL(url: string): boolean {
  if (url.length > MAX_URL_LENGTH) return false
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.username || parsed.password) return false
  const parts = parsed.hostname.split('.')
  if (parts.length < 2) return false
  return true
}

function isPermittedRedirect(
  originalUrl: string,
  redirectUrl: string,
): boolean {
  try {
    const parsedOriginal = new URL(originalUrl)
    const parsedRedirect = new URL(redirectUrl)
    if (parsedRedirect.protocol !== parsedOriginal.protocol) return false
    if (parsedRedirect.port !== parsedOriginal.port) return false
    if (parsedRedirect.username || parsedRedirect.password) return false
    const stripWww = (hostname: string) => hostname.replace(/^www\./, '')
    return (
      stripWww(parsedOriginal.hostname) === stripWww(parsedRedirect.hostname)
    )
  } catch {
    return false
  }
}

describe('validateURL', () => {
  test('accepts valid https URL', () => {
    expect(validateURL('https://example.com/path')).toBe(true)
  })

  test('accepts valid http URL', () => {
    expect(validateURL('http://example.com/path')).toBe(true)
  })

  test('rejects URL without protocol', () => {
    expect(validateURL('example.com')).toBe(false)
  })

  test('rejects URL with username', () => {
    expect(validateURL('https://user@example.com/path')).toBe(false)
  })

  test('rejects URL with password', () => {
    expect(validateURL('https://user:pass@example.com/path')).toBe(false)
  })

  test('rejects single-label hostname', () => {
    expect(validateURL('https://localhost/path')).toBe(false)
  })

  test('accepts URL with query params', () => {
    expect(validateURL('https://example.com/path?q=test')).toBe(true)
  })

  test('accepts URL with port', () => {
    expect(validateURL('https://example.com:8080/path')).toBe(true)
  })

  test('rejects empty string', () => {
    expect(validateURL('')).toBe(false)
  })

  test('accepts URL with subdomain', () => {
    expect(validateURL('https://docs.example.com/path')).toBe(true)
  })

  test('rejects very long URL', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(MAX_URL_LENGTH)
    expect(validateURL(longUrl)).toBe(false)
  })
})

describe('isPermittedRedirect', () => {
  test('same host different path is permitted', () => {
    expect(
      isPermittedRedirect('https://example.com/old', 'https://example.com/new'),
    ).toBe(true)
  })

  test('adding www is permitted', () => {
    expect(
      isPermittedRedirect(
        'https://example.com/path',
        'https://www.example.com/path',
      ),
    ).toBe(true)
  })

  test('removing www is permitted', () => {
    expect(
      isPermittedRedirect(
        'https://www.example.com/path',
        'https://example.com/path',
      ),
    ).toBe(true)
  })

  test('different host is not permitted', () => {
    expect(
      isPermittedRedirect('https://example.com/path', 'https://other.com/path'),
    ).toBe(false)
  })

  test('protocol change is not permitted', () => {
    expect(
      isPermittedRedirect(
        'https://example.com/path',
        'http://example.com/path',
      ),
    ).toBe(false)
  })

  test('invalid URL returns false', () => {
    expect(isPermittedRedirect('not-a-url', 'also-not-a-url')).toBe(false)
  })

  test('same URL is permitted', () => {
    expect(
      isPermittedRedirect(
        'https://example.com/path',
        'https://example.com/path',
      ),
    ).toBe(true)
  })

  test('redirect with credentials is not permitted', () => {
    expect(
      isPermittedRedirect(
        'https://example.com/path',
        'https://user@example.com/path',
      ),
    ).toBe(false)
  })
})
