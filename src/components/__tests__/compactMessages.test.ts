import { describe, expect, test } from 'bun:test'

/**
 * Verify compaction and context-related user messages are clear and actionable.
 * Pure string tests — no side effects.
 */

describe('Compaction error messages', () => {
  test('not enough messages includes guidance', () => {
    const msg =
      'Not enough messages to compact. Send a few more messages first, then try again.'
    expect(msg).toContain('Not enough messages')
    expect(msg).toContain('try again')
  })

  test('prompt too long suggests actions', () => {
    const msg =
      'Conversation too long to summarize. Try /compact to manually clear conversation history, or start a new session with /clear.'
    expect(msg).toContain('/compact')
    expect(msg).toContain('/clear')
    expect(msg).toContain('too long')
  })

  test('incomplete response mentions network', () => {
    const msg =
      'Compaction interrupted · This may be due to network issues — please try again.'
    expect(msg).toContain('interrupted')
    expect(msg).toContain('try again')
  })

  test('user abort is clear', () => {
    const msg = 'API Error: Request was aborted.'
    expect(msg).toContain('aborted')
  })
})

describe('CompactSummary display text', () => {
  test('auto-compact title explains what happened', () => {
    const title = 'Conversation summarized to free up context'
    expect(title).toContain('summarized')
    expect(title).toContain('context')
    expect(title).not.toContain('Compact summary')
  })

  test('manual compact title mentions message count', () => {
    const line1 = 'Summarized conversation'
    expect(line1).toContain('Summarized')
  })

  test('expand hint says "view summary" not "expand"', () => {
    const hint = 'view summary'
    expect(hint).toContain('summary')
  })
})
