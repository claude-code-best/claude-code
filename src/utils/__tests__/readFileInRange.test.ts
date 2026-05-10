import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import { readFileInRange } from '../readFileInRange'

describe('readFileInRange', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join('/tmp', 'readFileInRange-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('fast path — UTF-8 file', async () => {
    const filePath = path.join(tmpDir, 'utf8.txt')
    fs.writeFileSync(filePath, 'Hello 世界\nLine 2\nLine 3\n', 'utf-8')

    const result = await readFileInRange(filePath, 0)
    expect(result.content).toBe('Hello 世界\nLine 2\nLine 3\n')
    expect(result.lineCount).toBe(4)
    expect(result.totalLines).toBe(4)
  })

  test('fast path — GBK file', async () => {
    const filePath = path.join(tmpDir, 'gbk.txt')
    // "你好世界" in GBK + newline
    const gbkBytes = Buffer.from([
      0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7, 0x0a,
    ])
    fs.writeFileSync(filePath, gbkBytes)

    const result = await readFileInRange(filePath, 0)
    expect(result.content).toBe('你好世界\n')
    expect(result.totalBytes).toBe(13) // UTF-8 byte length of "你好世界\n"
  })

  test('fast path — line range on GBK file', async () => {
    const filePath = path.join(tmpDir, 'gbk-lines.txt')
    // Three lines in GBK: "第一行\n第二行\n第三行\n"
    const line1 = Buffer.from([0xb5, 0xda, 0xd2, 0xbb, 0xd0, 0xd0]) // 第一行
    const line2 = Buffer.from([0xb5, 0xda, 0xb6, 0xfe, 0xd0, 0xd0]) // 第二行
    const line3 = Buffer.from([0xb5, 0xda, 0xc8, 0xfd, 0xd0, 0xd0]) // 第三行
    const content = Buffer.concat([
      line1,
      Buffer.from([0x0a]),
      line2,
      Buffer.from([0x0a]),
      line3,
      Buffer.from([0x0a]),
    ])
    fs.writeFileSync(filePath, content)

    const result = await readFileInRange(filePath, 1, 1)
    expect(result.content).toBe('第二行')
  })

  test('BOM stripping', async () => {
    const filePath = path.join(tmpDir, 'bom.txt')
    const bom = Buffer.from([0xef, 0xbb, 0xbf])
    fs.writeFileSync(filePath, Buffer.concat([bom, Buffer.from('Hello\n')]))

    const result = await readFileInRange(filePath, 0)
    expect(result.content).toBe('Hello\n')
  })

  test('empty file', async () => {
    const filePath = path.join(tmpDir, 'empty.txt')
    fs.writeFileSync(filePath, '')

    const result = await readFileInRange(filePath, 0)
    expect(result.content).toBe('')
    expect(result.totalLines).toBe(1)
    expect(result.totalBytes).toBe(0)
  })

  test('fast path — offset and maxLines', async () => {
    const filePath = path.join(tmpDir, 'lines.txt')
    fs.writeFileSync(filePath, 'a\nb\nc\nd\ne\n', 'utf-8')

    const result = await readFileInRange(filePath, 1, 2)
    expect(result.content).toBe('b\nc')
    expect(result.lineCount).toBe(2)
  })
})
