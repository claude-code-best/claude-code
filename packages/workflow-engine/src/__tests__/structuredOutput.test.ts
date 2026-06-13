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

test('合法对象通过', () => {
  const { valid, errors } = validateAgainstSchema(
    { name: 'a', count: 1 },
    schema,
  )
  expect(valid).toBe(true)
  expect(errors).toEqual([])
})

test('缺字段失败', () => {
  const { valid, errors } = validateAgainstSchema({ name: 'a' }, schema)
  expect(valid).toBe(false)
  expect(errors.length).toBeGreaterThan(0)
})

test('类型错误失败', () => {
  const { valid } = validateAgainstSchema({ name: 'a', count: 'x' }, schema)
  expect(valid).toBe(false)
})

test('同一 schema 复用缓存', () => {
  validateAgainstSchema({ name: 'a', count: 1 }, schema)
  // 第二次用同一 schema 对象应命中缓存（不抛错即可）
  expect(validateAgainstSchema({ name: 'b', count: 2 }, schema).valid).toBe(
    true,
  )
})
