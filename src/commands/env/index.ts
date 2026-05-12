import type { Command, LocalCommandResult } from '../../types/command.js'
import { getSessionId } from '../../bootstrap/state.js'

/**
 * /env — show the user a snapshot of the current environment, claude config,
 * feature flags, and version info. All secrets are masked.
 *
 * Pure-local command: no Anthropic backend dependency. Restored from stub
 * 2026-04-29 (was Anthropic-internal in upstream; safe to expose to fork
 * users since output is local-only).
 */

const SECRET_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /api[_-]?key/i,
  /auth/i,
  /private/i,
  /credential/i,
  /jwt/i,
  /session[_-]?id$/i,
]

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some(rx => rx.test(key))
}

function maskValue(value: string): string {
  if (value.length <= 8) return '***'
  return `${value.slice(0, 4)}…${value.slice(-2)} (${value.length} chars)`
}

const ENV_PREFIX_ALLOWLIST = [
  'CLAUDE_',
  'FEATURE_',
  'ANTHROPIC_',
  'BUN_',
  'NODE_',
  'GEMINI_',
  'OPENAI_',
  'GROK_',
  'CCR_',
  'KAIROS_',
  'BUGHUNTER_',
]

function shouldShowEnv(key: string): boolean {
  return ENV_PREFIX_ALLOWLIST.some(prefix => key.startsWith(prefix))
}

function formatEnvVars(): string {
  const entries = Object.entries(process.env)
    .filter(([k]) => shouldShowEnv(k))
    .map(([k, v]): [string, string] => {
      const display = isSecretKey(k) && v ? maskValue(v) : (v ?? '')
      return [k, display]
    })
    .sort(([a], [b]) => a.localeCompare(b))

  if (entries.length === 0) {
    return '  (no recognized env vars set)'
  }
  return entries.map(([k, v]) => `  ${k}=${v}`).join('\n')
}

function formatRuntime(): string {
  const lines = [
    `  platform:        ${process.platform} ${process.arch}`,
    `  cwd:             ${process.cwd()}`,
    `  pid:             ${process.pid}`,
    `  bun:             ${typeof Bun !== 'undefined' ? Bun.version : 'n/a'}`,
    `  node:            ${process.version}`,
    `  session:         ${getSessionId()}`,
  ]
  return lines.join('\n')
}

const env: Command = {
  type: 'local',
  name: 'env',
  description: 'Show current environment, runtime, and feature flags',
  isHidden: false,
  isEnabled: () => true,
  supportsNonInteractive: true,
  load: async () => ({
    call: async (): Promise<LocalCommandResult> => {
      const text = [
        '## Runtime',
        formatRuntime(),
        '',
        '## Environment Variables (allowlisted prefixes)',
        formatEnvVars(),
        '',
        '_Secrets matching token/password/auth/api_key are masked. Set additional `CLAUDE_*` / `FEATURE_*` env vars to see them here._',
      ].join('\n')
      return { type: 'text', value: text }
    },
  }),
}

export default env
