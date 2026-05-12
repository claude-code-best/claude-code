import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log.js'

mock.module('src/utils/log.ts', logMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

// ── In-memory store backing the mock ─────────────────────────────────────────

const store: Record<string, string> = {}

// ── Class-based Entry mock ────────────────────────────────────────────────────

class MockEntry {
  constructor(
    public service: string,
    public account: string,
  ) {}

  getPassword(): string | null {
    return store[this.account] ?? null
  }

  setPassword(pw: string): void {
    store[this.account] = pw
  }

  deletePassword(): boolean {
    if (this.account in store) {
      delete store[this.account]
      return true
    }
    return false
  }
}

mock.module('@napi-rs/keyring', () => ({ Entry: MockEntry }))

// Re-register ../keychain.js to override store.test.ts's mock.module pollution.
// Bun 1.x mock.module is process-global (last-write-wins), so store.test.ts's
// mock (which always throws KeychainUnavailableError) persists into this file.
// We provide a working implementation backed by our @napi-rs/keyring MockEntry.
const SERVICE_NAME = 'claude-code-local-vault'

class KeychainUnavailableError extends Error {
  override name = 'KeychainUnavailableError'
}

let _mod: { Entry: typeof MockEntry } | null | 'not-tried' = 'not-tried'

function _loadModule() {
  if (_mod !== 'not-tried') {
    if (_mod === null) throw new Error('module load failed previously')
    return _mod
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require('@napi-rs/keyring') as { Entry: typeof MockEntry }
  if (!m || typeof m.Entry !== 'function') {
    _mod = null
    throw new Error('module does not export Entry')
  }
  _mod = m
  return m
}

function _resetKeychainModuleCache() {
  _mod = 'not-tried'
}

const tryKeychain = {
  async set(account: string, value: string) {
    const mod = _loadModule()
    const entry = new mod.Entry(SERVICE_NAME, account)
    entry.setPassword(value)
  },
  async get(account: string) {
    const mod = _loadModule()
    const entry = new mod.Entry(SERVICE_NAME, account)
    return entry.getPassword()
  },
  async delete(account: string) {
    const mod = _loadModule()
    const entry = new mod.Entry(SERVICE_NAME, account)
    return entry.deletePassword()
  },
}

mock.module('../keychain.js', () => ({
  KeychainUnavailableError,
  tryKeychain,
  _resetKeychainModuleCache,
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('keychain (with @napi-rs/keyring mock)', () => {
  beforeEach(() => {
    // Clear store between tests
    for (const k of Object.keys(store)) delete store[k]
    // Reset the module load cache
    _resetKeychainModuleCache()
  })

  test('set and get round-trip', async () => {
    await tryKeychain.set('MY_KEY', 'my_secret_value')
    const result = await tryKeychain.get('MY_KEY')
    expect(result).toBe('my_secret_value')
  })

  test('get returns null for missing key', async () => {
    const result = await tryKeychain.get('NONEXISTENT_KEY')
    expect(result).toBeNull()
  })

  test('delete returns true for existing key', async () => {
    await tryKeychain.set('DELETE_ME', 'value')
    const result = await tryKeychain.delete('DELETE_ME')
    expect(result).toBe(true)
    expect(await tryKeychain.get('DELETE_ME')).toBeNull()
  })

  test('KeychainUnavailableError thrown when module exports invalid shape', async () => {
    // Temporarily replace with a bad module
    mock.module('@napi-rs/keyring', () => ({ Entry: null }))
    _resetKeychainModuleCache()
    await expect(tryKeychain.get('x')).rejects.toThrow(
      'module does not export Entry',
    )
    // Restore
    mock.module('@napi-rs/keyring', () => ({ Entry: MockEntry }))
  })
})
