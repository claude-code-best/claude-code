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
  createProgressMessage,
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
  ensureToolResultPairing,
  buildMessageLookups,
  updateMessageLookupsIncremental,
  computeMessageStructureKey,
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

describe('ensureToolResultPairing', () => {
  test('does not produce consecutive user messages when orphaned tool_result is stripped after an existing user message (CC-1215)', () => {
    // Reproduce the scenario from the bug report:
    // Streaming yields assistant[thinking] and assistant[tool_use] separately.
    // normalizeMessagesForAPI merges them, but if the merge fails (e.g. intervening
    // user message breaks backward walk), ensureToolResultPairing sees duplicate
    // tool_use ID, strips it, leaving empty content in the next user message,
    // which becomes NO_CONTENT_MESSAGE. If the previous result entry is already
    // user, this must NOT create consecutive user messages.
    const toolUseId = 'toolu_test_dup_001'

    const messages: (UserMessage | AssistantMessage)[] = [
      // Previous turn: user with tool_result
      createUserMessage({
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: 'previous result',
          },
        ],
      }),
      // Current turn: assistant with thinking only (tool_use was deduped away)
      makeAssistantMsg([{ type: 'thinking', thinking: 'let me think...' }]),
      // Current turn: assistant with tool_use (second streaming yield, same ID)
      makeAssistantMsg([
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'Bash',
          input: { command: 'pwd' },
        },
      ]),
      // Tool result for the tool_use
      createUserMessage({
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: '/home/user',
          },
        ],
      }),
    ]

    const result = ensureToolResultPairing(messages)

    // Verify no consecutive user messages
    for (let i = 1; i < result.length; i++) {
      if (result[i - 1]!.type === 'user') {
        expect(result[i]!.type).not.toBe('user')
      }
    }
  })

  test('inserts NO_CONTENT_MESSAGE when previous result entry is assistant', () => {
    // When the orphan strip empties a user message and the previous entry is
    // assistant, the placeholder should still be inserted to maintain alternation.
    const toolUseId = 'toolu_test_orphan_001'

    const messages: (UserMessage | AssistantMessage)[] = [
      makeAssistantMsg([{ type: 'text', text: 'hello' }]),
      // This assistant has a tool_use with an ID that won't match any result
      makeAssistantMsg([
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'Bash',
          input: { command: 'ls' },
        },
      ]),
      // User message with ONLY a tool_result for a non-existent tool_use
      // After orphan stripping, content becomes empty
      createUserMessage({
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'nonexistent_id',
            content: 'orphan',
          },
        ],
      }),
    ]

    const result = ensureToolResultPairing(messages)

    // Should have assistant, [possibly modified assistant], user placeholder
    // The key assertion: last message should be a user placeholder
    const lastMsg = result[result.length - 1]!
    expect(lastMsg.type).toBe('user')
  })
})

// ─── CC-1215: normalizeMessagesForAPI must not merge assistants across tool_results ──

