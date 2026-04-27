/**
 * Bridge module: converts Claude Code's SDKMessage stream events from
 * QueryEngine.submitMessage() into ACP SessionUpdate notifications.
 *
 * Handles all SDKMessage types:
 *  - system (compact_boundary, api_retry, local_command_output)
 *  - user (message replay)
 *  - assistant (full messages with content blocks)
 *  - stream_event (real-time streaming: content_block_start/delta)
 *  - result (turn termination with usage/cost)
 *  - progress (subagent progress)
 *  - tool_use_summary
 */
import type {
  AgentSideConnection,
  ClientCapabilities,
  ContentBlock,
  PlanEntry,
  SessionNotification,
  SessionUpdate,
  StopReason,
  ToolCallContent,
  ToolCallLocation,
  ToolKind,
} from '@agentclientprotocol/sdk'
import type { SDKMessage } from '../../entrypoints/sdk/coreTypes.generated.js'
import { toDisplayPath, markdownEscape } from './utils.js'

// ── ToolUseCache ──────────────────────────────────────────────────

export type ToolUseCache = {
  [key: string]: {
    type: 'tool_use' | 'server_tool_use' | 'mcp_tool_use'
    id: string
    name: string
    input: unknown
  }
}

// ── Session usage tracking ────────────────────────────────────────

export type SessionUsage = {
  inputTokens: number
  outputTokens: number
  cachedReadTokens: number
  cachedWriteTokens: number
}

// ── Tool info conversion ──────────────────────────────────────────

interface ToolInfo {
  title: string
  kind: ToolKind
  content: ToolCallContent[]
  locations?: ToolCallLocation[]
}

