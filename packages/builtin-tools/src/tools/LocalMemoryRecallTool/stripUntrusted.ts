/**
 * Strip Unicode bidi overrides, zero-width chars, BOM, line/paragraph
 * separators, NEL, and ASCII control chars (except newline, CR, tab) from
 * user-stored memory content before placing it in tool_result.
 *
 * Memory content is data the user typed; it may contain prompt-injection
 * vectors (RTL overrides that flip apparent text, ANSI escapes, zero-width
 * characters that hide injected payloads).
 *
 * NOTE on regex construction: built via new RegExp(string) rather than
 * regex literals. Two reasons:
 *   (a) U+2028 and U+2029 are JS regex-literal terminators, so they
 *       cannot appear directly in a regex literal,
 *   (b) the escape sequences in a regex literal are TS-source-level,
 *       which can be corrupted by editor save round-trips on Windows.
 * Building from a string with explicit unicode escape sequences sidesteps
 * both problems.
 */

const STRIP_PATTERN = new RegExp(
  // Bidi overrides U+202A..U+202E and U+2066..U+2069
  '[\u202A-\u202E\u2066-\u2069]|' +
    // Zero-width U+200B..U+200F and BOM U+FEFF
    '[\u200B-\u200F\uFEFF]|' +
    // ASCII control chars except newline/CR/tab; DEL included
    '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]',
  'g',
)

const LINE_SEP_PATTERN = /[\u2028\u2029\u0085]/g

export function stripUntrustedControl(s: string): string {
  return s.replace(STRIP_PATTERN, '').replace(LINE_SEP_PATTERN, ' ')
}
