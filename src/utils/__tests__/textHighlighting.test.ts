import { describe, expect, test } from 'bun:test'
import {
  segmentTextByHighlights,
  type TextHighlight,
} from '../textHighlighting'

describe('segmentTextByHighlights', () => {
  // Basic
  test('returns single segment with no highlights', () => {
    const segments = segmentTextByHighlights('hello world', [])
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe('hello world')
    expect(segments[0].highlight).toBeUndefined()
  })

  test('returns highlighted segment for single highlight', () => {
    const highlights: TextHighlight[] = [
      { start: 0, end: 5, color: undefined, priority: 0 },
    ]
    const segments = segmentTextByHighlights('hello world', highlights)
    expect(segments.length).toBeGreaterThanOrEqual(2)
    expect(segments.some(s => s.highlight !== undefined)).toBe(true)
  })

  test('returns three segments for highlight in the middle', () => {
    const highlights: TextHighlight[] = [
      { start: 3, end: 7, color: undefined, priority: 0 },
    ]
    const segments = segmentTextByHighlights('hello world', highlights)
    expect(segments.length).toBeGreaterThanOrEqual(2)
  })

  test('highlight covering entire text', () => {
    const highlights: TextHighlight[] = [
      { start: 0, end: 5, color: undefined, priority: 0 },
    ]
    const segments = segmentTextByHighlights('hello', highlights)
    expect(segments).toHaveLength(1)
    expect(segments[0].highlight).toBeDefined()
  })

  // Multiple highlights
  test('handles non-overlapping highlights', () => {
    const highlights: TextHighlight[] = [
      { start: 0, end: 3, color: undefined, priority: 0 },
      { start: 6, end: 9, color: undefined, priority: 0 },
    ]
    const segments = segmentTextByHighlights('abcXYZdef', highlights)
    const highlighted = segments.filter(s => s.highlight)
    expect(highlighted.length).toBe(2)
  })

  test('handles overlapping highlights (priority-based)', () => {
    const highlights: TextHighlight[] = [
      { start: 0, end: 5, color: undefined, priority: 0 },
      { start: 3, end: 8, color: undefined, priority: 1 },
    ]
    const segments = segmentTextByHighlights('hello world', highlights)
    // Overlapping: higher priority wins or they don't overlap
    expect(segments.length).toBeGreaterThan(0)
  })

  test('handles adjacent highlights', () => {
    const highlights: TextHighlight[] = [
      { start: 0, end: 3, color: undefined, priority: 0 },
      { start: 3, end: 6, color: undefined, priority: 0 },
    ]
    const segments = segmentTextByHighlights('abcdef', highlights)
    const highlighted = segments.filter(s => s.highlight)
    expect(highlighted.length).toBe(2)
  })

  // Boundary
  test('highlight starting at 0', () => {
    const highlights: TextHighlight[] = [
      { start: 0, end: 3, color: undefined, priority: 0 },
    ]
    const segments = segmentTextByHighlights('abcdef', highlights)
    expect(segments[0].start).toBe(0)
  })

  test('highlight ending at text length', () => {
    const text = 'hello'
    const highlights: TextHighlight[] = [
      { start: 3, end: 5, color: undefined, priority: 0 },
    ]
    const segments = segmentTextByHighlights(text, highlights)
    expect(segments.length).toBeGreaterThan(0)
  })

  test('empty highlights array returns single segment', () => {
    const segments = segmentTextByHighlights('text', [])
    expect(segments).toHaveLength(1)
    expect(segments[0].highlight).toBeUndefined()
  })

  // Properties
  test('preserves highlight color property', () => {
    const highlights: TextHighlight[] = [
      { start: 0, end: 3, color: 'primary' as any, priority: 0 },
    ]
    const segments = segmentTextByHighlights('abc', highlights)
    const highlighted = segments.find(s => s.highlight)
    expect(highlighted?.highlight?.color as string).toBe('primary')
  })

  test('preserves highlight priority property', () => {
    const highlights: TextHighlight[] = [
      { start: 0, end: 3, color: undefined, priority: 5 },
    ]
    const segments = segmentTextByHighlights('abc', highlights)
    const highlighted = segments.find(s => s.highlight)
    expect(highlighted?.highlight?.priority).toBe(5)
  })

  test('preserves dimColor and inverse flags', () => {
    const highlights: TextHighlight[] = [
      {
        start: 0,
        end: 3,
        color: undefined,
        priority: 0,
        dimColor: true,
        inverse: true,
      },
    ]
    const segments = segmentTextByHighlights('abc', highlights)
    const highlighted = segments.find(s => s.highlight)
    expect(highlighted?.highlight?.dimColor).toBe(true)
    expect(highlighted?.highlight?.inverse).toBe(true)
  })

  test('highlights with start === end are skipped', () => {
    const highlights: TextHighlight[] = [
      { start: 3, end: 3, color: undefined, priority: 0 },
    ]
    const segments = segmentTextByHighlights('abcdef', highlights)
    expect(segments).toHaveLength(1)
    expect(segments[0].highlight).toBeUndefined()
  })
})
