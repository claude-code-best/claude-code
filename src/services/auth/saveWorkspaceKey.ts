/**
 * saveWorkspaceKey — saves a workspace API key to global config.
 *
 * Security properties:
 * - Validates sk-ant-api03- prefix before writing.
 * - Enforces minimum (20) and maximum (256) length limits.
 * - Error messages never contain the key value itself.
 * - After write, getGlobalConfig() immediately reflects the new key because
 *   saveGlobalConfig uses write-through cache semantics.
 *
 * On POSIX: also attempts chmod 600 on the config file so only the owner can
 * read the plaintext key.
 * On Windows: no-op chmod, but a one-time warning is logged via logError.
 */

import { promises as fs } from 'fs'
import { getGlobalClaudeFile } from '../../utils/env.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logError } from '../../utils/log.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORKSPACE_KEY_PREFIX = 'sk-ant-api03-'
const MIN_KEY_LENGTH = 20
const MAX_KEY_LENGTH = 256

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates and saves a workspace API key to ~/.claude.json.
 *
 * The write is performed via saveGlobalConfig so the in-process cache is
 * updated immediately — no restart needed.
 *
 * @throws {Error} if the key is empty, has the wrong prefix, is too short, or
 *                 is too long. Error messages never expose the key value.
 * @throws {Error} (re-thrown) if the underlying fs write fails (sanitized).
 */
export async function saveWorkspaceKey(key: string): Promise<void> {
  // --- Validation (prefix-only, no key value in errors) ---
  if (!key || key.trim().length === 0) {
    throw new Error('Workspace API key must not be empty.')
  }

  const trimmed = key.trim()

  if (trimmed.length < MIN_KEY_LENGTH) {
    throw new Error(
      `Workspace API key is too short (${trimmed.length} chars). ` +
        `Expected at least ${MIN_KEY_LENGTH} chars starting with "${WORKSPACE_KEY_PREFIX}".`,
    )
  }

  if (trimmed.length > MAX_KEY_LENGTH) {
    throw new Error(
      `Workspace API key is too long (${trimmed.length} chars). ` +
        `Maximum allowed length is ${MAX_KEY_LENGTH} chars.`,
    )
  }

  if (!trimmed.startsWith(WORKSPACE_KEY_PREFIX)) {
    // Only show first 4 chars of the actual key to avoid leaking entropy
    const prefix4 = trimmed.slice(0, 4)
    throw new Error(
      `Workspace API key must start with "${WORKSPACE_KEY_PREFIX}" (workspace key). ` +
        `Got prefix "${prefix4}...". ` +
        'Obtain a workspace API key from https://console.anthropic.com/settings/keys.',
    )
  }

  // --- Write (cache-invalidating via saveGlobalConfig write-through) ---
  try {
    saveGlobalConfig(current => ({
      ...current,
      workspaceApiKey: trimmed,
    }))
  } catch (err: unknown) {
    // Sanitize: re-throw without mentioning the key value
    throw new Error(
      `Failed to save workspace API key to config: ${sanitizeErrorMessage(err)}`,
    )
  }

  // --- POSIX: chmod 600 the config file so only the owner can read it ---
  await tryChmod600()
}

/**
 * Remove the workspace API key from settings.
 * Does NOT touch the ANTHROPIC_API_KEY env var (that's session-scoped).
 *
 * After this, getEffectiveWorkspaceApiKey() will fall through to the env
 * var if any, otherwise return undefined.
 */
export async function removeWorkspaceKey(): Promise<void> {
  try {
    saveGlobalConfig(current => {
      // Strip the field; setting undefined preserves other properties.
      const next = { ...current }
      delete (next as { workspaceApiKey?: string }).workspaceApiKey
      return next
    })
  } catch (err: unknown) {
    throw new Error(
      `Failed to remove workspace API key: ${sanitizeErrorMessage(err)}`,
    )
  }
}

/**
 * Returns the effective workspace API key from the two-source chain:
 *   1. ANTHROPIC_API_KEY env var (takes precedence)
 *   2. workspaceApiKey from ~/.claude.json
 *
 * Returns undefined when neither is set.
 */
export function getEffectiveWorkspaceApiKey(): string | undefined {
  const fromEnv = process.env['ANTHROPIC_API_KEY']?.trim()
  if (fromEnv) return fromEnv
  return getGlobalConfig().workspaceApiKey?.trim() || undefined
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strips any key-looking values from a raw error message so we never
 * accidentally surface the secret in error output / logs / Sentry.
 */
function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Replace any sk-ant-api03-* pattern with a placeholder
    return err.message.replace(/sk-ant-api03-\S*/g, '[REDACTED]')
  }
  return 'unknown error'
}

/**
 * Attempts to set mode 0o600 on the global config file.
 * - POSIX: silently succeeds or logs on failure.
 * - Windows: fs.chmod is a no-op; we log a one-time informational warning.
 */
async function tryChmod600(): Promise<void> {
  const configPath = getGlobalClaudeFile()
  if (process.platform === 'win32') {
    logError(
      new Error(
        '[saveWorkspaceKey] Windows: chmod 600 is not supported. ' +
          'To protect your API key, restrict access to ' +
          `${configPath} via icacls or Windows ACL settings.`,
      ),
    )
    return
  }
  try {
    await fs.chmod(configPath, 0o600)
  } catch (err: unknown) {
    // Non-fatal — log but don't throw
    logError(
      new Error(
        `[saveWorkspaceKey] Could not set chmod 600 on ${configPath}: ${sanitizeErrorMessage(err)}`,
      ),
    )
  }
}
