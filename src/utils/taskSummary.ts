import { feature } from 'bun:bundle'
import { isBgSession, updateSessionActivity } from './concurrentSessions.js'
import { logForDebugging } from './debug.js'

/**
 * Minimum interval between task summary generations (ms).
 * Prevents excessive updates during rapid tool-call loops.
 */
const SUMMARY_INTERVAL_MS = 30_000

let lastSummaryTime = 0

/**
 * Whether a task summary should be generated this turn.
 * Only generates in bg sessions, and rate-limits to avoid churn.
 */
export function shouldGenerateTaskSummary(): boolean {
  if (!feature('BG_SESSIONS')) return false
  if (!isBgSession()) return false

  const now = Date.now()
  return now - lastSummaryTime >= SUMMARY_INTERVAL_MS
}

/**
 * Generate a task summary from the current turn's messages and push it
 * to the session registry so `claude ps` can display live status.
 *
 * Fire-and-forget from query.ts — errors are logged, never thrown.
 */
export function maybeGenerateTaskSummary(
  options: Record<string, unknown>,
): void {
  lastSummaryTime = Date.now()

  try {
    const messages = options.forkContextMessages as
      | Array<{
          type: string
          message?: { content?: unknown }
        }>
      | undefined

    if (!messages || messages.length === 0) return

    // Extract a short status from the most recent assistant message
    const lastAssistant = [...messages]
      .reverse()
      .find(m => m.type === 'assistant')

    let status: 'busy' | 'idle' = 'busy'
    let waitingFor: string | undefined

    if (lastAssistant?.message?.content) {
      const content = lastAssistant.message.content
      // Check if last block is tool_use
      if (Array.isArray(content)) {
        const lastBlock = content[content.length - 1] as
          | Record<string, unknown>
          | undefined
        if (lastBlock?.type === 'tool_use') {
          status = 'busy'
          waitingFor = `tool: ${lastBlock.name || 'unknown'}`
        }
      }
    }

    // Fire-and-forget update to session registry
    void updateSessionActivity({
      status,
      waitingFor,
    }).catch(err => {
      logForDebugging(`[taskSummary] updateSessionActivity failed: ${err}`)
    })
  } catch (err) {
    logForDebugging(`[taskSummary] error: ${err}`)
  }
}
