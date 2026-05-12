import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from 'bun:test'
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  statSync,
  readFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logMock } from '../../../../tests/mocks/log.js'

mock.module('src/utils/log.ts', logMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

// ── Keychain mock (unavailable by default to test fallback path) ───────────────

import { KeychainUnavailableError } from '../keychain.js'

const keychainUnavailable = async (): Promise<never> => {
  throw new KeychainUnavailableError('test: keychain mocked as unavailable')
}

const keychainMock = {
  set: mock(keychainUnavailable),
  get: mock(keychainUnavailable),
  delete: mock(keychainUnavailable),
  list: mock(keychainUnavailable),
  _addToIndex: mock(keychainUnavailable),
  _removeFromIndex: mock(keychainUnavailable),
}

mock.module('../keychain.js', () => ({
  KeychainUnavailableError,
  tryKeychain: keychainMock,
  _resetKeychainModuleCache: () => {},
}))

// ── Crypto fallback tests ─────────────────────────────────────────────────────

describe('store (AES-256-GCM file fallback)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'local-vault-test-'))
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
    // Use a fixed passphrase via env to avoid file creation
    process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE'] =
      'test-passphrase-fixed-32chars-xxx'
    // Reset all keychain mocks to unavailable
    keychainMock.set.mockImplementation(keychainUnavailable)
    keychainMock.get.mockImplementation(keychainUnavailable)
    keychainMock.delete.mockImplementation(keychainUnavailable)
    keychainMock.list.mockImplementation(keychainUnavailable)
    keychainMock._addToIndex.mockImplementation(keychainUnavailable)
    keychainMock._removeFromIndex.mockImplementation(keychainUnavailable)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
    delete process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE']
  })

  test('round-trip: set then get returns same value', async () => {
    const { setSecret, getSecret } = await import('../store.js')
    await setSecret('API_KEY', 'super-secret-value-abc123')
    const result = await getSecret('API_KEY')
    expect(result).toBe('super-secret-value-abc123')
  })

  test('get returns null for missing key', async () => {
    const { getSecret } = await import('../store.js')
    const result = await getSecret('NONEXISTENT_KEY')
    expect(result).toBeNull()
  })

  test('delete removes key; subsequent get returns null', async () => {
    const { setSecret, getSecret, deleteSecret } = await import('../store.js')
    await setSecret('TO_DELETE', 'temporary-value')
    const deleted = await deleteSecret('TO_DELETE')
    expect(deleted).toBe(true)
    expect(await getSecret('TO_DELETE')).toBeNull()
  })

  test('delete returns false for nonexistent key', async () => {
    const { deleteSecret } = await import('../store.js')
    const result = await deleteSecret('GHOST_KEY')
    expect(result).toBe(false)
  })

  test('listKeys returns stored keys without values', async () => {
    const { setSecret, listKeys } = await import('../store.js')
    await setSecret('KEY_A', 'value-a')
    await setSecret('KEY_B', 'value-b')
    const keys = await listKeys()
    expect(keys).toContain('KEY_A')
    expect(keys).toContain('KEY_B')
    expect(keys.join('')).not.toContain('value-a')
    expect(keys.join('')).not.toContain('value-b')
  })

  test('wrong passphrase throws LocalVaultDecryptionError (does not leak bytes)', async () => {
    const { setSecret } = await import('../store.js')
    await setSecret('SENSITIVE', 'my-secret-12345')

    // Change passphrase to simulate wrong key
    process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE'] =
      'wrong-passphrase-different-xxxxx'
    const { getSecret, LocalVaultDecryptionError } = await import('../store.js')
    await expect(getSecret('SENSITIVE')).rejects.toBeInstanceOf(
      LocalVaultDecryptionError,
    )
    // Restore
    process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE'] =
      'test-passphrase-fixed-32chars-xxx'
  })

  test('file does not exist → getSecret returns null (not error)', async () => {
    const { getSecret } = await import('../store.js')
    const result = await getSecret('ANY_KEY')
    expect(result).toBeNull()
  })

  test('corrupted JSON vault file → getSecret throws LocalVaultDecryptionError (A2 fix)', async () => {
    writeFileSync(join(tmpDir, 'local-vault.enc.json'), 'not-valid-json')
    const { getSecret, LocalVaultDecryptionError } = await import('../store.js')
    await expect(getSecret('ANY_KEY')).rejects.toBeInstanceOf(
      LocalVaultDecryptionError,
    )
  })

  test('value at exactly 64KB round-trips successfully', async () => {
    const { setSecret, getSecret } = await import('../store.js')
    const exactValue = 'X'.repeat(64 * 1024)
    await setSecret('LARGE_KEY', exactValue)
    const result = await getSecret('LARGE_KEY')
    expect(result).toBe(exactValue)
  })

  test('value over 64KB is rejected by setSecret (D1 fix)', async () => {
    const { setSecret, LocalVaultValueTooLargeError } = await import(
      '../store.js'
    )
    const tooLarge = 'X'.repeat(64 * 1024 + 1)
    await expect(setSecret('LARGE_KEY', tooLarge)).rejects.toBeInstanceOf(
      LocalVaultValueTooLargeError,
    )
  })

  test('Unicode key round-trip', async () => {
    const { setSecret, getSecret } = await import('../store.js')
    await setSecret('KEY_🔑', 'unicode-secret-日本語')
    const result = await getSecret('KEY_🔑')
    expect(result).toBe('unicode-secret-日本語')
  })

  test('IV is unique per encryption (AES-GCM invariant)', async () => {
    // Write two entries; IVs in vault file should differ
    const { setSecret } = await import('../store.js')
    await setSecret('KEY_1', 'value-1')
    await setSecret('KEY_2', 'value-2')
    const vaultRaw = readFileSync(join(tmpDir, 'local-vault.enc.json'), 'utf8')
    const vault = JSON.parse(vaultRaw) as Record<string, unknown>
    // Only check actual encrypted records (skip metadata keys like _salt, _version)
    const records = Object.entries(vault)
      .filter(([k]) => !k.startsWith('_'))
      .map(([, v]) => (v as { iv: string }).iv)
    expect(new Set(records).size).toBe(records.length) // all IVs unique
  })

  test('passphrase file mode 600 on POSIX', async () => {
    // Remove env passphrase to force file creation
    delete process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE']
    const { setSecret } = await import('../store.js')
    await setSecret('MODE_TEST', 'value')
    const passphraseFile = join(tmpDir, '.local-vault-passphrase')
    if (process.platform !== 'win32') {
      const stat = statSync(passphraseFile)
      const mode = stat.mode & 0o777
      expect(mode).toBe(0o600)
    }
    // On Windows: file should exist (mode check is best-effort)
    const { existsSync } = await import('node:fs')
    expect(existsSync(passphraseFile)).toBe(true)
    process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE'] =
      'test-passphrase-fixed-32chars-xxx'
  })
})

