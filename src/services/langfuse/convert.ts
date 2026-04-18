/**
 * Convert internal Message types to Langfuse-compatible OpenAI-style chat format.
 *
 * Langfuse generations expect:
 *   input:  { role, content }[]  where content is string or structured parts
 *   output: { role: 'assistant', content: string | part[] }
 *
 * Key conversions from Anthropic → OpenAI format:
 *   - tool_use blocks  → tool_calls[] at message level
 *   - tool_result blocks → separate { role: 'tool' } messages
 */

import type { Message, AssistantMessage, UserMessage } from 'src/types/message.js'

type LangfuseContentPart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: string; [key: string]: unknown }

type LangfuseToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type LangfuseChatMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | LangfuseContentPart[] | null
  tool_calls?: LangfuseToolCall[]
  tool_call_id?: string
}

/** Normalize a content block into a LangfuseContentPart (non-tool_use, non-tool_result) */
function toContentPart(block: Record<string, unknown>): LangfuseContentPart | null {
  const type = block.type as string | undefined
  if (type === 'text') {
    return { type: 'text', text: String(block.text ?? '') }
  }
  if (type === 'thinking' || type === 'redacted_thinking') {
    return { type: 'thinking', thinking: String(block.thinking ?? '[redacted]') }
  }
  if (type === 'image') {
    return { type: 'text', text: '[image]' }
  }
  if (type === 'document') {
    const name = (block.source as Record<string, unknown> | undefined)?.filename
      ?? (block.title as string | undefined)
      ?? 'document'
    return { type: 'text', text: `[document: ${name}]` }
  }
  if (type === 'server_tool_use' || type === 'web_search_tool_result' || type === 'tool_search_tool_result') {
    return { type, id: String(block.id ?? ''), name: String(block.name ?? type) }
  }
  // unknown block: keep type + scalar fields only
  const safe: Record<string, unknown> = { type: type ?? 'unknown' }
  for (const [k, v] of Object.entries(block)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') safe[k] = v
  }
  return safe as LangfuseContentPart
}

/** Extract tool_use blocks from content into OpenAI-style tool_calls */
function extractToolCalls(content: unknown[]): { tool_calls: LangfuseToolCall[]; rest: unknown[] } {
  const toolCalls: LangfuseToolCall[] = []
  const rest: unknown[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') { rest.push(block); continue }
    const b = block as Record<string, unknown>
    if (b.type === 'tool_use') {
      toolCalls.push({
        id: String(b.id ?? ''),
        type: 'function',
        function: {
          name: String(b.name ?? ''),
          arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? {}),
        },
      })
    } else {
      rest.push(block)
    }
  }
  return { tool_calls: toolCalls, rest }
}

/** Extract tool_result blocks into separate { role: 'tool' } messages */
function extractToolResults(content: unknown[]): { toolMessages: LangfuseChatMessage[]; rest: unknown[] } {
  const toolMessages: LangfuseChatMessage[] = []
  const rest: unknown[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') { rest.push(block); continue }
    const b = block as Record<string, unknown>
    if (b.type === 'tool_result') {
      const resultContent = Array.isArray(b.content)
        ? (b.content as Record<string, unknown>[])
            .map(c => {
              if (c.type === 'text') return String(c.text ?? '')
              if (c.type === 'image') return '[image]'
              if (c.type === 'document') return '[document]'
              return `[${String(c.type ?? 'unknown')}]`
            })
            .join('\n')
        : String(b.content ?? '')
      toolMessages.push({
        role: 'tool',
        tool_call_id: String(b.tool_use_id ?? ''),
        content: resultContent,
      })
    } else {
      rest.push(block)
    }
  }
  return { toolMessages, rest }
}

/** Collapse content parts: join all-text arrays into a single string */
function collapseContent(parts: LangfuseContentPart[]): string | LangfuseContentPart[] {
  if (parts.length === 0) return ''
  if (parts.every(p => p.type === 'text')) {
    return parts.map(p => (p as { type: 'text'; text: string }).text).join('\n')
  }
  return parts
}

function toRole(msg: Message): 'user' | 'assistant' | 'system' {
  if (msg.type === 'assistant') return 'assistant'
  if (msg.type === 'system') return 'system'
  return 'user'
}

/** Convert messagesForAPI (UserMessage | AssistantMessage)[] → Langfuse input format */
export function convertMessagesToLangfuse(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt?: readonly string[],
): LangfuseChatMessage[] {
  const result: LangfuseChatMessage[] = []
  if (systemPrompt && systemPrompt.length > 0) {
    for (const block of systemPrompt) {
      if (block.trim()) result.push({ role: 'system', content: block })
    }
  }
  for (const msg of messages) {
    const inner = msg.message
    if (!inner) continue
    const role = (inner.role as 'user' | 'assistant' | undefined) ?? toRole(msg)
    const rawContent = inner.content
    if (typeof rawContent === 'string' || !Array.isArray(rawContent)) {
      result.push({ role, content: String(rawContent ?? '') })
      continue
    }

    if (role === 'assistant') {
      // Extract tool_use → tool_calls at message level
      const { tool_calls, rest } = extractToolCalls(rawContent)
      const parts = rest
        .filter((b): b is Record<string, unknown> => b != null && typeof b === 'object')
        .map(b => toContentPart(b))
        .filter((p): p is LangfuseContentPart => p !== null)
      result.push({
        role: 'assistant',
        content: collapseContent(parts),
        ...(tool_calls.length > 0 && { tool_calls }),
      })
    } else {
      // User messages: extract tool_result → separate tool messages
      const { toolMessages, rest } = extractToolResults(rawContent)
      const parts = rest
        .filter((b): b is Record<string, unknown> => b != null && typeof b === 'object')
        .map(b => toContentPart(b))
        .filter((p): p is LangfuseContentPart => p !== null)
      if (parts.length > 0 || toolMessages.length === 0) {
        result.push({ role: 'user', content: collapseContent(parts) })
      }
      result.push(...toolMessages)
    }
  }
  return result
}

/** Convert Anthropic-style tool schemas to Langfuse-compatible OpenAI-style tool format */
export function convertToolsToLangfuse(tools: unknown[]): unknown[] {
  return tools.map(tool => {
    const t = tool as Record<string, unknown>
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema ?? t.parameters ?? {},
      },
    }
  })
}

/** Convert AssistantMessage[] (newMessages) → Langfuse output format (last assistant turn) */
export function convertOutputToLangfuse(
  messages: AssistantMessage[],
): LangfuseChatMessage | LangfuseChatMessage[] | null {
  if (messages.length === 0) return null

  const convert = (msg: AssistantMessage): LangfuseChatMessage => {
    const rawContent = msg.message?.content
    if (typeof rawContent === 'string' || !Array.isArray(rawContent)) {
      return { role: 'assistant', content: String(rawContent ?? '') }
    }
    const { tool_calls, rest } = extractToolCalls(rawContent)
    const parts = rest
      .filter((b): b is Record<string, unknown> => b != null && typeof b === 'object')
      .map(b => toContentPart(b))
      .filter((p): p is LangfuseContentPart => p !== null)
    return {
      role: 'assistant',
      content: collapseContent(parts),
      ...(tool_calls.length > 0 && { tool_calls }),
    }
  }

  if (messages.length === 1) return convert(messages[0]!)
  return messages.map(convert)
}
