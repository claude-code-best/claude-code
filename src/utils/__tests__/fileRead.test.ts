import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

import {
  readFileSyncWithMetadata,
  detectEncodingForResolvedPath,
} from '../fileRead'

describe('readFileSyncWithMetadata', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join('/tmp', 'fileRead-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('reads UTF-8 file correctly', () => {
    const filePath = path.join(tmpDir, 'utf8.txt')
    fs.writeFileSync(filePath, 'Hello, 世界\n', 'utf-8')

    const result = readFileSyncWithMetadata(filePath)
    expect(result.encoding).toBe('utf-8')
    expect(result.content).toBe('Hello, 世界\n')
    expect(result.lineEndings).toBe('LF')
  })

  test('reads GBK encoded file correctly', () => {
    const filePath = path.join(tmpDir, 'gbk.txt')
    // "你好世界" in GBK encoding
    const gbkBytes = Buffer.from([
      0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7,
    ])
    fs.writeFileSync(filePath, gbkBytes)

    const result = readFileSyncWithMetadata(filePath)
    expect(result.encoding).toBe('gbk')
    expect(result.content).toBe('你好世界')
  })

  test('reads empty file with utf8 encoding', () => {
    const filePath = path.join(tmpDir, 'empty.txt')
    fs.writeFileSync(filePath, '')

    const result = readFileSyncWithMetadata(filePath)
    expect(result.encoding).toBe('utf8')
    expect(result.content).toBe('')
  })

  test('reads UTF-16LE BOM file correctly', () => {
    const filePath = path.join(tmpDir, 'utf16le.txt')
    // BOM + "Hello" in UTF-16LE
    const bom = Buffer.from([0xff, 0xfe])
    const content = Buffer.from('Hello', 'utf-16le')
    fs.writeFileSync(filePath, Buffer.concat([bom, content]))

    const result = readFileSyncWithMetadata(filePath)
    expect(result.encoding).toBe('utf-16le')
    expect(result.content).toBe('Hello')
  })

  test('normalizes CRLF to LF', () => {
    const filePath = path.join(tmpDir, 'crlf.txt')
    fs.writeFileSync(filePath, 'line1\r\nline2\r\nline3\r\n', 'utf-8')

    const result = readFileSyncWithMetadata(filePath)
    expect(result.content).toBe('line1\nline2\nline3\n')
    expect(result.lineEndings).toBe('CRLF')
  })
})

describe('detectEncodingForResolvedPath', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join('/tmp', 'fileRead-detect-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('returns utf8 for empty file', () => {
    const filePath = path.join(tmpDir, 'empty.txt')
    fs.writeFileSync(filePath, '')

    const result = detectEncodingForResolvedPath(filePath)
    expect(result).toBe('utf8')
  })

  test('detects GBK encoding from file', () => {
    const filePath = path.join(tmpDir, 'gbk.txt')
    const gbkBytes = Buffer.from([0xc4, 0xe3, 0xba, 0xc3])
    fs.writeFileSync(filePath, gbkBytes)

    const result = detectEncodingForResolvedPath(filePath)
    expect(result).toBe('gbk')
  })
})
