// Stream replay + forwarding loop.
//
// `nextSdkMessageOrAbort` races an async generator against an AbortSignal.
// `forwardSessionUpdates` consumes the SDKMessage stream and dispatches into
// the notification converters, accumulating usage and mapping stop reasons.
// `replayHistoryMessages` replays stored user/assistant history through
// `toAcpNotifications`.
import { randomUUID } from 'node:crypto'
import type {
  AgentSideConnection,
  ClientCapabilities,
  StopReason,
} from '@agentclientprotocol/sdk'
import type { SDKMessage } from '../../../entrypoints/sdk/coreTypes.generated.js'
import type { BridgeSDKMessage, SessionUsage, ToolUseCache } from './types.js'
import {
  assistantMessageToAcpNotifications,
  streamEventToAcpNotifications,
  toAcpNotifications,
} from './notifications.js'
import { getMatchingModelUsage } from './modelUsage.js'

// Top-level const alias retained from the original module. Only the
// forwardSessionUpdates default branch and replayHistoryMessages reference it.
const logger: { debug: (...args: unknown[]) => void } = console

export function nextSdkMessageOrAbort(
  sdkMessages: AsyncGenerator<SDKMessage, void, unknown>,
  abortSignal: AbortSignal,
): Promise<IteratorResult<SDKMessage, void>> {
  if (abortSignal.aborted) {
    return Promise.resolve({ done: true, value: undefined })
  }
  let abortHandler: (() => void) | undefined
  const abortPromise = new Promise<IteratorResult<SDKMessage, void>>(
    resolve => {
      abortHandler = () => resolve({ done: true, value: undefined })
      abortSignal.addEventListener('abort', abortHandler, { once: true })
    },
  )
  return Promise.race([sdkMessages.next(), abortPromise]).finally(() => {
    if (abortHandler) {
      abortSignal.removeEventListener('abort', abortHandler)
    }
  })
}

// ── Main forwarding function ──────────────────────────────────────

/**
 * Iterates SDKMessages from QueryEngine.submitMessage(), converts each
 * to ACP SessionUpdate notifications, and sends them via conn.sessionUpdate().
 * Returns the final StopReason and accumulated usage for the prompt turn.
 */
