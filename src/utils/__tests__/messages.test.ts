import { describe, expect, test } from 'bun:test'
import {
  deriveShortMessageId,
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  CANCEL_MESSAGE,
  REJECT_MESSAGE,
  NO_RESPONSE_REQUESTED,
  SYNTHETIC_MESSAGES,
  isSyntheticMessage,
  getLastAssistantMessage,
  hasToolCallsInLastAssistantTurn,
  createAssistantMessage,
  createAssistantAPIErrorMessage,
  createUserMessage,
  createUserInterruptionMessage,
  prepareUserContent,
  createToolResultStopMessage,
  extractTag,
  isNotEmptyMessage,
  deriveUUID,
  normalizeMessages,
  normalizeMessagesForAPI,
  isClassifierDenial,
  buildYoloRejectionMessage,
  buildClassifierUnavailableMessage,
  AUTO_REJECT_MESSAGE,
  DONT_ASK_REJECT_MESSAGE,
  SYNTHETIC_MODEL,
} from '../messages'
import type {
  Message,
  AssistantMessage,
  UserMessage,
} from '../../types/message'

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeAssistantMsg(
  contentBlocks: Array<{ type: string; text?: string; [key: string]: any }>,
): AssistantMessage {
  return createAssistantMessage({
    content: contentBlocks as any,
  })
}

function makeUserMsg(text: string): UserMessage {
  return createUserMessage({ content: text })
}

// ─── deriveShortMessageId ───────────────────────────────────────────────

describe('deriveShortMessageId', () => {
  test('returns 6-char string', () => {
    const id = deriveShortMessageId('550e8400-e29b-41d4-a716-446655440000')
    expect(id).toHaveLength(6)
  })

  test('is deterministic for same input', () => {
    const uuid = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789'
    expect(deriveShortMessageId(uuid)).toBe(deriveShortMessageId(uuid))
  })

  test('produces different IDs for different UUIDs', () => {
    const id1 = deriveShortMessageId('00000000-0000-0000-0000-000000000001')
    const id2 = deriveShortMessageId('ffffffff-ffff-ffff-ffff-ffffffffffff')
    expect(id1).not.toBe(id2)
  })
})

// ─── Constants ──────────────────────────────────────────────────────────

describe('message constants', () => {
  test('SYNTHETIC_MESSAGES contains expected messages', () => {
    expect(SYNTHETIC_MESSAGES.has(INTERRUPT_MESSAGE)).toBe(true)
    expect(SYNTHETIC_MESSAGES.has(INTERRUPT_MESSAGE_FOR_TOOL_USE)).toBe(true)
    expect(SYNTHETIC_MESSAGES.has(CANCEL_MESSAGE)).toBe(true)
    expect(SYNTHETIC_MESSAGES.has(REJECT_MESSAGE)).toBe(true)
    expect(SYNTHETIC_MESSAGES.has(NO_RESPONSE_REQUESTED)).toBe(true)
  })

  test('SYNTHETIC_MODEL is <synthetic>', () => {
    expect(SYNTHETIC_MODEL).toBe('<synthetic>')
  })
})

// ─── Message factories ──────────────────────────────────────────────────

describe('createAssistantMessage', () => {
  test('creates assistant message with string content', () => {
    const msg = createAssistantMessage({ content: 'hello' })
    expect(msg.type).toBe('assistant')
    expect(msg.message!.role).toBe('assistant')
    expect(msg.message!.content![0] as any).toBeTruthy()
    expect((msg.message!.content![0] as any).text).toBe('hello')
  })

  test('creates assistant message with content blocks', () => {
    const blocks = [{ type: 'text' as const, text: 'hello' }]
    const msg = createAssistantMessage({ content: blocks as any })
    expect(msg.type).toBe('assistant')
    expect(msg.message.content).toHaveLength(1)
  })

  test('generates unique uuid per call', () => {
    const msg1 = createAssistantMessage({ content: 'a' })
    const msg2 = createAssistantMessage({ content: 'b' })
    expect(msg1.uuid).not.toBe(msg2.uuid)
  })

  test('has isApiErrorMessage false', () => {
    const msg = createAssistantMessage({ content: 'test' })
    expect(msg.isApiErrorMessage).toBe(false)
  })
})

