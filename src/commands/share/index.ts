import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Command, LocalCommandResult } from '../../types/command.js'
import {
  getSessionId,
  getSessionProjectDir,
  getOriginalCwd,
} from '../../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { sanitizePath } from '../../utils/path.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'

import * as childProcess from 'node:child_process'
import { promisify } from 'node:util'

/**
 * Sanitizes an error message before surfacing it to the user:
 * - Replaces the home directory path with "~" to avoid leaking absolute paths.
 * - Truncates to 200 characters to avoid leaking large stack traces or token fragments.
 */
function sanitizeErrorMessage(msg: string): string {
  const home = homedir()
  let sanitized = msg.replace(
    new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
    '~',
  )
  if (sanitized.length > 200) sanitized = sanitized.slice(0, 200) + '…'
  return sanitized
}

// Re-resolved at call time via namespace import so that test runners using
// mock.module('node:child_process') see the replacement (unlike module-load
// promisify capture which binds the original reference permanently).
function execFileAsync(
  cmd: string,
  args: string[],
  opts: { timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  return promisify(childProcess.execFile)(cmd, args, opts)
}

// Patterns to mask in shared content (API keys, tokens, passwords, secrets)
const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Anthropic / OpenAI-style API keys
  {
    pattern: /\b(sk-ant-[A-Za-z0-9_-]{20,})/g,
    replacement: '[REDACTED_ANTHROPIC_KEY]',
  },
  {
    pattern: /\b(sk-[A-Za-z0-9_-]{20,})/g,
    replacement: '[REDACTED_API_KEY]',
  },
  // Bearer / Authorization tokens
  {
    pattern: /\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}/gi,
    replacement: '$1[REDACTED_TOKEN]',
  },
  // Generic: key/token/secret/password followed by = or : and a value
  {
    pattern:
      /("(?:api[_-]?key|token|secret|password|passwd|auth)["\s]*[:=]\s*")[^"]{8,}"/gi,
    replacement: '$1[REDACTED]"',
  },
  // AWS-style access keys
  {
    pattern: /\b(AKIA[A-Z0-9]{16})\b/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  // GitHub personal access tokens (ghp_*, gho_*, ghs_*, ghr_*)
  {
    pattern: /\b(gh[a-z]_[A-Za-z0-9_]{36,})/g,
    replacement: '[REDACTED_GH_TOKEN]',
  },
  // Slack bot tokens (xoxb-*)
  {
    pattern: /\b(xoxb-[A-Za-z0-9-]{30,})/g,
    replacement: '[REDACTED_SLACK_TOKEN]',
  },
  // NOTE: We intentionally do NOT redact generic ≥32-char hex strings because
  // they match legitimate git commit SHAs and base64 content, producing
  // garbled share output. Token detection is limited to prefixed patterns above.
]

/**
 * Masks secret-looking strings in the given text.
 * Exported for testing.
 */
export function maskSecrets(text: string): string {
  let result = text
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

/**
 * Builds a summary-only version of the session JSONL:
 * Takes the first 200 chars of each turn's text content (user/assistant only).
 */
function buildSummaryContent(logPath: string): string {
  try {
    const lines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)

    const summaryLines: string[] = []
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>
        const role = entry.role as string | undefined
        if (role !== 'user' && role !== 'assistant') continue

        const content = entry.content
        let text = ''
        if (typeof content === 'string') {
          text = content.slice(0, 200)
        } else if (Array.isArray(content)) {
          const firstText = (content as Array<Record<string, unknown>>).find(
            b => b.type === 'text',
          )
          text = ((firstText?.text as string | undefined) ?? '').slice(0, 200)
        }
        if (text) {
          summaryLines.push(JSON.stringify({ role, content: text }))
        }
      } catch {
        // skip malformed
      }
    }
    return summaryLines.join('\n')
  } catch {
    // Defensive: log file disappeared between existsSync and readFileSync (TOCTOU)
    return ''
  }
}

