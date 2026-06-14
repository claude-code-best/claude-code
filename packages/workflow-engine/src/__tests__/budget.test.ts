import { expect, test } from 'bun:test'
import { Budget, BudgetExhaustedError } from '../engine/budget.js'

test('total=null means unlimited', () => {
  const b = new Budget(null)
  expect(b.total).toBeNull()
  expect(b.remaining()).toBe(Infinity)
  b.addOutputTokens(999999)
  expect(b.spent()).toBe(999999)
  expect(() => b.assertCanSpend()).not.toThrow()
})

test('accumulates and throws when cap exceeded', () => {
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

test('addOutputTokens ignores negative values', () => {
  const b = new Budget(100)
  b.addOutputTokens(-50)
  expect(b.spent()).toBe(0)
})
