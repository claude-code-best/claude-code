// Core content-block → SessionUpdate conversion engine.
//
// `toAcpNotifications` handles text/thinking/image/tool_use/tool_result/etc.
// and writes into the ToolUseCache. `assistantMessageToAcpNotifications` and
// `streamEventToAcpNotifications` are thin adapters. `normalizePlanStatus`
// maps TodoWrite status strings onto the ACP PlanEntry status enum.
import type {
  AgentSideConnection,
  ClientCapabilities,
  PlanEntry,
  SessionNotification,
  SessionUpdate,
} from '@agentclientprotocol/sdk'
import type { ToolUseCache } from './types.js'
import { toolInfoFromToolUse } from './toolInfo.js'
import { toolUpdateFromToolResult } from './toolResults.js'

/**
 * Maps a TodoWrite status string onto the ACP PlanEntry status enum.
 * Unknown / unsupported values fall back to 'pending'.
 */
export function normalizePlanStatus(
  status: string,
): 'pending' | 'in_progress' | 'completed' {
  if (status === 'in_progress') return 'in_progress'
  if (status === 'completed') return 'completed'
  return 'pending'
}

export function toAcpNotifications(
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
    streamingActive?: boolean
    // Per message-id.mdx RFD: UUID identifying the message these chunks
    // belong to. Only attached to agent_message_chunk / user_message_chunk /
    // agent_thought_chunk (spec scope). undefined = omit the field entirely.
    messageId?: string
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
          ...(options?.messageId ? { messageId: options.messageId } : {}),
          content: { type: 'text', text },
        }
        break
      }

      case 'thinking':
      case 'thinking_delta': {
        const thinking = (chunk.thinking as string) ?? ''
        update = {
          sessionUpdate: 'agent_thought_chunk',
          ...(options?.messageId ? { messageId: options.messageId } : {}),
          content: { type: 'text', text: thinking },
        }
        break
      }

      case 'image': {
        const source = chunk.source as Record<string, unknown> | undefined
        if (source?.type === 'base64') {
          update = {
            sessionUpdate:
              role === 'assistant'
                ? 'agent_message_chunk'
                : 'user_message_chunk',
            ...(options?.messageId ? { messageId: options.messageId } : {}),
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
            const entries: PlanEntry[] = todos.map(todo => ({
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
            // Second encounter — tool_use input is now fully received.
            // The tool is about to execute (pending permission, then run).
            // Emit a tool_call_update with status 'in_progress' so clients
            // can distinguish "awaiting approval / running" from the initial
            // 'pending' (per ACP v1 ToolCallStatus lifecycle, schema.json:3525).
            update = {
              _meta: {
                claudeCode: { toolName },
              },
              toolCallId: toolUseId,
              sessionUpdate: 'tool_call_update',
              status: 'in_progress',
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
        const toolUseId = (chunk.tool_use_id as string | undefined) ?? ''
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
              (chunk.is_error as boolean | undefined) === true
                ? 'failed'
                : 'completed',
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

export function assistantMessageToAcpNotifications(
  msg: { message?: unknown; parent_tool_use_id?: string | null },
  sessionId: string,
  toolUseCache: ToolUseCache,
  conn: AgentSideConnection,
  options?: {
    clientCapabilities?: ClientCapabilities
    parentToolUseId?: string | null
    cwd?: string
    streamingActive?: boolean
    messageId?: string
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
          ...(options?.messageId ? { messageId: options.messageId } : {}),
          content: { type: 'text', text: content },
        },
      },
    ]
  }

  // When streaming is active, text/thinking were already sent via stream_event
  // messages. Filter them out to avoid duplicate agent_message_chunk /
  // agent_thought_chunk notifications. String content (synthetic messages)
  // is unaffected — those have no corresponding stream_events.
  const contentToProcess = options?.streamingActive
    ? content.filter(
        block => block.type !== 'text' && block.type !== 'thinking',
      )
    : content

  if (contentToProcess.length === 0) return []

  return toAcpNotifications(
    contentToProcess,
    'assistant',
    sessionId,
    toolUseCache,
    conn,
    undefined,
    options,
  )
}

export function streamEventToAcpNotifications(
  msg: {
    event?: Record<string, unknown>
    parent_tool_use_id?: string | null
  },
  sessionId: string,
  toolUseCache: ToolUseCache,
  conn: AgentSideConnection,
  options?: {
    clientCapabilities?: ClientCapabilities
    cwd?: string
    streamingActive?: boolean
    messageId?: string
  },
): SessionNotification[] {
  const event = (msg as unknown as { event: Record<string, unknown> }).event
  if (!event) return []

  switch (event.type as string) {
    case 'content_block_start': {
      const contentBlock = event.content_block as
        | Record<string, unknown>
        | undefined
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
          messageId: options?.messageId,
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
          messageId: options?.messageId,
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
