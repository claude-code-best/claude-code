import { describe, expect, test } from 'bun:test'
import {
  createUserMessage,
  createAssistantMessage,
  normalizeMessages,
  extractTag,
} from '../../src/utils/messages'

// ─── Message Structure ────────────────────────────────────────────────

describe('Message pipeline: message structure', () => {
  test("createUserMessage returns a Message with type 'user'", () => {
    const msg = createUserMessage('hello')
    expect(msg.type).toBe('user')
    expect(msg.message.role).toBe('user')
    expect(msg.uuid).toBeTruthy()
    expect(msg.timestamp).toBeTruthy()
  })

  test("createAssistantMessage returns a Message with type 'assistant'", () => {
    const msg = createAssistantMessage('response')
    expect(msg.type).toBe('assistant')
    expect(msg.message.role).toBe('assistant')
    expect(msg.uuid).toBeTruthy()
  })

  test('user and assistant messages have different UUIDs', () => {
    const user = createUserMessage('hello')
    const assistant = createAssistantMessage('response')
    expect(user.uuid).not.toBe(assistant.uuid)
  })
})

// ─── Tag Extraction ───────────────────────────────────────────────────

describe('Message pipeline: tag extraction', () => {
  test('extractTag returns null for non-matching tag', () => {
    expect(extractTag('no tags here', 'think')).toBeNull()
  })

  test('extractTag returns null for empty string', () => {
    expect(extractTag('', 'think')).toBeNull()
  })

  test('extractTag requires tagName parameter', () => {
    // Calling without tagName throws
    expect(() => (extractTag as any)('hello')).toThrow()
  })
})

// ─── Normalization ────────────────────────────────────────────────────

describe('Message pipeline: normalization', () => {
  test('normalizeMessages returns an array', () => {
    const msg = createUserMessage('hello')
    const result = normalizeMessages([msg])
    expect(Array.isArray(result)).toBe(true)
  })

  test('normalizeMessages preserves at least one message for simple input', () => {
    const msg = createUserMessage('hello')
    const result = normalizeMessages([msg])
    expect(result.length).toBeGreaterThanOrEqual(1)
  })
})