describe('createAssistantAPIErrorMessage', () => {
  test('sets isApiErrorMessage to true', () => {
    const msg = createAssistantAPIErrorMessage({ content: 'error' })
    expect(msg.isApiErrorMessage).toBe(true)
  })

  test('includes error details', () => {
    const msg = createAssistantAPIErrorMessage({
      content: 'fail',
      errorDetails: 'rate limited',
    })
    expect(msg.errorDetails).toBe('rate limited')
  })
})

describe('createUserMessage', () => {
  test('creates user message with string content', () => {
    const msg = createUserMessage({ content: 'hello' })
    expect(msg.type).toBe('user')
    expect(msg.message.role).toBe('user')
    expect(msg.message.content).toBe('hello')
  })

  test('generates unique uuid', () => {
    const msg1 = createUserMessage({ content: 'a' })
    const msg2 = createUserMessage({ content: 'b' })
    expect(msg1.uuid).not.toBe(msg2.uuid)
  })

  test('uses provided uuid when given', () => {
    const msg = createUserMessage({
      content: 'test',
      uuid: 'custom-uuid-1234-5678-abcd-ef0123456789',
    })
    expect(msg.uuid).toBe('custom-uuid-1234-5678-abcd-ef0123456789')
  })

  test('sets isMeta flag', () => {
    const msg = createUserMessage({ content: 'test', isMeta: true })
    expect(msg.isMeta).toBe(true)
  })
})

describe('createUserInterruptionMessage', () => {
  test('creates interrupt message without tool use', () => {
    const msg = createUserInterruptionMessage({})
    expect(msg.type).toBe('user')
    expect((msg.message.content as any)[0].text).toBe(INTERRUPT_MESSAGE)
  })

  test('creates interrupt message with tool use', () => {
    const msg = createUserInterruptionMessage({ toolUse: true })
    expect((msg.message.content as any)[0].text).toBe(
      INTERRUPT_MESSAGE_FOR_TOOL_USE,
    )
  })
})

describe('prepareUserContent', () => {
  test('returns string when no preceding blocks', () => {
    const result = prepareUserContent({
      inputString: 'hello',
      precedingInputBlocks: [],
    })
    expect(result).toBe('hello')
  })

  test('returns array when preceding blocks exist', () => {
    const blocks = [{ type: 'image' as const, source: {} } as any]
    const result = prepareUserContent({
      inputString: 'describe this',
      precedingInputBlocks: blocks,
    })
    expect(Array.isArray(result)).toBe(true)
    expect((result as any[]).length).toBe(2)
    expect((result as any[])[1].text).toBe('describe this')
  })
})

describe('createToolResultStopMessage', () => {
  test('creates tool result with error flag', () => {
    const result = createToolResultStopMessage('tool-123')
    expect(result.type).toBe('tool_result')
    expect(result.is_error).toBe(true)
    expect(result.tool_use_id).toBe('tool-123')
    expect(result.content).toBe(CANCEL_MESSAGE)
  })
})

// ─── isSyntheticMessage ─────────────────────────────────────────────────

describe('isSyntheticMessage', () => {
  test('identifies interrupt message as synthetic', () => {
    const msg: any = {
      type: 'user',
      message: { content: [{ type: 'text', text: INTERRUPT_MESSAGE }] },
    }
    expect(isSyntheticMessage(msg)).toBe(true)
  })

  test('identifies cancel message as synthetic', () => {
    const msg: any = {
      type: 'user',
      message: { content: [{ type: 'text', text: CANCEL_MESSAGE }] },
    }
    expect(isSyntheticMessage(msg)).toBe(true)
  })

  test('returns false for normal user message', () => {
    const msg: any = {
      type: 'user',
      message: { content: [{ type: 'text', text: 'hello' }] },
    }
    expect(isSyntheticMessage(msg)).toBe(false)
  })

  test('returns false for progress message', () => {
    const msg: any = {
      type: 'progress',
      message: { content: [{ type: 'text', text: INTERRUPT_MESSAGE }] },
    }
    expect(isSyntheticMessage(msg)).toBe(false)
  })

  test('returns false for string content', () => {
    const msg: any = {
      type: 'user',
      message: { content: INTERRUPT_MESSAGE },
    }
    expect(isSyntheticMessage(msg)).toBe(false)
  })
})

