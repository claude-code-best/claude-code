import { describe, expect, test } from 'bun:test'
import {
  convertLeadingTabsToSpaces,
  addLineNumbers,
  stripLineNumberPrefix,
  pathsEqual,
  normalizePathForComparison,
} from '../file'

describe('convertLeadingTabsToSpaces', () => {
  test('converts leading tabs to 2 spaces each', () => {
    expect(convertLeadingTabsToSpaces('\t\thello')).toBe('    hello')
  })

  test('only converts leading tabs', () => {
    expect(convertLeadingTabsToSpaces('\thello\tworld')).toBe('  hello\tworld')
  })

  test('returns unchanged if no tabs', () => {
    expect(convertLeadingTabsToSpaces('no tabs')).toBe('no tabs')
  })

  test('handles empty string', () => {
    expect(convertLeadingTabsToSpaces('')).toBe('')
  })

  test('handles multiline content', () => {
    const input = '\tline1\n\t\tline2\nline3'
    const expected = '  line1\n    line2\nline3'
    expect(convertLeadingTabsToSpaces(input)).toBe(expected)
  })
})

describe('addLineNumbers', () => {
  test('adds line numbers starting from 1', () => {
    const result = addLineNumbers({ content: 'a\nb\nc', startLine: 1 })
    expect(result).toMatch(/^\s*1[→\t]a\n\s*2[→\t]b\n\s*3[→\t]c$/)
  })

  test('returns empty string for empty content', () => {
    expect(addLineNumbers({ content: '', startLine: 1 })).toBe('')
  })

  test('respects startLine offset', () => {
    const result = addLineNumbers({ content: 'hello', startLine: 10 })
    expect(result).toMatch(/^\s*10[→\t]hello$/)
  })
})

describe('stripLineNumberPrefix', () => {
  test('strips arrow-separated prefix', () => {
    expect(stripLineNumberPrefix('     1→content')).toBe('content')
  })

  test('strips tab-separated prefix', () => {
    expect(stripLineNumberPrefix('1\tcontent')).toBe('content')
  })

  test('returns line unchanged if no prefix', () => {
    expect(stripLineNumberPrefix('no prefix')).toBe('no prefix')
  })

  test('handles large line numbers', () => {
    expect(stripLineNumberPrefix('123456→content')).toBe('content')
  })
})

describe('normalizePathForComparison', () => {
  test('normalizes redundant separators', () => {
    const result = normalizePathForComparison('/a//b/c')
    expect(result).toBe('/a/b/c')
  })

  test('resolves dot segments', () => {
    const result = normalizePathForComparison('/a/./b/../c')
    expect(result).toBe('/a/c')
  })
})

describe('pathsEqual', () => {
  test('returns true for identical paths', () => {
    expect(pathsEqual('/a/b/c', '/a/b/c')).toBe(true)
  })

  test('returns true for equivalent paths with dot segments', () => {
    expect(pathsEqual('/a/./b', '/a/b')).toBe(true)
  })

  test('returns false for different paths', () => {
    expect(pathsEqual('/a/b', '/a/c')).toBe(false)
  })
})
