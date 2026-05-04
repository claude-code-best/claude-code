import { describe, expect, test } from 'bun:test'
import {
  FINGERPRINT_SALT,
  extractFirstMessageText,
  computeFingerprint,
} from '../fingerprint'

describe('FINGERPRINT_SALT', () => {
  test("has expected value '59cf53e54c78'", () => {
    expect(FINGERPRINT_SALT).toBe('59cf53e54c78')
  })
})

describe('extractFirstMessageText', () => {
  test('extracts text from first user message', () => {
    const messages = [{ type: 'user', message: { content: 'hello world' } }]
    expect(extractFirstMessageText(messages as any)).toBe('hello world')
  })

  test('extracts text from single user message with array content', () => {
    const messages = [
      {
        type: 'user',
        message: {
          content: [
            { type: 'text', text: 'hello' },
            { type: 'image', url: 'x' },
          ],
        },
      },
    ]
    expect(extractFirstMessageText(messages as any)).toBe('hello')
  })

  test('returns empty string when no user messages', () => {
    const messages = [{ type: 'assistant', message: { content: 'hi' } }]
    expect(extractFirstMessageText(messages as any)).toBe('')
  })

  test('skips assistant messages', () => {
    const messages = [
      { type: 'assistant', message: { content: 'hi' } },
      { type: 'user', message: { content: 'hello' } },
    ]
    expect(extractFirstMessageText(messages as any)).toBe('hello')
  })

  test('handles mixed content blocks (text + image)', () => {
    const messages = [
      {
        type: 'user',
        message: {
          content: [
            { type: 'image', url: 'http://example.com/img.png' },
            { type: 'text', text: 'after image' },
          ],
        },
      },
    ]
    expect(extractFirstMessageText(messages as any)).toBe('after image')
  })

  test('returns empty string for empty array', () => {
    expect(extractFirstMessageText([])).toBe('')
  })

  test('returns empty string when content has no text block', () => {
    const messages = [
      {
        type: 'user',
        message: {
          content: [{ type: 'image', url: 'x' }],
        },
      },
    ]
    expect(extractFirstMessageText(messages as any)).toBe('')
  })
})

describe('computeFingerprint', () => {
  test('returns deterministic 3-char hex string', () => {
    const result = computeFingerprint('test message', '1.0.0')
    expect(result).toHaveLength(3)
    expect(result).toMatch(/^[0-9a-f]{3}$/)
  })

  test('same input produces same fingerprint', () => {
    const a = computeFingerprint('same input', '1.0.0')
    const b = computeFingerprint('same input', '1.0.0')
    expect(a).toBe(b)
  })

  test('different message text produces different fingerprint', () => {
    const a = computeFingerprint('hello world from test one', '1.0.0')
    const b = computeFingerprint('goodbye world from test two', '1.0.0')
    expect(a).not.toBe(b)
  })

  test('different version produces different fingerprint', () => {
    const a = computeFingerprint('same text', '1.0.0')
    const b = computeFingerprint('same text', '2.0.0')
    expect(a).not.toBe(b)
  })

  test('handles short strings (length < 21)', () => {
    const result = computeFingerprint('hi', '1.0.0')
    expect(result).toHaveLength(3)
    expect(result).toMatch(/^[0-9a-f]{3}$/)
  })

  test('handles empty string', () => {
    const result = computeFingerprint('', '1.0.0')
    expect(result).toHaveLength(3)
    expect(result).toMatch(/^[0-9a-f]{3}$/)
  })

  test('fingerprint is valid hex', () => {
    const result = computeFingerprint('any message here for testing', '3.5.1')
    expect(result).toMatch(/^[0-9a-f]{3}$/)
  })
})