export function toolInfoFromToolUse(
  toolUse: { name: string; id: string; input: Record<string, unknown> },
  _supportsTerminalOutput: boolean = false,
  cwd?: string,
): ToolInfo {
  const name = toolUse.name
  const input = toolUse.input

  switch (name) {
    case 'Agent':
    case 'Task': {
      const description = (input?.description as string | undefined) ?? 'Task'
      const prompt = input?.prompt as string | undefined
      return {
        title: description,
        kind: 'think',
        content: prompt
          ? [{ type: 'content' as const, content: { type: 'text' as const, text: prompt } }]
          : [],
      }
    }

    case 'Bash': {
      const command = (input?.command as string | undefined) ?? 'Terminal'
      const description = input?.description as string | undefined
      return {
        title: command,
        kind: 'execute',
        content: _supportsTerminalOutput
          ? [{ type: 'terminal' as const, terminalId: toolUse.id }]
          : description
            ? [{ type: 'content' as const, content: { type: 'text' as const, text: description } }]
            : [],
      }
    }

    case 'Read': {
      const filePath = (input?.file_path as string | undefined) ?? 'File'
      const offset = input?.offset as number | undefined
      const limit = input?.limit as number | undefined
      let suffix = ''
      if (limit && limit > 0) {
        suffix = ` (${offset ?? 1} - ${(offset ?? 1) + limit - 1})`
      } else if (offset) {
        suffix = ` (from line ${offset})`
      }
      const displayPath = filePath ? toDisplayPath(filePath, cwd) : 'File'
      return {
        title: `Read ${displayPath}${suffix}`,
        kind: 'read',
        locations: filePath ? [{ path: filePath, line: offset ?? 1 }] : [],
        content: [],
      }
    }

    case 'Write': {
      const filePath = (input?.file_path as string | undefined) ?? ''
      const content = (input?.content as string | undefined) ?? ''
      const displayPath = filePath ? toDisplayPath(filePath, cwd) : undefined
      return {
        title: displayPath ? `Write ${displayPath}` : 'Write',
        kind: 'edit',
        content: filePath
          ? [{ type: 'diff' as const, path: filePath, oldText: null, newText: content }]
          : [{ type: 'content' as const, content: { type: 'text' as const, text: content } }],
        locations: filePath ? [{ path: filePath }] : [],
      }
    }

    case 'Edit': {
      const filePath = (input?.file_path as string | undefined) ?? ''
      const oldString = (input?.old_string as string | undefined) ?? ''
      const newString = (input?.new_string as string | undefined) ?? ''
      const displayPath = filePath ? toDisplayPath(filePath, cwd) : undefined
      return {
        title: displayPath ? `Edit ${displayPath}` : 'Edit',
        kind: 'edit',
        content: filePath
          ? [{ type: 'diff' as const, path: filePath, oldText: oldString || null, newText: newString }]
          : [],
        locations: filePath ? [{ path: filePath }] : [],
      }
    }

    case 'Glob': {
      const globPath = (input?.path as string | undefined) ?? ''
      const pattern = (input?.pattern as string | undefined) ?? ''
      let label = 'Find'
      if (globPath) label += ` \`${globPath}\``
      if (pattern) label += ` \`${pattern}\``
      return {
        title: label,
        kind: 'search',
        content: [],
        locations: globPath ? [{ path: globPath }] : [],
      }
    }

    case 'Grep': {
      const grepPattern = (input?.pattern as string | undefined) ?? ''
      const grepPath = (input?.path as string | undefined) ?? ''
      let label = 'grep'
      if (input?.['-i']) label += ' -i'
      if (input?.['-n']) label += ' -n'
      if (input?.['-A'] !== undefined) label += ` -A ${input['-A'] as number}`
      if (input?.['-B'] !== undefined) label += ` -B ${input['-B'] as number}`
      if (input?.['-C'] !== undefined) label += ` -C ${input['-C'] as number}`
      if (input?.output_mode === 'files_with_matches') label += ' -l'
      else if (input?.output_mode === 'count') label += ' -c'
      if (input?.head_limit !== undefined) label += ` | head -${input.head_limit as number}`
      if (input?.glob) label += ` --include="${input.glob as string}"`
      if (input?.type) label += ` --type=${input.type as string}`
      if (input?.multiline) label += ' -P'
      if (grepPattern) label += ` "${grepPattern}"`
      if (grepPath) label += ` ${grepPath}`
      return {
        title: label,
        kind: 'search',
        content: [],
      }
    }

    case 'WebFetch': {
      const url = (input?.url as string | undefined) ?? ''
      const fetchPrompt = input?.prompt as string | undefined
      return {
        title: url ? `Fetch ${url}` : 'Fetch',
        kind: 'fetch',
        content: fetchPrompt
          ? [{ type: 'content' as const, content: { type: 'text' as const, text: fetchPrompt } }]
          : [],
      }
    }

    case 'WebSearch': {
      const query = (input?.query as string | undefined) ?? 'Web search'
      let label = `"${query}"`
      const allowed = input?.allowed_domains as string[] | undefined
      const blocked = input?.blocked_domains as string[] | undefined
      if (allowed && allowed.length > 0) label += ` (allowed: ${allowed.join(', ')})`
      if (blocked && blocked.length > 0) label += ` (blocked: ${blocked.join(', ')})`
      return {
        title: label,
        kind: 'fetch',
        content: [],
      }
    }

    case 'TodoWrite': {
      const todos = input?.todos as Array<{ content: string }> | undefined
      return {
        title: Array.isArray(todos)
          ? `Update TODOs: ${todos.map((t) => t.content).join(', ')}`
          : 'Update TODOs',
        kind: 'think',
        content: [],
      }
    }

    case 'ExitPlanMode': {
      const plan = (input as Record<string, unknown>)?.plan as string | undefined
      return {
        title: 'Ready to code?',
        kind: 'switch_mode',
        content: plan
          ? [{ type: 'content' as const, content: { type: 'text' as const, text: plan } }]
          : [],
      }
    }

    default:
      return {
        title: name || 'Unknown Tool',
        kind: 'other',
        content: [],
      }
  }
}

