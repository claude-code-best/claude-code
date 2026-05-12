import { describe, expect, test } from 'bun:test'
import {
  buildDerivedSecretForms,
  scrubAllSecretForms,
  scrubAxiosError,
  scrubResponseHeaders,
  truncateToBytes,
} from '../scrub.js'

describe('buildDerivedSecretForms', () => {
  test('returns empty array for empty secret', () => {
    expect(buildDerivedSecretForms('')).toEqual([])
  })

  test('M7: returns empty array for too-short secret (DoS guard)', () => {
    // A 1-3 char secret causes amplification on scrub; refuse to scrub.
    expect(buildDerivedSecretForms('X')).toEqual([])
    expect(buildDerivedSecretForms('XY')).toEqual([])
    expect(buildDerivedSecretForms('XYZ')).toEqual([])
  })

  test('covers all 4 forms: raw, Bearer, base64, Basic-base64 (>=8 chars)', () => {
    // M3 (audit #6): bare-base64 form is only emitted for secrets >= 8 chars
    // (collision risk for short secrets). Use 'helloXXX' (8 chars).
    const forms = buildDerivedSecretForms('helloXXX')
    const b64 = Buffer.from('helloXXX', 'utf8').toString('base64')
    expect(forms).toContain('helloXXX')
    expect(forms).toContain('Bearer helloXXX')
    expect(forms).toContain(b64)
    expect(forms).toContain(`Basic ${b64}`)
    expect(forms.length).toBe(4)
  })

  test('M3 (audit #6): short secret (4-7 chars) omits bare-base64 form', () => {
    // 4-char secret. Raw + Bearer + Basic-prefixed-base64 all emitted; bare
    // base64 is suppressed because 7-8 char base64 collides with random
    // tokens in the response body.
    const forms = buildDerivedSecretForms('hello')
    const b64 = Buffer.from('hello', 'utf8').toString('base64')
    expect(forms).toContain('hello')
    expect(forms).toContain('Bearer hello')
    expect(forms).toContain(`Basic ${b64}`)
    expect(forms).not.toContain(b64) // bare-base64 NOT emitted
    expect(forms.length).toBe(3)
  })

  test('M3 (audit #6): boundary at 7 vs 8 chars', () => {
    // 7-char: bare-base64 suppressed (3 forms)
    expect(buildDerivedSecretForms('1234567').length).toBe(3)
    // 8-char: bare-base64 emitted (4 forms)
    expect(buildDerivedSecretForms('12345678').length).toBe(4)
  })

  test('M7: returns longest-first so callers do not need to sort', () => {
    const forms = buildDerivedSecretForms('helloXXX')
    // Basic <base64> is longest, raw 'helloXXX' is shortest
    for (let i = 1; i < forms.length; i++) {
      expect(forms[i]!.length).toBeLessThanOrEqual(forms[i - 1]!.length)
    }
  })
})

describe('scrubAllSecretForms', () => {
  test('redacts raw secret', () => {
    const forms = buildDerivedSecretForms('XSECRETXX')
    expect(scrubAllSecretForms('header: XSECRETXX', forms)).toBe(
      'header: [REDACTED]',
    )
  })

  test('redacts Bearer-prefixed secret (longest-first)', () => {
    const forms = buildDerivedSecretForms('TOK123')
    // The Bearer form should be matched FIRST so we don't end up with
    // 'Bearer [REDACTED]' (the unredacted 'Bearer' prefix lingering).
    const result = scrubAllSecretForms('Authorization: Bearer TOK123', forms)
    expect(result).toBe('Authorization: [REDACTED]')
  })

  test('redacts base64-form (server might echo Basic auth)', () => {
    const forms = buildDerivedSecretForms('user:pass')
    const b64 = Buffer.from('user:pass', 'utf8').toString('base64')
    const result = scrubAllSecretForms(`echoed: ${b64}`, forms)
    expect(result).toBe('echoed: [REDACTED]')
  })

  test('redacts Basic-base64-form', () => {
    const forms = buildDerivedSecretForms('mypass')
    const b64 = Buffer.from('mypass', 'utf8').toString('base64')
    expect(scrubAllSecretForms(`Auth: Basic ${b64}`, forms)).toBe(
      'Auth: [REDACTED]',
    )
  })

  test('redacts ALL occurrences', () => {
    // M7: secrets >= 4 chars are scrubbed; 'XX' is too short and returns
    // empty forms (DoS guard). Use a 4-char secret to verify all-occurrence
    // replacement.
    const forms = buildDerivedSecretForms('XKEY')
    expect(scrubAllSecretForms('XKEY-hello-XKEY', forms)).toBe(
      '[REDACTED]-hello-[REDACTED]',
    )
  })

  test('preserves non-secret strings', () => {
    const forms = buildDerivedSecretForms('SECRET')
    expect(scrubAllSecretForms('hello world', forms)).toBe('hello world')
  })

  test('handles empty inputs', () => {
    expect(scrubAllSecretForms('', buildDerivedSecretForms('X'))).toBe('')
    expect(scrubAllSecretForms('text', [])).toBe('text')
  })
})

