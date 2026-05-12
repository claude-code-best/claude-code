import { describe, expect, test } from 'bun:test'

import plan from './index.js'

describe('plan bridge invocation safety', () => {
  test('allows headless plan mode operations over Remote Control', () => {
    expect(plan.getBridgeInvocationError?.('')).toBeUndefined()
    expect(
      plan.getBridgeInvocationError?.('write a migration plan'),
    ).toBeUndefined()
  })

  test('blocks /plan open over Remote Control', () => {
    expect(plan.getBridgeInvocationError?.('open')).toBe(
      "Opening the local editor via /plan open isn't available over Remote Control.",
    )
  })
})
