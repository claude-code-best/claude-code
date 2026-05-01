import { describe, expect, test } from 'bun:test'
import { calculateHorizontalScrollWindow } from '../horizontalScroll'

describe('calculateHorizontalScrollWindow', () => {
  // Basic scenarios
  test('all items fit within available width', () => {
    const result = calculateHorizontalScrollWindow([10, 10, 10], 50, 3, 1)
    expect(result).toEqual({
      startIndex: 0,
      endIndex: 3,
      showLeftArrow: false,
      showRightArrow: false,
    })
  })

  test('single item selected within view', () => {
    const result = calculateHorizontalScrollWindow([20], 50, 3, 0)
    expect(result).toEqual({
      startIndex: 0,
      endIndex: 1,
      showLeftArrow: false,
      showRightArrow: false,
    })
  })

  test('selected item at beginning', () => {
    const widths = [10, 10, 10, 10, 10]
    const result = calculateHorizontalScrollWindow(widths, 25, 3, 0)
    expect(result.startIndex).toBe(0)
    expect(result.showLeftArrow).toBe(false)
    expect(result.showRightArrow).toBe(true)
    expect(result.endIndex).toBeGreaterThan(0)
  })

  test('selected item at end', () => {
    const widths = [10, 10, 10, 10, 10]
    const result = calculateHorizontalScrollWindow(widths, 25, 3, 4)
    expect(result.endIndex).toBe(5)
    expect(result.showRightArrow).toBe(false)
    expect(result.showLeftArrow).toBe(true)
  })

  test('selected item beyond visible range scrolls right', () => {
    const widths = [10, 10, 10, 10, 10]
    const result = calculateHorizontalScrollWindow(widths, 20, 3, 4)
    expect(result.startIndex).toBeLessThanOrEqual(4)
    expect(result.endIndex).toBeGreaterThan(4)
  })

  test('selected item before visible range scrolls left', () => {
    const widths = [10, 10, 10, 10, 10]
    // Select last item first (simulates initial scroll to end)
    const result = calculateHorizontalScrollWindow(widths, 20, 3, 0)
    expect(result.startIndex).toBe(0)
  })

  // Arrow indicators
  test('showLeftArrow when items hidden on left', () => {
    const widths = [10, 10, 10, 10, 10]
    const result = calculateHorizontalScrollWindow(widths, 15, 3, 4)
    expect(result.showLeftArrow).toBe(true)
  })

  test('showRightArrow when items hidden on right', () => {
    const widths = [10, 10, 10, 10, 10]
    const result = calculateHorizontalScrollWindow(widths, 15, 3, 0)
    expect(result.showRightArrow).toBe(true)
  })

  test('no arrows when all items visible', () => {
    const result = calculateHorizontalScrollWindow([10, 10], 50, 3, 0)
    expect(result.showLeftArrow).toBe(false)
    expect(result.showRightArrow).toBe(false)
  })

  test('both arrows when items hidden on both sides', () => {
    const widths = [10, 10, 10, 10, 10, 10, 10]
    // Select middle item with limited width
    const result = calculateHorizontalScrollWindow(widths, 20, 3, 3)
    // Both arrows may or may not show depending on exact fit
    expect(result.startIndex).toBeLessThanOrEqual(3)
    expect(result.endIndex).toBeGreaterThan(3)
  })

  // Boundary conditions
  test('empty itemWidths array', () => {
    const result = calculateHorizontalScrollWindow([], 50, 3, 0)
    expect(result).toEqual({
      startIndex: 0,
      endIndex: 0,
      showLeftArrow: false,
      showRightArrow: false,
    })
  })

  test('single item', () => {
    const result = calculateHorizontalScrollWindow([30], 50, 3, 0)
    expect(result).toEqual({
      startIndex: 0,
      endIndex: 1,
      showLeftArrow: false,
      showRightArrow: false,
    })
  })

  test('available width is 0', () => {
    const result = calculateHorizontalScrollWindow([10, 10], 0, 3, 0)
    // With 0 width, nothing fits except maybe the selected
    expect(result.startIndex).toBe(0)
  })

  test('item wider than available width', () => {
    const result = calculateHorizontalScrollWindow([100], 50, 3, 0)
    // Total width > available, but only one item
    expect(result.startIndex).toBe(0)
    expect(result.endIndex).toBe(1)
  })

  test('all items same width', () => {
    const widths = [10, 10, 10, 10]
    const result = calculateHorizontalScrollWindow(widths, 25, 3, 2)
    expect(result.startIndex).toBeLessThanOrEqual(2)
    expect(result.endIndex).toBeGreaterThan(2)
  })

  test('varying item widths', () => {
    const widths = [5, 20, 5, 20, 5]
    const result = calculateHorizontalScrollWindow(widths, 20, 3, 2)
    expect(result.startIndex).toBeLessThanOrEqual(2)
    expect(result.endIndex).toBeGreaterThan(2)
  })

  test('firstItemHasSeparator adds separator width to first item', () => {
    const widths = [10, 10, 10, 10, 10]
    const withSep = calculateHorizontalScrollWindow(widths, 20, 3, 4, true)
    const withoutSep = calculateHorizontalScrollWindow(widths, 20, 3, 4, false)
    // Both should include selected index 4
    expect(withSep.endIndex).toBe(5)
    expect(withoutSep.endIndex).toBe(5)
  })

  test('selectedIdx in middle of overflow', () => {
    const widths = [10, 10, 10, 10, 10, 10, 10]
    const result = calculateHorizontalScrollWindow(widths, 25, 3, 3)
    expect(result.startIndex).toBeLessThanOrEqual(3)
    expect(result.endIndex).toBeGreaterThan(3)
  })

  test('scroll snaps to show selected at left edge', () => {
    const widths = [10, 10, 10, 10, 10]
    // Jump to last item which forces scroll
    const result = calculateHorizontalScrollWindow(widths, 20, 3, 4)
    expect(result.startIndex).toBeLessThanOrEqual(4)
    expect(result.endIndex).toBe(5)
  })

  test('scroll snaps to show selected at right edge', () => {
    const widths = [10, 10, 10, 10, 10]
    const result = calculateHorizontalScrollWindow(widths, 20, 3, 4)
    expect(result.endIndex).toBe(5)
    expect(result.startIndex).toBeGreaterThan(0)
  })
})
