/**
 * LocalVault store — OS keychain primary, AES-256-GCM file fallback.
 *
 * Passphrase priority:
 *   1. CLAUDE_LOCAL_VAULT_PASSPHRASE env var
 *   2. ~/.claude/.local-vault-passphrase (mode 600 on POSIX)
 *   3. Auto-generate + write to file (warns user to backup)
 *
 * Fallback file: ~/.claude/local-vault.enc.json (gitignored)
 *
 * Security invariants:
 *   - AES-256-GCM with per-record random IV; scryptSync KDF for passphrase
 *   - Vault-level 16-byte random salt stored in vault file header
 *   - D1: value size capped at MAX_SECRET_BYTES (64 KB)
 *   - B1: derived key buffer is zeroed after use (best-effort)
 *   - C1: vault file writes use tmp+rename (atomic on POSIX)
 *   - C5: passphrase file creation uses 'wx' exclusive flag (no double-write)
 *   - A2: readVaultFile differentiates ENOENT vs JSON-parse error
 *   - F1/F2: scryptSync KDF + per-vault salt (no rainbow tables)
 *   - G4: decryption error includes recovery instructions
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logError } from '../../utils/log.js'
import { KeychainUnavailableError, tryKeychain } from './keychain.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum secret value size: 64 KB (OS keychain typically < 4 KB; file fallback keeps overhead low). */
const MAX_SECRET_BYTES = 64 * 1024

/** AES-GCM algorithm. */
const ALGORITHM = 'aes-256-gcm' as const
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32
const SALT_BYTES = 16

/** scrypt parameters: N=16384 (2^14), r=8, p=1. OWASP-recommended minimum for interactive. */
const SCRYPT_PARAMS: Parameters<typeof scryptSync>[3] = { N: 16384, r: 8, p: 1 }

// ── Error types ───────────────────────────────────────────────────────────────

export class LocalVaultDecryptionError extends Error {
  constructor(reason: string) {
    super(
      `LocalVault decryption failed: ${reason}. ` +
        'Restore from your backup of ~/.claude/.local-vault-passphrase, ' +
        'or delete ~/.claude/local-vault.enc.json to reset (DESTROYS ALL SECRETS).',
    )
    this.name = 'LocalVaultDecryptionError'
  }
}

export class LocalVaultValueTooLargeError extends Error {
  constructor(byteLength: number) {
    super(
      `LocalVault: secret value is too large (${byteLength} bytes). ` +
        `Maximum allowed is ${MAX_SECRET_BYTES} bytes (${MAX_SECRET_BYTES / 1024} KB). ` +
        'Use external storage for large data.',
    )
    this.name = 'LocalVaultValueTooLargeError'
  }
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function getClaudeDir(): string {
  return process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')
}

function getVaultFilePath(): string {
  return join(getClaudeDir(), 'local-vault.enc.json')
}

function getPassphraseFilePath(): string {
  return join(getClaudeDir(), '.local-vault-passphrase')
}

// ── Passphrase management ─────────────────────────────────────────────────────

/**
 * Derives a 32-byte AES key from a passphrase + salt using scryptSync.
 *
 * F1/F2 fix: replaces single SHA-256 with memory-hard KDF + per-vault salt.
 * The salt is stored in the vault file header so it survives process restarts.
 * For the auto-generated 64-hex passphrase (256 bits entropy) this is defense-
 * in-depth; for user-provided low-entropy passphrases it is mandatory.
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_BYTES, SCRYPT_PARAMS) as Buffer
}

/**
 * Get or create the passphrase.
 *
 * C5 fix: uses { flag: 'wx' } (exclusive create) for atomic first-run write.
 * If EEXIST (race: another process wrote first), re-reads from disk.
 */
async function getOrCreatePassphrase(): Promise<string> {
  // Priority 1: env var
  const envVal = process.env['CLAUDE_LOCAL_VAULT_PASSPHRASE']
  if (envVal) return envVal

  const passphraseFile = getPassphraseFilePath()

  // Priority 2: existing passphrase file
  if (existsSync(passphraseFile)) {
    return readFileSync(passphraseFile, 'utf8').trim()
  }

  // Priority 3: auto-generate + write to file (exclusive create to avoid double-write)
  const claudeDir = getClaudeDir()
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true })
  }

  const generated = randomBytes(32).toString('hex')
  try {
    // C5: 'wx' flag means exclusive create — EEXIST if another process wrote first
    writeFileSync(passphraseFile, generated, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EEXIST') {
      // Another concurrent first-run wrote the file — use theirs
      return readFileSync(passphraseFile, 'utf8').trim()
    }
    throw err
  }

  // Ensure mode 600 even if umask interfered
  try {
    chmodSync(passphraseFile, 0o600)
  } catch {
    // A4: Windows — best effort; user cannot act before encryption proceeds.
    // Recommend env var as the secure alternative.
    logError(
      new Error(
        'LocalVault: could not set passphrase file permissions on Windows. ' +
          'To secure your vault, set CLAUDE_LOCAL_VAULT_PASSPHRASE env var instead of relying on the passphrase file. ' +
          'Run: icacls "%USERPROFILE%\\.claude\\.local-vault-passphrase" /inheritance:r /grant:r "%USERNAME%":F',
      ),
    )
  }

  // E5: Use logError (consistent with rest of file) instead of console.warn
  logError(
    new Error(
      '[LocalVault] Generated new passphrase file: ' +
        passphraseFile +
        ' — Back it up! Losing this file means losing access to your encrypted vault.',
    ),
  )

  return generated
}