// ── maskSecret tests ──────────────────────────────────────────────────────────

describe('maskSecret', () => {
  test('masks long secret correctly', async () => {
    const { maskSecret } = await import('../store.js')
    const masked = maskSecret('ABCDEFGHIJKLMNOP')
    expect(masked.startsWith('ABCD')).toBe(true)
    expect(masked).toContain('...')
    expect(masked).not.toBe('ABCDEFGHIJKLMNOP')
  })

  test('short secret uses length notation', async () => {
    const { maskSecret } = await import('../store.js')
    expect(maskSecret('abc')).toContain('len=3')
    expect(maskSecret('abc')).not.toContain('abc')
  })
})

// ── I1: Security invariant — secret never appears in logs ─────────────────────

describe('store: security invariants (I1)', () => {
  let tmpDir: string
  const SECRET_VALUE = 'super-secret-never-log-me-abc999'

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vault-sec-'))
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
    process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE'] =
      'test-passphrase-fixed-32chars-xxx'
    keychainMock.set.mockImplementation(keychainUnavailable)
    keychainMock.get.mockImplementation(keychainUnavailable)
    keychainMock.delete.mockImplementation(keychainUnavailable)
    keychainMock.list.mockImplementation(keychainUnavailable)
    keychainMock._addToIndex.mockImplementation(keychainUnavailable)
    keychainMock._removeFromIndex.mockImplementation(keychainUnavailable)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
    delete process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE']
  })

  test('secret value never appears in console.warn calls after setSecret', async () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
    const { setSecret } = await import('../store.js')
    await setSecret('MY_KEY', SECRET_VALUE)
    const allWarnCalls = warnSpy.mock.calls.flat().map(String).join(' ')
    expect(allWarnCalls).not.toContain(SECRET_VALUE)
    warnSpy.mockRestore()
  })

  test('secret value never appears in vault file keys (only encrypted blob)', async () => {
    const { setSecret } = await import('../store.js')
    await setSecret('MY_KEY', SECRET_VALUE)
    const vaultPath = join(tmpDir, 'local-vault.enc.json')
    const vaultContent = readFileSync(vaultPath, 'utf8')
    // The plaintext secret must not appear in the vault file
    expect(vaultContent).not.toContain(SECRET_VALUE)
    // The key name IS stored (by design), but the value must not be
    expect(vaultContent).toContain('MY_KEY')
  })
})

