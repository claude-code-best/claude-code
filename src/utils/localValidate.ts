/**
 * Shared validation utilities for /local-memory and /local-vault input names.
 *
 * Both LocalMemoryRecallTool (PR-1) and VaultHttpFetchTool (PR-2) need a
 * consistent, path-safe, OS-portable key naming scheme. multiStore.ts also
 * uses validateKey for entry keys after PR-0a key-collision fix.
 *
 * Allowed: letters, digits, dot, underscore, hyphen.
 * Length 1..128.
 * Rejected:
 *   - empty / too long
 *   - any character outside [A-Za-z0-9._-]
 *   - leading dot (hidden file pattern, e.g. ".gitconfig")
 *   - Windows reserved device names (NUL, CON, COM1, etc.) — would silently
 *     write to a device on Windows and lose data
 */

const KEY_REGEX = /^[A-Za-z0-9._-]+$/
// Windows treats device names as reserved REGARDLESS of extension —
// `NUL.txt`, `CON.foo`, `COM1.bak` all alias to the device. So we must
// match the basename component (everything before the first dot) against
// the reserved set, not just the entire key.
const WINDOWS_RESERVED_BASENAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
const MAX_KEY_LENGTH = 128

export function validateKey(key: string): void {
  if (!key) {
    throw new Error('Empty key')
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new Error(`Key too long (max ${MAX_KEY_LENGTH})`)
  }
  if (!KEY_REGEX.test(key)) {
    throw new Error(`Invalid key chars: ${JSON.stringify(key)}`)
  }
  if (key.startsWith('.')) {
    throw new Error('Leading dot forbidden')
  }
  // M6 fix: match the basename (pre-dot component) so e.g. NUL.txt and
  // CON.foo are also rejected. On Windows these still alias to the device
  // file regardless of extension and would silently lose data.
  const basenameComponent = key.includes('.') ? key.split('.')[0]! : key
  if (WINDOWS_RESERVED_BASENAME.test(basenameComponent)) {
    throw new Error(`Windows reserved name: ${key}`)
  }
}

/** Returns true iff key would pass validateKey (no throw). Useful for guards. */
export function isValidKey(key: string): boolean {
  try {
    validateKey(key)
    return true
  } catch {
    return false
  }
}
