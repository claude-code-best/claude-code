import { describe, expect, test } from 'bun:test'
import { applyGrouping } from '../groupToolUses'

// Helper: build minimal tool-use assistant message
function makeToolUseMsg(
  uuid: string,
  messageId: string,
  toolUseId: string,
  toolName: string,
): any {
  return {
    type: 'assistant',
    uuid,
    timestamp: Date.now(),
    message: {
      id: messageId,
      content: [{ type: 'tool_use', id: toolUseId, name: toolName, input: {} }],
    },
  }
}

// Helper: build minimal tool-result user message
function makeToolResultMsg(uuid: string, toolUseId: string): any {
  return {
    type: 'user',
    uuid,
    timestamp: Date.now(),
    message: {
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }],
    },
  }
}

// Helper: build minimal text assistant message
function makeTextMsg(uuid: string, text: string): any {
  return {
    type: 'assistant',
    uuid,
    timestamp: Date.now(),
    message: { id: `msg-${uuid}`, content: [{ type: 'text', text }] },
  }
}

// Minimal tool definitions
const groupableTool: any = { name: 'Grep', renderGroupedToolUse: true }
const nonGroupableTool: any = { name: 'Bash', renderGroupedToolUse: undefined }

// ─── applyGrouping ────────────────────────────────────────────────────

describe('applyGrouping', () => {
  test('returns all messages in verbose mode', () => {
    const msgs = [
      makeToolUseMsg('u1', 'm1', 'tu1', 'Grep'),
      makeToolUseMsg('u2', 'm1', 'tu2', 'Grep'),
    ]
    const result = applyGrouping(msgs, [groupableTool], true)
    expect(result.messages).toHaveLength(2)
    expect(result.messages).toBe(msgs) // same reference
  })

  test('does not group when tool lacks renderGroupedToolUse', () => {
    const msgs = [
      makeToolUseMsg('u1', 'm1', 'tu1', 'Bash'),
      makeToolUseMsg('u2', 'm1', 'tu2', 'Bash'),
    ]
    const result = applyGrouping(msgs, [nonGroupableTool])
    expect(result.messages).toHaveLength(2)
    // Both messages should pass through as-is
    expect(result.messages[0]).toBe(msgs[0])
  })

  test('does not group single tool use', () => {
    const msgs = [makeToolUseMsg('u1', 'm1', 'tu1', 'Grep')]
    const result = applyGrouping(msgs, [groupableTool])
    expect(result.messages).toHaveLength(1)
    expect((result.messages[0] as any).type).toBe('assistant')
  })

  test('groups 2+ tool uses of same type from same message', () => {
    const msgs = [
      makeToolUseMsg('u1', 'm1', 'tu1', 'Grep'),
      makeToolUseMsg('u2', 'm1', 'tu2', 'Grep'),
      makeToolUseMsg('u3', 'm1', 'tu3', 'Grep'),
    ]
    const result = applyGrouping(msgs, [groupableTool])
    expect(result.messages).toHaveLength(1)
    const grouped = result.messages[0] as any
    expect(grouped.type).toBe('grouped_tool_use')
    expect(grouped.toolName).toBe('Grep')
    expect(grouped.messages).toHaveLength(3)
  })

  test('does not group tool uses from different messages', () => {
    const msgs = [
      makeToolUseMsg('u1', 'm1', 'tu1', 'Grep'),
      makeToolUseMsg('u2', 'm2', 'tu2', 'Grep'),
    ]
    const result = applyGrouping(msgs, [groupableTool])
    // Each belongs to a different message.id, so no group (< 2 per group)
    expect(result.messages).toHaveLength(2)
  })

  test('collects tool results for grouped uses', () => {
    const msgs = [
      makeToolUseMsg('u1', 'm1', 'tu1', 'Grep'),
      makeToolUseMsg('u2', 'm1', 'tu2', 'Grep'),
      makeToolResultMsg('u3', 'tu1'),
      makeToolResultMsg('u4', 'tu2'),
    ]
    const result = applyGrouping(msgs, [groupableTool])
    const grouped = result.messages[0] as any
    expect(grouped.type).toBe('grouped_tool_use')
    expect(grouped.results).toHaveLength(2)
  })

  test('skips user messages whose tool_results are all grouped', () => {
    const msgs = [
      makeToolUseMsg('u1', 'm1', 'tu1', 'Grep'),
      makeToolUseMsg('u2', 'm1', 'tu2', 'Grep'),
      makeToolResultMsg('u3', 'tu1'),
      makeToolResultMsg('u4', 'tu2'),
    ]
    const result = applyGrouping(msgs, [groupableTool])
    // Only the grouped message should remain — result messages are consumed
    expect(result.messages).toHaveLength(1)
  })

  test('preserves non-grouped messages alongside groups', () => {
    const msgs = [
      makeTextMsg('u0', 'thinking...'),
      makeToolUseMsg('u1', 'm1', 'tu1', 'Grep'),
      makeToolUseMsg('u2', 'm1', 'tu2', 'Grep'),
      makeTextMsg('u3', 'done'),
    ]
    const result = applyGrouping(msgs, [groupableTool])
    expect(result.messages).toHaveLength(3) // text + grouped + text
    expect((result.messages[0] as any).type).toBe('assistant')
    expect((result.messages[1] as any).type).toBe('grouped_tool_use')
    expect((result.messages[2] as any).type).toBe('assistant')
  })

  test('handles empty messages array', () => {
    const result = applyGrouping([], [groupableTool])
    expect(result.messages).toHaveLength(0)
  })

  test('handles empty tools array', () => {
    const msgs = [makeToolUseMsg('u1', 'm1', 'tu1', 'Grep')]
    const result = applyGrouping(msgs, [])
    expect(result.messages).toHaveLength(1)
  })
})
