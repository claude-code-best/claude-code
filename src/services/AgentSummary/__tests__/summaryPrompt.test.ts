import { describe, expect, test } from 'bun:test'
import {
  buildSummaryPrompt,
  createSummaryPromptMessage,
} from '../summaryPrompt.js'

describe('buildSummaryPrompt', () => {
  test('builds the first summary prompt without previous-summary pressure', () => {
    const prompt = buildSummaryPrompt(null)

    expect(prompt).toContain('Describe your most recent action')
    expect(prompt).toContain('Good: "Reading runAgent.ts"')
    expect(prompt).not.toContain('Previous:')
  })

  test('asks for a new summary when a previous one exists', () => {
    const prompt = buildSummaryPrompt('Reading udsMessaging.ts')

    expect(prompt).toContain('Previous: "Reading udsMessaging.ts"')
    expect(prompt).toContain('say something NEW')
  })
})

describe('createSummaryPromptMessage', () => {
  test('creates the minimal user message shape used by forked summaries', () => {
    const message = createSummaryPromptMessage('Summarize progress')

    expect(message.type).toBe('user')
    expect(message.message.role).toBe('user')
    expect(message.message.content).toBe('Summarize progress')
    expect(message.uuid).toBeString()
    expect(message.timestamp).toBeString()
  })
})