// ── Tool result conversion ────────────────────────────────────────

export function toolUpdateFromToolResult(
  toolResult: Record<string, unknown>,
  toolUse: { name: string; id: string } | undefined,
  _supportsTerminalOutput: boolean = false,
): { content?: ToolCallContent[]; title?: string; _meta?: Record<string, unknown> } {
  if (!toolUse) return {}

  const isError = toolResult.is_error === true
  const resultContent = toolResult.content as
    | string
    | Array<Record<string, unknown>>
    | undefined

  // For error results, return error content
  if (isError && resultContent) {
    return toAcpContentUpdate(resultContent, true)
  }

  switch (toolUse.name) {
    case 'Read': {
      if (typeof resultContent === 'string' && resultContent.length > 0) {
        return {
          content: [
            {
              type: 'content' as const,
              content: { type: 'text' as const, text: markdownEscape(resultContent) },
            },
          ],
        }
      }
      if (Array.isArray(resultContent) && resultContent.length > 0) {
        return {
          content: resultContent.map((c: Record<string, unknown>) => ({
            type: 'content' as const,
            content:
              c.type === 'text'
                ? { type: 'text' as const, text: markdownEscape(c.text as string) }
                : toAcpContentBlock(c, false),
          })),
        }
      }
      return {}
    }

    case 'Bash': {
      let output = ''
      let exitCode = isError ? 1 : 0
      const terminalId = String(toolUse.id)

      // Handle bash_code_execution_result format
      if (
        resultContent &&
        typeof resultContent === 'object' &&
        !Array.isArray(resultContent) &&
        (resultContent as Record<string, unknown>).type === 'bash_code_execution_result'
      ) {
        const bashResult = resultContent as Record<string, unknown>
        output = [bashResult.stdout, bashResult.stderr].filter(Boolean).join('\n')
        exitCode = (bashResult.return_code as number) ?? (isError ? 1 : 0)
      } else if (typeof resultContent === 'string') {
        output = resultContent
      } else if (Array.isArray(resultContent) && resultContent.length > 0) {
        output = resultContent
          .map((c: Record<string, unknown>) =>
            c.type === 'text' ? (c.text as string) : '',
          )
          .join('\n')
      }

      if (_supportsTerminalOutput) {
        return {
          content: [{ type: 'terminal' as const, terminalId }],
          _meta: {
            terminal_info: { terminal_id: terminalId },
            terminal_output: { terminal_id: terminalId, data: output },
            terminal_exit: { terminal_id: terminalId, exit_code: exitCode, signal: null },
          },
        }
      }

      if (output.trim()) {
        return {
          content: [
            {
              type: 'content' as const,
              content: {
                type: 'text' as const,
                text: `\`\`\`console\n${output.trimEnd()}\n\`\`\``,
              },
            },
          ],
        }
      }
      return {}
    }

    case 'Edit':
    case 'Write': {
      return {}
    }

    case 'ExitPlanMode': {
      return { title: 'Exited Plan Mode' }
    }

    default: {
      return toAcpContentUpdate(
        resultContent ?? '',
        isError,
      )
    }
  }
}

function toAcpContentUpdate(
  content: unknown,
  isError: boolean,
): { content?: ToolCallContent[] } {
  if (Array.isArray(content) && content.length > 0) {
    return {
      content: content.map((c: Record<string, unknown>) => ({
        type: 'content' as const,
        content: toAcpContentBlock(c, isError),
      })),
    }
  }
  if (typeof content === 'string' && content.length > 0) {
    return {
      content: [
        {
          type: 'content' as const,
          content: {
            type: 'text' as const,
            text: isError ? `\`\`\`\n${content}\n\`\`\`` : content,
          },
        },
      ],
    }
  }
  return {}
}

