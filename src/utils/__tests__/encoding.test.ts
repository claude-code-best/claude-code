import { describe, test, expect } from 'bun:test'
import {
  detectEncoding,
  decodeBuffer,
  encodeString,
  type FileEncoding,
  type DetectedEncoding,
} from '../encoding'

describe('detectEncoding', () => {
  test('detects UTF-16LE BOM', () => {
    const buf = Buffer.from([0xff, 0xfe, 0x48, 0x00])
    expect(detectEncoding(buf)).toBe('utf-16le')
  })

  test('detects UTF-8 BOM', () => {
    const buf = Buffer.from([0xef, 0xbb, 0xbf, 0x48, 0x65])
    expect(detectEncoding(buf)).toBe('utf-8')
  })

  test('detects valid UTF-8 without BOM', () => {
    const buf = Buffer.from('Hello, 世界', 'utf-8')
    expect(detectEncoding(buf)).toBe('utf-8')
  })

  test('detects GBK encoded Chinese text', () => {
    // "你好" in GBK: C4 E3 BA C3
    const buf = Buffer.from([0xc4, 0xe3, 0xba, 0xc3])
    expect(detectEncoding(buf)).toBe('gbk')
  })

  test('returns utf-8 for empty buffer', () => {
    const buf = Buffer.alloc(0)
    expect(detectEncoding(buf)).toBe('utf-8')
  })

  test('falls back to latin1 for random bytes', () => {
    // Random bytes that aren't valid UTF-8 or GBK
    const buf = Buffer.from([0x80, 0x81, 0x82, 0x83, 0x84, 0x85])
    expect(detectEncoding(buf)).toBe('latin1')
  })

  test('prioritizes BOM over content analysis', () => {
    // UTF-8 BOM followed by bytes that could be confused
    const buf = Buffer.from([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f])
    expect(detectEncoding(buf)).toBe('utf-8')
  })
})

describe('decodeBuffer', () => {
  test('decodes UTF-8 buffer correctly', () => {
    const buf = Buffer.from('Hello, 世界', 'utf-8')
    expect(decodeBuffer(buf, 'utf-8')).toBe('Hello, 世界')
  })

  test('decodes GBK buffer correctly', () => {
    // "你好" in GBK
    const buf = Buffer.from([0xc4, 0xe3, 0xba, 0xc3])
    expect(decodeBuffer(buf, 'gbk')).toBe('你好')
  })

  test('decodes UTF-16LE buffer correctly', () => {
    const buf = Buffer.from([
      0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f, 0x00,
    ])
    expect(decodeBuffer(buf, 'utf-16le')).toBe('Hello')
  })

  test('decodes empty buffer', () => {
    const buf = Buffer.alloc(0)
    expect(decodeBuffer(buf, 'utf-8')).toBe('')
  })
})

describe('encodeString', () => {
  test('encodes UTF-8 string without conversion flag', () => {
    const { buffer, converted } = encodeString('Hello 世界', 'utf-8')
    expect(converted).toBe(false)
    expect(buffer.toString('utf-8')).toBe('Hello 世界')
  })

  test('encodes UTF-8 with utf8 alias', () => {
    const { buffer, converted } = encodeString('test', 'utf8')
    expect(converted).toBe(false)
    expect(buffer.toString('utf-8')).toBe('test')
  })

  test('encodes UTF-16LE string', () => {
    const { buffer, converted } = encodeString('Hello', 'utf-16le')
    expect(converted).toBe(false)
    expect(decodeBuffer(buffer, 'utf-16le')).toBe('Hello')
  })

  test('handles GBK encoding (may convert)', () => {
    const { buffer, converted } = encodeString('你好', 'gbk')
    expect(buffer).toBeInstanceOf(Buffer)
    expect(typeof converted).toBe('boolean')
    if (!converted) {
      expect(decodeBuffer(buffer, 'gbk')).toBe('你好')
    }
  })
})
