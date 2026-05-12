/**
 * Scrubbing functions for VaultHttpFetchTool.
 *
 * The cardinal rule: NO secret-derived string ever leaves this tool's
 * boundary in any field that would land in tool_result, jsonl, transcript
 * search, telemetry, or compact summaries. The scrub layer applies to:
 *   - response body (server might echo Authorization)
 *   - response headers (Authorization / X-Api-Key / Set-Cookie)
 *   - axios error messages (axios.AxiosError.config can carry the request
 *     headers — including the Authorization we just sent)
 *
 * Strategy: build all "derived forms" of the secret BEFORE the request, then
 * apply scrubAllSecretForms to every byte that crosses the tool boundary.
 *
 * Derived forms covered:
 *   - raw secret value
 *   - 'Bearer <secret>'
 *   - <secret> base64-encoded (for Basic-style payloads)
 *   - 'Basic <base64>' full header value
 *
 * Custom auth_header_name puts the raw secret as the header value, which is
 * already covered by the raw-secret form.
 */

const REDACTED = '[REDACTED]'

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'www-authenticate',
])

/**
 * Minimum secret length for scrubbing the RAW form. Below this threshold,
 * scrubbing causes pathological output amplification — e.g. a 1-char
 * secret 'X' on a 1MB body that happens to contain many X chars produces
 * ~10MB of [REDACTED].
 *
 * 4 chars is below any realistic secret (API tokens, OAuth tokens, JWTs,
 * passwords are all >>4). The vault store should reject sub-4-char values
 * at write time, but this is defense-in-depth at scrub time.
 */
const MIN_SCRUB_LENGTH = 4

/**
 * Minimum secret length for scrubbing the BASE64-derived forms.
 *
 * M3 fix (codecov-100 audit #6): a 4-char secret has a 7-8 char base64
 * representation that is short enough to collide with naturally-occurring
 * tokens in the response body (`x4Kp` → `eDRLcA==`, which can match
 * unrelated short identifiers). Raw + Bearer forms are still scrubbed
 * for short secrets because their substring match is much more specific
 * (e.g. `Bearer x4Kp` is unlikely to collide). For base64 forms we wait
 * until the secret is >= 8 chars (yielding >= 12 base64 chars), which is
 * the OWASP minimum for a credential and is well clear of incidental
 * collisions. This is a TIGHTER scrub for short secrets, not looser:
 * we still scrub the raw secret value itself.
 */
const MIN_SCRUB_BASE64_LENGTH = 8

/**
 * Compute every form the secret could appear in across response body /
 * headers / error message.
 *
 * L7 fix: returns `[]` (empty) when secret is shorter than MIN_SCRUB_LENGTH
 * — scrubbing a too-short pattern is worse than not scrubbing. Caller
 * should guard `if (secret && secret.length >= MIN_SCRUB_LENGTH)` before
 * trusting the result is non-empty. The previous JSDoc claimed "always
 * non-empty" which was inaccurate.
 *
 * M3 fix (codecov-100 audit #6): for short secrets (4-7 chars) we omit
 * the bare-base64 form because its 7-8 char encoding is short enough to
 * collide with unrelated tokens in the response body and produce
 * spurious [REDACTED] markers. We still emit raw + Bearer + Basic-base64
 * because those have a longer/more-specific match shape.
 *
 * Returned forms are sorted longest-first so callers don't need to re-sort.
 */
export function buildDerivedSecretForms(secret: string): readonly string[] {
  if (!secret || secret.length < MIN_SCRUB_LENGTH) return []
  const base64 = Buffer.from(secret, 'utf8').toString('base64')
  // Pre-sorted longest-first (Basic > Bearer > base64 > raw, generally)
  // so callers don't pay the sort cost on every scrub call.
  if (secret.length < MIN_SCRUB_BASE64_LENGTH) {
    // M3 fix: omit the bare-base64 form for short secrets (collision risk).
    // The Basic-prefixed form keeps base64 content in the scrub list but
    // anchored on the literal "Basic " prefix so collisions with random
    // 8-char tokens in the body are vanishingly unlikely.
    return [`Basic ${base64}`, `Bearer ${secret}`, secret]
  }
  return [`Basic ${base64}`, `Bearer ${secret}`, base64, secret]
}

/**
 * Replace every occurrence of any derived secret form in `s` with [REDACTED].
 *
 * M7 fix: forms array is pre-sorted longest-first by buildDerivedSecretForms,
 * so we no longer allocate a sorted copy on every call. Also added a
 * `s.length >= form.length` fast-path before `includes()` to skip
 * impossible-match work, and the `includes()` check itself is the fast path
 * that lets us skip the split/join allocation for clean bodies.
 */
export function scrubAllSecretForms(
  s: string,
  forms: readonly string[],
): string {
  if (!s || forms.length === 0) return s
  let out = s
  for (const form of forms) {
    if (form.length > 0 && out.length >= form.length && out.includes(form)) {
      out = out.split(form).join(REDACTED)
    }
  }
  return out
}

/**
 * Sanitize response headers: redact sensitive header names entirely, and
 * scrub any remaining headers' values for secret echo.
 */
export function scrubResponseHeaders(
  headers: unknown,
  forms: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headers || typeof headers !== 'object') return out
  for (const [key, value] of Object.entries(
    headers as Record<string, unknown>,
  )) {
    const lname = key.toLowerCase()
    if (SENSITIVE_HEADER_NAMES.has(lname)) {
      out[key] = REDACTED
      continue
    }
    const sv = Array.isArray(value)
      ? value.map(v => String(v ?? '')).join(', ')
      : String(value ?? '')
    out[key] = scrubAllSecretForms(sv, forms)
  }
  return out
}

/**
 * Truncate a string to at most `maxBytes` UTF-8 bytes, returning a value that
 * is still valid UTF-8 (no half-encoded code points).
 *
 * H1 fix (codecov-100 audit): the previous code used `String#slice(0, 80)`
 * which counts UTF-16 *code units*. With multi-byte UTF-8 (CJK, emoji,
 * combining marks) an 80-char slice can balloon to 240+ bytes — violating
 * the analytics field's byte-cap contract. We walk the byte buffer and
 * back off to the start of the last complete UTF-8 code point. (We also
 * walk back any combining-mark continuation bytes that depend on a
 * just-truncated lead byte; this is handled implicitly by the
 * leading-byte check since UTF-8 continuation bytes are 0b10xxxxxx.)
 *
 * Empty / null-ish inputs return ''.
 */
export function truncateToBytes(input: string, maxBytes: number): string {
  if (!input || maxBytes <= 0) return ''
  const buf = Buffer.from(input, 'utf8')
  if (buf.length <= maxBytes) return input
  // Walk back from maxBytes until we land on a code-point boundary.
  // UTF-8 continuation bytes match 10xxxxxx (0x80–0xBF). A code-point
  // boundary is any byte that does NOT match that mask.
  let end = maxBytes
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) {
    end--
  }
  return buf.subarray(0, end).toString('utf8')
}

/**
 * Convert an axios / fetch error into a safe summary string. NEVER stringify
 * the raw error: axios.AxiosError carries .config.headers which contains the
 * Authorization we just sent. Build a synthetic message and scrub it.
 */
export function scrubAxiosError(e: unknown, forms: readonly string[]): string {
  if (e instanceof Error) {
    const msg = scrubAllSecretForms(e.message, forms)
    return `Request failed: ${msg}`
  }
  return 'Request failed (unknown error)'
}
