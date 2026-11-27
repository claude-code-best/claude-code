import { describe, expect, test } from 'bun:test'
import {
  clampSliderIndex,
  getInitialSliderIndex,
  moveSliderLeft,
  moveSliderRight,
} from '../sliderState.js'

describe('clampSliderIndex', () => {
  test('clamps into [0, length - 1]', () => {
    expect(clampSliderIndex(-1, 3)).toBe(0)
    expect(clampSliderIndex(0, 3)).toBe(0)
    expect(clampSliderIndex(1, 3)).toBe(1)
    expect(clampSliderIndex(5, 3)).toBe(2)
  })

  test('empty item lists yield 0', () => {
    expect(clampSliderIndex(0, 0)).toBe(0)
    expect(clampSliderIndex(3, 0)).toBe(0)
  })
})

describe('moveSliderLeft / moveSliderRight', () => {
  test('steps one position and stops at the ends', () => {
    expect(moveSliderLeft(0, 3)).toBe(0)
    expect(moveSliderLeft(1, 3)).toBe(0)
    expect(moveSliderLeft(2, 3)).toBe(1)

    expect(moveSliderRight(0, 3)).toBe(1)
    expect(moveSliderRight(1, 3)).toBe(2)
    expect(moveSliderRight(2, 3)).toBe(2)
  })

  test('empty lists stay at 0', () => {
    expect(moveSliderLeft(0, 0)).toBe(0)
    expect(moveSliderRight(0, 0)).toBe(0)
  })
})

describe('getInitialSliderIndex', () => {
  test('starts on the current value when present', () => {
    expect(getInitialSliderIndex(['off', 'on'], 'on')).toBe(1)
    expect(getInitialSliderIndex(['off', 'on'], 'off')).toBe(0)
  })

  test('falls back to 0 for missing or undefined values', () => {
    expect(getInitialSliderIndex(['off', 'on'], undefined)).toBe(0)
    expect(getInitialSliderIndex(['off', 'on'], 'bogus')).toBe(0)
    expect(getInitialSliderIndex([], undefined)).toBe(0)
  })
})