describe('normalizeMessagesForAPI – thinking + tool_use same turn (CC-1215)', () => {
  test('does not merge same-id assistants across a tool_result boundary', () => {
    // Simulate the streaming sequence when extended thinking + tool_use appear
    // in the same turn, and StreamingToolExecutor inserts a tool_result
    // between the two assistant content-block messages.
    const sharedMessageId = 'msg_shared_001'
    const toolUseId = 'toolu_cc1215'

    // assistant[thinking] — first content_block_stop yield
    const thinkingMsg = createAssistantMessage({
      content: [
        { type: 'thinking', thinking: 'Let me think...', signature: 'sig1' },
      ],
    })
    thinkingMsg.message.id = sharedMessageId

    // user[tool_result] — from StreamingToolExecutor completing fast
    const toolResultMsg = createUserMessage({
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: '/home/user',
        },
      ],
    })

    // assistant[tool_use] — second content_block_stop yield
    const toolUseMsg = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'Bash',
          input: { command: 'pwd' },
        },
      ],
    })
    toolUseMsg.message.id = sharedMessageId

    const messages: Message[] = [
      makeUserMsg('Run pwd'),
      thinkingMsg,
      toolResultMsg,
      toolUseMsg,
    ]

    const result = normalizeMessagesForAPI(messages)

    // Before the fix, the backward walk would skip the tool_result and merge
    // thinking + tool_use into one assistant. This produced duplicate tool_use
    // IDs after ensureToolResultPairing ran, leading to orphaned tool_results
    // and consecutive user messages → API 400.
    //
    // After the fix, the backward walk stops at the tool_result, so the two
    // assistants remain separate. The result should have 4 messages:
    //   user, assistant[thinking], user[tool_result], assistant[tool_use]
    expect(result).toHaveLength(4)
    expect(result[0]!.type).toBe('user')
    expect(result[1]!.type).toBe('assistant')
    expect(result[2]!.type).toBe('user')
    expect(result[3]!.type).toBe('assistant')

    // The thinking assistant should NOT have been merged with the tool_use one
    const thinkingAssistant = result[1] as AssistantMessage
    const thinkingContent = thinkingAssistant.message.content as Array<{
      type: string
    }>
    expect(thinkingContent.some(b => b.type === 'tool_use')).toBe(false)

    const toolUseAssistant = result[3] as AssistantMessage
    const toolUseContent = toolUseAssistant.message.content as Array<{
      type: string
    }>
    expect(toolUseContent.some(b => b.type === 'tool_use')).toBe(true)
  })

  test('still merges consecutive same-id assistants without intervening tool_result', () => {
    const sharedMessageId = 'msg_shared_002'

    const thinkingMsg = createAssistantMessage({
      content: [{ type: 'thinking', thinking: 'Hmm', signature: 'sig2' }],
    })
    thinkingMsg.message.id = sharedMessageId

    const toolUseMsg = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_merge',
          name: 'Bash',
          input: { command: 'ls' },
        },
      ],
    })
    toolUseMsg.message.id = sharedMessageId

    // No tool_result between them — they should still be merged
    const messages: Message[] = [
      makeUserMsg('List files'),
      thinkingMsg,
      toolUseMsg,
    ]

    const result = normalizeMessagesForAPI(messages)

    // Should be: user, assistant[thinking + tool_use]
    expect(result).toHaveLength(2)
    expect(result[0]!.type).toBe('user')

    const merged = result[1] as AssistantMessage
    const content = merged.message.content as Array<{ type: string }>
    expect(content.some(b => b.type === 'thinking')).toBe(true)
    expect(content.some(b => b.type === 'tool_use')).toBe(true)
  })

  test('full pipeline: normalize + ensureToolResultPairing produces valid role alternation', () => {
    const sharedMessageId = 'msg_shared_003'
    const toolUseId = 'toolu_pipeline'

    const thinkingMsg = createAssistantMessage({
      content: [
        { type: 'thinking', thinking: 'Planning...', signature: 'sig3' },
      ],
    })
    thinkingMsg.message.id = sharedMessageId

    const toolResultMsg = createUserMessage({
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: 'file.txt',
        },
      ],
    })

    const toolUseMsg = createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'Bash',
          input: { command: 'ls' },
        },
      ],
    })
    toolUseMsg.message.id = sharedMessageId

    // Full pipeline: normalize → ensureToolResultPairing
    const normalized = normalizeMessagesForAPI([
      makeUserMsg('Run ls'),
      thinkingMsg,
      toolResultMsg,
      toolUseMsg,
    ])
    const result = ensureToolResultPairing(normalized)

    // Verify strict role alternation: user → assistant → user → assistant → ...
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1]!
      const curr = result[i]!
      if (prev.type === 'user' && curr.type === 'user') {
        expect.unreachable(`Consecutive user messages at index ${i - 1}-${i}`)
      }
      if (prev.type === 'assistant' && curr.type === 'assistant') {
        expect.unreachable(
          `Consecutive assistant messages at index ${i - 1}-${i}`,
        )
      }
    }
  })
})

// ─── Progress tick replace (Bash/PowerShell elapsed-time freeze) ──────────

