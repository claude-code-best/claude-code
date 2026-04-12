import { describe, expect, test } from 'bun:test'
import { recursivelySanitizeUnicode } from '../sanitization.js'

describe('recursivelySanitizeUnicode', () => {
  test('passes through clean strings', () => {
    expect(recursivelySanitizeUnicode('hello world')).toBe('hello world')
    expect(recursivelySanitizeUnicode('')).toBe('')
  })

  test('removes control characters', () => {
    expect(recursivelySanitizeUnicode('hello\x00world')).toBe('helloworld')
    expect(recursivelySanitizeUnicode('test\x07bell')).toBe('testbell')
  })

  test('preserves allowed whitespace', () => {
    expect(recursivelySanitizeUnicode('hello\tworld')).toBe('hello\tworld')
    expect(recursivelySanitizeUnicode('hello\nworld')).toBe('hello\nworld')
    expect(recursivelySanitizeUnicode('hello\rworld')).toBe('hello\rworld')
  })

  test('removes replacement character', () => {
    expect(recursivelySanitizeUnicode('hello\uFFFDworld')).toBe('helloworld')
  })

  test('normalizes to NFC', () => {
    // é can be composed (U+00E9) or decomposed (U+0065 + U+0301)
    const decomposed = 'e\u0301'
    const result = recursivelySanitizeUnicode(decomposed)
    expect(result).toBe('é')
  })

  test('sanitizes arrays recursively', () => {
    const input = ['hello\x00world', 'clean']
    expect(recursivelySanitizeUnicode(input)).toEqual(['helloworld', 'clean'])
  })

  test('sanitizes objects recursively', () => {
    const input = { name: 'test\x07', nested: { value: 'a\x00b' } }
    expect(recursivelySanitizeUnicode(input)).toEqual({
      name: 'test',
      nested: { value: 'ab' },
    })
  })

  test('handles null and non-string primitives', () => {
    expect(recursivelySanitizeUnicode(null)).toBe(null)
    expect(recursivelySanitizeUnicode(42)).toBe(42)
    expect(recursivelySanitizeUnicode(true)).toBe(true)
    expect(recursivelySanitizeUnicode(undefined)).toBe(undefined)
  })
})
