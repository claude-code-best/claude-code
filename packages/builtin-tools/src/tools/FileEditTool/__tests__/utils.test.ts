import { mock, describe, expect, test } from 'bun:test'
import { logMock } from '../../../../../../tests/mocks/log'

// Mock log.ts to cut the heavy dependency chain
mock.module('src/utils/log.ts', logMock)

const { stripTrailingWhitespace, findActualString, applyEditToFile } =
  await import('../utils')

// ─── stripTrailingWhitespace ────────────────────────────────────────────

describe('stripTrailingWhitespace', () => {
  test('strips trailing spaces from lines', () => {
    expect(stripTrailingWhitespace('hello   \nworld  ')).toBe('hello\nworld')
  })

  test('strips trailing tabs', () => {
    expect(stripTrailingWhitespace('hello\t\nworld\t')).toBe('hello\nworld')
  })

  test('preserves leading whitespace', () => {
    expect(stripTrailingWhitespace('  hello  \n  world  ')).toBe(
      '  hello\n  world',
    )
  })

  test('handles empty string', () => {
    expect(stripTrailingWhitespace('')).toBe('')
  })

  test('handles CRLF line endings', () => {
    expect(stripTrailingWhitespace('hello   \r\nworld  ')).toBe(
      'hello\r\nworld',
    )
  })

  test('handles no trailing whitespace', () => {
    expect(stripTrailingWhitespace('hello\nworld')).toBe('hello\nworld')
  })

  test('handles CR-only line endings', () => {
    expect(stripTrailingWhitespace('hello   \rworld  ')).toBe('hello\rworld')
  })

  test('handles content with no trailing newline', () => {
    expect(stripTrailingWhitespace('hello   ')).toBe('hello')
  })
})

// ─── findActualString ───────────────────────────────────────────────────

describe('findActualString', () => {
  test('finds exact match', () => {
    expect(findActualString('hello world', 'hello')).toBe('hello')
  })

  test('returns null when not found', () => {
    expect(findActualString('hello world', 'xyz')).toBeNull()
  })

  test('returns null for empty search in non-empty content', () => {
    // Empty string is always found at index 0 via includes()
    const result = findActualString('hello', '')
    expect(result).toBe('')
  })

  // ── CJK / UTF-8 characters ──

  test('finds match with CJK characters in content', () => {
    const fileContent = 'input int x = 620; // 止盈点数(点) — 32个pip=320点'
    const result = findActualString(fileContent, fileContent)
    expect(result).toBe(fileContent)
  })
})

// ─── applyEditToFile ────────────────────────────────────────────────────

describe('applyEditToFile', () => {
  test('replaces first occurrence by default', () => {
    expect(applyEditToFile('foo bar foo', 'foo', 'baz')).toBe('baz bar foo')
  })

  test('replaces all occurrences with replaceAll=true', () => {
    expect(applyEditToFile('foo bar foo', 'foo', 'baz', true)).toBe(
      'baz bar baz',
    )
  })

  test('handles deletion (empty newString) with trailing newline', () => {
    const result = applyEditToFile('line1\nline2\nline3\n', 'line2', '')
    expect(result).toBe('line1\nline3\n')
  })

  test('handles deletion without trailing newline', () => {
    const result = applyEditToFile('foobar', 'foo', '')
    expect(result).toBe('bar')
  })

  test('handles no match (returns original)', () => {
    expect(applyEditToFile('hello world', 'xyz', 'abc')).toBe('hello world')
  })

  test('handles empty original content with insertion', () => {
    expect(applyEditToFile('', '', 'new content')).toBe('new content')
  })

  test('handles multiline oldString and newString', () => {
    const content = 'line1\nline2\nline3\n'
    const result = applyEditToFile(content, 'line2\nline3', 'replaced')
    expect(result).toBe('line1\nreplaced\n')
  })

  test('handles multiline replacement across multiple lines', () => {
    const content = 'header\nold line A\nold line B\nfooter\n'
    const result = applyEditToFile(
      content,
      'old line A\nold line B',
      'new line X\nnew line Y',
    )
    expect(result).toBe('header\nnew line X\nnew line Y\nfooter\n')
  })
})
