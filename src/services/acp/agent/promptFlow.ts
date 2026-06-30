/**
 * Prompt-flow methods for AcpAgent, attached to the prototype via
 * Object.assign. Kept in a sibling module to keep AcpAgent.ts under the
 * 500-line budget. The barrel (./index.ts) imports this module for its
 * side effect so the prototype is populated before any instance is built.
 *
 * Methods attached: prompt, setSessionConfigOption.
 */
import { randomUUID } from 'node:crypto'
import type {
  PromptRequest,
  PromptResponse,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
} from '@agentclientprotocol/sdk'
import type { SessionId } from '../../../types/ids.js'
import {
  switchSession,
  getSessionProjectDir,
} from '../../../bootstrap/state.js'
import { forwardSessionUpdates } from '../bridge.js'
import type { ToolUseCache } from '../bridge.js'
import { promptToQueryInput } from '../promptConversion.js'
import { sanitizeTitle } from '../utils.js'
import { AcpAgent } from './AcpAgent.js'
import type { AcpSession } from './sessionTypes.js'
import { flattenConfigOptionValues } from './configOptions.js'
import { popNextPendingPrompt } from './promptQueue.js'
import {
  getConnection,
  readClientCapabilities,
  syncSessionConfigState,
} from './internalAccessors.js'

// ── prompt ───────────────────────────────────────────────────────

async function prompt(
  this: AcpAgent,
  params: PromptRequest,
): Promise<PromptResponse> {
  const session = this.sessions.get(params.sessionId)
  if (!session) {
    throw new Error(`Session ${params.sessionId} not found`)
  }

  // Per message-id.mdx RFD: if the client supplied a `messageId` on the
  // PromptRequest, echo it back as `userMessageId` to confirm receipt.
  // We do not self-generate when omitted — the spec makes that optional and
  // staying quiet avoids surfacing IDs the client didn't ask to track.
  const userMessageId = params.messageId ?? undefined

  // Extract text/image content from the prompt
  const promptInput = promptToQueryInput(params.prompt)

  // Per prompt-turn.mdx, `prompt` is a required ContentBlock[] and an
  // effectively-empty prompt is malformed input — reject it with an
  // invalid_params error rather than fabricating a successful end_turn.
  if (!promptInput.trim()) {
    throw new Error('Prompt content is empty')
  }

  const promptCancelGeneration = session.cancelGeneration

  // Handle prompt queuing — if a prompt is already running, queue this one
  if (session.promptRunning) {
    const promptUuid = randomUUID()
    const cancelled = await new Promise<boolean>(resolve => {
      session.pendingQueue.push(promptUuid)
      session.pendingMessages.set(promptUuid, { resolve })
    })
    if (cancelled) {
      return { stopReason: 'cancelled' }
    }
  }

  if (session.cancelGeneration !== promptCancelGeneration) {
    return { stopReason: 'cancelled' }
  }

  // Reset cancellation only when this prompt is about to run. Queued prompts
  // must not clear the cancellation state for the active prompt.
  session.cancelled = false
  session.promptRunning = true

  try {
    // Reset the query engine's abort controller for a fresh query.
    // After a previous interrupt(), the internal controller is stuck in
    // aborted state — without this, submitMessage() fails immediately.
    session.queryEngine.resetAbortController()
    // Switch global session state so recordTranscript writes to the correct
    // session file. Without this, multi-session scenarios (or creating a new
    // session after another) write transcript data to the wrong file.
    switchSession(params.sessionId as SessionId, getSessionProjectDir())

    const sdkMessages = session.queryEngine.submitMessage(promptInput)

    const { stopReason, usage } = await forwardSessionUpdates(
      params.sessionId,
      sdkMessages,
      getConnection(this),
      session.queryEngine.getAbortSignal(),
      session.toolUseCache,
      readClientCapabilities(this),
      session.cwd,
      () => session.cancelled,
    )

    // If the session was cancelled during processing, return cancelled
    if (session.cancelled) {
      return { stopReason: 'cancelled' }
    }

    // Emit a session_info_update so Clients learn the session's display
    // title / last-activity timestamp via the stable v1 session/update
    // channel. The title is derived from the first user prompt.
    await emitSessionInfoUpdate(this, params.sessionId, promptInput)

    // Per session-usage.mdx RFD and the bundled SDK schema, PromptResponse
    // carries an optional `usage` field at the root with cumulative token
    // totals for the session. The field is UNSTABLE in v1 but is implemented
    // by all major ACP clients. We additionally mirror the same payload into
    // `_meta.claudeCode.usage` for consumers that read the vendor namespace.
    // thoughtTokens are reported as 0 until the bridge tracks them, but are
    // included in totalTokens so totals match the sum of components.
    if (usage) {
      const thoughtTokens = 0
      const usagePayload = {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedReadTokens: usage.cachedReadTokens,
        cachedWriteTokens: usage.cachedWriteTokens,
        thoughtTokens,
        totalTokens:
          usage.inputTokens +
          usage.outputTokens +
          usage.cachedReadTokens +
          usage.cachedWriteTokens +
          thoughtTokens,
      }
      return {
        stopReason,
        usage: usagePayload,
        ...(userMessageId ? { userMessageId } : {}),
        _meta: {
          claudeCode: {
            usage: usagePayload,
          },
        },
      }
    }
    return {
      stopReason,
      ...(userMessageId ? { userMessageId } : {}),
    }
  } catch (err: unknown) {
    // Treat AbortError / cancellation-shaped errors as a turn cancellation
    // regardless of the session.cancelled flag, to close the race window
    // between interrupt() firing and cancel() setting the flag. Per
    // prompt-turn.mdx the Agent MUST return `cancelled` for aborts.
    const isAbort =
      err instanceof Error &&
      (err.name === 'AbortError' ||
        /abort|cancelled|interrupt/i.test(err.message))
    if (session.cancelled || isAbort) {
      return { stopReason: 'cancelled' }
    }

    // Check for process death errors
    if (
      err instanceof Error &&
      (err.message.includes('terminated') ||
        err.message.includes('process exited'))
    ) {
      await this.teardownSession(params.sessionId)
      throw new Error(
        'The Claude Agent process exited unexpectedly. Please start a new session.',
      )
    }

    throw err
  } finally {
    // Resolve next pending prompt if any
    const nextPrompt = popNextPendingPrompt(session)
    if (nextPrompt) {
      session.promptRunning = true
      nextPrompt.resolve(false)
    } else {
      session.promptRunning = false
    }
  }
}