function toAcpContentBlock(
  content: Record<string, unknown>,
  isError: boolean,
): ContentBlock {
  const wrapText = (text: string): ContentBlock => ({
    type: 'text',
    text: isError ? `\`\`\`\n${text}\n\`\`\`` : text,
  })

  const type = content.type as string
  switch (type) {
    case 'text': {
      const text = content.text as string
      return { type: 'text', text: isError ? `\`\`\`\n${text}\n\`\`\`` : text }
    }
    case 'image': {
      const source = content.source as Record<string, unknown> | undefined
      if (source?.type === 'base64') {
        return {
          type: 'image',
          data: source.data as string,
          mimeType: source.media_type as string,
        }
      }
      return wrapText(
        source?.type === 'url'
          ? `[image: ${source.url as string}]`
          : '[image: file reference]',
      )
    }
    case 'tool_reference':
      return wrapText(`Tool: ${content.tool_name as string}`)
    case 'tool_search_tool_search_result': {
      const refs = content.tool_references as Array<{ tool_name: string }> | undefined
      return wrapText(`Tools found: ${refs?.map((r) => r.tool_name).join(', ') || 'none'}`)
    }
    case 'tool_search_tool_result_error':
      return wrapText(
        `Error: ${content.error_code as string}${content.error_message ? ` - ${content.error_message as string}` : ''}`,
      )
    case 'web_search_result':
      return wrapText(`${content.title as string} (${content.url as string})`)
    case 'web_search_tool_result_error':
      return wrapText(`Error: ${content.error_code as string}`)
    case 'web_fetch_result':
      return wrapText(`Fetched: ${content.url as string}`)
    case 'web_fetch_tool_result_error':
      return wrapText(`Error: ${content.error_code as string}`)
    case 'code_execution_result':
    case 'bash_code_execution_result':
      return wrapText(`Output: ${(content.stdout as string) || (content.stderr as string) || ''}`)
    case 'code_execution_tool_result_error':
    case 'bash_code_execution_tool_result_error':
      return wrapText(`Error: ${content.error_code as string}`)
    case 'text_editor_code_execution_view_result':
      return wrapText(content.content as string)
    case 'text_editor_code_execution_create_result':
      return wrapText(content.is_file_update ? 'File updated' : 'File created')
    case 'text_editor_code_execution_str_replace_result': {
      const lines = content.lines as string[] | undefined
      return wrapText(lines?.join('\n') || '')
    }
    case 'text_editor_code_execution_tool_result_error':
      return wrapText(
        `Error: ${content.error_code as string}${content.error_message ? ` - ${content.error_message as string}` : ''}`,
      )
    default:
      try {
        return { type: 'text', text: JSON.stringify(content) }
      } catch {
        return { type: 'text', text: '[content]' }
      }
  }
}

// ── Edit tool response → diff ──────────────────────────────────────

interface EditToolResponseHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

interface EditToolResponse {
  filePath?: string
  structuredPatch?: EditToolResponseHunk[]
}

/**
 * Builds diff ToolUpdate content from the structured Edit toolResponse.
 * Parses structuredPatch hunks (lines prefixed with -, +, space) into
 * oldText/newText diff pairs.
 */
export function toolUpdateFromEditToolResponse(toolResponse: unknown): {
  content?: ToolCallContent[]
  locations?: ToolCallLocation[]
} {
  if (!toolResponse || typeof toolResponse !== 'object') return {}
  const response = toolResponse as EditToolResponse
  if (!response.filePath || !Array.isArray(response.structuredPatch)) return {}

  const content: ToolCallContent[] = []
  const locations: ToolCallLocation[] = []

  for (const { lines, newStart } of response.structuredPatch) {
    const oldText: string[] = []
    const newText: string[] = []
    for (const line of lines) {
      if (line.startsWith('-')) {
        oldText.push(line.slice(1))
      } else if (line.startsWith('+')) {
        newText.push(line.slice(1))
      } else {
        oldText.push(line.slice(1))
        newText.push(line.slice(1))
      }
    }
    if (oldText.length > 0 || newText.length > 0) {
      locations.push({ path: response.filePath, line: newStart })
      content.push({
        type: 'diff',
        path: response.filePath,
        oldText: oldText.join('\n') || null,
        newText: newText.join('\n'),
      })
    }
  }

  const result: { content?: ToolCallContent[]; locations?: ToolCallLocation[] } = {}
  if (content.length > 0) result.content = content
  if (locations.length > 0) result.locations = locations
  return result
}