// ─── getLastAssistantMessage ────────────────────────────────────────────

describe('getLastAssistantMessage', () => {
  test('returns last assistant message', () => {
    const a1 = makeAssistantMsg([{ type: 'text', text: 'first' }])
    const u = makeUserMsg('mid')
    const a2 = makeAssistantMsg([{ type: 'text', text: 'last' }])
    const result = getLastAssistantMessage([a1, u, a2])
    expect(result).toBe(a2)
  })

  test('returns undefined for empty array', () => {
    expect(getLastAssistantMessage([])).toBeUndefined()
  })

  test('returns undefined when no assistant messages', () => {
    const u = makeUserMsg('hello')
    expect(getLastAssistantMessage([u])).toBeUndefined()
  })
})

// ─── hasToolCallsInLastAssistantTurn ────────────────────────────────────

describe('hasToolCallsInLastAssistantTurn', () => {
  test('returns true when last assistant has tool_use', () => {
    const msg = makeAssistantMsg([
      { type: 'text', text: 'let me check' },
      { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
    ])
    expect(hasToolCallsInLastAssistantTurn([msg])).toBe(true)
  })

  test('returns false when last assistant has only text', () => {
    const msg = makeAssistantMsg([{ type: 'text', text: 'done' }])
    expect(hasToolCallsInLastAssistantTurn([msg])).toBe(false)
  })

  test('returns false for empty messages', () => {
    expect(hasToolCallsInLastAssistantTurn([])).toBe(false)
  })
})

// ─── extractTag ─────────────────────────────────────────────────────────

describe('extractTag', () => {
  test('extracts simple tag content', () => {
    expect(extractTag('<foo>bar</foo>', 'foo')).toBe('bar')
  })

  test('extracts tag with attributes', () => {
    expect(extractTag('<foo class="a">bar</foo>', 'foo')).toBe('bar')
  })

  test('handles multiline content', () => {
    expect(extractTag('<foo>\nline1\nline2\n</foo>', 'foo')).toBe(
      '\nline1\nline2\n',
    )
  })

  test('returns null for missing tag', () => {
    expect(extractTag('<foo>bar</foo>', 'baz')).toBeNull()
  })

  test('returns null for empty html', () => {
    expect(extractTag('', 'foo')).toBeNull()
  })

  test('returns null for empty tagName', () => {
    expect(extractTag('<foo>bar</foo>', '')).toBeNull()
  })

  test('is case-insensitive', () => {
    expect(extractTag('<FOO>bar</FOO>', 'foo')).toBe('bar')
  })
})

// ─── isNotEmptyMessage ──────────────────────────────────────────────────

describe('isNotEmptyMessage', () => {
  test('returns true for message with text content', () => {
    const msg: any = {
      type: 'user',
      message: { content: 'hello' },
    }
    expect(isNotEmptyMessage(msg)).toBe(true)
  })

  test('returns false for empty string content', () => {
    const msg: any = {
      type: 'user',
      message: { content: '  ' },
    }
    expect(isNotEmptyMessage(msg)).toBe(false)
  })

  test('returns false for empty content array', () => {
    const msg: any = {
      type: 'user',
      message: { content: [] },
    }
    expect(isNotEmptyMessage(msg)).toBe(false)
  })

  test('returns true for progress message', () => {
    const msg: any = {
      type: 'progress',
      message: { content: [] },
    }
    expect(isNotEmptyMessage(msg)).toBe(true)
  })

  test('returns true for multi-block content', () => {
    const msg: any = {
      type: 'user',
      message: {
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      },
    }
    expect(isNotEmptyMessage(msg)).toBe(true)
  })

  test('returns true for non-text block', () => {
    const msg: any = {
      type: 'user',
      message: {
        content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }],
      },
    }
    expect(isNotEmptyMessage(msg)).toBe(true)
  })

  test('returns false for whitespace-only text block in content array', () => {
    const msg: any = {
      type: 'user',
      message: {
        content: [{ type: 'text', text: '  ' }],
      },
    }
    expect(isNotEmptyMessage(msg)).toBe(false)
  })
})