// ── setSessionConfigOption ───────────────────────────────────────

async function setSessionConfigOption(
  this: AcpAgent,
  params: SetSessionConfigOptionRequest,
): Promise<SetSessionConfigOptionResponse> {
  const session = this.sessions.get(params.sessionId)
  if (!session) {
    throw new Error('Session not found')
  }
  if (typeof params.value !== 'string') {
    throw new Error(
      `Invalid value for config option ${params.configId}: ${String(params.value)}`,
    )
  }

  const option = session.configOptions.find(o => o.id === params.configId)
  if (!option) {
    throw new Error(`Unknown config option: ${params.configId}`)
  }

  // Per session-config-options.mdx: value MUST be one of the values listed
  // in the option's options array. Reject unknown values with an error
  // rather than silently persisting them. Only `select` options carry an
  // options array; `boolean` options have no enumerated values.
  if (option.type === 'select') {
    const validValues = flattenConfigOptionValues(
      (option as { options?: unknown }).options,
    )
    if (!validValues.includes(params.value)) {
      throw new Error(
        `Invalid value '${params.value}' for config option ${params.configId}; must be one of: ${validValues.join(', ')}`,
      )
    }
  }

  const value = params.value

  if (params.configId === 'mode') {
    this.applySessionMode(params.sessionId, value)
    await getConnection(this).sessionUpdate({
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'current_mode_update',
        currentModeId: value,
      },
    })
  } else if (params.configId === 'model') {
    session.queryEngine.setModel(value)
  }

  syncSessionConfigState(this, session, params.configId, value)

  session.configOptions = session.configOptions.map(o =>
    o.id === params.configId && typeof o.currentValue === 'string'
      ? { ...o, currentValue: value }
      : o,
  )

  return { configOptions: session.configOptions }
}

// ── Private-field accessors ──────────────────────────────────────
//
// getConnection / readClientCapabilities / syncSessionConfigState are
// imported from ./internalAccessors.js (shared with sessionLifecycle.ts and
// createSessionMethod.ts). The session_info_update helper below is local to
// this module because it is only called from prompt().

/**
 * Emit a session_info_update notification carrying a derived session title
 * (truncated first user prompt) and the current last-activity timestamp.
 * Sent once per session — subsequent turns reuse the same title.
 *
 * This logic was originally the private `AcpAgent.maybeEmitSessionInfoUpdate`
 * method on the shell class. It is only called from the prompt flow, so it
 * lives here to avoid the `noUnusedPrivateClassMembers` false positive that
 * cast-based access would otherwise trigger on the shell.
 */
async function emitSessionInfoUpdate(
  agent: AcpAgent,
  sessionId: string,
  firstPrompt: string,
): Promise<void> {
  const session = agent.sessions.get(sessionId)
  if (!session) return
  // sessionInfoTitleSent is tracked via toolUseCache to avoid reshaping
  // AcpSession; use a dedicated per-session flag instead.
  const cache = session.toolUseCache as ToolUseCache & {
    __sessionInfoTitleSent?: boolean
  }
  if (cache.__sessionInfoTitleSent) return
  cache.__sessionInfoTitleSent = true
  const title = sanitizeTitle(firstPrompt).slice(0, 100)
  try {
    await getConnection(agent).sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'session_info_update',
        ...(title ? { title } : {}),
        updatedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('[ACP] Failed to send session_info_update:', err)
  }
}

// ── Prototype attachment ─────────────────────────────────────────

Object.assign(AcpAgent.prototype, {
  prompt,
  setSessionConfigOption,
})