function nextSdkMessageOrAbort(
  sdkMessages: AsyncGenerator<SDKMessage, void, unknown>,
  abortSignal: AbortSignal,
): Promise<IteratorResult<SDKMessage, void>> {
  if (abortSignal.aborted) {
    return Promise.resolve({ done: true, value: undefined })
  }

  let abortHandler: (() => void) | undefined
  const abortPromise = new Promise<IteratorResult<SDKMessage, void>>((resolve) => {
    abortHandler = () => resolve({ done: true, value: undefined })
    abortSignal.addEventListener('abort', abortHandler, { once: true })
  })

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

  try {
    while (!abortSignal.aborted) {
      // Race the next message against the abort signal so we unblock
      // immediately when cancelled, even if the generator is waiting for
      // a slow API response.
      const nextResult = await nextSdkMessageOrAbort(sdkMessages, abortSignal)
      if (nextResult.done || abortSignal.aborted) break
      const msg = nextResult.value

      if (msg == null) continue

      const type = msg.type as string

      switch (type) {
        // ── System messages ────────────────────────────────────────
        case 'system': {
          const subtype = msg.subtype as string | undefined

          if (subtype === 'compact_boundary') {
            // Reset assistant usage tracking after compaction
            lastAssistantTotalUsage = 0
            // Send usage reset after compaction
            await conn.sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: 'usage_update',
                used: 0,
                size: lastContextWindowSize,
              },
            })
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
          const usage = msg.usage as
            | {
                input_tokens: number
                output_tokens: number
                cache_read_input_tokens: number
                cache_creation_input_tokens: number
              }
            | undefined

          if (usage) {
            accumulatedUsage.inputTokens += usage.input_tokens
            accumulatedUsage.outputTokens += usage.output_tokens
            accumulatedUsage.cachedReadTokens += usage.cache_read_input_tokens
            accumulatedUsage.cachedWriteTokens += usage.cache_creation_input_tokens
          }

          // Resolve context window size from modelUsage via prefix matching
          const modelUsage = msg.modelUsage as
            | Record<string, { contextWindow?: number }>
            | undefined
          if (modelUsage && lastAssistantModel) {
            const match = getMatchingModelUsage(modelUsage, lastAssistantModel)
            if (match?.contextWindow) {
              lastContextWindowSize = match.contextWindow
            }
          }

          // Send usage_update — use lastAssistantTotalUsage if available
          // (more accurate than accumulatedUsage which may include background tasks)
          const usedTokens = lastAssistantTotalUsage ?? (
            accumulatedUsage.inputTokens +
            accumulatedUsage.outputTokens +
            accumulatedUsage.cachedReadTokens +
            accumulatedUsage.cachedWriteTokens
          )

          const totalCostUsd = msg.total_cost_usd as number | undefined
          await conn.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: 'usage_update',
              used: usedTokens,
              size: lastContextWindowSize,
              cost: totalCostUsd != null
                ? { amount: totalCostUsd, currency: 'USD' }
                : undefined,
            },
          })

          // Determine stop reason
          const subtype = msg.subtype as string | undefined
          const isError = msg.is_error as boolean | undefined

          if (abortSignal.aborted) {
            stopReason = 'cancelled'
            break
          }

          switch (subtype) {
            case 'success': {
              const stopReasonStr = msg.stop_reason as string | null
              if (stopReasonStr === 'max_tokens') {
                stopReason = 'max_tokens'
              }
              if (isError) {
                // Report error as end_turn
                stopReason = 'end_turn'
              }
              break
            }
            case 'error_during_execution': {
              if ((msg.stop_reason as string | null) === 'max_tokens') {
                stopReason = 'max_tokens'
              } else if (isError) {
                stopReason = 'end_turn'
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
          const notifications = streamEventToAcpNotifications(
            msg,
            sessionId,
            toolUseCache,
            conn,
            {
              clientCapabilities,
              cwd,
            },
          )
          for (const notification of notifications) {
            await conn.sessionUpdate(notification)
          }
          break
        }

        // ── Assistant messages ─────────────────────────────────────
        case 'assistant': {
          // Track last assistant total usage for context window computation
          // (only for top-level messages, not subagents)
          const assistantMsg = msg.message as Record<string, unknown> | undefined
          const parentToolUseId = msg.parent_tool_use_id as string | null | undefined
          if (assistantMsg?.usage && parentToolUseId === null) {
            const msgUsage = assistantMsg.usage as Record<string, unknown>
            lastAssistantTotalUsage =
              ((msgUsage.input_tokens as number) ?? 0) +
              ((msgUsage.output_tokens as number) ?? 0) +
              ((msgUsage.cache_read_input_tokens as number) ?? 0) +
              ((msgUsage.cache_creation_input_tokens as number) ?? 0)
          }
          // Track the current top-level model for context window size lookup
          if (
            parentToolUseId === null &&
            assistantMsg?.model &&
            assistantMsg.model !== '<synthetic>'
          ) {
            lastAssistantModel = assistantMsg.model as string
          }

          const notifications = assistantMessageToAcpNotifications(
            msg,
            sessionId,
            toolUseCache,
            conn,
            {
              clientCapabilities,
              cwd,
            },
          )
          for (const notification of notifications) {
            await conn.sessionUpdate(notification)
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
          const progressData = msg.data as Record<string, unknown> | undefined
          if (!progressData) break

          // Handle agent/skill subagent progress
          const progressType = progressData.type as string | undefined
          if (progressType === 'agent_progress' || progressType === 'skill_progress') {
            const progressMessage = progressData.message as
              | Record<string, unknown>
              | undefined
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
          lastAssistantTotalUsage = 0
          await conn.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: 'usage_update',
              used: 0,
              size: lastContextWindowSize,
            },
          })
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
          // Ignore unknown message types
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

// ── Assistant message conversion ──────────────────────────────────

function assistantMessageToAcpNotifications(
  msg: SDKMessage,
  sessionId: string,
  toolUseCache: ToolUseCache,
  conn: AgentSideConnection,
  options?: {
    clientCapabilities?: ClientCapabilities
    parentToolUseId?: string | null
    cwd?: string
  },
): SessionNotification[] {
  const message = msg.message as Record<string, unknown> | undefined
  if (!message) return []

  const content = message.content as
    | string
    | Array<Record<string, unknown>>
    | undefined
  if (!content) return []

  // If content is a string, treat as text
  if (typeof content === 'string') {
    return [
      {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: content },
        },
      },
    ]
  }

  return toAcpNotifications(content, 'assistant', sessionId, toolUseCache, conn, undefined, options)
}