// ─── deriveUUID ─────────────────────────────────────────────────────────

describe('deriveUUID', () => {
  test('produces deterministic output', () => {
    const parent = '550e8400-e29b-41d4-a716-446655440000' as any
    expect(deriveUUID(parent, 0)).toBe(deriveUUID(parent, 0))
  })

  test('produces different output for different indices', () => {
    const parent = '550e8400-e29b-41d4-a716-446655440000' as any
    expect(deriveUUID(parent, 0)).not.toBe(deriveUUID(parent, 1))
  })

  test('preserves UUID-like length', () => {
    const parent = '550e8400-e29b-41d4-a716-446655440000' as any
    const derived = deriveUUID(parent, 5)
    expect(derived.length).toBe(parent.length)
  })
})

// ─── isClassifierDenial ─────────────────────────────────────────────────

describe('isClassifierDenial', () => {
  test('returns true for classifier denial prefix', () => {
    expect(
      isClassifierDenial(
        'Permission for this action has been denied. Reason: unsafe',
      ),
    ).toBe(true)
  })

  test('returns false for normal content', () => {
    expect(isClassifierDenial('hello world')).toBe(false)
  })
})

// ─── Message builder functions ──────────────────────────────────────────

describe('AUTO_REJECT_MESSAGE', () => {
  test('includes tool name', () => {
    const msg = AUTO_REJECT_MESSAGE('Bash')
    expect(msg).toContain('Bash')
    expect(msg).toContain('denied')
  })
})

describe('DONT_ASK_REJECT_MESSAGE', () => {
  test('includes tool name and dont ask mode', () => {
    const msg = DONT_ASK_REJECT_MESSAGE('Write')
    expect(msg).toContain('Write')
    expect(msg).toContain("don't ask mode")
  })
})

describe('buildYoloRejectionMessage', () => {
  test('includes reason', () => {
    const msg = buildYoloRejectionMessage('potentially destructive')
    expect(msg).toContain('potentially destructive')
    expect(msg).toContain('denied')
  })
})

describe('buildClassifierUnavailableMessage', () => {
  test('includes tool name and model', () => {
    const msg = buildClassifierUnavailableMessage('Bash', 'classifier-v1')
    expect(msg).toContain('Bash')
    expect(msg).toContain('classifier-v1')
    expect(msg).toContain('unavailable')
  })

  test('tells the model to wait and retry later', () => {
    const msg = buildClassifierUnavailableMessage('Bash', 'classifier-v1')
    expect(msg).toContain('Wait briefly and then try this action again.')
    expect(msg).toContain('come back to it later')
  })
})

describe('normalizeMessages', () => {
  test('splits multi-block assistant message into individual messages', () => {
    const msg = makeAssistantMsg([
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ])
    const normalized = normalizeMessages([msg])
    expect(normalized.length).toBe(2)
    // Verify each split message contains only one content block
    expect(normalized[0].message.content).toHaveLength(1)
    expect((normalized[0].message.content as any[])[0].text).toBe('first')
    expect(normalized[1].message.content).toHaveLength(1)
    expect((normalized[1].message.content as any[])[0].text).toBe('second')
  })

  test('handles empty array', () => {
    const result = normalizeMessages([] as AssistantMessage[])
    expect(result).toEqual([])
  })

  test('preserves single-block message', () => {
    const msg = makeAssistantMsg([{ type: 'text', text: 'hello' }])
    const normalized = normalizeMessages([msg])
    expect(normalized.length).toBe(1)
  })
})

describe('normalizeMessagesForAPI', () => {
  test('preserves Gemini thought signature metadata on tool_use blocks', () => {
    const assistant = makeAssistantMsg([
      {
        type: 'tool_use',
        id: 'tool-1',
        name: 'Bash',
        input: { command: 'pwd' },
        _geminiThoughtSignature: 'sig-123',
      },
    ])

    const normalized = normalizeMessagesForAPI([assistant])
    const block = (normalized[0] as AssistantMessage).message!
      .content![0] as any

    expect(block.type).toBe('tool_use')
    expect(block._geminiThoughtSignature).toBe('sig-123')
  })
})
