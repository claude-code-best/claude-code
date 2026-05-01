import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'
import { semanticNumber } from '../semanticNumber'

describe('semanticNumber', () => {
  test('parses number 42', () => {
    expect(semanticNumber().parse(42)).toBe(42)
  })

  test('parses number 0', () => {
    expect(semanticNumber().parse(0)).toBe(0)
  })

  test('parses negative number -5', () => {
    expect(semanticNumber().parse(-5)).toBe(-5)
  })

  test('parses float 3.14', () => {
    expect(semanticNumber().parse(3.14)).toBeCloseTo(3.14)
  })

  test("parses string '42' to 42", () => {
    expect(semanticNumber().parse('42')).toBe(42)
  })

  test("parses string '-7.5' to -7.5", () => {
    expect(semanticNumber().parse('-7.5')).toBe(-7.5)
  })

  test("rejects string 'abc'", () => {
    expect(() => semanticNumber().parse('abc')).toThrow()
  })

  test("rejects empty string ''", () => {
    expect(() => semanticNumber().parse('')).toThrow()
  })

  test('rejects null', () => {
    expect(() => semanticNumber().parse(null)).toThrow()
  })

  test('rejects boolean true', () => {
    expect(() => semanticNumber().parse(true)).toThrow()
  })

  test('works with custom inner schema (z.number().int().min(0))', () => {
    const schema = semanticNumber(z.number().int().min(0))
    expect(schema.parse(5)).toBe(5)
    expect(schema.parse('10')).toBe(10)
    expect(() => schema.parse(-1)).toThrow()
  })
})
