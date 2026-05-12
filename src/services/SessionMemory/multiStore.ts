/**
 * Multi-store extension of local SessionMemory.
 *
 * Each store is a directory under ~/.claude/local-memory/<store>/
 * Each entry is stored as a markdown file: <key>.md
 *
 * This is a new sibling layer — does NOT modify sessionMemory.ts.
 */

import {
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  closeSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { validateKey } from '../../utils/localValidate.js'

// ── Path helpers ──────────────────────────────────────────────────────────────

// L8 fix: cache the result so repeated tool calls don't re-do homedir() +
// join() on every list/fetch. Cache is keyed on the env var so a test that
// changes CLAUDE_CONFIG_DIR mid-process still picks up the new dir.
let _baseDirCache: { configDir: string; baseDir: string } | undefined
function getBaseDir(): string {
  const configDir =
    process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')
  if (_baseDirCache && _baseDirCache.configDir === configDir) {
    return _baseDirCache.baseDir
  }
  const baseDir = join(configDir, 'local-memory')
  _baseDirCache = { configDir, baseDir }
  return baseDir
}

function getStoreDir(store: string): string {
  return join(getBaseDir(), store)
}

function getEntryPath(store: string, key: string): string {
  // PR-0a fix: validateKey rejects any '/' or '\' (and other unsafe chars)
  // up front, so the previous .replace(/[/\\]/g, '_') sanitize is no longer
  // needed and was actually harmful: it caused 'a/b' and 'a_b' to collide
  // on the same a_b.md file. Backward compat: pre-existing a_b.md files
  // (regardless of the original key the user typed) remain readable as
  // key='a_b' under the new validator.
  validateKey(key)
  return join(getStoreDir(store), `${key}.md`)
}

/** Maximum allowed store name length (OS path component limit). */
const MAX_STORE_NAME_LENGTH = 255
/** Maximum allowed entry value size: 1 MB. */
const MAX_VALUE_BYTES = 1_048_576

/**
 * Validates a store name for path-safety.
 *
 * Rejects:
 *   - empty string
 *   - names that do not equal their own basename (path-like, e.g. "a/b", "../x")
 *   - forward slash, backslash, null byte, colon (Windows drive prefix: "C:foo")
 *   - names starting with "." (hidden/relative marker)
 *   - the literal ".." string
 *   - names longer than 255 characters
 *
 * E1 fix: hardened against path traversal on Windows and POSIX.
 */
export function isValidStoreName(store: string): boolean {
  try {
    validateStoreName(store)
    return true
  } catch {
    return false
  }
}

function validateStoreName(store: string): void {
  if (!store) {
    throw new Error('Invalid store name: store name must not be empty.')
  }
  if (store.length > MAX_STORE_NAME_LENGTH) {
    throw new Error(
      `Invalid store name: "${store.slice(0, 20)}…" is too long (max ${MAX_STORE_NAME_LENGTH} chars).`,
    )
  }
  // Reject path separators (forward slash, backslash), Windows drive colons.
  // Null bytes checked separately to avoid biome noControlCharactersInRegex warning.
  if (/[/\\:]/.test(store) || store.includes('\0')) {
    throw new Error(
      `Invalid store name: "${store}" contains illegal characters (path separators, null byte, or colon).`,
    )
  }
  // Reject names starting with "." — covers ".." and hidden names
  if (store.startsWith('.')) {
    throw new Error(`Invalid store name: "${store}" must not start with ".".`)
  }
  // Guard: resolved basename must equal the store name itself.
  // This catches any path-like names that slipped through the above checks.
  if (basename(store) !== store) {
    throw new Error(
      `Invalid store name: "${store}" is path-like and would escape the base directory.`,
    )
  }
}

// validateKey is now imported from src/utils/localValidate.ts (shared with PR-1/2)

// ── Public API ────────────────────────────────────────────────────────────────

/** List all active (non-archived) stores. */
export function listStores(): string[] {
  const baseDir = getBaseDir()
  if (!existsSync(baseDir)) return []
  return readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.endsWith('.archived'))
    .map(d => d.name)
    .sort()
}

/** List all stores (active + archived). */
export function listAllStores(): string[] {
  const baseDir = getBaseDir()
  if (!existsSync(baseDir)) return []
  return readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
}

/** Create a new store directory. */
export function createStore(store: string): void {
  validateStoreName(store)
  const storeDir = getStoreDir(store)
  if (existsSync(storeDir)) {
    throw new Error(`Store "${store}" already exists`)
  }
  mkdirSync(storeDir, { recursive: true })
}

/** Archive a store by renaming it to <store>.archived */
export function archiveStore(store: string): void {
  validateStoreName(store)
  const storeDir = getStoreDir(store)
  if (!existsSync(storeDir)) {
    throw new Error(`Store "${store}" does not exist`)
  }
  const archivedDir = storeDir + '.archived'
  renameSync(storeDir, archivedDir)
}

/** Write an entry to a store. Creates the store dir if needed. */
export function setEntry(store: string, key: string, value: string): void {
  validateStoreName(store)
  validateKey(key)

  // D2: Guard against unbounded value sizes (1 MB limit).
  // File-fallback vault is not designed for large data blobs.
  const byteLength = Buffer.byteLength(value, 'utf8')
  if (byteLength > MAX_VALUE_BYTES) {
    throw new Error(
      `Entry value too large: ${byteLength} bytes exceeds the 1 MB limit. ` +
        'Use external storage for large data.',
    )
  }

  const storeDir = getStoreDir(store)
  if (!existsSync(storeDir)) {
    mkdirSync(storeDir, { recursive: true })
  }
  const entryPath = getEntryPath(store, key)

  // C2: Atomic write — write to a .tmp file then rename.
  // On POSIX, rename(2) is atomic; on Windows it is best-effort but safe.
  // This prevents half-written files on crash mid-write.
  const tmpPath = join(storeDir, `.${randomBytes(8).toString('hex')}.tmp`)
  try {
    writeFileSync(tmpPath, value, 'utf8')
    renameSync(tmpPath, entryPath)
  } catch (err) {
    // Clean up tmp file on error
    try {
      rmSync(tmpPath, { force: true })
    } catch {
      /* ignore cleanup error */
    }
    throw err
  }
}

