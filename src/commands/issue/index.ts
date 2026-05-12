import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Command, LocalCommandResult } from '../../types/command.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import {
  getSessionId,
  getSessionProjectDir,
  getOriginalCwd,
} from '../../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { sanitizePath } from '../../utils/path.js'

import * as childProcess from 'node:child_process'
import { promisify } from 'node:util'

// Re-resolved at call time via namespace import so that test runners using
// mock.module('node:child_process') see the replacement.
function execFileAsync(
  cmd: string,
  args: string[],
  opts: { timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  return promisify(childProcess.execFile)(cmd, args, opts)
}

function execFileSyncFn(
  cmd: string,
  args: string[],
  opts?: { stdio?: unknown; timeout?: number },
): Buffer {
  return childProcess.execFileSync(
    cmd,
    args,
    opts as Parameters<typeof childProcess.execFileSync>[2],
  ) as Buffer
}

function tryDetectGitRemoteUrl(): string | null {
  try {
    const out = execFileSyncFn('git', ['remote', 'get-url', 'origin'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    })
    return out.toString().trim() || null
  } catch {
    return null
  }
}

function parseOwnerRepo(
  remote: string,
): { owner: string; repo: string } | null {
  const ssh = remote.match(/^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
  if (ssh) return { owner: ssh[1], repo: ssh[2] }
  const https = remote.match(
    /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/,
  )
  if (https) return { owner: https[1], repo: https[2] }
  return null
}

function ghCliAvailable(): boolean {
  try {
    execFileSyncFn('gh', ['--version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Checks whether issues are enabled in the repo (gh API call).
 * Returns null when we can't determine (no auth, no network).
 */
async function repoHasIssuesEnabled(
  owner: string,
  repo: string,
): Promise<boolean | null> {
  try {
    const result = await execFileAsync(
      'gh',
      ['api', `repos/${owner}/${repo}`, '--jq', '.has_issues'],
      { timeout: 8000 },
    )
    const val = result.stdout.trim()
    if (val === 'true') return true
    if (val === 'false') return false
    return null
  } catch {
    return null
  }
}

/**
 * Returns the first .github/ISSUE_TEMPLATE/*.md body (front-matter stripped),
 * or null if none exists.
 */
function detectIssueTemplate(cwd: string): string | null {
  const templateDir = join(cwd, '.github', 'ISSUE_TEMPLATE')
  if (!existsSync(templateDir)) return null
  try {
    const files = readdirSync(templateDir).filter(
      f => f.endsWith('.md') || f.endsWith('.yml') || f.endsWith('.yaml'),
    )
    if (files.length === 0) return null

    // Use the first markdown template
    const mdFile = files.find(f => f.endsWith('.md'))
    if (!mdFile) return null

    const content = readFileSync(join(templateDir, mdFile), 'utf8')
    // Strip YAML front-matter (---...---)
    const stripped = content.replace(/^---[\s\S]*?---\n?/, '').trim()
    return stripped || null
  } catch {
    return null
  }
}

/**
 * Extracts the last N turns from the session log, truncating each to 200 chars.
 * Includes the current error if any tool_result has an error indicator.
 */
function getTranscriptSummary(maxTurns = 5): string {
  try {
    const sessionId = getSessionId()
    const projectDir = getSessionProjectDir()
    const logPath = projectDir
      ? join(projectDir, `${sessionId}.jsonl`)
      : join(
          getClaudeConfigHomeDir(),
          'projects',
          sanitizePath(getOriginalCwd()),
          `${sessionId}.jsonl`,
        )
    if (!existsSync(logPath)) return '(no session log found)'
    const lines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)

    const summaryParts: string[] = []
    const errors: string[] = []

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>
        const role = entry.role as string | undefined

        // Collect errors from tool_result blocks
        if (Array.isArray(entry.content)) {
          for (const block of entry.content as Array<Record<string, unknown>>) {
            if (
              block.type === 'tool_result' &&
              block.is_error === true &&
              typeof block.content === 'string'
            ) {
              errors.push(block.content.slice(0, 200))
            }
          }
        }

        if (role === 'user' || role === 'assistant') {
          const content = entry.content
          let text = ''
          if (typeof content === 'string') {
            text = content.slice(0, 200)
          } else if (Array.isArray(content)) {
            const firstText = (content as Array<Record<string, unknown>>).find(
              b => b.type === 'text',
            )
            text = (firstText?.text as string | undefined)?.slice(0, 200) ?? ''
          }
          if (text) summaryParts.push(`[${role}] ${text}`)
        }
      } catch {
        // skip malformed lines
      }
    }

    const recentParts = summaryParts.slice(-maxTurns * 2) // user + assistant per turn
    let result =
      recentParts.length > 0
        ? recentParts.join('\n')
        : '(no conversation content in log)'

    if (errors.length > 0) {
      result += '\n\n### Recent errors\n' + errors.slice(-3).join('\n')
    }
    return result
  } catch {
    return '(could not read session log)'
  }
}

interface IssueOptions {
  title: string
  labels: string[]
  assignees: string[]
  valid: boolean
  parseError?: string
}

/**
 * Parses /issue args.
 *
 * Format: /issue [--label <label>]* [--assignee <user>]* <title words...>
 *
 * Examples:
 *   /issue Fix login bug
 *   /issue --label bug --assignee alice Fix login bug
 */
function parseIssueArgs(args: string): IssueOptions {
  const parts = args.trim().split(/\s+/)
  const labels: string[] = []
  const assignees: string[] = []
  const titleParts: string[] = []

  let i = 0
  while (i < parts.length) {
    if (parts[i] === '--label' || parts[i] === '-l') {
      const next = parts[i + 1]
      if (!next || next.startsWith('--')) {
        return {
          title: '',
          labels: [],
          assignees: [],
          valid: false,
          parseError: `--label requires a value`,
        }
      }
      labels.push(next)
      i += 2
    } else if (parts[i] === '--assignee' || parts[i] === '-a') {
      const next = parts[i + 1]
      if (!next || next.startsWith('--')) {
        return {
          title: '',
          labels: [],
          assignees: [],
          valid: false,
          parseError: `--assignee requires a value`,
        }
      }
      assignees.push(next)
      i += 2
    } else if (parts[i].startsWith('--')) {
      return {
        title: '',
        labels: [],
        assignees: [],
        valid: false,
        parseError: `Unknown flag: ${parts[i]}`,
      }
    } else {
      titleParts.push(parts[i])
      i++
    }
  }

  return {
    title: titleParts.join(' '),
    labels,
    assignees,
    valid: true,
  }
}

const issue: Command = {
  type: 'local',
  name: 'issue',
  description:
    'Create a GitHub issue via gh CLI. Flags: --label <label>, --assignee <user>',
  isHidden: false,
  isEnabled: () => true,
  supportsNonInteractive: true,
  bridgeSafe: true,
  load: async () => ({
    call: async (args: string): Promise<LocalCommandResult> => {
      const opts = parseIssueArgs(args)

      if (!opts.valid) {
        return {
          type: 'text',
          value: [
            `Error: ${opts.parseError}`,
            '',
            'Usage: /issue [--label <label>] [--assignee <user>] <title>',
            '',
            '  Example: /issue --label bug --assignee alice Fix login when token expires',
          ].join('\n'),
        }
      }

      const { title, labels, assignees } = opts

      const remote = tryDetectGitRemoteUrl()
      const parsed = remote ? parseOwnerRepo(remote) : null
      const hasGh = ghCliAvailable()
      const cwd = getOriginalCwd()

      if (!title) {
        const urlHint = parsed
          ? `https://github.com/${parsed.owner}/${parsed.repo}/issues/new`
          : '(no GitHub remote detected)'
        return {
          type: 'text',
          value: [
            'Usage: /issue [--label <label>] [--assignee <user>] <title>',
            '',
            `  Example: /issue Fix login bug when token expires`,
            `  Example: /issue --label bug --assignee alice Fix crash on startup`,
            '',
            parsed
              ? `Repo: ${parsed.owner}/${parsed.repo}`
              : 'No GitHub remote detected.',
            `New issue URL: ${urlHint}`,
            hasGh
              ? '\n`gh` CLI is available — run /issue <title> to create immediately.'
              : '\nInstall `gh` CLI (https://cli.github.com/) for one-command issue creation.',
          ].join('\n'),
        }
      }

      logEvent('tengu_issue_started', {
        has_gh: String(
          hasGh,
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        has_remote: String(
          !!parsed,
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        has_labels: String(
          labels.length > 0,
        ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      if (!hasGh || !parsed) {
        // Fallback: provide URL-encoded browser link.
        // Browsers silently truncate URLs beyond ~8KB so we cap the body at
        // MAX_URL_BODY characters. When the full body is larger we save a draft
        // to ~/.claude/issue-drafts/ and tell the user where to find it.
        const MAX_URL_BODY = 4096
        const sessionSummary = getTranscriptSummary()
        const fullBodyText = `## Context from Claude Code session\n\n${sessionSummary}`

        let bodyText = fullBodyText
        let draftPath: string | null = null
        if (fullBodyText.length > MAX_URL_BODY) {
          bodyText =
            fullBodyText.slice(0, MAX_URL_BODY) +
            '\n\n... (truncated, see CLI for full body)'
          try {
            const draftsDir = join(homedir(), '.claude', 'issue-drafts')
            mkdirSync(draftsDir, { recursive: true })
            const stamp = new Date().toISOString().replace(/[:.]/g, '-')
            draftPath = join(draftsDir, `issue-${stamp}.md`)
            writeFileSync(
              draftPath,
              `# Issue Draft\n\n**Title:** ${title}\n\n${fullBodyText}`,
              'utf8',
            )
          } catch {
            // Non-fatal; proceed without draft
          }
        }

        const body = encodeURIComponent(bodyText)
        const encodedTitle = encodeURIComponent(title)
        const labelQuery = labels
          .map(l => `labels=${encodeURIComponent(l)}`)
          .join('&')
        const url = parsed
          ? `https://github.com/${parsed.owner}/${parsed.repo}/issues/new?title=${encodedTitle}&body=${body}${labelQuery ? '&' + labelQuery : ''}`
          : null
        const lines: string[] = ['## File a GitHub issue', '']
        if (url) {
          lines.push(`Open in browser:\n${url}`)
          if (draftPath) {
            lines.push('')
            lines.push(`Full issue body saved to:\n  \`${draftPath}\``)
          }
        } else {
          lines.push('No GitHub remote detected in this directory.')
          lines.push(
            'Run from a directory with a GitHub git remote to get a pre-filled URL.',
          )
        }
        if (!hasGh) {
          lines.push('')
          lines.push(
            'Install `gh` CLI (https://cli.github.com/) to create issues without a browser.',
          )
        }
        logEvent('tengu_issue_fallback', {
          reason: (!hasGh
            ? 'no_gh'
            : 'no_remote') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return { type: 'text', value: lines.join('\n') }
      }

      // Check if issues are enabled on this repo — fall back to Discussions if not
      const hasIssues = await repoHasIssuesEnabled(parsed.owner, parsed.repo)
      if (hasIssues === false) {
        logEvent('tengu_issue_fallback', {
          reason:
            'issues_disabled' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        const discussionUrl = `https://github.com/${parsed.owner}/${parsed.repo}/discussions/new`
        return {
          type: 'text',
          value: [
            `## Issues are disabled for ${parsed.owner}/${parsed.repo}`,
            '',
            'The repository has Issues disabled. You can open a Discussion instead:',
            `  ${discussionUrl}`,
            '',
            '`gh` does not support creating Discussions from the CLI without an extension.',
          ].join('\n'),
        }
      }

      // Detect issue template
      const templateBody = detectIssueTemplate(cwd)

      // Build rich body: session context + template (if present) + errors
      const sessionSummary = getTranscriptSummary(5)
      const bodyParts: string[] = [
        '## Context from Claude Code session',
        '',
        sessionSummary,
      ]
      if (templateBody) {
        bodyParts.push('', '---', '', templateBody)
      }
      bodyParts.push(
        '',
        '---',
        '_Created via `/issue` command in Claude Code._',
      )
      const body = bodyParts.join('\n')

      // Build gh issue create args
      const ghArgs: string[] = [
        'issue',
        'create',
        '--title',
        title,
        '--body',
        body,
      ]
      for (const label of labels) {
        ghArgs.push('--label', label)
      }
      for (const assignee of assignees) {
        ghArgs.push('--assignee', assignee)
      }
      ghArgs.push('--repo', `${parsed.owner}/${parsed.repo}`)

      try {
        const result = await execFileAsync('gh', ghArgs, { timeout: 30000 })
        const issueUrl = result.stdout.trim()
        logEvent('tengu_issue_created', {
          repo: `${parsed.owner}/${parsed.repo}` as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          has_labels: String(
            labels.length > 0,
          ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {
          type: 'text',
          value: [
            '## Issue created',
            '',
            `Title: ${title}`,
            `URL:   ${issueUrl}`,
            labels.length > 0 ? `Labels: ${labels.join(', ')}` : '',
            assignees.length > 0 ? `Assignees: ${assignees.join(', ')}` : '',
          ]
            .filter(l => l !== '')
            .join('\n'),
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        logEvent('tengu_issue_failed', {
          error: msg.slice(
            0,
            200,
          ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        return {
          type: 'text',
          value: [
            '## Failed to create issue',
            '',
            `Error: ${msg}`,
            '',
            'Make sure you are logged in: `gh auth login`',
          ].join('\n'),
        }
      }
    },
  }),
}

export default issue