export async function forwardSessionUpdates(
  sessionId: string,
  sdkMessages: AsyncGenerator<SDKMessage, void, unknown>,
  conn: AgentSideConnection,
  abortSignal: AbortSignal,
  toolUseCache: ToolUseCache,
  clientCapabilities?: ClientCapabilities,
  cwd?: string,
  isCancelled?: () => boolean,
): Promise<{ stopReason: StopReason; usage?: SessionUsage }> {
  let stopReason: StopReason = 'end_turn'
  const accumulatedUsage: SessionUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedReadTokens: 0,
    cachedWriteTokens: 0,
  }

  // Track last assistant usage/model for context window size computation
  let lastAssistantTotalUsage: number | null = null
  let lastAssistantModel: string | null = null
  let lastContextWindowSize = 200000
  let streamingActive = false

  // Per message-id.mdx RFD: UUID identifying the current top-level agent
  // message. Lazily generated on the first sign of a new assistant message
  // (stream_event or assistant SDK message with parent_tool_use_id === null)
  // and reset to null after the assistant message completes. All chunks of
  // the same message share this ID; different messages get different IDs.
  // Subagent messages (parent_tool_use_id !== null) don't get a tracked ID
  // — they're nested inside a tool call and don't surface as top-level
  // agent_message_chunk / agent_thought_chunk in the spec sense.
  let currentAgentMessageId: string | null = null

  try {
    while (!abortSignal.aborted) {
      // Race the next message against the abort signal so we unblock
      // immediately when cancelled, even if the generator is waiting for
      // a slow API response.
      const nextResult = await nextSdkMessageOrAbort(sdkMessages, abortSignal)
      if (nextResult.done || abortSignal.aborted) break
      const rawMsg = nextResult.value
      if (rawMsg == null) continue
      const msg = rawMsg as BridgeSDKMessage

      switch (msg.type) {
        // ── System messages ────────────────────────────────────────
        case 'system': {
          const subtype = msg.subtype

          if (subtype === 'compact_boundary') {
            // Reset assistant usage tracking after compaction. We don't emit a
            // usage_update here because we don't know the post-compaction context
            // size — the next prompt's result will carry the corrected value.
            lastAssistantTotalUsage = 0
            await conn.sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: '\n\nCompacting completed.' },
              },
            })
          }
          // api_retry, local_command_output — skip for now
          break
        }

        // ── Result messages ────────────────────────────────────────
        case 'result': {
          const usage = msg.usage

          if (usage) {
            accumulatedUsage.inputTokens += usage.input_tokens ?? 0
            accumulatedUsage.outputTokens += usage.output_tokens ?? 0
            accumulatedUsage.cachedReadTokens +=
              usage.cache_read_input_tokens ?? 0
            accumulatedUsage.cachedWriteTokens +=
              usage.cache_creation_input_tokens ?? 0
          }

          // Resolve context window size from modelUsage via prefix matching
          const modelUsage = msg.modelUsage
          if (modelUsage && lastAssistantModel) {
            const match = getMatchingModelUsage(modelUsage, lastAssistantModel)
            if (match?.contextWindow) {
              lastContextWindowSize = match.contextWindow
            }
          }

          // Per session-usage.mdx RFD: emit usage_update so clients can display
          // context window utilization (e.g. "53K / 200K"). Although usage_update
          // is currently UNSTABLE in the v1 schema, it is the only standardized
          // carrier for context-window state and is implemented by all major ACP
          // clients (Zed, Cursor, etc.). Strict v1-stable compliance broke this
          // UX (clients showed 0/0), so we emit it whenever we have usage data.
          // See audit §4.1 for the prior strict-compliance rationale and revert.
          if (lastAssistantTotalUsage !== null) {
            await conn.sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: 'usage_update',
                used: lastAssistantTotalUsage,
                size: lastContextWindowSize,
              },
            })
          }

          // Determine stop reason
          const subtype = msg.subtype
          const isError = msg.is_error

          if (abortSignal.aborted) {
            stopReason = 'cancelled'
            break
          }

          switch (subtype) {
            case 'success': {
              // Map Anthropic stop_reason to ACP StopReason. Branches are mutually
              // exclusive so a max_tokens termination that is also flagged isError
              // no longer silently flips to end_turn (audit §3.3, §3.4). refusal
              // (safety refusal) is a first-class ACP stop reason that must surface
              // to the client instead of being misreported as end_turn.
              const r = msg.stop_reason
              if (r === 'max_tokens') stopReason = 'max_tokens'
              else if (r === 'refusal') stopReason = 'refusal'
              else stopReason = 'end_turn'
              if (isError) stopReason = 'end_turn'
              break
            }
            case 'error_during_execution': {
              // Mutually exclusive: max_tokens wins when reported, otherwise the
              // error path falls back to end_turn. Avoids the prior two-if
              // sequence that overwrote max_tokens with end_turn (audit §3.4).
              if (msg.stop_reason === 'max_tokens') {
                stopReason = 'max_tokens'
              } else {
                stopReason = 'end_turn'
              }
              break
            }
            case 'error_max_budget_usd':
            case 'error_max_turns':
            case 'error_max_structured_output_retries':
              if (isError) {
                stopReason = 'max_turn_requests'
              } else {
                stopReason = 'max_turn_requests'
              }
              break
          }
          break
        }

        // ── Stream events ──────────────────────────────────────────
        case 'stream_event': {
          // Lazily generate messageId for top-level assistant messages on the
          // first stream event. Subagent stream_events (parent_tool_use_id !==
          // null) don't get a tracked ID — they're nested inside a tool call.
          const streamParent = msg.parent_tool_use_id
          if (streamParent === null && currentAgentMessageId === null) {
            currentAgentMessageId = randomUUID()
          }
          // After the lazy-generate above, currentAgentMessageId is a string
          // when streamParent === null. Capture it locally so TS narrows.
          const streamMessageId =
            streamParent === null
              ? (currentAgentMessageId ?? undefined)
              : undefined
          const notifications = streamEventToAcpNotifications(
            msg,
            sessionId,
            toolUseCache,
            conn,
            {
              clientCapabilities,
              cwd,
              messageId: streamMessageId,
            },
          )
          for (const notification of notifications) {
            await conn.sessionUpdate(notification)
          }
          streamingActive = true
          break
        }

        // ── Assistant messages ─────────────────────────────────────
        case 'assistant': {
          // Track last assistant total usage for context window computation
          // (only for top-level messages, not subagents)
          const assistantMsg = msg.message
          const parentToolUseId = msg.parent_tool_use_id
          if (assistantMsg?.usage && parentToolUseId === null) {
            const usage = assistantMsg.usage
            lastAssistantTotalUsage =
              (typeof usage.input_tokens === 'number'
                ? usage.input_tokens
                : 0) +
              (typeof usage.output_tokens === 'number'
                ? usage.output_tokens
                : 0) +
              (typeof usage.cache_read_input_tokens === 'number'
                ? usage.cache_read_input_tokens
                : 0) +
              (typeof usage.cache_creation_input_tokens === 'number'
                ? usage.cache_creation_input_tokens
                : 0)
          }
          // Track the current top-level model for context window size lookup
          if (
            parentToolUseId === null &&
            assistantMsg?.model &&
            assistantMsg.model !== '<synthetic>'
          ) {
            lastAssistantModel = assistantMsg.model
          }

          // Reuse the messageId already generated for stream_events of this
          // top-level message; if no stream_events arrived (e.g., synthetic
          // message without streaming), generate one now. Then reset so the
          // next assistant message gets a fresh UUID.
          let assistantMessageId: string | undefined
          if (parentToolUseId === null) {
            if (currentAgentMessageId === null) {
              currentAgentMessageId = randomUUID()
            }
            assistantMessageId = currentAgentMessageId
          }

          const notifications = assistantMessageToAcpNotifications(
            msg,
            sessionId,
            toolUseCache,
            conn,
            {
              clientCapabilities,
              cwd,
              parentToolUseId,
              streamingActive,
              messageId: assistantMessageId,
            },
          )
          for (const notification of notifications) {
            await conn.sessionUpdate(notification)
          }

          // Reset after the top-level assistant message completes so the
          // next message (stream_event or assistant) gets a fresh UUID.
          if (parentToolUseId === null) {
            currentAgentMessageId = null
          }
          break
        }

        // ── User messages ──────────────────────────────────────────
        case 'user': {
          // In ACP mode, user messages from replay/synthetic are typically skipped
          // The client already knows what the user sent
          break
        }

        // ── Progress messages ──────────────────────────────────────
        case 'progress': {
          const progressData = msg.data
          if (!progressData) break

          // Handle agent/skill subagent progress
          const progressType = progressData.type
          if (
            progressType === 'agent_progress' ||
            progressType === 'skill_progress'
          ) {
            const progressMessage = progressData.message
            if (progressMessage) {
              const content = progressMessage.content as
                | Array<Record<string, unknown>>
                | undefined
              if (content) {
                for (const block of content) {
                  if (block.type === 'text') {
                    await conn.sessionUpdate({
                      sessionId,
                      update: {
                        sessionUpdate: 'agent_message_chunk',
                        content: { type: 'text', text: block.text as string },
                      },
                    })
                  }
                }
              }
            }
          }
          break
        }

        // ── Tool use summary ───────────────────────────────────────
        case 'tool_use_summary': {
          // Skip for now — not critical for basic functionality
          break
        }

        // ── Attachment messages ────────────────────────────────────
        case 'attachment': {
          // Skip — handled by QueryEngine internally
          break
        }

        // ── Compact boundary ───────────────────────────────────────
        case 'compact_boundary': {
          // Don't emit usage_update here — we don't know the post-compaction
          // context size. The next prompt's result will carry the corrected value.
          lastAssistantTotalUsage = 0
          await conn.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '\n\nCompacting completed.' },
            },
          })
          break
        }

        default:
          logger.debug('Ignoring unknown SDK message type')
          break
      }
    }

    // If we exited the loop because abort fired or cancel was requested, return cancelled
    if (abortSignal.aborted || isCancelled?.()) {
      return { stopReason: 'cancelled', usage: accumulatedUsage }
    }
  } catch (err: unknown) {
    if (abortSignal.aborted) {
      return { stopReason: 'cancelled', usage: accumulatedUsage }
    }
    throw err
  }

  return { stopReason, usage: accumulatedUsage }
}