describe('scrubResponseHeaders', () => {
  test('redacts Authorization header by NAME (case-insensitive)', () => {
    const forms = buildDerivedSecretForms('SECRET')
    const result = scrubResponseHeaders(
      { 'Content-Type': 'application/json', authorization: 'Bearer SECRET' },
      forms,
    )
    expect(result['authorization']).toBe('[REDACTED]')
    expect(result['Content-Type']).toBe('application/json')
  })

  test('redacts X-Api-Key header', () => {
    const forms = buildDerivedSecretForms('K')
    const result = scrubResponseHeaders({ 'x-api-key': 'K' }, forms)
    expect(result['x-api-key']).toBe('[REDACTED]')
  })

  test('redacts cookie / set-cookie / proxy-authorization / www-authenticate', () => {
    const forms = buildDerivedSecretForms('S')
    const result = scrubResponseHeaders(
      {
        cookie: 'session=abc',
        'set-cookie': 'token=xyz',
        'proxy-authorization': 'Bearer S',
        'www-authenticate': 'Bearer realm="x"',
      },
      forms,
    )
    expect(result['cookie']).toBe('[REDACTED]')
    expect(result['set-cookie']).toBe('[REDACTED]')
    expect(result['proxy-authorization']).toBe('[REDACTED]')
    expect(result['www-authenticate']).toBe('[REDACTED]')
  })

  test('scrubs secret-like values from non-sensitive headers (echo case)', () => {
    const forms = buildDerivedSecretForms('XSECRETXX')
    // Server echoes our auth into a non-sensitive header (defensive)
    const result = scrubResponseHeaders(
      { 'x-debug-echo': 'received header: Bearer XSECRETXX' },
      forms,
    )
    expect(result['x-debug-echo']).toBe('received header: [REDACTED]')
  })

  test('handles array-valued headers (set-cookie)', () => {
    const forms = buildDerivedSecretForms('X')
    const result = scrubResponseHeaders({ 'set-cookie': ['a', 'b'] }, forms)
    expect(result['set-cookie']).toBe('[REDACTED]')
  })

  test('handles empty / null / non-object input', () => {
    expect(scrubResponseHeaders(null, [])).toEqual({})
    expect(scrubResponseHeaders(undefined, [])).toEqual({})
    expect(scrubResponseHeaders('not-an-object', [])).toEqual({})
  })
})

