import { describe, expect, test } from 'bun:test'
import { padAligned } from '../markdown'

describe('padAligned', () => {
  test('left-aligns: pads with spaces on right', () => {
    const result = padAligned('hello', 5, 10, 'left')
    expect(result).toBe('hello     ')
    expect(result.length).toBe(10)
  })

  test('right-aligns: pads with spaces on left', () => {
    const result = padAligned('hello', 5, 10, 'right')
    expect(result).toBe('     hello')
    expect(result.length).toBe(10)
  })

  test('center-aligns: pads with spaces on both sides', () => {
    const result = padAligned('hi', 2, 6, 'center')
    expect(result).toBe('  hi  ')
    expect(result.length).toBe(6)
  })

  test('no padding when displayWidth equals targetWidth', () => {
    const result = padAligned('hello', 5, 5, 'left')
    expect(result).toBe('hello')
  })

  test('handles content wider than targetWidth', () => {
    const result = padAligned('hello world', 11, 5, 'left')
    expect(result).toBe('hello world')
  })

  test('null/undefined align defaults to left', () => {
    expect(padAligned('hi', 2, 5, null)).toBe('hi   ')
    expect(padAligned('hi', 2, 5, undefined)).toBe('hi   ')
  })

  test('handles empty string content', () => {
    const result = padAligned('', 0, 5, 'center')
    expect(result).toBe('     ')
  })

  test('handles zero displayWidth', () => {
    const result = padAligned('', 0, 3, 'left')
    expect(result).toBe('   ')
  })

  test('handles zero targetWidth', () => {
    const result = padAligned('hello', 5, 0, 'left')
    expect(result).toBe('hello')
  })

  test('center alignment with odd padding distribution', () => {
    const result = padAligned('hi', 2, 7, 'center')
    expect(result).toBe('  hi   ')
    expect(result.length).toBe(7)
  })
})