// ── History replay ──────────────────────────────────────────────────

/**
 * Replays conversation history messages to the ACP client as session updates.
 * Used when resuming/loading a session to show the client the previous conversation.
 */
export async function replayHistoryMessages(
  sessionId: string,
  messages: Array<Record<string, unknown>>,
  conn: AgentSideConnection,
  toolUseCache: ToolUseCache,
  clientCapabilities?: ClientCapabilities,
  cwd?: string,
): Promise<void> {
  for (const rawMsg of messages) {
    const msg = rawMsg as BridgeSDKMessage
    // Skip non-conversation messages
    if (msg.type !== 'user' && msg.type !== 'assistant') {
      logger.debug('Ignoring unknown SDK message type')
      continue
    }
    // Skip meta messages (synthetic continuation prompts)
    if (msg.isMeta === true) continue

    const messageData = msg.message
    const content = messageData?.content
    if (!content) continue

    const role: 'assistant' | 'user' =
      msg.type === 'assistant' ? 'assistant' : 'user'

    if (typeof content === 'string') {
      if (!content.trim()) continue
      // Per message-id.mdx RFD: each replayed message gets its own UUID
      // (JSONL doesn't preserve the original ACP messageId). All chunks of
      // the same message share the ID.
      const replayMessageId = randomUUID()
      await conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate:
            role === 'assistant' ? 'agent_message_chunk' : 'user_message_chunk',
          ...(replayMessageId ? { messageId: replayMessageId } : {}),
          content: { type: 'text', text: content },
        },
      })
      continue
    }

    if (Array.isArray(content)) {
      // Each replayed message gets a fresh UUID independent of other messages.
      const replayMessageId = randomUUID()
      const notifications = toAcpNotifications(
        content as Array<Record<string, unknown>>,
        role,
        sessionId,
        toolUseCache,
        conn,
        undefined,
        { clientCapabilities, cwd, messageId: replayMessageId },
      )
      for (const notification of notifications) {
        await conn.sessionUpdate(notification)
      }
    }
  }
}
