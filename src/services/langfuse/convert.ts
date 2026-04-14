/**
 * Convert internal Message types to Langfuse-compatible OpenAI-style chat format.
 *
 * Langfuse generations expect:
 *   input:  { role, content }[]  where content is string or structured parts
 *   output: { role: 'assistant', content: string | part[] }
 */

import type { Message, AssistantMessage, UserMessage } from 'src/types/message.js'

type LangfuseContentPart =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'thinking'; thinking: string }
  | { type: string; [key: string]: unknown }

type LangfuseChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string | LangfuseContentPart[]
}

function normalizeContent(content: unknown): string | LangfuseContentPart[] {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content ?? '')

  const parts: LangfuseContentPart[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    const type = b.type as string | undefined

    if (type === 'text') {
      parts.push({ type: 'text', text: String(b.text ?? '') })
    } else if (type === 'thinking' || type === 'redacted_thinking') {
      parts.push({ type: 'thinking', thinking: String(b.thinking ?? '[redacted]') })
    } else if (type === 'tool_use') {
      parts.push({ type: 'tool_use', id: String(b.id ?? ''), name: String(b.name ?? ''), input: b.input })
    } else if (type === 'tool_result') {
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
      parts.push({ type: 'tool_result', tool_use_id: String(b.tool_use_id ?? ''), content: resultContent })
    } else if (type === 'image') {
      parts.push({ type: 'text', text: '[image]' })
    } else if (type === 'document') {
      const name = (b.source as Record<string, unknown> | undefined)?.filename
        ?? (b.title as string | undefined)
        ?? 'document'
      parts.push({ type: 'text', text: `[document: ${name}]` })
    } else if (type === 'server_tool_use' || type === 'web_search_tool_result' || type === 'tool_search_tool_result') {
      // server-side tool blocks — keep name/id, drop raw content
      parts.push({ type: type, id: String(b.id ?? ''), name: String(b.name ?? type) })
    } else {
      // unknown block: keep type + scalar fields only, drop any binary/large payloads
      const safe: Record<string, unknown> = { type: type ?? 'unknown' }
      for (const [k, v] of Object.entries(b)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') safe[k] = v
      }
      parts.push(safe as LangfuseContentPart)
    }
  }

  // Collapse to plain string if only one text part
  if (parts.length === 1 && parts[0]!.type === 'text') {
    return (parts[0] as { type: 'text'; text: string }).text
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
    result.push({ role, content: normalizeContent(inner.content) })
  }
  return result
}

/** Convert AssistantMessage[] (newMessages) → Langfuse output format (last assistant turn) */
export function convertOutputToLangfuse(
  messages: AssistantMessage[],
): LangfuseChatMessage | LangfuseChatMessage[] | null {
  if (messages.length === 0) return null
  if (messages.length === 1) {
    const msg = messages[0]!
    return { role: 'assistant', content: normalizeContent(msg.message?.content) }
  }
  return messages.map(msg => ({
    role: 'assistant' as const,
    content: normalizeContent(msg.message?.content),
  }))
}