// ── I2: AES-GCM tamper detection ──────────────────────────────────────────────

describe('store: AES-GCM tamper detection (I2)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vault-tamper-'))
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
    process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE'] =
      'test-passphrase-fixed-32chars-xxx'
    keychainMock.set.mockImplementation(keychainUnavailable)
    keychainMock.get.mockImplementation(keychainUnavailable)
    keychainMock.delete.mockImplementation(keychainUnavailable)
    keychainMock.list.mockImplementation(keychainUnavailable)
    keychainMock._addToIndex.mockImplementation(keychainUnavailable)
    keychainMock._removeFromIndex.mockImplementation(keychainUnavailable)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
    delete process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE']
  })

  test('flipping a byte in data causes LocalVaultDecryptionError', async () => {
    const { setSecret, getSecret, LocalVaultDecryptionError } = await import(
      '../store.js'
    )
    await setSecret('TAMPER_KEY', 'original-value-to-tamper')
    const vaultPath = join(tmpDir, 'local-vault.enc.json')
    const vault = JSON.parse(readFileSync(vaultPath, 'utf8')) as Record<
      string,
      { iv: string; tag: string; data: string }
    >
    // Flip last byte of data hex
    const record = vault['TAMPER_KEY']!
    const dataHex = record.data
    const flippedByte = (parseInt(dataHex.slice(-2), 16) ^ 0xff)
      .toString(16)
      .padStart(2, '0')
    vault['TAMPER_KEY'] = {
      ...record,
      data: dataHex.slice(0, -2) + flippedByte,
    }
    writeFileSync(vaultPath, JSON.stringify(vault), 'utf8')
    await expect(getSecret('TAMPER_KEY')).rejects.toBeInstanceOf(
      LocalVaultDecryptionError,
    )
  })

  test('flipping a byte in tag causes LocalVaultDecryptionError', async () => {
    const { setSecret, getSecret, LocalVaultDecryptionError } = await import(
      '../store.js'
    )
    await setSecret('TAMPER_TAG', 'original-value-tag-tamper')
    const vaultPath = join(tmpDir, 'local-vault.enc.json')
    const vault = JSON.parse(readFileSync(vaultPath, 'utf8')) as Record<
      string,
      { iv: string; tag: string; data: string }
    >
    const record = vault['TAMPER_TAG']!
    const tagHex = record.tag
    const flippedByte = (parseInt(tagHex.slice(-2), 16) ^ 0xff)
      .toString(16)
      .padStart(2, '0')
    vault['TAMPER_TAG'] = { ...record, tag: tagHex.slice(0, -2) + flippedByte }
    writeFileSync(vaultPath, JSON.stringify(vault), 'utf8')
    await expect(getSecret('TAMPER_TAG')).rejects.toBeInstanceOf(
      LocalVaultDecryptionError,
    )
  })
})

// ── H3 fix (codecov-100 audit): invalid-UTF-8 decryption surfaces as error ────

