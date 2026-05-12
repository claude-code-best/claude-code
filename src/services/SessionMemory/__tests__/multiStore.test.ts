import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// No mocks needed — multiStore.ts is pure fs, no log/debug/bun:bundle side effects.

describe('multiStore', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'multi-store-test-'))
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
  })

  test('listStores returns empty when no stores exist', async () => {
    const { listStores } = await import('../multiStore.js')
    expect(listStores()).toEqual([])
  })

  test('createStore creates a store directory', async () => {
    const { createStore, listStores } = await import('../multiStore.js')
    createStore('my-store')
    expect(listStores()).toContain('my-store')
  })

  test('createStore throws if store already exists', async () => {
    const { createStore } = await import('../multiStore.js')
    createStore('duplicate')
    expect(() => createStore('duplicate')).toThrow('already exists')
  })

  test('setEntry and getEntry round-trip', async () => {
    const { createStore, setEntry, getEntry } = await import('../multiStore.js')
    createStore('notes')
    setEntry('notes', 'hello', '# Hello\nThis is a note.')
    expect(getEntry('notes', 'hello')).toBe('# Hello\nThis is a note.')
  })

  test('getEntry returns null for missing key', async () => {
    const { createStore, getEntry } = await import('../multiStore.js')
    createStore('empty-store')
    expect(getEntry('empty-store', 'nonexistent')).toBeNull()
  })

  test('cross-store isolation: entries in different stores do not bleed', async () => {
    const { createStore, setEntry, getEntry } = await import('../multiStore.js')
    createStore('store-a')
    createStore('store-b')
    setEntry('store-a', 'shared-key', 'value-from-a')
    setEntry('store-b', 'shared-key', 'value-from-b')
    expect(getEntry('store-a', 'shared-key')).toBe('value-from-a')
    expect(getEntry('store-b', 'shared-key')).toBe('value-from-b')
  })

  test('listEntries returns keys in a store', async () => {
    const { createStore, setEntry, listEntries } = await import(
      '../multiStore.js'
    )
    createStore('listing')
    setEntry('listing', 'alpha', 'a')
    setEntry('listing', 'beta', 'b')
    const entries = listEntries('listing')
    expect(entries).toContain('alpha')
    expect(entries).toContain('beta')
  })

  test('deleteEntry removes entry and returns true', async () => {
    const { createStore, setEntry, deleteEntry, getEntry } = await import(
      '../multiStore.js'
    )
    createStore('del-store')
    setEntry('del-store', 'to-remove', 'temp')
    expect(deleteEntry('del-store', 'to-remove')).toBe(true)
    expect(getEntry('del-store', 'to-remove')).toBeNull()
  })

  test('deleteEntry returns false for missing entry', async () => {
    const { createStore, deleteEntry } = await import('../multiStore.js')
    createStore('del-store-2')
    expect(deleteEntry('del-store-2', 'ghost')).toBe(false)
  })

  test('archiveStore renames directory with .archived suffix', async () => {
    const { createStore, archiveStore, listStores, listAllStores } =
      await import('../multiStore.js')
    createStore('to-archive')
    archiveStore('to-archive')
    expect(listStores()).not.toContain('to-archive')
    expect(listAllStores()).toContain('to-archive.archived')
  })

  test('large entry round-trip (>500KB)', async () => {
    const { createStore, setEntry, getEntry } = await import('../multiStore.js')
    createStore('large')
    const largeValue = 'A'.repeat(512 * 1024)
    setEntry('large', 'big-entry', largeValue)
    expect(getEntry('large', 'big-entry')).toBe(largeValue)
  })

  test('Unicode key is rejected (path-safety policy from PR-0a)', async () => {
    const { createStore, setEntry } = await import('../multiStore.js')
    createStore('unicode-store')
    // Unicode keys are now rejected by validateKey to keep path-safety
    // semantics OS-portable and to enable safe permission rule contents.
    // Value can still contain unicode — only the key is constrained.
    expect(() =>
      setEntry('unicode-store', '日本語キー', 'value with 日本語'),
    ).toThrow(/invalid key chars/i)
  })

  test('value with unicode is still stored fine (only key is constrained)', async () => {
    const { createStore, setEntry, getEntry } = await import('../multiStore.js')
    createStore('unicode-value-store')
    setEntry('unicode-value-store', 'ascii_key', 'value with 日本語 ✓')
    expect(getEntry('unicode-value-store', 'ascii_key')).toBe(
      'value with 日本語 ✓',
    )
  })

  test('backward compat: pre-existing a_b.md file remains readable as a_b key', async () => {
    // Simulates the pre-PR-0a state where a user wrote setEntry('s', 'a_b', X)
    // OR setEntry('s', 'a/b', X) — both produced a_b.md on disk. After PR-0a,
    // the new validateKey rejects 'a/b' but accepts 'a_b'. Existing a_b.md
    // files must still load via getEntry('s', 'a_b').
    const { createStore, getEntry } = await import('../multiStore.js')
    createStore('compat-store')
    const storeDir = join(tmpDir, 'local-memory', 'compat-store')
    writeFileSync(join(storeDir, 'a_b.md'), 'legacy content')
    expect(getEntry('compat-store', 'a_b')).toBe('legacy content')
  })

  test('key collision regression: a/b is rejected, no longer collides with a_b', async () => {
    const { createStore, setEntry, getEntry } = await import('../multiStore.js')
    createStore('regression-store')
    // a_b is valid and stored
    setEntry('regression-store', 'a_b', 'value-from-underscore')
    // a/b is now rejected (would have collided pre-PR-0a)
    expect(() =>
      setEntry('regression-store', 'a/b', 'value-from-slash'),
    ).toThrow(/invalid key chars/i)
    // a_b still has the correct value (no overwrite happened)
    expect(getEntry('regression-store', 'a_b')).toBe('value-from-underscore')
  })

  test('Windows reserved name NUL is rejected (would silently lose data on Windows)', async () => {
    const { createStore, setEntry } = await import('../multiStore.js')
    createStore('win-reserved')
    expect(() => setEntry('win-reserved', 'NUL', 'lost')).toThrow(
      /windows reserved/i,
    )
  })

  test('leading dot key is rejected (.gitconfig)', async () => {
    const { createStore, setEntry } = await import('../multiStore.js')
    createStore('hidden-keys')
    expect(() => setEntry('hidden-keys', '.gitconfig', 'x')).toThrow(
      /leading dot/i,
    )
  })
})

