import { describe, expect, test } from 'bun:test'
import z from 'zod/v4'
import { zodToJsonSchema } from '../zodToJsonSchema'

describe('zodToJsonSchema', () => {
  test('converts string schema', () => {
    const schema = z.string()
    const result = zodToJsonSchema(schema)
    expect(result.type).toBe('string')
  })

  test('converts number schema', () => {
    const schema = z.number()
    const result = zodToJsonSchema(schema)
    expect(result.type).toBe('number')
  })

  test('converts object schema with properties', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    })
    const result = zodToJsonSchema(schema)
    expect(result.type).toBe('object')
    expect(result.properties).toBeDefined()
    expect((result.properties as any).name).toEqual({ type: 'string' })
    expect((result.properties as any).age).toEqual({ type: 'number' })
  })

  test('converts enum schema', () => {
    const schema = z.enum(['a', 'b', 'c'])
    const result = zodToJsonSchema(schema)
    expect(result.enum).toEqual(['a', 'b', 'c'])
  })

  test('converts optional fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    })
    const result = zodToJsonSchema(schema)
    expect(result.required).toEqual(['required'])
    expect(result.required).not.toContain('optional')
  })

  test('caches results for same schema reference', () => {
    const schema = z.string()
    const first = zodToJsonSchema(schema)
    const second = zodToJsonSchema(schema)
    expect(first).toBe(second) // same reference (cached)
  })

  test('different schemas get different results', () => {
    const s1 = z.string()
    const s2 = z.number()
    const r1 = zodToJsonSchema(s1)
    const r2 = zodToJsonSchema(s2)
    expect(r1).not.toBe(r2)
    expect(r1.type).not.toBe(r2.type)
  })

  test('converts array schema', () => {
    const schema = z.array(z.string())
    const result = zodToJsonSchema(schema)
    expect(result.type).toBe('array')
    expect((result.items as any).type).toBe('string')
  })

  test('converts boolean schema', () => {
    const result = zodToJsonSchema(z.boolean())
    expect(result.type).toBe('boolean')
  })
})