// ── Vault file format ─────────────────────────────────────────────────────────

type EncryptedRecord = {
  iv: string // hex
  tag: string // hex
  data: string // hex
}

type VaultFile = {
  /** F1/F2: per-vault KDF salt, 32 hex chars (16 bytes). */
  _salt?: string
  /** Version marker for forward compatibility. */
  _version?: number
  [key: string]: EncryptedRecord | string | number | undefined
}

// ── Crypto primitives ─────────────────────────────────────────────────────────

function encrypt(
  plaintext: string,
  key: Buffer,
  entryKey: string,
): EncryptedRecord {
  // New IV per encryption — invariant: no IV reuse
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  // F3: bind entry key as AAD so swapping records fails GCM authentication
  cipher.setAAD(Buffer.from(entryKey, 'utf8'))
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  }
}

function decrypt(
  record: EncryptedRecord,
  key: Buffer,
  entryKey: string,
): string {
  let iv: Buffer
  let tag: Buffer
  let data: Buffer
  try {
    iv = Buffer.from(record.iv, 'hex')
    tag = Buffer.from(record.tag, 'hex')
    data = Buffer.from(record.data, 'hex')
  } catch {
    throw new LocalVaultDecryptionError('corrupted record encoding')
  }

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new LocalVaultDecryptionError('invalid IV or tag length')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  // F3: must supply the same AAD used during encryption
  decipher.setAAD(Buffer.from(entryKey, 'utf8'))
  let decrypted: Buffer
  try {
    decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  } catch {
    // Do not leak partial decrypted bytes
    throw new LocalVaultDecryptionError(
      'authentication tag mismatch — wrong passphrase or tampered data',
    )
  }
  // H3 fix (codecov-100 audit): use a fatal TextDecoder so invalid UTF-8
  // surfaces as a thrown error instead of being silently replaced with
  // U+FFFD. AES-GCM authentication catches *most* tampering, but the
  // decryption succeeds before we get here — and a vault written by a
  // bug in an older version (or by a manual `local-vault.enc.json`
  // edit) could still contain non-UTF-8 bytes. Without this check the
  // caller would receive a lossy string and have no way to detect that
  // their secret has been corrupted.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(decrypted)
  } catch {
    throw new LocalVaultDecryptionError(
      'decrypted payload is not valid UTF-8 — vault record may be corrupted',
    )
  }
}

// ── Vault file I/O ────────────────────────────────────────────────────────────

async function readVaultFile(): Promise<VaultFile> {
  const filePath = getVaultFilePath()
  if (!existsSync(filePath)) return {}
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return {}
    // Rethrow unexpected read errors (permissions, hardware fault)
    throw err
  }
  // A2: differentiate parse error from absence
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new LocalVaultDecryptionError(
      'vault file is corrupt (invalid JSON) — restore from backup',
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new LocalVaultDecryptionError(
      'vault file has unexpected format — restore from backup',
    )
  }
  return parsed as VaultFile
}

async function writeVaultFile(data: VaultFile): Promise<void> {
  const claudeDir = getClaudeDir()
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true })
  }
  const filePath = getVaultFilePath()
  // C1: atomic write — tmp file + rename (POSIX rename(2) is atomic)
  const vaultDir = join(filePath, '..')
  const tmpPath = join(
    vaultDir,
    `.local-vault-${randomBytes(8).toString('hex')}.tmp`,
  )
  try {
    await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8')
    renameSync(tmpPath, filePath)
  } catch (err) {
    // Clean up tmp on failure
    try {
      rmSync(tmpPath, { force: true })
    } catch {
      /* ignore cleanup error */
    }
    throw err
  }
}