function getTranscriptPath(): string {
  const sessionId = getSessionId()
  const projectDir = getSessionProjectDir()
  if (projectDir) {
    return join(projectDir, `${sessionId}.jsonl`)
  }
  const encoded = sanitizePath(getOriginalCwd())
  return join(
    getClaudeConfigHomeDir(),
    'projects',
    encoded,
    `${sessionId}.jsonl`,
  )
}

async function ghAvailable(): Promise<boolean> {
  try {
    await execFileAsync('gh', ['--version'], { timeout: 3000 })
    return true
  } catch {
    return false
  }
}

async function uploadToGist(
  filePath: string,
  isPublic: boolean,
): Promise<string> {
  const visibility = isPublic ? '--public' : '--secret'
  const result = await execFileAsync(
    'gh',
    [
      'gist',
      'create',
      filePath,
      visibility,
      '--filename',
      'claude-session.jsonl',
    ],
    { timeout: 30000 },
  )
  const url = result.stdout.trim()
  if (!url.startsWith('https://')) {
    throw new Error(`Unexpected gh gist output: ${url}`)
  }
  return url
}

/**
 * Fallback upload via 0x0.st (free text paste service).
 * Only used when gh gist fails and --allow-public-fallback is set.
 */
async function uploadTo0x0(filePath: string): Promise<string> {
  const result = await execFileAsync(
    'curl',
    ['-s', '-F', `file=@${filePath}`, 'https://0x0.st'],
    { timeout: 20000 },
  )
  const url = result.stdout.trim()
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    throw new Error(`0x0.st returned unexpected output: ${url.slice(0, 100)}`)
  }
  return url
}

/**
 * Parses /share flags.
 * Supported: --public, --private (default), --mask-secrets, --summary-only, --allow-public-fallback
 */
interface ShareOptions {
  isPublic: boolean
  maskSecrets: boolean
  summaryOnly: boolean
  allowPublicFallback: boolean
  valid: boolean
}

function parseShareArgs(args: string): ShareOptions {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const unknownFlags = parts.filter(
    p =>
      p.startsWith('--') &&
      ![
        '--public',
        '--private',
        '--mask-secrets',
        '--summary-only',
        '--allow-public-fallback',
      ].includes(p),
  )
  if (unknownFlags.length > 0) {
    return {
      isPublic: false,
      maskSecrets: false,
      summaryOnly: false,
      allowPublicFallback: false,
      valid: false,
    }
  }
  return {
    isPublic: parts.includes('--public'),
    maskSecrets: parts.includes('--mask-secrets'),
    summaryOnly: parts.includes('--summary-only'),
    allowPublicFallback: parts.includes('--allow-public-fallback'),
    valid: true,
  }
}

