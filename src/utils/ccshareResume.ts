/**
 * ccshare Resume — load a shared conversation from a ccshare URL.
 *
 * ccshare URLs have the format:
 *   https://go/ccshare/<id>        (Anthropic internal go-link)
 *   ccshare://<id>                 (direct scheme)
 *   <id>                           (bare ID matching ccshare pattern)
 *
 * The ID format is typically: <user>-<date>-<time> (e.g. boris-20260311-211036)
 */
import type { LogOption } from 'src/types/logs.js'
import { logForDebugging } from './debug.js'

const CCSHARE_URL_PATTERN =
  /(?:https?:\/\/go\/ccshare\/|ccshare:\/\/)([a-zA-Z0-9_-]+-\d{8}-\d{6})/
const CCSHARE_BARE_PATTERN = /^[a-zA-Z0-9_-]+-\d{8}-\d{6}$/

/**
 * Extract a ccshare ID from a resume string.
 * Returns null if the string is not a ccshare URL/ID.
 */
export function parseCcshareId(resume: string): string | null {
  if (!resume) return null

  // Try URL format first
  const urlMatch = resume.match(CCSHARE_URL_PATTERN)
  if (urlMatch) return urlMatch[1]!

  // Try bare ID format
  if (CCSHARE_BARE_PATTERN.test(resume.trim())) {
    return resume.trim()
  }

  return null
}

/**
 * Load a shared conversation by ccshare ID.
 *
 * Fetches the conversation transcript from Anthropic's ccshare API
 * and returns it as a LogOption for resume processing.
 */
export async function loadCcshare(ccshareId: string): Promise<LogOption> {
  logForDebugging(`ccshare: loading ${ccshareId}`)

  // Try the Anthropic API endpoint for ccshare
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'
  const url = `${baseUrl}/v1/code/ccshare/${ccshareId}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }

  // Use OAuth token if available
  try {
    const { getClaudeAIOAuthTokens } = await import('./auth.js')
    const tokens = getClaudeAIOAuthTokens()
    if (tokens?.accessToken) {
      headers.Authorization = `Bearer ${tokens.accessToken}`
    }
  } catch {
    // No auth available — try without
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(
      `ccshare load failed: ${response.status} ${response.statusText}`,
    )
  }

  const data = (await response.json()) as {
    messages?: unknown[]
    created_at?: string
    session_id?: string
  }

  if (!data.messages || !Array.isArray(data.messages)) {
    throw new Error('ccshare: invalid response — no messages array')
  }

  const now = new Date()
  return {
    date: data.created_at ?? now.toISOString(),
    messages: data.messages as LogOption['messages'],
    value: data.messages.length,
    created: now,
    modified: now,
    firstPrompt: '(ccshare resume)',
    messageCount: data.messages.length,
    isSidechain: false,
  }
}
