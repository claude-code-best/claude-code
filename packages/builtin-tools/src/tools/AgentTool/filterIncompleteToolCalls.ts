import type {
  AssistantMessage,
  Message,
  UserMessage,
} from 'src/types/message.js'

/**
 * Removes invalid or orphaned tool_use/tool_result blocks while preserving
 * completed tool-call pairs. This is intentionally block-level, not
 * message-level, so completed parallel tool calls stay paired with results.
 */
export function filterIncompleteToolCalls(messages: Message[]): Message[] {
  const toolUseIdsWithResults = new Set<string>()

  for (const message of messages) {
    if (message?.type === 'user') {
      const userMessage = message as UserMessage
      const content = userMessage.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            toolUseIdsWithResults.add(block.tool_use_id)
          }
        }
      }
    }
  }

  const retainedToolUseIds = new Set<string>()
  const withoutOrphanToolUses: Message[] = []

  for (const message of messages) {
    if (message?.type === 'assistant') {
      const assistantMessage = message as AssistantMessage
      const content = assistantMessage.message.content
      if (Array.isArray(content)) {
        let changed = false
        const filteredContent = content.filter(block => {
          if (block.type !== 'tool_use') return true
          if (!block.id) {
            changed = true
            return false
          }
          if (toolUseIdsWithResults.has(block.id)) {
            retainedToolUseIds.add(block.id)
            return true
          }
          changed = true
          return false
        })

        if (!changed) {
          withoutOrphanToolUses.push(message)
          continue
        }
        if (filteredContent.length > 0) {
          withoutOrphanToolUses.push({
            ...assistantMessage,
            message: {
              ...assistantMessage.message,
              content: filteredContent,
            },
          })
        }
        continue
      }
    }
    withoutOrphanToolUses.push(message)
  }

  const filteredMessages: Message[] = []
  for (const message of withoutOrphanToolUses) {
    if (message?.type !== 'user') {
      filteredMessages.push(message)
      continue
    }
    const userMessage = message as UserMessage
    const content = userMessage.message.content
    if (!Array.isArray(content)) {
      filteredMessages.push(message)
      continue
    }
    let changed = false
    const filteredContent = content.filter(block => {
      if (block.type !== 'tool_result') return true
      if (!block.tool_use_id) {
        changed = true
        return false
      }
      if (retainedToolUseIds.has(block.tool_use_id)) return true
      changed = true
      return false
    })
    if (!changed) {
      filteredMessages.push(message)
      continue
    }
    if (filteredContent.length > 0) {
      filteredMessages.push({
        ...userMessage,
        message: {
          ...userMessage.message,
          content: filteredContent,
        },
      })
    }
  }

  return filteredMessages
}
