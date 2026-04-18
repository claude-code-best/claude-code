/**
 * Sanitize inbound GitHub webhook payload content before it enters the session.
 *
 * Called from useReplBridge.tsx when feature('KAIROS_GITHUB_WEBHOOKS') is enabled.
 * Strips known secret patterns (tokens, API keys, credentials) while preserving
 * the meaningful content (PR titles, descriptions, commit messages, etc.).
 *
 * Must be synchronous and never throw — on error, returns a safe placeholder.
 */

/** Patterns that match known secret/token formats. */
const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // GitHub tokens (PAT, OAuth, App, Server-to-server)
  {
    pattern: /\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{10,}\b/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  // Anthropic API keys
  {
    pattern: /\bsk-ant-[A-Za-z0-9_-]{10,}\b/g,
    replacement: '[REDACTED_ANTHROPIC_KEY]',
  },
  // Generic Bearer tokens in headers
  {
    pattern: /(Bearer\s+)[A-Za-z0-9._\-/+=]{20,}/gi,
    replacement: '$1[REDACTED_TOKEN]',
  },
  // AWS access keys
  {
    pattern: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  // AWS secret keys (40-char base64-like strings after common labels)
  {
    pattern:
      /(aws_secret_access_key|secret_key|SecretAccessKey)['":\s=]+[A-Za-z0-9/+=]{30,}/gi,
    replacement: '$1=[REDACTED_AWS_SECRET]',
  },
  // Generic API key patterns (key=value or "key": "value")
  {
    pattern:
      /(api[_-]?key|apikey|secret|password|token|credential)['":\s=]+["']?[A-Za-z0-9._\-/+=]{16,}["']?/gi,
    replacement: '$1=[REDACTED]',
  },
  // npm tokens
  { pattern: /\bnpm_[A-Za-z0-9]{36}\b/g, replacement: '[REDACTED_NPM_TOKEN]' },
  // Slack tokens
  {
    pattern: /\bxox[bporas]-[A-Za-z0-9-]{10,}\b/g,
    replacement: '[REDACTED_SLACK_TOKEN]',
  },
]

/** Maximum content length before truncation (100KB). */
const MAX_CONTENT_LENGTH = 100_000

export function sanitizeInboundWebhookContent(content: string): string {
  try {
    if (!content) return content

    let sanitized = content

    // Redact known secret patterns first (before truncation to avoid
    // splitting a secret across the truncation boundary)
    for (const { pattern, replacement } of SECRET_PATTERNS) {
      pattern.lastIndex = 0
      sanitized = sanitized.replace(pattern, replacement)
    }

    // Truncate excessively large payloads after redaction
    if (sanitized.length > MAX_CONTENT_LENGTH) {
      sanitized = sanitized.slice(0, MAX_CONTENT_LENGTH) + '\n... [truncated]'
    }

    return sanitized
  } catch {
    // Never throw, never return raw content — return a safe placeholder
    return '[webhook content redacted due to sanitization error]'
  }
}
