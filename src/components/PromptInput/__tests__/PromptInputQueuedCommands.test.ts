import { describe, expect, test } from 'bun:test'
import { truncateQueuedPreview } from '../PromptInputQueuedCommands.js'

// Official 2.1.330 (changelog: "a long queued message hiding Claude's reply
// while it streams, and erasing it from scrollback in the classic
// renderer"): while a reply streams, the queue preview is capped to a
// couple of rows so a long queued message can't grow the classic front
// frame over the streaming reply.
describe('truncateQueuedPreview', () => {
  test('short single-line message passes through unchanged', () => {
    expect(truncateQueuedPreview('fix the bug')).toBe('fix the bug')
  })

  test('two-line message passes through unchanged', () => {
    const value = 'first line\nsecond line'
    expect(truncateQueuedPreview(value)).toBe(value)
  })

  test('multi-line message is capped to two lines with an ellipsis', () => {
    const value = 'line one\nline two\nline three\nline four'
    expect(truncateQueuedPreview(value)).toBe('line one\nline two…')
  })

  test('very long single line is capped by characters with an ellipsis', () => {
    const value = 'x'.repeat(500)
    const result = truncateQueuedPreview(value)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(241)
    expect(result.startsWith('x'.repeat(240))).toBe(true)
  })

  test('multi-line message that is also long is capped by lines then chars', () => {
    const value = `${'a'.repeat(200)}\n${'b'.repeat(200)}\n${'c'.repeat(200)}`
    const result = truncateQueuedPreview(value)
    expect(result.endsWith('…')).toBe(true)
    // First two lines kept, then the 240-char cap applied across them.
    expect(result.startsWith('a'.repeat(200))).toBe(true)
    expect(result).not.toContain('c')
  })
})