// ── Stream event conversion ───────────────────────────────────────

function streamEventToAcpNotifications(
  msg: SDKMessage,
  sessionId: string,
  toolUseCache: ToolUseCache,
  conn: AgentSideConnection,
  options?: {
    clientCapabilities?: ClientCapabilities
    cwd?: string
  },
): SessionNotification[] {
  const event = (msg as unknown as { event: Record<string, unknown> }).event
  if (!event) return []

  switch (event.type as string) {
    case 'content_block_start': {
      const contentBlock = event.content_block as Record<string, unknown> | undefined
      if (!contentBlock) return []
      return toAcpNotifications(
        [contentBlock],
        'assistant',
        sessionId,
        toolUseCache,
        conn,
        undefined,
        {
          clientCapabilities: options?.clientCapabilities,
          parentToolUseId: msg.parent_tool_use_id as string | null | undefined,
          cwd: options?.cwd,
        },
      )
    }
    case 'content_block_delta': {
      const delta = event.delta as Record<string, unknown> | undefined
      if (!delta) return []
      return toAcpNotifications(
        [delta],
        'assistant',
        sessionId,
        toolUseCache,
        conn,
        undefined,
        {
          clientCapabilities: options?.clientCapabilities,
          parentToolUseId: msg.parent_tool_use_id as string | null | undefined,
          cwd: options?.cwd,
        },
      )
    }
    // No content to emit
    case 'message_start':
    case 'message_delta':
    case 'message_stop':
    case 'content_block_stop':
      return []

    default:
      return []
  }
}

