import { describe, expect, test } from 'bun:test'
import { adjustHunkLineNumbers, getPatchFromContents } from '../diff'

describe('adjustHunkLineNumbers', () => {
  test('shifts hunk line numbers by offset', () => {
    const hunks = [
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 4,
        lines: [' a', '-b', '+c', '+d', ' e'],
      },
    ] as any[]
    const result = adjustHunkLineNumbers(hunks, 10)
    expect(result[0].oldStart).toBe(11)
    expect(result[0].newStart).toBe(11)
  })

  test('returns original hunks for zero offset', () => {
    const hunks = [
      { oldStart: 5, oldLines: 2, newStart: 5, newLines: 2, lines: [] },
    ] as any[]
    const result = adjustHunkLineNumbers(hunks, 0)
    expect(result).toBe(hunks) // same reference
  })

  test('handles negative offset', () => {
    const hunks = [
      { oldStart: 10, oldLines: 2, newStart: 10, newLines: 2, lines: [] },
    ] as any[]
    const result = adjustHunkLineNumbers(hunks, -5)
    expect(result[0].oldStart).toBe(5)
    expect(result[0].newStart).toBe(5)
  })

  test('handles empty hunks array', () => {
    expect(adjustHunkLineNumbers([], 10)).toEqual([])
  })
})

describe('getPatchFromContents', () => {
  test('returns hunks for different content', () => {
    const hunks = getPatchFromContents({
      filePath: 'test.txt',
      oldContent: 'hello\nworld',
      newContent: 'hello\nplanet',
    })
    expect(hunks.length).toBe(1)
    const allLines = hunks[0].lines
    expect(allLines).toContain('-world')
    expect(allLines).toContain('+planet')
  })

  test('returns empty hunks for identical content', () => {
    const hunks = getPatchFromContents({
      filePath: 'test.txt',
      oldContent: 'same content',
      newContent: 'same content',
    })
    expect(hunks).toEqual([])
  })

  test('handles content with ampersands', () => {
    const hunks = getPatchFromContents({
      filePath: 'test.txt',
      oldContent: 'a & b',
      newContent: 'a & c',
    })
    expect(hunks.length).toBeGreaterThan(0)
    // Verify ampersands are unescaped in the output
    const allLines = hunks.flatMap((h: any) => h.lines)
    expect(allLines.some((l: string) => l.includes('&'))).toBe(true)
  })

  test('handles empty old content (new file)', () => {
    const hunks = getPatchFromContents({
      filePath: 'test.txt',
      oldContent: '',
      newContent: 'new content',
    })
    expect(hunks.length).toBeGreaterThan(0)
    const allLines = hunks.flatMap((h: any) => h.lines)
    expect(allLines.some((l: string) => l.startsWith('+'))).toBe(true)
  })

  test('handles content with dollar signs', () => {
    const hunks = getPatchFromContents({
      filePath: 'test.txt',
      oldContent: 'price: $5',
      newContent: 'price: $10',
    })
    expect(hunks.length).toBeGreaterThan(0)
    const allLines = hunks.flatMap((h: any) => h.lines)
    expect(allLines.some((l: string) => l.includes('$'))).toBe(true)
    // Verify dollar signs are unescaped (not the token)
    expect(allLines.some((l: string) => l.includes('<<:DOLLAR_TOKEN:>>'))).toBe(
      false,
    )
  })

  test('handles deleting all content', () => {
    const hunks = getPatchFromContents({
      filePath: 'test.txt',
      oldContent: 'line1\nline2\nline3',
      newContent: '',
    })
    expect(hunks.length).toBeGreaterThan(0)
    const allLines = hunks.flatMap((h: any) => h.lines)
    expect(allLines.some((l: string) => l.startsWith('-'))).toBe(true)
    expect(
      allLines.every(
        (l: string) =>
          l.startsWith('-') || l.startsWith(' ') || l.startsWith('\\'),
      ),
    ).toBe(true)
  })

  test('ignoreWhitespace treats indentation changes as identical', () => {
    const old = 'function foo() {\n  return 42;\n}\n'
    const nw = 'function foo() {\n\treturn 42;\n}\n'
    const hunks = getPatchFromContents({
      filePath: 'test.txt',
      oldContent: old,
      newContent: nw,
      ignoreWhitespace: true,
    })
    expect(hunks).toEqual([])
  })
})
