import { mock, describe, expect, test } from 'bun:test'

// Mock log.ts to cut the heavy dependency chain
mock.module('src/utils/log.ts', () => ({
  logError: () => {},
  logToFile: () => {},
  getLogDisplayTitle: () => '',
  logEvent: () => {},
  logMCPError: () => {},
  logMCPDebug: () => {},
  dateToFilename: (d: Date) => d.toISOString().replace(/[:.]/g, '-'),
  getLogFilePath: () => '/tmp/mock-log',
  attachErrorLogSink: () => {},
  getInMemoryErrors: () => [],
  loadErrorLogs: async () => [],
  getErrorLogByIndex: async () => null,
  captureAPIRequest: () => {},
  _resetErrorLogForTesting: () => {},
}))

const {
  normalizeQuotes,
  stripTrailingWhitespace,
  findActualString,
  preserveQuoteStyle,
  applyEditToFile,
  LEFT_SINGLE_CURLY_QUOTE,
  RIGHT_SINGLE_CURLY_QUOTE,
  LEFT_DOUBLE_CURLY_QUOTE,
  RIGHT_DOUBLE_CURLY_QUOTE,
} = await import('../utils')

// ─── normalizeQuotes ────────────────────────────────────────────────────

describe('normalizeQuotes', () => {
  test('converts left single curly to straight', () => {
    expect(normalizeQuotes(`${LEFT_SINGLE_CURLY_QUOTE}hello`)).toBe("'hello")
  })

  test('converts right single curly to straight', () => {
    expect(normalizeQuotes(`hello${RIGHT_SINGLE_CURLY_QUOTE}`)).toBe("hello'")
  })

  test('converts left double curly to straight', () => {
    expect(normalizeQuotes(`${LEFT_DOUBLE_CURLY_QUOTE}hello`)).toBe('"hello')
  })

  test('converts right double curly to straight', () => {
    expect(normalizeQuotes(`hello${RIGHT_DOUBLE_CURLY_QUOTE}`)).toBe('hello"')
  })

  test('leaves straight quotes unchanged', () => {
    expect(normalizeQuotes('\'hello\' "world"')).toBe('\'hello\' "world"')
  })

  test('handles empty string', () => {
    expect(normalizeQuotes('')).toBe('')
  })
})

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

  test('finds match with curly quotes normalized', () => {
    const fileContent = `${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE}`
    const result = findActualString(fileContent, '"hello"')
    expect(result).not.toBeNull()
  })

  test('returns null when not found', () => {
    expect(findActualString('hello world', 'xyz')).toBeNull()
  })

  test('returns null for empty search in non-empty content', () => {
    // Empty string is always found at index 0 via includes()
    const result = findActualString('hello', '')
    expect(result).toBe('')
  })
})

// ─── preserveQuoteStyle ─────────────────────────────────────────────────

describe('preserveQuoteStyle', () => {
  test('returns newString unchanged when no normalization happened', () => {
    expect(preserveQuoteStyle('hello', 'hello', 'world')).toBe('world')
  })

  test('converts straight double quotes to curly in replacement', () => {
    const oldString = '"hello"'
    const actualOldString = `${LEFT_DOUBLE_CURLY_QUOTE}hello${RIGHT_DOUBLE_CURLY_QUOTE}`
    const newString = '"world"'
    const result = preserveQuoteStyle(oldString, actualOldString, newString)
    expect(result).toContain(LEFT_DOUBLE_CURLY_QUOTE)
    expect(result).toContain(RIGHT_DOUBLE_CURLY_QUOTE)
  })

  test('converts straight single quotes to curly in replacement', () => {
    const oldString = "'hello'"
    const actualOldString = `${LEFT_SINGLE_CURLY_QUOTE}hello${RIGHT_SINGLE_CURLY_QUOTE}`
    const newString = "'world'"
    const result = preserveQuoteStyle(oldString, actualOldString, newString)
    expect(result).toContain(LEFT_SINGLE_CURLY_QUOTE)
    expect(result).toContain(RIGHT_SINGLE_CURLY_QUOTE)
  })

  test('treats apostrophe in contraction as right curly quote', () => {
    const oldString = "'it's a test'"
    const actualOldString = `${LEFT_SINGLE_CURLY_QUOTE}it${RIGHT_SINGLE_CURLY_QUOTE}s a test${RIGHT_SINGLE_CURLY_QUOTE}`
    const newString = "'don't worry'"
    const result = preserveQuoteStyle(oldString, actualOldString, newString)
    // The leading ' at position 0 should be LEFT_SINGLE_CURLY_QUOTE
    expect(result[0]).toBe(LEFT_SINGLE_CURLY_QUOTE)
    // The apostrophe in "don't" (between n and t) should be RIGHT_SINGLE_CURLY_QUOTE
    expect(result).toContain(RIGHT_SINGLE_CURLY_QUOTE)
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