// ── I3 / E1: Path traversal regression tests ─────────────────────────────────
// All these MUST throw BEFORE the fix lands (they test the invariant that
// invalid store names are rejected before any file I/O occurs).

describe('multiStore: path traversal rejection (E1 regression)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'multi-store-sec-'))
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
  })

  test('store name ".." is rejected', async () => {
    const { setEntry } = await import('../multiStore.js')
    expect(() => setEntry('..', 'key', 'value')).toThrow()
  })

  test('store name "a/b" is rejected', async () => {
    const { setEntry } = await import('../multiStore.js')
    expect(() => setEntry('a/b', 'key', 'value')).toThrow()
  })

  test('store name "a\\\\b" is rejected', async () => {
    const { setEntry } = await import('../multiStore.js')
    expect(() => setEntry('a\\b', 'key', 'value')).toThrow()
  })

  test('store name with null byte is rejected', async () => {
    const { setEntry } = await import('../multiStore.js')
    expect(() => setEntry('foo\x00bar', 'key', 'value')).toThrow()
  })

  test('store name "C:hack" (Windows drive prefix) is rejected', async () => {
    const { setEntry } = await import('../multiStore.js')
    expect(() => setEntry('C:hack', 'key', 'value')).toThrow()
  })

  test('store name that resolves outside base dir is rejected', async () => {
    const { setEntry } = await import('../multiStore.js')
    // An encoded-style path that could escape
    expect(() => setEntry('../escape', 'key', 'value')).toThrow()
  })

  test('store name too long (>255 chars) is rejected', async () => {
    const { setEntry } = await import('../multiStore.js')
    const longName = 'a'.repeat(256)
    expect(() => setEntry(longName, 'key', 'value')).toThrow()
  })

  test('validateStoreName: accepted store name passes', async () => {
    const { createStore } = await import('../multiStore.js')
    // Should NOT throw
    expect(() => createStore('valid-store-name')).not.toThrow()
  })

  test('D2: value >1MB is rejected', async () => {
    const { createStore, setEntry } = await import('../multiStore.js')
    createStore('size-test')
    const bigValue = 'X'.repeat(1_048_577) // 1MB + 1 byte
    expect(() => setEntry('size-test', 'big', bigValue)).toThrow()
  })
})

