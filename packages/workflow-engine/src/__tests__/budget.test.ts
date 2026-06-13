import { expect, test } from 'bun:test'
import { Budget, BudgetExhaustedError } from '../engine/budget.js'

test('total=null 时无限制', () => {
  const b = new Budget(null)
  expect(b.total).toBeNull()
  expect(b.remaining()).toBe(Infinity)
  b.addOutputTokens(999999)
  expect(b.spent()).toBe(999999)
  expect(() => b.assertCanSpend()).not.toThrow()
})

test('累加并触顶抛错', () => {
  const b = new Budget(100)
  expect(b.remaining()).toBe(100)
  b.addOutputTokens(40)
  expect(b.spent()).toBe(40)
  expect(b.remaining()).toBe(60)
  expect(() => b.assertCanSpend()).not.toThrow()
  b.addOutputTokens(60)
  expect(b.spent()).toBe(100)
  expect(() => b.assertCanSpend()).toThrow(BudgetExhaustedError)
})

test('addOutputTokens 负值忽略', () => {
  const b = new Budget(100)
  b.addOutputTokens(-50)
  expect(b.spent()).toBe(0)
})
