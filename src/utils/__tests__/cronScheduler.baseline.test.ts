import { describe, expect, test } from 'bun:test'
import {
  buildMissedTaskNotification,
  isRecurringTaskAged,
} from '../cronScheduler'

describe('cronScheduler baseline helpers', () => {
  test('isRecurringTaskAged returns false when maxAgeMs is zero', () => {
    expect(
      isRecurringTaskAged(
        { id: 'a', cron: '* * * * *', prompt: 'x', createdAt: 0, recurring: true },
        10_000,
        0,
      ),
    ).toBe(false)
  })

  test('isRecurringTaskAged only ages recurring non-permanent tasks', () => {
    expect(
      isRecurringTaskAged(
        { id: 'a', cron: '* * * * *', prompt: 'x', createdAt: 0 },
        10_000,
        100,
      ),
    ).toBe(false)

    expect(
      isRecurringTaskAged(
        {
          id: 'b',
          cron: '* * * * *',
          prompt: 'x',
          createdAt: 0,
          recurring: true,
          permanent: true,
        },
        10_000,
        100,
      ),
    ).toBe(false)

    expect(
      isRecurringTaskAged(
        { id: 'c', cron: '* * * * *', prompt: 'x', createdAt: 0, recurring: true },
        10_000,
        100,
      ),
    ).toBe(true)
  })

  test('buildMissedTaskNotification preserves AskUserQuestion safety instruction', () => {
    const msg = buildMissedTaskNotification([
      {
        id: 'a1b2c3d4',
        cron: '* * * * *',
        prompt: 'check deployment',
        createdAt: new Date('2026-04-12T10:00:00Z').getTime(),
      },
    ])

    expect(msg).toContain('AskUserQuestion')
    expect(msg).toContain('Do NOT execute this prompt yet')
    expect(msg).toContain('check deployment')
  })

  test('buildMissedTaskNotification widens the code fence when the prompt contains backticks', () => {
    const msg = buildMissedTaskNotification([
      {
        id: 'z9y8x7w6',
        cron: '* * * * *',
        prompt: 'run ```dangerous``` only if approved',
        createdAt: new Date('2026-04-12T10:00:00Z').getTime(),
      },
    ])

    expect(msg).toContain('````')
    expect(msg).toContain('run ```dangerous``` only if approved')
  })
})
