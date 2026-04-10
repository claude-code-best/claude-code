import { describe, expect, test } from 'bun:test'
import { groupMessagesByApiRound } from '../grouping'

function makeMsg(type: 'user' | 'assistant' | 'system', id: string): any {
  return {
    type,
    message: { id, content: `${type}-${id}` },
  }
}

describe('groupMessagesByApiRound', () => {
  // Boundary fires when: assistant msg with NEW id AND current group has items
  test('splits before first assistant if user messages precede it', () => {
    const messages = [makeMsg('user', 'u1'), makeMsg('assistant', 'a1')]
    const groups = groupMessagesByApiRound(messages)
    // user msgs form group 1, assistant starts group 2
    expect(groups).toHaveLength(2)
    expect(groups[0]).toHaveLength(1)
    expect(groups[1]).toHaveLength(1)
  })

  test('single assistant message forms one group', () => {
    const messages = [makeMsg('assistant', 'a1')]
    const groups = groupMessagesByApiRound(messages)
    expect(groups).toHaveLength(1)
  })

  test('splits at new assistant message ID', () => {
    const messages = [
      makeMsg('user', 'u1'),
      makeMsg('assistant', 'a1'),
      makeMsg('assistant', 'a2'),
    ]
    const groups = groupMessagesByApiRound(messages)
    expect(groups).toHaveLength(3)
  })

  test('keeps same-ID assistant messages in same group (streaming chunks)', () => {
    const messages = [
      makeMsg('assistant', 'a1'),
      makeMsg('assistant', 'a1'),
      makeMsg('assistant', 'a1'),
    ]
    const groups = groupMessagesByApiRound(messages)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(3)
  })

  test('returns empty array for empty input', () => {
    expect(groupMessagesByApiRound([])).toEqual([])
  })

  test('handles all user messages (no assistant)', () => {
    const messages = [makeMsg('user', 'u1'), makeMsg('user', 'u2')]
    const groups = groupMessagesByApiRound(messages)
    expect(groups).toHaveLength(1)
  })

  test('three API rounds produce correct groups', () => {
    const messages = [
      makeMsg('user', 'u1'),
      makeMsg('assistant', 'a1'),
      makeMsg('user', 'u2'),
      makeMsg('assistant', 'a2'),
      makeMsg('user', 'u3'),
      makeMsg('assistant', 'a3'),
    ]
    const groups = groupMessagesByApiRound(messages)
    // [u1], [a1, u2], [a2, u3], [a3] = 4 groups
    expect(groups).toHaveLength(4)
  })

  test('consecutive user messages stay in same group', () => {
    const messages = [makeMsg('user', 'u1'), makeMsg('user', 'u2')]
    expect(groupMessagesByApiRound(messages)).toHaveLength(1)
  })

  test('does not produce empty groups', () => {
    const messages = [makeMsg('assistant', 'a1'), makeMsg('assistant', 'a2')]
    const groups = groupMessagesByApiRound(messages)
    for (const group of groups) {
      expect(group.length).toBeGreaterThan(0)
    }
  })

  test('handles single message', () => {
    expect(groupMessagesByApiRound([makeMsg('user', 'u1')])).toHaveLength(1)
  })

  test('preserves message order within groups', () => {
    const messages = [makeMsg('assistant', 'a1'), makeMsg('user', 'u2')]
    const groups = groupMessagesByApiRound(messages)
    expect(groups[0][0].message.id).toBe('a1')
    expect(groups[0][1].message.id).toBe('u2')
  })

  test('handles system messages', () => {
    const messages = [makeMsg('system', 's1'), makeMsg('assistant', 'a1')]
    // system msg is non-assistant, goes to current. Then assistant a1 is new ID
    // and current has items, so split.
    const groups = groupMessagesByApiRound(messages)
    expect(groups).toHaveLength(2)
  })

  test('tool_result after assistant stays in same round', () => {
    const messages = [
      makeMsg('assistant', 'a1'),
      makeMsg('user', 'tool_result_1'),
      makeMsg('assistant', 'a1'), // same ID = no new boundary
    ]
    const groups = groupMessagesByApiRound(messages)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(3)
  })
})