// ── Core content block → ACP notification conversion ──────────────

function toAcpNotifications(
  content: Array<Record<string, unknown>>,
  role: 'assistant' | 'user',
  sessionId: string,
  toolUseCache: ToolUseCache,
  _conn: AgentSideConnection,
  _logger?: { error: (...args: unknown[]) => void },
  options?: {
    registerHooks?: boolean
    clientCapabilities?: ClientCapabilities
    parentToolUseId?: string | null
    cwd?: string
  },
): SessionNotification[] {
  const output: SessionNotification[] = []

  for (const chunk of content) {
    const chunkType = chunk.type as string
    let update: SessionUpdate | null = null

    switch (chunkType) {
      case 'text':
      case 'text_delta': {
        const text = (chunk.text as string) ?? ''
        update = {
          sessionUpdate:
            role === 'assistant' ? 'agent_message_chunk' : 'user_message_chunk',
          content: { type: 'text', text },
        }
        break
      }

      case 'thinking':
      case 'thinking_delta': {
        const thinking = (chunk.thinking as string) ?? ''
        update = {
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: thinking },
        }
        break
      }

      case 'image': {
        const source = chunk.source as Record<string, unknown> | undefined
        if (source?.type === 'base64') {
          update = {
            sessionUpdate:
              role === 'assistant' ? 'agent_message_chunk' : 'user_message_chunk',
            content: {
              type: 'image',
              data: source.data as string,
              mimeType: source.media_type as string,
            },
          }
        }
        break
      }

      case 'tool_use':
      case 'server_tool_use':
      case 'mcp_tool_use': {
        const toolUseId = (chunk.id as string) ?? ''
        const toolName = (chunk.name as string) ?? 'unknown'
        const toolInput = chunk.input as Record<string, unknown> | undefined
        const alreadyCached = toolUseId in toolUseCache

        // Cache this tool_use for later matching
        toolUseCache[toolUseId] = {
          type: chunkType as 'tool_use' | 'server_tool_use' | 'mcp_tool_use',
          id: toolUseId,
          name: toolName,
          input: toolInput,
        }

        // TodoWrite → plan update
        if (toolName === 'TodoWrite') {
          const todos = (toolInput as Record<string, unknown>)?.todos as
            | Array<{ content: string; status: string }>
            | undefined
          if (Array.isArray(todos)) {
            const entries: PlanEntry[] = todos.map((todo) => ({
              content: todo.content,
              status: normalizePlanStatus(todo.status),
              priority: 'medium',
            }))
            update = {
              sessionUpdate: 'plan',
              entries,
            }
          }
        } else {
          // Regular tool call
          const rawInput = toolInput ? { ...toolInput } : {}

          if (alreadyCached) {
            // Second encounter — send as tool_call_update
            update = {
              _meta: {
                claudeCode: { toolName },
              },
              toolCallId: toolUseId,
              sessionUpdate: 'tool_call_update',
              rawInput,
              ...toolInfoFromToolUse(
                { name: toolName, id: toolUseId, input: toolInput ?? {} },
                false,
                options?.cwd,
              ),
            }
          } else {
            // First encounter — send as tool_call
            update = {
              _meta: {
                claudeCode: { toolName },
              },
              toolCallId: toolUseId,
              sessionUpdate: 'tool_call',
              rawInput,
              status: 'pending',
              ...toolInfoFromToolUse(
                { name: toolName, id: toolUseId, input: toolInput ?? {} },
                false,
                options?.cwd,
              ),
            }
          }
        }
        break
      }

      case 'tool_result':
      case 'mcp_tool_result': {
        const toolUseId =
          (chunk.tool_use_id as string | undefined) ?? ''
        const toolUse = toolUseCache[toolUseId]
        if (!toolUse) break

        if (toolUse.name !== 'TodoWrite') {
          const toolUpdate = toolUpdateFromToolResult(
            chunk as unknown as Record<string, unknown>,
            { name: toolUse.name, id: toolUse.id },
            false,
          )

          update = {
            _meta: {
              claudeCode: { toolName: toolUse.name },
            },
            toolCallId: toolUseId,
            sessionUpdate: 'tool_call_update',
            status:
              (chunk.is_error as boolean | undefined) === true ? 'failed' : 'completed',
            rawOutput: chunk.content,
            ...toolUpdate,
          }
        }
        break
      }

      case 'redacted_thinking':
      case 'input_json_delta':
      case 'citations_delta':
      case 'signature_delta':
      case 'container_upload':
      case 'compaction':
      case 'compaction_delta':
        // Skip these types
        break
    }

    if (update) {
      // Add parentToolUseId to _meta if present
      if (options?.parentToolUseId) {
        const existingMeta = (update as Record<string, unknown>)._meta as
          | Record<string, unknown>
          | undefined
        ;(update as Record<string, unknown>)._meta = {
          ...existingMeta,
          claudeCode: {
            ...((existingMeta?.claudeCode as Record<string, unknown>) ?? {}),
            parentToolUseId: options.parentToolUseId,
          },
        }
      }
      output.push({ sessionId, update })
    }
  }

  return output
}

