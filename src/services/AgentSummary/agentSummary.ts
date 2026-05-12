/**
 * Periodic background summarization for coordinator mode sub-agents.
 *
 * Forks the sub-agent's conversation every ~30s using runForkedAgent()
 * to generate a 1-2 sentence progress summary. The summary is stored
 * on AgentProgress for UI display.
 *
 * Cache sharing: uses the same CacheSafeParams as the parent agent
 * to share the prompt cache. Tools are kept in the request for cache
 * key matching but denied via canUseTool callback.
 */

import type { TaskContext } from '../../Task.js'
import { isPoorModeActive } from '../../commands/poor/poorMode.js'
import { updateAgentSummary } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { AgentId } from '../../types/ids.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  type CacheSafeParams,
  runForkedAgent,
} from '../../utils/forkedAgent.js'
import { logError } from '../../utils/log.js'
import { getAgentTranscript } from '../../utils/sessionStorage.js'
import { buildSummaryContext } from './summaryContext.js'
import {
  buildSummaryPrompt,
  createSummaryPromptMessage,
} from './summaryPrompt.js'

const SUMMARY_INTERVAL_MS = 30_000

export type AgentSummaryDependencies = Partial<{
  clearTimeout: typeof clearTimeout
  getAgentTranscript: typeof getAgentTranscript
  isPoorModeActive: typeof isPoorModeActive
  logError: typeof logError
  logForDebugging: typeof logForDebugging
  runForkedAgent: typeof runForkedAgent
  setTimeout: typeof setTimeout
  updateAgentSummary: typeof updateAgentSummary
}>

export function startAgentSummarization(
  taskId: string,
  agentId: AgentId,
  cacheSafeParams: CacheSafeParams,
  setAppState: TaskContext['setAppState'],
  dependencies: AgentSummaryDependencies = {},
): { stop: () => void } {
  // Drop forkContextMessages from the closure — runSummary rebuilds it each
  // tick from getAgentTranscript(). Without this, the original fork messages
  // (passed from AgentTool.tsx) are pinned for the lifetime of the timer.
  const { forkContextMessages: _drop, ...baseParams } = cacheSafeParams
  let summaryAbortController: AbortController | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let previousSummary: string | null = null
  let lastHandledTranscriptFingerprint: string | null = null
  const clearTimeoutImpl = dependencies.clearTimeout ?? clearTimeout
  const getAgentTranscriptImpl =
    dependencies.getAgentTranscript ?? getAgentTranscript
  const isPoorModeActiveImpl = dependencies.isPoorModeActive ?? isPoorModeActive
  const logErrorImpl = dependencies.logError ?? logError
  const logForDebuggingImpl = dependencies.logForDebugging ?? logForDebugging
  const runForkedAgentImpl = dependencies.runForkedAgent ?? runForkedAgent
  const setTimeoutImpl = dependencies.setTimeout ?? setTimeout
  const updateAgentSummaryImpl =
    dependencies.updateAgentSummary ?? updateAgentSummary

  async function runSummary(): Promise<void> {
    if (stopped) return
    if (isPoorModeActiveImpl()) {
      logForDebuggingImpl('[AgentSummary] Skipping summary — poor mode active')
      scheduleNext()
      return
    }

    logForDebuggingImpl(`[AgentSummary] Timer fired for agent ${agentId}`)

    try {
      // Read current messages from transcript
      const transcript = await getAgentTranscriptImpl(agentId)
      if (!transcript || transcript.messages.length < 3) {
        // Not enough context yet — finally block will schedule next attempt
        logForDebuggingImpl(
          `[AgentSummary] Skipping summary for ${taskId}: not enough messages (${transcript?.messages.length ?? 0})`,
        )
        return
      }

      const summaryContext = buildSummaryContext(
        transcript.messages,
        lastHandledTranscriptFingerprint,
      )
      if (summaryContext.skipReason === 'unchanged') {
        logForDebuggingImpl(
          `[AgentSummary] Skipping summary for ${taskId}: transcript unchanged`,
        )
        return
      }

      if (summaryContext.skipReason === 'too_small') {
        logForDebuggingImpl(
          `[AgentSummary] Skipping summary for ${taskId}: no bounded context available`,
        )
        return
      }

      // Build fork params with current messages
      const forkParams: CacheSafeParams = {
        ...baseParams,
        forkContextMessages: summaryContext.messages,
      }

      logForDebuggingImpl(
        `[AgentSummary] Forking for summary, ${summaryContext.messages.length} messages in context`,
      )

      // Create abort controller for this summary
      summaryAbortController = new AbortController()

      // Deny tools via callback, NOT by passing tools:[] - that busts cache
      const canUseTool = async () => ({
        behavior: 'deny' as const,
        message: 'No tools needed for summary',
        decisionReason: { type: 'other' as const, reason: 'summary only' },
      })

      // DO NOT set maxOutputTokens here. The fork piggybacks on the main
      // thread's prompt cache by sending identical cache-key params (system,
      // tools, model, messages prefix, thinking config). Setting maxOutputTokens
      // would clamp budget_tokens, creating a thinking config mismatch that
      // invalidates the cache.
      //
      // ContentReplacementState is cloned by default in createSubagentContext
      // from forkParams.toolUseContext (the subagent's LIVE state captured at
      // onCacheSafeParams time). No explicit override needed.
      const result = await runForkedAgentImpl({
        promptMessages: [
          createSummaryPromptMessage(buildSummaryPrompt(previousSummary)),
        ],
        cacheSafeParams: forkParams,
        canUseTool,
        querySource: 'agent_summary',
        forkLabel: 'agent_summary',
        overrides: { abortController: summaryAbortController },
        skipTranscript: true,
      })

      if (stopped) return

      // Extract summary text from result
      for (const msg of result.messages) {
        if (msg.type !== 'assistant') continue
        // Skip API error messages
        if (msg.isApiErrorMessage) {
          logForDebugging(
            `[AgentSummary] Skipping API error message for ${taskId}`,
          )
          continue
        }
        const contentArr = Array.isArray(msg.message!.content)
          ? msg.message!.content
          : []
        const textBlock = contentArr.find(b => b.type === 'text')
        if (textBlock?.type === 'text' && textBlock.text.trim()) {
          const summaryText = textBlock.text.trim()
          logForDebuggingImpl(
            `[AgentSummary] Summary result for ${taskId}: ${summaryText}`,
          )
          lastHandledTranscriptFingerprint = summaryContext.fingerprint
          previousSummary = summaryText
          updateAgentSummaryImpl(taskId, summaryText, setAppState)
          break
        }
      }
    } catch (e) {
      if (!stopped && e instanceof Error) {
        logErrorImpl(e)
      }
    } finally {
      summaryAbortController = null
      // Reset timer on completion (not initiation) to prevent overlapping summaries
      if (!stopped) {
        scheduleNext()
      }
    }
  }

  function scheduleNext(): void {
    if (stopped) return
    timeoutId = setTimeoutImpl(runSummary, SUMMARY_INTERVAL_MS)
  }

  function stop(): void {
    logForDebuggingImpl(`[AgentSummary] Stopping summarization for ${taskId}`)
    stopped = true
    if (timeoutId) {
      clearTimeoutImpl(timeoutId)
      timeoutId = null
    }
    if (summaryAbortController) {
      summaryAbortController.abort()
      summaryAbortController = null
    }
  }

  // Start the first timer
  scheduleNext()

  return { stop }
}
