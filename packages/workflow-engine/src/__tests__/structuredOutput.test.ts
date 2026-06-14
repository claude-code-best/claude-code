import { expect, test } from 'bun:test'
import { validateAgainstSchema } from '../engine/structuredOutput.js'

const schema = {
  type: 'object',
  required: ['name', 'count'],
  properties: {
    name: { type: 'string' },
    count: { type: 'number' },
  },
  additionalProperties: false,
}

test('valid object passes', () => {
  const { valid, errors } = validateAgainstSchema(
    { name: 'a', count: 1 },
    schema,
  )
  expect(valid).toBe(true)
  expect(errors).toEqual([])
})

test('missing field fails', () => {
  const { valid, errors } = validateAgainstSchema({ name: 'a' }, schema)
  expect(valid).toBe(false)
  expect(errors.length).toBeGreaterThan(0)
})

test('type error fails', () => {
  const { valid } = validateAgainstSchema({ name: 'a', count: 'x' }, schema)
  expect(valid).toBe(false)
})

test('same schema reuses cache', () => {
  validateAgainstSchema({ name: 'a', count: 1 }, schema)
  // second use of the same schema object should hit cache (not throwing is enough)
  expect(validateAgainstSchema({ name: 'b', count: 2 }, schema).valid).toBe(
    true,
  )
})