describe('store: invalid-UTF-8 decryption rejection (H3)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vault-utf8-'))
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
    process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE'] =
      'test-passphrase-fixed-32chars-xxx'
    keychainMock.set.mockImplementation(keychainUnavailable)
    keychainMock.get.mockImplementation(keychainUnavailable)
    keychainMock.delete.mockImplementation(keychainUnavailable)
    keychainMock.list.mockImplementation(keychainUnavailable)
    keychainMock._addToIndex.mockImplementation(keychainUnavailable)
    keychainMock._removeFromIndex.mockImplementation(keychainUnavailable)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
    delete process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE']
  })

  test('regression: decrypted payload with invalid UTF-8 throws LocalVaultDecryptionError (no silent U+FFFD)', async () => {
    // We craft a vault file whose encrypted record decrypts to a buffer
    // containing invalid UTF-8 (lone continuation byte 0xC3 followed by
    // 0x28 — '(' — which is NOT a valid continuation byte).
    // The encrypted record must pass GCM authentication, so we encrypt
    // the malformed bytes ourselves with the same passphrase + salt as
    // the store would derive.
    const { LocalVaultDecryptionError, getSecret } = await import('../store.js')
    const { createCipheriv, randomBytes, scryptSync } = await import(
      'node:crypto'
    )

    // Mirror the constants from store.ts
    const ALGORITHM = 'aes-256-gcm' as const
    const IV_BYTES = 12
    const KEY_BYTES = 32
    const SALT_BYTES = 16
    const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }

    const passphrase = 'test-passphrase-fixed-32chars-xxx'
    const salt = randomBytes(SALT_BYTES)
    const key256 = scryptSync(
      passphrase,
      salt,
      KEY_BYTES,
      SCRYPT_PARAMS,
    ) as Buffer

    // Invalid UTF-8 sequence: lone continuation byte / overlong / truncated
    // multi-byte. 0xC3 0x28 is the canonical "invalid 2-byte sequence" example.
    const invalidUtf8 = Buffer.from([0xc3, 0x28, 0xa0, 0xa1])

    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, key256, iv)
    const entryKey = 'BAD_UTF8'
    cipher.setAAD(Buffer.from(entryKey, 'utf8'))
    const encrypted = Buffer.concat([
      cipher.update(invalidUtf8),
      cipher.final(),
    ])
    const tag = cipher.getAuthTag()

    const vaultData = {
      _salt: salt.toString('hex'),
      _version: 2,
      [entryKey]: {
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        data: encrypted.toString('hex'),
      },
    }
    writeFileSync(
      join(tmpDir, 'local-vault.enc.json'),
      JSON.stringify(vaultData),
      'utf8',
    )

    // Old code: returned a string with U+FFFD replacement chars (corruption
    // undetectable to caller). New code: throws LocalVaultDecryptionError.
    await expect(getSecret(entryKey)).rejects.toBeInstanceOf(
      LocalVaultDecryptionError,
    )
    await expect(getSecret(entryKey)).rejects.toMatchObject({
      message: expect.stringMatching(/UTF-8|corrupted/i),
    })
  })

  test('valid UTF-8 (CJK / emoji) still round-trips after H3 fix', async () => {
    // Sanity: H3's fatal TextDecoder must not break valid multi-byte UTF-8.
    const { setSecret, getSecret } = await import('../store.js')
    const value = '日本語🎉🌟αβγ test 123'
    await setSecret('UTF8_OK', value)
    expect(await getSecret('UTF8_OK')).toBe(value)
  })
})

// ── D1: Value size limit ───────────────────────────────────────────────────────

describe('store: value size limit (D1)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vault-size-'))
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
    process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE'] =
      'test-passphrase-fixed-32chars-xxx'
    keychainMock.set.mockImplementation(keychainUnavailable)
    keychainMock._addToIndex.mockImplementation(keychainUnavailable)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
    delete process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE']
  })

  test('setSecret rejects value >64KB', async () => {
    const { setSecret } = await import('../store.js')
    const bigValue = 'X'.repeat(64 * 1024 + 1)
    await expect(setSecret('BIG_KEY', bigValue)).rejects.toThrow()
  })

  test('setSecret accepts value exactly at 64KB', async () => {
    const { setSecret, getSecret } = await import('../store.js')
    const exactValue = 'X'.repeat(64 * 1024)
    await expect(setSecret('EXACT_KEY', exactValue)).resolves.toBeUndefined()
    expect(await getSecret('EXACT_KEY')).toBe(exactValue)
  })
})
