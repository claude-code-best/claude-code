import type { SDKAssistantMessageError } from '../../../entrypoints/agentSdkTypes.js'

type CodexErrorLike = {
  status?: unknown
  message?: unknown
  error?: {
    message?: unknown
  }
}

export type NormalizedCodexError = {
  content: string
  error: SDKAssistantMessageError
}

function readErrorStatus(error: unknown): number | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as CodexErrorLike).status === 'number'
  ) {
    return (error as CodexErrorLike).status as number
  }

  return null
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const value = error as CodexErrorLike
    if (typeof value.message === 'string' && value.message.length > 0) {
      return value.message
    }
    if (
      typeof value.error?.message === 'string' &&
      value.error.message.length > 0
    ) {
      return value.error.message
    }
  }

  return String(error)
}

export function getCodexConfigurationError(): NormalizedCodexError | null {
  if (!process.env.CODEX_API_KEY) {
    return {
      content:
        'Missing CODEX_API_KEY. Configure it in settings or your environment before using the codex provider.',
      error: 'authentication_failed',
    }
  }

  return null
}

export function normalizeCodexError(error: unknown): NormalizedCodexError {
  const status = readErrorStatus(error)
  const message = readErrorMessage(error)

  if (/^Codex preflight:/i.test(message)) {
    return {
      content: message,
      error: 'invalid_request',
    }
  }

  if (status === 401 || status === 403) {
    return {
      content: `Codex authentication failed (${status}). Verify CODEX_API_KEY and CODEX_BASE_URL.`,
      error: 'authentication_failed',
    }
  }

  if (status === 404) {
    return {
      content:
        'Codex endpoint not found (404). Verify CODEX_BASE_URL points to a Responses API root.',
      error: 'invalid_request',
    }
  }

  if (status === 429) {
    return {
      content:
        'Codex rate limit reached (429). Retry shortly or reduce request volume.',
      error: 'rate_limit',
    }
  }

  if (status === 502 && /upstream request failed/i.test(message)) {
    return {
      content:
        'Codex gateway returned 502 Upstream request failed. This usually means a transient gateway issue or incomplete Responses API compatibility during tool replay.',
      error: 'server_error',
    }
  }

  if (status !== null && status >= 500) {
    return {
      content: `Codex server error (${status}): ${message}`,
      error: 'server_error',
    }
  }

  return {
    content: `API Error: ${message}`,
    error: 'unknown',
  }
}