/** Get or create the per-vault salt, storing it in the vault file. */
async function getOrCreateSalt(vaultData: VaultFile): Promise<Buffer> {
  if (
    typeof vaultData['_salt'] === 'string' &&
    vaultData['_salt'].length === SALT_BYTES * 2
  ) {
    return Buffer.from(vaultData['_salt'], 'hex')
  }
  // Generate new salt and persist it (the caller will write the vault file)
  const salt = randomBytes(SALT_BYTES)
  vaultData['_salt'] = salt.toString('hex')
  vaultData['_version'] = 2
  return salt
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function setSecret(key: string, value: string): Promise<void> {
  if (!key) throw new Error('key must not be empty')

  // D1: Guard against unbounded value sizes
  const byteLength = Buffer.byteLength(value, 'utf8')
  if (byteLength > MAX_SECRET_BYTES) {
    throw new LocalVaultValueTooLargeError(byteLength)
  }

  // Primary: OS keychain
  try {
    await tryKeychain.set(key, value)
    await tryKeychain._addToIndex(key)
    return
  } catch (err: unknown) {
    if (!(err instanceof KeychainUnavailableError)) {
      throw err
    }
    // Keychain unavailable → fall through to file
    // A: Not silently swallowed; user gets a console warning each call
    logError(
      new Error(
        '[LocalVault] OS keychain not available, falling back to encrypted file. ' +
          'Install platform keychain or set CLAUDE_LOCAL_VAULT_PASSPHRASE env.',
      ),
    )
  }

  // Fallback: encrypted file
  const passphrase = await getOrCreatePassphrase()
  const vaultData = await readVaultFile()
  const salt = await getOrCreateSalt(vaultData)

  // B1: zero the key buffer after use regardless of success/failure
  const key256 = deriveKey(passphrase, salt)
  try {
    vaultData[key] = encrypt(value, key256, key)
    await writeVaultFile(vaultData)
  } finally {
    key256.fill(0)
  }
}

export async function getSecret(key: string): Promise<string | null> {
  // Primary: OS keychain
  try {
    const val = await tryKeychain.get(key)
    return val
  } catch (err: unknown) {
    if (!(err instanceof KeychainUnavailableError)) {
      throw err
    }
    // Keychain unavailable — fall through to file (no log needed on read path)
  }

  // Fallback: encrypted file
  const vaultData = await readVaultFile()
  const record = vaultData[key]
  if (!record || typeof record !== 'object' || Array.isArray(record))
    return null

  // Detect old format: no salt field → record was encrypted without scrypt KDF.
  // The new AAD binding also means old records will fail authentication.
  // Instruct user to re-set secrets encrypted under the old format.
  if (typeof vaultData['_salt'] !== 'string') {
    throw new LocalVaultDecryptionError(
      'vault was created with an older format (no KDF salt). ' +
        'Please re-set your secrets using /local-vault set to upgrade to the secure format',
    )
  }

  const passphrase = await getOrCreatePassphrase()
  const salt = Buffer.from(vaultData['_salt'], 'hex')

  // B1: zero the key buffer after use
  const key256 = deriveKey(passphrase, salt)
  try {
    return decrypt(record as EncryptedRecord, key256, key)
  } finally {
    key256.fill(0)
  }
}

export async function deleteSecret(key: string): Promise<boolean> {
  // Primary: OS keychain
  try {
    const deleted = await tryKeychain.delete(key)
    await tryKeychain._removeFromIndex(key)
    return deleted
  } catch (err: unknown) {
    if (!(err instanceof KeychainUnavailableError)) {
      throw err
    }
  }

  // Fallback: encrypted file
  const vaultData = await readVaultFile()
  if (!(key in vaultData)) return false
  const updated = { ...vaultData }
  delete updated[key]
  await writeVaultFile(updated)
  return true
}

export async function listKeys(): Promise<string[]> {
  // Primary: OS keychain index
  try {
    return await tryKeychain.list()
  } catch (err: unknown) {
    if (!(err instanceof KeychainUnavailableError)) {
      throw err
    }
  }

  // Fallback: encrypted file keys (no decryption needed — just keys)
  const vaultData = await readVaultFile()
  // Filter out internal metadata keys
  return Object.keys(vaultData).filter(k => !k.startsWith('_'))
}

/** Mask a secret value for display: first 4 chars + ... + last 2 chars + length */
export function maskSecret(value: string): string {
  if (value.length <= 6) return `***[len=${value.length}]`
  return `${value.slice(0, 4)}...[len=${value.length}]`
}
