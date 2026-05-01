import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'
import { semanticBoolean } from '../semanticBoolean'

describe('semanticBoolean', () => {
  test('parses boolean true to true', () => {
    expect(semanticBoolean().parse(true)).toBe(true)
  })

  test('parses boolean false to false', () => {
    expect(semanticBoolean().parse(false)).toBe(false)
  })

  test("parses string 'true' to true", () => {
    expect(semanticBoolean().parse('true')).toBe(true)
  })

  test("parses string 'false' to false", () => {
    expect(semanticBoolean().parse('false')).toBe(false)
  })

  test("rejects string 'TRUE' (case-sensitive)", () => {
    expect(() => semanticBoolean().parse('TRUE')).toThrow()
  })

  test("rejects string 'FALSE' (case-sensitive)", () => {
    expect(() => semanticBoolean().parse('FALSE')).toThrow()
  })

  test('rejects number 1', () => {
    expect(() => semanticBoolean().parse(1)).toThrow()
  })

  test('rejects null', () => {
    expect(() => semanticBoolean().parse(null)).toThrow()
  })

  test('rejects undefined', () => {
    expect(() => semanticBoolean().parse(undefined)).toThrow()
  })

  test('works with custom inner schema (z.boolean().optional())', () => {
    const schema = semanticBoolean(z.boolean().optional())
    expect(schema.parse(true)).toBe(true)
    expect(schema.parse('false')).toBe(false)
    expect(schema.parse(undefined)).toBeUndefined()
  })
})