function normalizePlanStatus(
  status: string,
): 'pending' | 'in_progress' | 'completed' {
  if (status === 'in_progress') return 'in_progress'
  if (status === 'completed') return 'completed'
  return 'pending'
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
  for (const msg of messages) {
    const type = msg.type as string
    // Skip non-conversation messages
    if (type !== 'user' && type !== 'assistant') continue
    // Skip meta messages (synthetic continuation prompts)
    if (msg.isMeta === true) continue

    const messageData = msg.message as Record<string, unknown> | undefined
    const content = messageData?.content
    if (!content) continue

    const role: 'assistant' | 'user' = type === 'assistant' ? 'assistant' : 'user'

    if (typeof content === 'string') {
      if (!content.trim()) continue
      await conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate:
            role === 'assistant' ? 'agent_message_chunk' : 'user_message_chunk',
          content: { type: 'text', text: content },
        },
      })
      continue
    }

    if (Array.isArray(content)) {
      const notifications = toAcpNotifications(
        content as Array<Record<string, unknown>>,
        role,
        sessionId,
        toolUseCache,
        conn,
        undefined,
        { clientCapabilities, cwd },
      )
      for (const notification of notifications) {
        await conn.sessionUpdate(notification)
      }
    }
  }
}

// ── Model usage matching ──────────────────────────────────────────

function commonPrefixLength(a: string, b: string): number {
  let i = 0
  const maxLen = Math.min(a.length, b.length)
  while (i < maxLen && a[i] === b[i]) i++
  return i
}

function getMatchingModelUsage(
  modelUsage: Record<string, { contextWindow?: number }>,
  currentModel: string,
): { contextWindow?: number } | null {
  let bestKey: string | null = null
  let bestLen = 0

  for (const key of Object.keys(modelUsage)) {
    const len = commonPrefixLength(key, currentModel)
    if (len > bestLen) {
      bestLen = len
      bestKey = key
    }
  }

  return bestKey ? modelUsage[bestKey] ?? null : null
}
