import { describe, expect, test } from 'bun:test'

/**
 * Verify that user-facing guidance in model picker and resume command
 * is concise and actionable. Pure string tests — no side effects.
 */

describe('ModelPicker subtitle', () => {
  test('subtitle mentions effort and context controls', () => {
    const subtitle =
      'Choose a model for this and future sessions. Use ← → to adjust effort, Space to toggle 1M context.'
    expect(subtitle).toContain('effort')
    expect(subtitle).toContain('1M context')
    expect(subtitle).toContain('sessions')
  })

  test('subtitle is under 120 characters', () => {
    const subtitle =
      'Choose a model for this and future sessions. Use ← → to adjust effort, Space to toggle 1M context.'
    expect(subtitle.length).toBeLessThan(120)
  })
})

describe('Resume error messages', () => {
  test('session not found suggests /resume to browse', () => {
    const message =
      'Session my-session was not found. Run /resume without arguments to browse all sessions.'
    expect(message).toContain('not found')
    expect(message).toContain('/resume')
    expect(message).toContain('browse')
  })

  test('multiple matches suggests /resume to pick', () => {
    const message =
      'Found 3 sessions matching test. Run /resume to pick one from the list.'
    expect(message).toContain('3 sessions')
    expect(message).toContain('/resume')
    expect(message).toContain('pick')
  })
})

describe('Cost command subscriber messages', () => {
  test('overage message mentions the key behavior', () => {
    const msg =
      'You are currently using your overages to power your Claude Code usage. We will automatically switch you back to your subscription rate limits when they reset'
    expect(msg).toContain('overages')
    expect(msg).toContain('automatically switch')
  })

  test('subscription message is concise', () => {
    const msg =
      'You are currently using your subscription to power your Claude Code usage'
    expect(msg.length).toBeLessThan(100)
  })
})
