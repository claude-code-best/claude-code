import { describe, test, expect } from 'bun:test'
import { Cursor } from '../Cursor'

describe('MeasuredText tab protection', () => {
  test('Cursor.fromText with tabs does not throw', () => {
    const cursor = Cursor.fromText('a\tb', 80)
    expect(cursor).toBeTruthy()
    expect(cursor.text).toBe('a\tb')
  })

  test('tab text preserves original tabs after measurement', () => {
    const cursor = Cursor.fromText('hello\tworld', 80)
    expect(cursor.text).toBe('hello\tworld')
    // Trigger measurement
    cursor.getPosition()
    expect(cursor.text).toBe('hello\tworld')
  })

  test('multi-line tab text works', () => {
    const cursor = Cursor.fromText('foo\n\tbar', 80)
    expect(cursor.text).toBe('foo\n\tbar')
    expect(() => cursor.getPosition()).not.toThrow()
  })

  test('tabs in narrow columns (triggering visual wrap) does not throw', () => {
    // 10 cols is narrow enough that tabs + text will wrap
    const cursor = Cursor.fromText('x\t\thello world\tfoo', 10)
    expect(() => cursor.getPosition()).not.toThrow()
    expect(cursor.text).toBe('x\t\thello world\tfoo')
  })

  test('getPosition returns valid coordinates for tab text', () => {
    const cursor = Cursor.fromText('a\tb\tc', 80)
    const pos = cursor.getPosition()
    expect(pos.line).toBeGreaterThanOrEqual(0)
    expect(pos.column).toBeGreaterThanOrEqual(0)
  })

  test('cursor movement on tab text does not throw', () => {
    const cursor = Cursor.fromText('abc\tdef\tghi', 80)
    // Move right through tab
    const right1 = cursor.right()
    expect(() => right1.getPosition()).not.toThrow()
    const right2 = right1.right()
    expect(() => right2.getPosition()).not.toThrow()
    // Move to end
    const end = cursor.endOfFile()
    expect(() => end.getPosition()).not.toThrow()
    // Move back
    expect(() => end.left().getPosition()).not.toThrow()
  })

  test('tab text in very narrow views (1 col) does not throw', () => {
    const cursor = Cursor.fromText('a\tb', 1)
    expect(() => cursor.getPosition()).not.toThrow()
  })

  test('text with only tabs does not throw', () => {
    const cursor = Cursor.fromText('\t\t', 80)
    expect(() => cursor.getPosition()).not.toThrow()
    expect(cursor.text).toBe('\t\t')
  })

  test('mixed tabs and newlines', () => {
    const cursor = Cursor.fromText('a\tb\nc\td\ne\tf', 80)
    expect(() => cursor.getPosition()).not.toThrow()
    // Move to last line
    const eof = cursor.endOfFile()
    expect(eof.text).toBe('a\tb\nc\td\ne\tf')
  })

  test('placeholder characters in text are handled gracefully', () => {
    // Text already contains \u2060 (word joiner)
    const textWithPlaceholder = 'ab\u2060\tc'
    const cursor = Cursor.fromText(textWithPlaceholder, 80)
    expect(() => cursor.getPosition()).not.toThrow()
    expect(cursor.text).toBe(textWithPlaceholder)
  })

  test('text with all placeholder candidates still works', () => {
    // Text contains all four zero-width placeholder candidates
    const allPlaceholders = 'a\u2060\u2061\u2062\u2063\tb'
    const cursor = Cursor.fromText(allPlaceholders, 80)
    expect(() => cursor.getPosition()).not.toThrow()
    expect(cursor.text).toBe(allPlaceholders)
  })
})