// ── M5 (codecov-100 audit #9): getEntryBounded short-read handling ──────────
// The audit flagged that the old loop returned a `readBytes`-sized buffer
// even if readSync delivered fewer bytes (e.g. file truncated mid-read),
// with `truncated=false`. Test pins the new behavior: short reads surface
// as `truncated=true`, and the returned value's length matches what was
// actually read (no trailing zero bytes).

describe('multiStore: getEntryBounded short-read handling (M5 audit #9)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'multi-store-bounded-'))
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
  })

  test('getEntryBounded: full read with file <= maxBytes returns truncated=false', async () => {
    const { createStore, setEntry, getEntryBounded } = await import(
      '../multiStore.js'
    )
    createStore('bounded')
    setEntry('bounded', 'small', 'hello')
    const result = getEntryBounded('bounded', 'small', 1024)
    expect(result).not.toBeNull()
    expect(result!.value).toBe('hello')
    expect(result!.truncated).toBe(false)
  })

  test('getEntryBounded: file larger than maxBytes returns truncated=true and prefix only', async () => {
    const { createStore, setEntry, getEntryBounded } = await import(
      '../multiStore.js'
    )
    createStore('bounded')
    setEntry('bounded', 'big', 'X'.repeat(2048))
    const result = getEntryBounded('bounded', 'big', 100)
    expect(result).not.toBeNull()
    expect(result!.value.length).toBe(100)
    expect(result!.value).toBe('X'.repeat(100))
    expect(result!.truncated).toBe(true)
  })

  test('getEntryBounded: returned value has no trailing zero bytes (audit #9 regression)', async () => {
    // The old code returned `buf.toString('utf8')` directly — if readSync
    // delivered fewer bytes than the buffer was allocated for (statSync
    // saw 100 bytes but only 50 were readable by readSync), the returned
    // string would have 50 trailing NUL bytes ( ) silently. The new
    // code uses subarray(0, offset) so the returned string length matches
    // exactly what was read.
    const { createStore, setEntry, getEntryBounded } = await import(
      '../multiStore.js'
    )
    createStore('bounded')
    setEntry('bounded', 'exact', 'a'.repeat(50))
    const result = getEntryBounded('bounded', 'exact', 100)
    expect(result).not.toBeNull()
    // 50-byte file, read with cap of 100 → readBytes=50, buf is 50 bytes,
    // value is exactly 50 bytes with no trailing NULs.
    expect(result!.value.length).toBe(50)
    expect(result!.value).toBe('a'.repeat(50))
    expect(result!.value).not.toContain(' ')
    expect(result!.truncated).toBe(false)
  })

  test('getEntryBounded: returns null for missing entry', async () => {
    const { createStore, getEntryBounded } = await import('../multiStore.js')
    createStore('bounded')
    expect(getEntryBounded('bounded', 'missing', 1024)).toBeNull()
  })
})