describe('truncateToBytes (H1: byte-aware reason capping)', () => {
  test('returns empty string for empty / zero-cap input', () => {
    expect(truncateToBytes('', 80)).toBe('')
    expect(truncateToBytes('hello', 0)).toBe('')
    expect(truncateToBytes('hello', -1)).toBe('')
  })

  test('returns input unchanged when already within byte cap', () => {
    expect(truncateToBytes('hello', 80)).toBe('hello')
    // Exact-length boundary: 5-char ASCII at maxBytes=5 returns unchanged
    expect(truncateToBytes('hello', 5)).toBe('hello')
  })

  test('truncates plain ASCII at the byte boundary', () => {
    const input = 'a'.repeat(120)
    const out = truncateToBytes(input, 80)
    expect(Buffer.byteLength(out, 'utf8')).toBe(80)
    expect(out).toBe('a'.repeat(80))
  })

  test('regression: 80 CJK chars produce <=80 BYTES, not 240', () => {
    // Each CJK char encodes to 3 bytes in UTF-8. 80 chars => 240 bytes.
    // Old code (input.reason.slice(0, 80)) returned the full 240-byte string.
    const input = '中'.repeat(80)
    const out = truncateToBytes(input, 80)
    const byteLen = Buffer.byteLength(out, 'utf8')
    expect(byteLen).toBeLessThanOrEqual(80)
    // 80 bytes / 3 bytes per char = 26 complete CJK chars
    expect(out).toBe('中'.repeat(26))
  })

  test('regression: emoji (4-byte UTF-8) does not produce half-encoded output', () => {
    // 🎉 is 4 bytes in UTF-8 (surrogate pair in JS, single code point).
    const input = '🎉'.repeat(40) // 160 bytes
    const out = truncateToBytes(input, 80)
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(80)
    // The result must be valid UTF-8 (no half-encoded surrogate)
    expect(out).toBe(Buffer.from(out, 'utf8').toString('utf8'))
    // 80 / 4 = 20 complete emoji
    expect(out).toBe('🎉'.repeat(20))
  })

  test('mixed ASCII + multi-byte: backs off to last code-point boundary', () => {
    // 'AAA' (3 bytes) + '中' (3 bytes) + 'BBB' (3 bytes) = 9 bytes total.
    // Cap at 5 bytes: 'AAA' fits (3 bytes), then '中' would push to 6 — back off.
    expect(truncateToBytes('AAA中BBB', 5)).toBe('AAA')
    // Cap at 6 bytes: 'AAA' + '中' = 6 bytes exactly → fits.
    expect(truncateToBytes('AAA中BBB', 6)).toBe('AAA中')
    // Cap at 7 bytes: 'AAA' + '中' = 6 bytes; +1 byte of 'B' would be a
    // valid ASCII boundary so 'AAA中B' fits.
    expect(truncateToBytes('AAA中BBB', 7)).toBe('AAA中B')
  })

  test('truncated output is always valid UTF-8 (no U+FFFD)', () => {
    // Stress: every byte length 1..30 on a multi-byte string must roundtrip
    const input = '日本語🎉🌟αβγ'
    for (let cap = 1; cap <= Buffer.byteLength(input, 'utf8'); cap++) {
      const out = truncateToBytes(input, cap)
      // Re-decoding the bytes must produce the same string (no replacement chars)
      const reDecoded = Buffer.from(out, 'utf8').toString('utf8')
      expect(out).toBe(reDecoded)
      expect(out).not.toContain('�')
      expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(cap)
    }
  })
})

describe('scrubAxiosError', () => {
  test('NEVER stringifies raw Error / AxiosError (would expose .config.headers)', () => {
    // Mimic an axios-like error with config.headers carrying Authorization
    class FakeAxiosError extends Error {
      config = { headers: { Authorization: 'Bearer XSECRETXX' } }
    }
    const e = new FakeAxiosError('Request failed with status code 401')
    const forms = buildDerivedSecretForms('XSECRETXX')
    const result = scrubAxiosError(e, forms)
    expect(result).not.toContain('XSECRETXX')
    expect(result).not.toContain('Bearer')
    // Should be a synthetic safe summary, not JSON.stringify of the error
    expect(result.startsWith('Request failed:')).toBe(true)
  })

  test('scrubs secret-derived strings in error.message', () => {
    const e = new Error('Bearer XSECRETXX failed')
    const forms = buildDerivedSecretForms('XSECRETXX')
    const result = scrubAxiosError(e, forms)
    expect(result).toBe('Request failed: [REDACTED] failed')
  })

  test('handles non-Error throwable', () => {
    expect(scrubAxiosError('boom', [])).toBe('Request failed (unknown error)')
    expect(scrubAxiosError({ status: 500 }, [])).toBe(
      'Request failed (unknown error)',
    )
  })
})
