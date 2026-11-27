import { describe, expect, test } from 'bun:test'
import {
  SCROLL_SPEED_DEFAULT,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_VALUES,
  parseScrollSpeed,
  resolveScrollSpeedBase,
} from '../scrollSpeed.js'

describe('parseScrollSpeed', () => {
  test('returns undefined for unset / empty / invalid values', () => {
    expect(parseScrollSpeed(undefined)).toBeUndefined()
    expect(parseScrollSpeed('')).toBeUndefined()
    expect(parseScrollSpeed('abc')).toBeUndefined()
    expect(parseScrollSpeed('0')).toBeUndefined()
    expect(parseScrollSpeed('-3')).toBeUndefined()
  })

  test('parses valid positive numbers', () => {
    expect(parseScrollSpeed('1')).toBe(1)
    expect(parseScrollSpeed('3')).toBe(3)
    expect(parseScrollSpeed('20')).toBe(20)
    expect(parseScrollSpeed('2.5')).toBe(2.5)
  })

  test('clamps values above the max', () => {
    expect(parseScrollSpeed('100')).toBe(SCROLL_SPEED_MAX)
    expect(parseScrollSpeed('21')).toBe(SCROLL_SPEED_MAX)
  })
})

describe('resolveScrollSpeedBase', () => {
  test('defaults to 1 when nothing is set', () => {
    expect(resolveScrollSpeedBase(undefined, undefined)).toBe(
      SCROLL_SPEED_DEFAULT,
    )
  })

  test('env var wins over settings', () => {
    expect(resolveScrollSpeedBase('4', 7)).toBe(4)
  })

  test('falls back to settings when env var is unset or invalid', () => {
    expect(resolveScrollSpeedBase(undefined, 5)).toBe(5)
    expect(resolveScrollSpeedBase('not-a-number', 5)).toBe(5)
    expect(resolveScrollSpeedBase('', 5)).toBe(5)
  })

  test('clamps out-of-range settings values', () => {
    expect(resolveScrollSpeedBase(undefined, 0)).toBe(SCROLL_SPEED_DEFAULT)
    expect(resolveScrollSpeedBase(undefined, -5)).toBe(SCROLL_SPEED_DEFAULT)
    expect(resolveScrollSpeedBase(undefined, 999)).toBe(SCROLL_SPEED_MAX)
  })

  test('slider value set covers 1..10 ascending', () => {
    expect([...SCROLL_SPEED_VALUES]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})
