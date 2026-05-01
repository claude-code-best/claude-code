import { describe, expect, test } from 'bun:test'
import { isSnipBoundaryMessage, projectSnippedView } from '../snipProjection.js'
import type { Message } from 'src/types/message.js'

// --- Helpers ---

function makeMessage(uuid: string, type: Message['type'] = 'user'): Message {
  return {
    type,
    uuid,
    message: {
      role: type === 'user' ? 'user' : 'assistant',
      content: `Message ${uuid}`,
    },
  } as Message
}

function makeSystemMessage(
  uuid: string,
  subtype?: string,
  extra?: Record<string, unknown>,
): Message {
  const msg: Message = {
    type: 'system',
    uuid,
    message: { role: 'system', content: '' },
    ...extra,
  } as Message
  if (subtype) {
    ;(msg as Record<string, unknown>).subtype = subtype
  }
  return msg
}

function makeSnipBoundary(uuid: string, removedUuids: string[]): Message {
  return makeSystemMessage(uuid, 'snip_boundary', {
    snipMetadata: { removedUuids },
    content: '[snip]',
  })
}

// --- isSnipBoundaryMessage ---

describe('isSnipBoundaryMessage', () => {
  test('returns true for system message with snip_boundary subtype', () => {
    const msg = makeSnipBoundary('b1', ['a'])
    expect(isSnipBoundaryMessage(msg)).toBe(true)
  })

  test('returns false for system message with different subtype', () => {
    const msg = makeSystemMessage('s1', 'local_command')
    expect(isSnipBoundaryMessage(msg)).toBe(false)
  })

  test('returns false for system message with no subtype', () => {
    const msg = makeSystemMessage('s1')
    expect(isSnipBoundaryMessage(msg)).toBe(false)
  })

  test('returns false for non-system message', () => {
    const msg = makeMessage('u1', 'user')
    expect(isSnipBoundaryMessage(msg)).toBe(false)
  })

  test('returns false for assistant message', () => {
    const msg = makeMessage('a1', 'assistant')
    expect(isSnipBoundaryMessage(msg)).toBe(false)
  })
})

// --- projectSnippedView ---

describe('projectSnippedView', () => {
  test('returns same array when no boundaries exist', () => {
    const msgs = [makeMessage('a'), makeMessage('b')]
    const result = projectSnippedView(msgs)
    expect(result).toBe(msgs) // same reference — no copy
  })

  test('filters out messages listed in removedUuids', () => {
    const a = makeMessage('a')
    const b = makeMessage('b')
    const c = makeMessage('c')
    const boundary = makeSnipBoundary('bnd', ['a', 'c'])

    const result = projectSnippedView([a, b, c, boundary])
    expect(result.map(m => m.uuid) as string[]).toEqual(['b', 'bnd'])
  })

  test('preserves boundary messages themselves', () => {
    const a = makeMessage('a')
    const boundary = makeSnipBoundary('bnd', ['a'])

    const result = projectSnippedView([a, boundary])
    expect(result).toHaveLength(1)
    expect(result[0]!.uuid as string).toBe('bnd')
  })

  test('handles multiple boundaries accumulating removedUuids', () => {
    const a = makeMessage('a')
    const b = makeMessage('b')
    const c = makeMessage('c')
    const d = makeMessage('d')
    const boundary1 = makeSnipBoundary('bnd1', ['a'])
    const boundary2 = makeSnipBoundary('bnd2', ['c'])

    const result = projectSnippedView([a, boundary1, b, c, boundary2, d])
    expect(result.map(m => m.uuid) as string[]).toEqual([
      'bnd1',
      'b',
      'bnd2',
      'd',
    ])
  })

  test('returns all messages when boundary has empty removedUuids', () => {
    const a = makeMessage('a')
    const boundary = makeSnipBoundary('bnd', [])

    const result = projectSnippedView([a, boundary])
    expect(result.map(m => m.uuid) as string[]).toEqual(['a', 'bnd'])
  })

  test('handles empty message array', () => {
    const result = projectSnippedView([])
    expect(result).toHaveLength(0)
  })
})
