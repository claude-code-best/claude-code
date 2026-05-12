/**
 * generateRecap — On-demand "while you were away" session recap.
 *
 * Implementation mirrors the official v2.1.123 tt8() function:
 *   - Reads getLastCacheSafeParams() (set after each turn) to share prompt cache
 *   - Forks a single-turn query with the recap prompt
 *   - Returns a discriminated union: ok / api-error / no-turn / aborted / failed
 *
 * The fork uses skipTranscript + skipCacheWrite to stay ephemeral and avoid
 * polluting the main session log or creating unnecessary cache entries.
 */

import { APIUserAbortError } from '@anthropic-ai/sdk'
import { logForDebugging } from '../../utils/debug.js'
import {
  getLastCacheSafeParams,
  runForkedAgent,
} from '../../utils/forkedAgent.js'
import {
  createUserMessage,
  getAssistantMessageText,
} from '../../utils/messages.js'

// Matches the official G$9 constant in v2.1.123:
// "lead with goal + current task, then one next action, ≤40 words, no markdown"
const RECAP_PROMPT_EN =
  'The user stepped away and is coming back. Recap in under 40 words, 1-2 plain sentences, no markdown. Lead with the overall goal and current task, then the one next action. Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents.'

const RECAP_PROMPT_ZH =
  '用户离开后回来了。用中文写 1-2 句话，不超过 60 字，无 markdown。先说明高层目标和当前任务，再说明下一步操作。跳过根因分析和次要待办。'

export type RecapResult =
  | { kind: 'ok'; text: string }
  | { kind: 'api-error'; text: string }
  | { kind: 'no-turn' }
  | { kind: 'aborted' }
  | { kind: 'failed' }

async function getRecapPrompt(): Promise<string> {
  try {
    const { getResolvedLanguage } = await import('../../utils/language.js')
    return getResolvedLanguage() === 'zh' ? RECAP_PROMPT_ZH : RECAP_PROMPT_EN
  } catch {
    return RECAP_PROMPT_EN
  }
}

/**
 * Generates a single-sentence recap of the current session.
 * Uses the cached CacheSafeParams from the last turn so the request
 * can share the prompt-cache prefix with the main loop.
 *
 * @param signal - AbortSignal to cancel in-flight requests
 * @returns RecapResult discriminated union
 */
export async function generateRecap(signal: AbortSignal): Promise<RecapResult> {
  const cacheSafeParams = getLastCacheSafeParams()
  if (!cacheSafeParams) {
    logForDebugging('[recap] no CacheSafeParams saved, skipping')
    return { kind: 'no-turn' }
  }

  // Wrap the parent signal so we can abort our inner request independently
  const inner = new AbortController()
  signal.addEventListener('abort', () => inner.abort(), { once: true })

  try {
    const { messages } = await runForkedAgent({
      promptMessages: [createUserMessage({ content: await getRecapPrompt() })],
      cacheSafeParams,
      canUseTool: async () => ({
        behavior: 'deny' as const,
        message: 'Recap cannot use tools',
        decisionReason: { type: 'other' as const, reason: 'away_summary' },
      }),
      overrides: { abortController: inner },
      querySource: 'away_summary',
      forkLabel: 'away_summary',
      maxTurns: 1,
      skipCacheWrite: true,
      skipTranscript: true,
    })

    if (signal.aborted) {
      return { kind: 'aborted' }
    }

    // Check for API error response in the message list
    const errorMsg = messages.find(
      m => m.type === 'assistant' && m.isApiErrorMessage,
    )
    if (errorMsg) {
      return {
        kind: 'api-error',
        text: getAssistantMessageText(errorMsg) ?? '',
      }
    }

    // Extract the assistant text from the last assistant message
    const assistantMsg = messages
      .filter(m => m.type === 'assistant' && !m.isApiErrorMessage)
      .pop()

    if (!assistantMsg) {
      return { kind: 'failed' }
    }

    const text = getAssistantMessageText(assistantMsg)
    if (!text || text.trim().length === 0) {
      return { kind: 'failed' }
    }

    return { kind: 'ok', text: text.trim() }
  } catch (err) {
    if (
      err instanceof APIUserAbortError ||
      signal.aborted ||
      inner.signal.aborted
    ) {
      return { kind: 'aborted' }
    }
    logForDebugging(`[recap] generation failed: ${err}`)
    return { kind: 'failed' }
  }
}
