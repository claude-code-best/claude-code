import { createHash } from 'crypto'

const MAX_CODEX_CALL_ID_LENGTH = 96

export function normalizeCodexCallId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const sanitized = value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._:-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, MAX_CODEX_CALL_ID_LENGTH)

  return sanitized.length > 0 ? sanitized : null
}

export function createCodexFallbackCallId(seed: string): string {
  const hash = createHash('sha1')
    .update(seed.length > 0 ? seed : 'codex-call')
    .digest('hex')
    .slice(0, 24)

  return `call_${hash}`
}

export function resolveCodexCallId(value: unknown, seed: string): string {
  return normalizeCodexCallId(value) ?? createCodexFallbackCallId(seed)
}
