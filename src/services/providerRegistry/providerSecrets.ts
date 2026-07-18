import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { basename, dirname, join } from 'path'
import { randomBytes } from 'node:crypto'
import { logError } from '../../utils/log.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

// =============================================================================
// Per-provider secret store
//
// The provider catalog (providers.json) is a NON-secret reference by design —
// each provider's auth only records scheme/source/envName, never the key. The
// legacy persistence funneled every provider's key into the single-active
// slots of settings.json (OPENAI_API_KEY, ANTHROPIC_AUTH_TOKEN, one top-level
// modelType), so configuring provider B clobbered provider A's key (chatgpt
// even deletes OPENAI_API_KEY, wiping any openai-compatible provider). On
// restart only whatever survived in settings.json was left — every other
// provider's key was gone.
//
// This store keeps each provider's credential durably, keyed by provider id,
// in ~/.claude/provider-secrets.json (0600). It is the source of truth that
// survives restarts; hydrateProviderSecretsIntoEnv() backfills the runtime env
// from it on startup and before each activation, so switching providers no
// longer depends on a key that a sibling save may have cleared.
// =============================================================================

type StoredSecret = {
  /** The env var the runtime reads this credential from (credentialSourceEnvName). */
  envName: string
  value: string
  updatedAt: number
}

type ProviderSecretsFile = {
  version: 1
  secrets: Record<string, StoredSecret>
}

export function getProviderSecretsFilePath(): string {
  return join(getClaudeConfigHomeDir(), 'provider-secrets.json')
}

function isStoredSecret(value: unknown): value is StoredSecret {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as StoredSecret).envName === 'string' &&
    typeof (value as StoredSecret).value === 'string'
  )
}

function readSecretsFile(): ProviderSecretsFile {
  const filePath = getProviderSecretsFilePath()
  if (!existsSync(filePath)) return { version: 1, secrets: {} }
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    const raw =
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as ProviderSecretsFile).secrets === 'object' &&
      (parsed as ProviderSecretsFile).secrets !== null
        ? (parsed as ProviderSecretsFile).secrets
        : {}
    const secrets: Record<string, StoredSecret> = {}
    for (const [providerId, secret] of Object.entries(raw)) {
      if (isStoredSecret(secret)) secrets[providerId] = secret
    }
    return { version: 1, secrets }
  } catch (error) {
    logError(`Failed to read provider secrets: ${String(error)}`)
    return { version: 1, secrets: {} }
  }
}

function writeSecretsFile(data: ProviderSecretsFile): void {
  const filePath = getProviderSecretsFilePath()
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = join(
    dirname(filePath),
    `.${basename(filePath)}-${process.pid}-${randomBytes(8).toString('hex')}.tmp`,
  )
  let descriptor: number | undefined
  try {
    descriptor = openSync(tmpPath, 'wx', 0o600)
    writeFileSync(descriptor, JSON.stringify(data, null, 2), 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(tmpPath, filePath)
    try {
      chmodSync(filePath, 0o600)
    } catch {
      // Best effort — the atomic create already used 0600.
    }
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        // Preserve the original write error.
      }
    }
    try {
      unlinkSync(tmpPath)
    } catch {
      // The temp file may not exist or may already have been renamed.
    }
    throw error
  }
}

/** Persist one provider's credential durably, keyed by provider id. No-op on empty. */
export function writeProviderSecret(
  providerId: string,
  envName: string,
  value: string,
): void {
  if (!providerId || !envName || !value.trim()) return
  const data = readSecretsFile()
  data.secrets[providerId] = {
    envName,
    value: value.trim(),
    updatedAt: Date.now(),
  }
  writeSecretsFile(data)
}

/** Remove a provider's stored credential (e.g. on auth removal). */
export function deleteProviderSecret(providerId: string): void {
  const data = readSecretsFile()
  if (data.secrets[providerId] === undefined) return
  delete data.secrets[providerId]
  writeSecretsFile(data)
}

export function readProviderSecret(
  providerId: string,
): StoredSecret | undefined {
  return readSecretsFile().secrets[providerId]
}

/**
 * Backfill the runtime env from the durable per-provider store.
 *
 * Non-active providers only fill an EMPTY slot (never clobber a live value the
 * process was launched with). The active provider — the one being started or
 * switched to — always wins its slot, so activation resolves against its key
 * even if a sibling provider shares the same env var.
 */
export function hydrateProviderSecretsIntoEnv(
  env: Record<string, string | undefined> = process.env,
  options: { activeProviderId?: string } = {},
): void {
  const { secrets } = readSecretsFile()
  for (const [providerId, secret] of Object.entries(secrets)) {
    if (providerId === options.activeProviderId) continue
    if (!env[secret.envName]) env[secret.envName] = secret.value
  }
  const active = options.activeProviderId
    ? secrets[options.activeProviderId]
    : undefined
  if (active) env[active.envName] = active.value
}
