import { describe, expect, test } from 'bun:test'
import {
  findUndeclaredKeys,
  MAX_RENDERED_SCHEMA_CHARS,
  normalizeSchemaForModel,
  renderSchemaForModel,
} from '../toolSchemaRender.js'

describe('normalizeSchemaForModel', () => {
  test('drops the $schema dialect keyword', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { q: { type: 'string' } },
    }

    const normalized = normalizeSchemaForModel(schema)

    expect(normalized).toEqual({
      type: 'object',
      properties: { q: { type: 'string' } },
    })
    // The input is not mutated — callers may still hold the original tool schema.
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#')
  })

  test('returns the same object when there is no $schema', () => {
    const schema = { type: 'object' }

    expect(normalizeSchemaForModel(schema)).toBe(schema)
  })
})

describe('renderSchemaForModel', () => {
  test('renders pretty JSON', () => {
    expect(renderSchemaForModel({ type: 'object' })).toBe(
      '{\n  "type": "object"\n}',
    )
  })

  test('truncates an oversized schema without promising a re-fetch path', () => {
    const schema = {
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 400 }, (_, i) => [
          `field_${i}`,
          { type: 'string' },
        ]),
      ),
    }

    const rendered = renderSchemaForModel(schema)

    expect(rendered.length).toBeLessThan(MAX_RENDERED_SCHEMA_CHARS + 300)
    expect(rendered).toContain('[schema truncated at')
    // The previous wording told the model to re-select the tool, which returns
    // this same truncated text — the remainder is not retrievable that way.
    expect(rendered).not.toContain('call SearchExtraTools')
  })

  test('honours a custom bound', () => {
    const rendered = renderSchemaForModel({ type: 'object' }, 10)

    expect(rendered.startsWith('{\n  "type"')).toBe(true)
    expect(rendered).toContain('[schema truncated at 10 of')
  })

  test('degrades to a placeholder instead of throwing on a cyclic schema', () => {
    const cyclic: Record<string, unknown> = { type: 'object' }
    cyclic.self = cyclic

    expect(renderSchemaForModel(cyclic)).toBe('[schema unavailable]')
  })

  test('degrades to a placeholder for non-serializable input', () => {
    expect(renderSchemaForModel(undefined)).toBe('[schema unavailable]')
  })
})

describe('findUndeclaredKeys', () => {
  test('reports a renamed key', () => {
    const schema = { type: 'object', properties: { q: { type: 'string' } } }

    expect(findUndeclaredKeys(schema, { query: 'hello' })).toEqual(['query'])
  })

  test('reports nothing when every key is declared', () => {
    const schema = {
      type: 'object',
      properties: { q: { type: 'string' }, limit: { type: 'number' } },
    }

    expect(findUndeclaredKeys(schema, { q: 'hello', limit: 3 })).toEqual([])
  })

  test('reports nothing when the schema declares no properties', () => {
    // A passthrough tool: nothing to compare against, so nothing to reject.
    expect(findUndeclaredKeys({ type: 'object' }, { anything: 1 })).toEqual([])
    expect(
      findUndeclaredKeys({ type: 'object', properties: {} }, { anything: 1 }),
    ).toEqual([])
  })

  test('reports nothing when the schema explicitly allows extras', () => {
    const schema = {
      type: 'object',
      properties: { q: { type: 'string' } },
      additionalProperties: true,
    }

    expect(findUndeclaredKeys(schema, { q: 'hello', extra: 1 })).toEqual([])
  })

  test('still reports when the schema forbids extras', () => {
    // additionalProperties:false already fails Ajv; the key names are still
    // needed for the error message.
    const schema = {
      type: 'object',
      properties: { q: { type: 'string' } },
      additionalProperties: false,
    }

    expect(findUndeclaredKeys(schema, { query: 'hello' })).toEqual(['query'])
  })

  test('handles undefined params', () => {
    const schema = { type: 'object', properties: { q: { type: 'string' } } }

    expect(findUndeclaredKeys(schema, undefined)).toEqual([])
  })
})