describe('computeMessageStructureKey + updateMessageLookupsIncremental: progress replace', () => {
  // REPL.tsx replaces ephemeral progress ticks (Bash/PowerShell/MCP) in-place
  // to bound the messages array. The lookups cache must invalidate when the
  // trailing progress tick changes, or ShellProgressMessage's elapsed time
  // freezes at the first tick forever.

  type BashProgress = {
    type: 'bash_progress'
    elapsedTimeSeconds: number
    output: string
    fullOutput: string
  }

  function makeAssistantWithToolUse(toolUseID: string): Message {
    return createAssistantMessage({
      content: [
        {
          type: 'tool_use',
          id: toolUseID,
          name: 'Bash',
          input: { command: 'sleep 10' },
        } as any,
      ],
    })
  }

  function makeProgress(
    parentToolUseID: string,
    uuid: `${string}-${string}-${string}-${string}-${string}`,
    elapsedTimeSeconds: number,
  ) {
    const msg = createProgressMessage<BashProgress>({
      toolUseID: `bash-progress-${elapsedTimeSeconds}`,
      parentToolUseID,
      data: {
        type: 'bash_progress',
        elapsedTimeSeconds,
        output: '',
        fullOutput: '',
      },
    })
    // Override uuid so the test is deterministic (createProgressMessage
    // generates a random uuid).
    return { ...msg, uuid }
  }

  test('computeMessageStructureKey distinguishes progress ticks by uuid', () => {
    const assistant = makeAssistantWithToolUse('bash-1')
    const normalized = normalizeMessages([assistant])

    const progress1 = makeProgress(
      'bash-1',
      '00000000-0000-0000-0000-000000000001',
      3,
    )
    const progress2 = makeProgress(
      'bash-1',
      '00000000-0000-0000-0000-000000000002',
      4,
    )

    const keyBefore = computeMessageStructureKey(
      [...normalized, progress1 as any],
      [...normalized, progress1 as any] as any,
    )
    const keyAfter = computeMessageStructureKey(
      [...normalized, progress2 as any],
      [...normalized, progress2 as any] as any,
    )

    // Same parentToolUseID, same length, but different uuid (tick replace).
    // Without uuid in the key, these would be identical and the lookups cache
    // would freeze on the first tick.
    expect(keyBefore).not.toEqual(keyAfter)
  })

  test('updateMessageLookupsIncremental returns null when trailing progress was replaced (same length)', () => {
    const assistant = makeAssistantWithToolUse('bash-1')
    const normalized = normalizeMessages([assistant])

    const progress1 = makeProgress(
      'bash-1',
      '00000000-0000-0000-0000-000000000001',
      3,
    )
    const progress2 = makeProgress(
      'bash-1',
      '00000000-0000-0000-0000-000000000002',
      4,
    )

    const withProgress1 = [...normalized, progress1 as any]
    const withProgress2 = [...normalized, progress2 as any]

    const existing = buildMessageLookups(
      withProgress1 as any,
      withProgress1 as any,
    )

    // Same length, but the trailing progress is a fresh tick. Returning
    // `existing` here would leave progressMessagesByToolUseID stuck on u1.
    const result = updateMessageLookupsIncremental(
      existing,
      withProgress1.length,
      withProgress1.length,
      withProgress2 as any,
      withProgress2 as any,
    )

    expect(result).toBeNull()
  })

  test('updateMessageLookupsIncremental still returns existing when length same and trailing is NOT progress', () => {
    // Protect the original streaming-delta fast path: content-only changes
    // on a non-progress trailing message should not trigger a full rebuild.
    const assistant = makeAssistantWithToolUse('bash-1')
    const normalized = normalizeMessages([assistant])

    const existing = buildMessageLookups(normalized as any, normalized as any)

    const result = updateMessageLookupsIncremental(
      existing,
      normalized.length,
      normalized.length,
      normalized as any,
      normalized as any,
    )

    expect(result).toBe(existing)
  })

  test('full rebuild after progress replace yields the new tick in progressMessagesByToolUseID', () => {
    // End-to-end: buildMessageLookups after a tick replace must reflect the
    // fresh progress, not the stale one. This is what Messages.tsx falls back
    // to when updateMessageLookupsIncremental returns null.
    const assistant = makeAssistantWithToolUse('bash-1')
    const normalized = normalizeMessages([assistant])

    const progress1 = makeProgress(
      'bash-1',
      '00000000-0000-0000-0000-000000000001',
      3,
    )
    const progress2 = makeProgress(
      'bash-1',
      '00000000-0000-0000-0000-000000000002',
      4,
    )

    const withProgress2 = [...normalized, progress2 as any]
    const rebuilt = buildMessageLookups(
      withProgress2 as any,
      withProgress2 as any,
    )

    const arr = rebuilt.progressMessagesByToolUseID.get('bash-1')
    expect(arr).toBeDefined()
    expect(arr).toHaveLength(1)
    expect(arr![0].uuid).toBe('00000000-0000-0000-0000-000000000002')
    expect((arr![0].data as BashProgress).elapsedTimeSeconds).toBe(4)
  })
})
