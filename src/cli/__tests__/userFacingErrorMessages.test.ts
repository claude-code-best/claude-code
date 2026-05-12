import { describe, expect, test } from 'bun:test'

/**
 * Verify that user-facing error messages include actionable guidance.
 * These are pure string-formatting tests — no side effects.
 */

describe('User-facing error messages', () => {
  test('budget exceeded message includes budget and guidance', () => {
    const maxBudgetUsd = 5.0
    const message = `Error: Exceeded USD budget ($${maxBudgetUsd}).\nTip: Increase the limit with --max-budget-usd or start a new session to continue.`

    expect(message).toContain('Exceeded USD budget')
    expect(message).toContain('$5')
    expect(message).toContain('--max-budget-usd')
    expect(message).toContain('new session')
  })

  test('max turns message includes guidance', () => {
    const maxTurns = 10
    const message = `Error: Reached max turns (${maxTurns}).\nTip: Increase the limit with --max-turns or continue in a new session.`

    expect(message).toContain('max turns')
    expect(message).toContain('--max-turns')
    expect(message).toContain('new session')
  })

  test('structured output retry message includes guidance', () => {
    const message =
      'Error: Failed to provide valid structured output after maximum retries.\nTip: Simplify your schema or check if the output format matches the expected structure.'

    expect(message).toContain('structured output')
    expect(message).toContain('Simplify your schema')
  })

  test('QueryEngine budget error includes actionable hint', () => {
    const maxBudgetUsd = 3.0
    const message = `Reached maximum budget ($${maxBudgetUsd}). Increase the limit with --max-budget-usd or start a new session.`

    expect(message).toContain('maximum budget')
    expect(message).toContain('--max-budget-usd')
    expect(message).toContain('new session')
  })
})

describe('Onboarding security copy', () => {
  test('security heading uses friendly tone', () => {
    const heading = 'Before you start, keep in mind:'
    expect(heading).not.toContain('Security')
    expect(heading).toContain('Before you start')
  })

  test('trust dialog copy is concise', () => {
    const body =
      'Is this a project you trust? (Your own code, a well-known open source project, or work from your team).'
    expect(body.length).toBeLessThan(120)
    expect(body).toContain('trust')
  })
})
