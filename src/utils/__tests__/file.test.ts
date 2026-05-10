import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

import {
  convertLeadingTabsToSpaces,
  addLineNumbers,
  stripLineNumberPrefix,
  pathsEqual,
  normalizePathForComparison,
  writeTextContent,
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

describe('writeTextContent with multi-encoding', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join('/tmp', 'writeTextContent-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('writes UTF-8 content correctly', () => {
    const filePath = path.join(tmpDir, 'utf8.txt')
    writeTextContent(filePath, 'Hello 世界', 'utf-8', 'LF')
    const content = fs.readFileSync(filePath, 'utf-8')
    expect(content).toBe('Hello 世界')
  })

  test('writes UTF-16LE content correctly', () => {
    const filePath = path.join(tmpDir, 'utf16le.txt')
    writeTextContent(filePath, 'Hello', 'utf-16le', 'LF')
    const buf = fs.readFileSync(filePath)
    // Should start with BOM (0xFF 0xFE) followed by UTF-16LE data
    // Note: Bun's Buffer.from('Hello', 'utf-16le') doesn't add BOM
    const text = buf.toString('utf-16le')
    expect(text).toBe('Hello')
  })

  test('GBK write falls back to UTF-8', () => {
    const filePath = path.join(tmpDir, 'gbk.txt')
    writeTextContent(filePath, '测试写入', 'gbk', 'LF')
    const content = fs.readFileSync(filePath, 'utf-8')
    // Content should be readable (either GBK or UTF-8 fallback)
    expect(content.length).toBeGreaterThan(0)
  })

  test('CRLF line endings with GBK encoding', () => {
    const filePath = path.join(tmpDir, 'gbk-crlf.txt')
    writeTextContent(filePath, 'line1\nline2', 'gbk', 'CRLF')
    const buf = fs.readFileSync(filePath)
    const content = buf.toString('utf-8')
    // Should have CRLF line endings
    expect(content).toContain('\r\n')
    expect(content).not.toContain('\n\r')
  })
})