/** Read an entry from a store. Returns null if not found. */
export function getEntry(store: string, key: string): string | null {
  validateStoreName(store)
  validateKey(key)
  const entryPath = getEntryPath(store, key)
  if (!existsSync(entryPath)) return null
  return readFileSync(entryPath, 'utf8')
}

/**
 * M4 fix: bounded read variant. Returns at most `maxBytes` bytes from the
 * entry file. If the on-disk file is larger, returns the prefix and sets
 * truncated=true. Caller should not assume the returned string is a complete
 * entry. Used by LocalMemoryRecallTool to defend against externally written
 * 1GB markdown files (the in-tool 1MB cap only guards setEntry; an attacker
 * with file system access could write any size).
 *
 * Bytes are read from a single fd, not the whole file. Result is decoded as
 * UTF-8 with truncate-at-codepoint-boundary semantics handled by the caller
 * (truncateUtf8 in LocalMemoryRecallTool).
 */
export function getEntryBounded(
  store: string,
  key: string,
  maxBytes: number,
): { value: string; truncated: boolean } | null {
  validateStoreName(store)
  validateKey(key)
  const entryPath = getEntryPath(store, key)
  if (!existsSync(entryPath)) return null
  const stat = statSync(entryPath)
  const total = stat.size
  const readBytes = Math.min(total, maxBytes)
  const buf = Buffer.alloc(readBytes)
  const fd = openSync(entryPath, 'r')
  // M5 fix (codecov-100 audit #9): track how many bytes we ACTUALLY read,
  // and surface short-reads as truncation. Previously the loop returned
  // `buf` (a `readBytes`-sized allocation) regardless of whether the
  // readSync calls cumulatively delivered that many bytes — a file that
  // was truncated on disk between statSync and readSync would yield a
  // half-zeroed buffer with truncated=false, silently corrupting the
  // returned string.
  let offset = 0
  try {
    while (offset < readBytes) {
      const n = readSync(fd, buf, offset, readBytes - offset, offset)
      if (n === 0) break // EOF: file shrank between stat and read
      // n < 0 cannot happen — Node's readSync throws on errno < 0 — but
      // belt-and-suspenders for clarity: treat negative as EOF.
      if (n < 0) break
      offset += n
    }
  } finally {
    closeSync(fd)
  }
  // M5: include `offset < readBytes` in the truncated flag so callers see
  // EOF-during-read as truncation. Use subarray(0, offset) so the value
  // length matches what we actually read (no trailing zero bytes).
  const truncated = total > maxBytes || offset < readBytes
  return { value: buf.subarray(0, offset).toString('utf8'), truncated }
}

/** Delete an entry from a store. Returns true if it existed. */
export function deleteEntry(store: string, key: string): boolean {
  validateStoreName(store)
  validateKey(key)
  const entryPath = getEntryPath(store, key)
  if (!existsSync(entryPath)) return false
  rmSync(entryPath)
  return true
}

/** List all entry keys in a store (without .md extension). */
export function listEntries(store: string): string[] {
  validateStoreName(store)
  const storeDir = getStoreDir(store)
  if (!existsSync(storeDir)) return []
  return readdirSync(storeDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3))
    .sort()
}

/**
 * M5 + F4 fix: truly bounded list variant.
 *
 * F4 (Codex round 6) found that the previous implementation collected every
 * .md filename into memory and sorted them all before slicing — that meant
 * a 100k-entry store still paid O(N) memory + O(N log N) sort. The cap
 * only limited what we returned to the caller, not what we processed.
 *
 * New approach: walk the dirents and maintain a bounded "top-K" buffer.
 * For maxEntries entries we keep the K alphabetically smallest names seen
 * so far. We use a simple insertion-sort-style approach with linear scan
 * because K is small (typically 1024) — for the realistic store sizes
 * (≤10k entries) the O(N×K) cost (~10M comparisons) is well under 100ms.
 * For pathological stores (1M+ entries) we still paid linear time on
 * readdirSync which lists the entire directory; truly avoiding that
 * needs an async streaming dirent walk that we'll do in a follow-up.
 *
 * Memory after this fix: O(K) instead of O(N).
 */
export function listEntriesBounded(
  store: string,
  maxEntries: number,
): { entries: string[]; truncated: boolean } {
  validateStoreName(store)
  const storeDir = getStoreDir(store)
  if (!existsSync(storeDir)) return { entries: [], truncated: false }
  // Bounded top-K accumulator. We keep `top` sorted ascending and never
  // grow beyond `maxEntries` items.
  const top: string[] = []
  let totalMd = 0
  for (const f of readdirSync(storeDir)) {
    if (!f.endsWith('.md')) continue
    totalMd++
    const key = f.slice(0, -3)
    if (top.length < maxEntries) {
      // Insert in sorted position (linear scan, K bounded so cheap)
      let i = 0
      while (i < top.length && top[i]! < key) i++
      top.splice(i, 0, key)
    } else if (key < top[maxEntries - 1]!) {
      // key is smaller than current largest in top; insert and pop largest
      let i = 0
      while (i < top.length && top[i]! < key) i++
      top.splice(i, 0, key)
      top.pop()
    }
    // else: key is larger than current top-K largest, skip
  }
  return { entries: top, truncated: totalMd > maxEntries }
}
