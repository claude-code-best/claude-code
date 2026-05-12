/**
 * Thin wrapper around @napi-rs/keyring OS keychain.
 * If the native module is unavailable (platform not supported, module missing),
 * throws KeychainUnavailableError so that store.ts can fall back to encrypted
 * file storage.
 */

export class KeychainUnavailableError extends Error {
  constructor(reason: string) {
    super(`OS keychain not available: ${reason}`)
    this.name = 'KeychainUnavailableError'
  }
}

const SERVICE_NAME = 'claude-code-local-vault'

type KeyringEntry = {
  getPassword: () => string | null
  setPassword: (password: string) => void
  deletePassword: () => boolean
}

type KeyringModule = {
  Entry: new (service: string, account: string) => KeyringEntry
}

let _mod: KeyringModule | null | 'not-tried' = 'not-tried'

async function loadModule(): Promise<KeyringModule> {
  if (_mod !== 'not-tried') {
    if (_mod === null)
      throw new KeychainUnavailableError('module load failed previously')
    return _mod
  }
  try {
    // Dynamic import so the rest of the codebase compiles even without the module.
    const m = (await import('@napi-rs/keyring')) as unknown as KeyringModule
    if (!m || typeof m.Entry !== 'function') {
      _mod = null
      throw new KeychainUnavailableError('module does not export Entry')
    }
    _mod = m
    return m
  } catch (err: unknown) {
    if (err instanceof KeychainUnavailableError) throw err
    _mod = null
    throw new KeychainUnavailableError(
      err instanceof Error ? err.message : String(err),
    )
  }
}

/**
 * Reset module cache — for testing only.
 * B2: intentionally not exported from the package's public API.
 * Only imported via the tests' mock.module() boundary.
 * @internal
 */
export function _resetKeychainModuleCache(): void {
  _mod = 'not-tried'
}

export const tryKeychain = {
  async set(account: string, value: string): Promise<void> {
    const mod = await loadModule()
    const entry = new mod.Entry(SERVICE_NAME, account)
    entry.setPassword(value)
  },

  async get(account: string): Promise<string | null> {
    const mod = await loadModule()
    const entry = new mod.Entry(SERVICE_NAME, account)
    return entry.getPassword()
  },

  async delete(account: string): Promise<boolean> {
    const mod = await loadModule()
    const entry = new mod.Entry(SERVICE_NAME, account)
    return entry.deletePassword()
  },

  /**
   * Keyring has no native "list all" — we maintain our own index in a
   * dedicated account named __index__.
   *
   * A3 fix: a corrupt index throws KeychainUnavailableError so the caller
   * can fall back to the file vault rather than silently returning [] and
   * stranding existing keys (they become undeletable via delete()).
   *
   * C4 note: index read-modify-write is not atomic across processes. In
   * practice /local-vault set is user-interactive (not concurrently scripted),
   * so the advisory risk is acceptable. A future version can use Bun.lock or
   * an exclusive file lock for cross-process safety.
   */
  async list(): Promise<string[]> {
    const mod = await loadModule()
    const indexEntry = new mod.Entry(SERVICE_NAME, '__index__')
    const raw = indexEntry.getPassword()
    if (!raw) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // A3: corrupt index — throw so caller can fall back, not silently lose key references
      throw new KeychainUnavailableError(
        'keychain index is corrupt (invalid JSON). Reset via: /local-vault list (will regenerate index on next set).',
      )
    }
    if (Array.isArray(parsed)) {
      return (parsed as unknown[]).filter(
        (x): x is string => typeof x === 'string',
      )
    }
    return []
  },

  async _addToIndex(account: string): Promise<void> {
    const mod = await loadModule()
    const indexEntry = new mod.Entry(SERVICE_NAME, '__index__')
    const existing = await this.list()
    if (!existing.includes(account)) {
      indexEntry.setPassword(JSON.stringify([...existing, account]))
    }
  },

  async _removeFromIndex(account: string): Promise<void> {
    const mod = await loadModule()
    const indexEntry = new mod.Entry(SERVICE_NAME, '__index__')
    const existing = await this.list()
    const updated = existing.filter(k => k !== account)
    indexEntry.setPassword(JSON.stringify(updated))
  },
}