const share: Command = {
  type: 'local',
  name: 'share',
  description:
    'Upload the current session log to GitHub Gist. Flags: --public, --private (default), --mask-secrets, --summary-only, --allow-public-fallback',
  isHidden: false,
  isEnabled: () => true,
  supportsNonInteractive: true,
  bridgeSafe: true,
  load: async () => ({
    call: async (args: string): Promise<LocalCommandResult> => {
      const opts = parseShareArgs(args)
      if (!opts.valid) {
        return {
          type: 'text',
          value: [
            'Usage: /share [--public|--private] [--mask-secrets] [--summary-only] [--allow-public-fallback]',
            '',
            '  --public               Create a public Gist (default: secret)',
            '  --private              Create a secret Gist (default)',
            '  --mask-secrets         Redact API keys, tokens, and secrets before uploading',
            '  --summary-only         Upload a summary (first 200 chars per turn) instead of full log',
            '  --allow-public-fallback  Fall back to 0x0.st if gh gist fails',
          ].join('\n'),
        }
      }

      const sessionId = getSessionId()
      const logPath = getTranscriptPath()

      logEvent('tengu_share_started', {
        visibility: (opts.isPublic
          ? 'public'
          : 'private') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        mask_secrets: String(
          opts.maskSecrets,
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        summary_only: String(
          opts.summaryOnly,
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      if (!existsSync(logPath)) {
        logEvent('tengu_share_failed', {
          reason:
            'log_not_found' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {
          type: 'text',
          value: [
            '## Session log not found',
            '',
            `Session: ${sessionId}`,
            `Expected path: \`${logPath}\``,
            '',
            'The session log may not have been written yet. Try sending at least one message first.',
          ].join('\n'),
        }
      }

      const hasGh = await ghAvailable()
      if (!hasGh && !opts.allowPublicFallback) {
        logEvent('tengu_share_failed', {
          reason:
            'gh_not_installed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {
          type: 'text',
          value: [
            '## Share session log',
            '',
            `Session: ${sessionId}`,
            `Log file: \`${logPath}\``,
            '',
            'To upload to GitHub Gist automatically, install the `gh` CLI:',
            '  https://cli.github.com/',
            '',
            'Then run:',
            `  \`gh gist create "${logPath}" --secret --filename claude-session.jsonl\``,
            '',
            'Or use `--allow-public-fallback` to upload to 0x0.st instead.',
            '',
            '_Privacy note: the JSONL contains everything typed in this session,_',
            '_including tool outputs. Review before sharing._',
          ].join('\n'),
        }
      }

      // Prepare the content to upload
      let uploadContent: string
      if (opts.summaryOnly) {
        uploadContent = buildSummaryContent(logPath)
        if (!uploadContent) {
          return {
            type: 'text',
            value: 'No conversation content found in session log.',
          }
        }
      } else {
        uploadContent = readFileSync(logPath, 'utf8')
      }

      // Mask secrets if requested
      if (opts.maskSecrets) {
        uploadContent = maskSecrets(uploadContent)
      }

      // Write to a temp file so we can pass the (possibly modified) content
      const tmpDir = mkdtempSync(join(tmpdir(), 'cc-share-'))
      const tmpFile = join(tmpDir, 'claude-session.jsonl')
      try {
        writeFileSync(tmpFile, uploadContent, 'utf8')
      } catch (writeErr: unknown) {
        // Defensive: tmpfile write failed after mkdtempSync succeeded (TOCTOU)
        rmSync(tmpDir, { recursive: true, force: true })
        const msg = sanitizeErrorMessage(
          writeErr instanceof Error ? writeErr.message : String(writeErr),
        )
        return { type: 'text', value: `Failed to prepare share file: ${msg}` }
      }

      try {
        let url: string
        let method: string

        if (hasGh) {
          try {
            url = await uploadToGist(tmpFile, opts.isPublic)
            method = 'GitHub Gist'
          } catch (gistErr: unknown) {
            if (!opts.allowPublicFallback) throw gistErr
            // Gist failed — try 0x0.st fallback
            url = await uploadTo0x0(tmpFile)
            method = '0x0.st (fallback)'
          }
        } else {
          // No gh, but --allow-public-fallback was set
          url = await uploadTo0x0(tmpFile)
          method = '0x0.st (fallback)'
        }

        logEvent('tengu_share_succeeded', {
          visibility: (opts.isPublic
            ? 'public'
            : 'private') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          method:
            method as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {
          type: 'text',
          value: [
            '## Session shared',
            '',
            `URL:        ${url}`,
            `Session:    ${sessionId}`,
            `Visibility: ${opts.isPublic ? 'public' : 'secret'}`,
            `Method:     ${method}`,
            opts.summaryOnly ? 'Content:    summary only (truncated)' : '',
            opts.maskSecrets ? 'Secrets:    masked before upload' : '',
            '',
            '_Privacy note: the JSONL contains everything typed in this session._',
          ]
            .filter(l => l !== '')
            .join('\n'),
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        logEvent('tengu_share_failed', {
          reason:
            'upload_error' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {
          type: 'text',
          value: [
            '## Failed to share session',
            '',
            `Error: ${msg}`,
            '',
            hasGh
              ? 'Make sure you are logged in: `gh auth login`'
              : 'Install the `gh` CLI: https://cli.github.com/',
            `Log file: \`${logPath}\``,
          ].join('\n'),
        }
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    },
  }),
}

export default share
