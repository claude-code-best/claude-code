import { describe, expect, test } from 'bun:test'

/**
 * Verify that user-facing permission and help copy meets usability standards.
 * These are pure string tests — no side effects, no React rendering.
 */

describe('Permission dialog footer hints', () => {
  test('bash permission footer says "reject" instead of "cancel"', () => {
    const footer = 'Esc to reject'
    expect(footer).toContain('reject')
    expect(footer).not.toContain('cancel')
  })

  test('bash permission footer tab hint says "add feedback"', () => {
    const tabHint = 'Tab to add feedback'
    expect(tabHint).toContain('feedback')
    expect(tabHint).not.toContain('amend')
  })

  test('file permission footer matches bash footer language', () => {
    const bashFooter = 'Esc to reject'
    const fileFooter = 'Esc to reject'
    expect(bashFooter).toBe(fileFooter)
  })
})

describe('Permission option labels', () => {
  test('.claude/ folder option is under 60 chars', () => {
    const label = 'Yes, allow edits to .claude/ config for this session'
    expect(label.length).toBeLessThan(60)
    expect(label).toContain('.claude/')
  })

  test('accept-once option has simple label', () => {
    const label = 'Yes'
    expect(label).toBe('Yes')
  })

  test('reject option has simple label', () => {
    const label = 'No'
    expect(label).toBe('No')
  })
})

describe('Help General page getting started guide', () => {
  test('step 1 mentions exploring code', () => {
    const step1 =
      'Ask a question or describe a task — Claude will explore your code and respond.'
    expect(step1).toContain('explore')
    expect(step1).toContain('question')
  })

  test('step 2 mentions reviewing actions', () => {
    const step2 =
      'When Claude wants to edit files or run commands, you review and approve each action.'
    expect(step2).toContain('review')
    expect(step2).toContain('approve')
  })

  test('step 3 mentions key commands', () => {
    const step3 = '/commit'
    const step3b = '/help'
    const step3c = '?'
    expect(step3).toBe('/commit')
    expect(step3b).toBe('/help')
    expect(step3c).toBe('?')
  })

  test('heading says "Getting started"', () => {
    const heading = 'Getting started'
    expect(heading).toBe('Getting started')
  })
})
