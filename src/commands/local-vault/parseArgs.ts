/**
 * Parse the args string for the /local-vault command.
 *
 * Supported sub-commands:
 *   list                         → { action: 'list' }
 *   set <key> <value>            → { action: 'set', key, value }
 *   get <key>                    → { action: 'get', key, reveal: false }
 *   get <key> --reveal           → { action: 'get', key, reveal: true }
 *   delete <key>                 → { action: 'delete', key }
 *   (empty)                      → { action: 'list' }
 *   anything else                → { action: 'invalid', reason }
 */

export type LocalVaultArgs =
  | { action: 'list' }
  | { action: 'set'; key: string; value: string }
  | { action: 'get'; key: string; reveal: boolean }
  | { action: 'delete'; key: string }
  | { action: 'invalid'; reason: string }

// Markdown renderer in REPL output treats `<key>` / `<value>` as HTML tags
// and strips them. Use uppercase placeholder names without angle brackets
// so the full usage line is visible to users.
const USAGE =
  'Usage: /local-vault list | set KEY VALUE | get KEY [--reveal] | delete KEY'

// M1 fix (codecov-100 audit #4): defensively reject hyphen-like Unicode
// prefixes on key names. ASCII '-' is the obvious flag prefix, but a key
// stored as e.g. '−mykey' (U+2212 MINUS SIGN) would round-trip through
// /local-vault set and then be unretrievable via the CLI because the
// shell-style tokenizer here is consistent. Reject any key whose first
// character is in the Unicode hyphen / dash family. List drawn from
// Unicode general category Pd (Dash_Punctuation) plus the math minus.
//   U+002D HYPHEN-MINUS                    -
//   U+2010 HYPHEN                          ‐
//   U+2011 NON-BREAKING HYPHEN             ‑
//   U+2012 FIGURE DASH                     ‒
//   U+2013 EN DASH                         –
//   U+2014 EM DASH                         —
//   U+2015 HORIZONTAL BAR                  ―
//   U+2212 MINUS SIGN                      −
//   U+FE58 SMALL EM DASH                   ﹘
//   U+FE63 SMALL HYPHEN-MINUS              ﹣
//   U+FF0D FULLWIDTH HYPHEN-MINUS          －
const HYPHEN_LIKE_PREFIX_REGEX = /^[-‐-―−﹘﹣－]/

export function parseLocalVaultArgs(args: string): LocalVaultArgs {
  const trimmed = args.trim()

  if (trimmed === '' || trimmed === 'list') {
    return { action: 'list' }
  }

  const tokens = trimmed.split(/\s+/)
  const subCmd = tokens[0]

  // ── list ──────────────────────────────────────────────────────────────────
  if (subCmd === 'list') {
    return { action: 'list' }
  }

  // ── set ───────────────────────────────────────────────────────────────────
  if (subCmd === 'set') {
    const key = tokens[1]
    if (!key) {
      return { action: 'invalid', reason: `set requires a key name. ${USAGE}` }
    }
    // D3 + M1: reject keys that start with '-' or any hyphen-like Unicode
    // character. ASCII '-' would be mistaken for a flag; non-ASCII hyphen
    // lookalikes (e.g. U+2212 MINUS SIGN) would silently store but then be
    // unretrievable because the user typically can't reproduce the exact
    // codepoint at the shell.
    if (HYPHEN_LIKE_PREFIX_REGEX.test(key)) {
      return {
        action: 'invalid',
        reason: `Key name must not start with "-" or a hyphen-like character (reserved for flags). ${USAGE}`,
      }
    }
    // D4: value is tokens[2..] joined, not substring math (handles keys with repeated substrings)
    const rest = tokens.slice(2).join(' ')
    if (!rest) {
      return {
        action: 'invalid',
        reason: `set requires a value. ${USAGE}`,
      }
    }
    return { action: 'set', key, value: rest }
  }

  // ── get ───────────────────────────────────────────────────────────────────
  if (subCmd === 'get') {
    // Strip flags before extracting the key so that `get --reveal MY_KEY`
    // correctly resolves MY_KEY as the key rather than --reveal.
    const flags = ['--reveal']
    const argsWithoutFlags = tokens.filter(t => !flags.includes(t))
    const key = argsWithoutFlags[1] // argsWithoutFlags[0] is 'get'
    if (!key) {
      return { action: 'invalid', reason: `get requires a key name. ${USAGE}` }
    }
    const reveal = tokens.includes('--reveal')
    return { action: 'get', key, reveal }
  }

  // ── delete ────────────────────────────────────────────────────────────────
  if (subCmd === 'delete') {
    const key = tokens[1]
    if (!key) {
      return {
        action: 'invalid',
        reason: `delete requires a key name. ${USAGE}`,
      }
    }
    return { action: 'delete', key }
  }

  return {
    action: 'invalid',
    reason: `Unknown sub-command "${subCmd}". ${USAGE}`,
  }
}
