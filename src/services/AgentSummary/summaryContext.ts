import { createHash } from 'node:crypto'
import { filterIncompleteToolCalls } from '@claude-code-best/builtin-tools/tools/AgentTool/filterIncompleteToolCalls.js'
import type { Message } from '../../types/message.js'

export const MAX_SUMMARY_CONTEXT_MESSAGES = 120
export const MAX_SUMMARY_CONTEXT_CHARS = 200_000

function estimateJsonChars(
  value: unknown,
  limit: number,
  seen = new Set<object>(),
): number {
  if (value === null) return 4
  switch (typeof value) {
    case 'string':
      return value.length + 2
    case 'number':
    case 'boolean':
      return String(value).length
    case 'undefined':
    case 'function':
    case 'symbol':
      return 0
    case 'object': {
      if (seen.has(value)) return Number.POSITIVE_INFINITY
      seen.add(value)
      let total = 2
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
          total += String(index).length + 3
          total += estimateJsonChars(value[index], limit - total, seen)
          if (total > limit) return total
        }
      } else {
        const record = value as Record<string, unknown>
        for (const key in record) {
          if (!Object.hasOwn(record, key)) continue
          total += key.length + 3
          total += estimateJsonChars(record[key], limit - total, seen)
          if (total > limit) return total
        }
      }
      seen.delete(value)
      return total
    }
  }
  return 0
}

function updateFingerprintHash(
  hash: ReturnType<typeof createHash>,
  value: unknown,
  limit: { remaining: number },
  seen = new Set<object>(),
): void {
  if (limit.remaining <= 0) return
  if (value === null || typeof value !== 'object') {
    const text = String(value)
    const consumed = Math.min(text.length, limit.remaining)
    if (consumed <= 0) return
    hash.update(typeof value)
    hash.update(':')
    hash.update(text.slice(0, consumed))
    if (consumed < text.length) {
      hash.update(`#truncated:${text.length}:${text.slice(-64)}`)
    }
    limit.remaining -= consumed
    return
  }
  if (seen.has(value)) {
    hash.update('[Circular]')
    return
  }
  seen.add(value)
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (limit.remaining <= 0) break
      const key = String(index)
      hash.update(key)
      limit.remaining -= key.length
      updateFingerprintHash(hash, value[index], limit, seen)
    }
  } else {
    const record = value as Record<string, unknown>
    for (const key in record) {
      if (limit.remaining <= 0) break
      if (!Object.hasOwn(record, key)) continue
      hash.update(key)
      limit.remaining -= key.length
      updateFingerprintHash(hash, record[key], limit, seen)
    }
  }
  seen.delete(value)
}

export function estimateMessageChars(
  message: Message,
  limit = Number.POSITIVE_INFINITY,
): number {
  const estimated = estimateJsonChars(message, limit)
  if (!Number.isFinite(estimated)) {
    return Number.POSITIVE_INFINITY
  }
  return estimated
}

function hasToolResultBlock(message: Message): boolean {
  if (message.type !== 'user') return false
  const content = message.message?.content
  return (
    Array.isArray(content) &&
    content.some(block => {
      return Boolean(
        block &&
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'tool_result',
      )
    })
  )
}

export function getSummaryContextFingerprint(
  messages: Message[],
): string | null {
  const lastMessage = messages.at(-1)
  if (!lastMessage) return null
  const hash = createHash('sha256')
  updateFingerprintHash(hash, messages, {
    remaining: MAX_SUMMARY_CONTEXT_CHARS,
  })
  return `${messages.length}:${lastMessage.uuid}:${hash.digest('hex').slice(0, 16)}`
}

export function selectSummaryContextMessages(
  messages: Message[],
  limits: {
    maxMessages?: number
    maxChars?: number
  } = {},
): Message[] {
  const maxMessages = limits.maxMessages ?? MAX_SUMMARY_CONTEXT_MESSAGES
  const maxChars = limits.maxChars ?? MAX_SUMMARY_CONTEXT_CHARS
  if (maxMessages <= 0 || maxChars <= 0) return []

  const selected: Message[] = []
  let selectedChars = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message) continue

    const messageChars = estimateMessageChars(message, maxChars - selectedChars)
    if (messageChars > maxChars) {
      if (selected.length === 0) return []
      break
    }

    if (
      selected.length >= maxMessages ||
      selectedChars + messageChars > maxChars
    ) {
      break
    }

    selected.unshift(message)
    selectedChars += messageChars
  }

  while (selected.length > 0) {
    const first = selected[0]
    if (!first) break
    if (first.type !== 'user' || hasToolResultBlock(first)) {
      selected.shift()
      continue
    }
    break
  }

  return selected
}

export type SummaryContextBuildResult = {
  messages: Message[]
  fingerprint: string | null
  skipReason?: 'too_small' | 'unchanged'
}

export function buildSummaryContext(
  messages: Message[],
  previousFingerprint: string | null,
): SummaryContextBuildResult {
  const cleanMessages = filterIncompleteToolCalls(messages)
  const boundedMessages = filterIncompleteToolCalls(
    selectSummaryContextMessages(cleanMessages),
  )
  const fingerprint = getSummaryContextFingerprint(boundedMessages)

  if (fingerprint && fingerprint === previousFingerprint) {
    return {
      messages: boundedMessages,
      fingerprint,
      skipReason: 'unchanged',
    }
  }

  if (boundedMessages.length < 3) {
    return {
      messages: boundedMessages,
      fingerprint,
      skipReason: 'too_small',
    }
  }

  return {
    messages: boundedMessages,
    fingerprint,
  }
}
