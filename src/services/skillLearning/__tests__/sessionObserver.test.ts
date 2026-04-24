import { describe, expect, test } from 'bun:test'
import { analyzeObservations } from '../sessionObserver.js'
import type { StoredSkillObservation } from '../observationStore.js'

function obs(partial: Partial<StoredSkillObservation>): StoredSkillObservation {
  return {
    id: partial.id ?? crypto.randomUUID(),
    timestamp: '2026-04-16T00:00:00.000Z',
    event: partial.event ?? 'user_message',
    sessionId: 's1',
    projectId: 'p1',
    projectName: 'project',
    cwd: process.cwd(),
    ...partial,
  }
}

describe('sessionObserver', () => {
  test('extracts user correction instincts', () => {
    const instincts = analyzeObservations([
      obs({ messageText: '不要直接 mock，用 testing-library' }),
    ])

    expect(instincts).toHaveLength(1)
    expect(instincts[0]?.domain).toBe('testing')
    expect(instincts[0]?.action).toContain('testing-library')
  })

  test('extracts repeated Grep -> Read -> Edit workflow instinct', () => {
    const seq = ['Grep', 'Read', 'Edit', 'Grep', 'Read', 'Edit']
    const instincts = analyzeObservations(
      seq.map((toolName, index) =>
        obs({ id: `o${index}`, event: 'tool_start', toolName }),
      ),
    )

    expect(instincts.some(instinct => instinct.domain === 'workflow')).toBe(
      true,
    )
  })

  test('does not invent instincts without clear patterns', () => {
    expect(analyzeObservations([obs({ messageText: 'hello' })])).toEqual([])
  })

  test('snapshots recent tool outcome on correction candidates', () => {
    const [instinct] = analyzeObservations([
      obs({
        id: 'o0',
        event: 'tool_complete',
        toolName: 'Edit',
        outcome: 'failure',
      }),
      obs({
        id: 'o1',
        event: 'user_message',
        messageText: '不要直接 mock，用 testing-library',
      }),
    ])
    expect(instinct?.evidenceOutcome).toBe('failure')
  })

  test('marks tool-error-resolution candidates as success outcome', () => {
    const instincts = analyzeObservations([
      obs({
        id: 'o0',
        event: 'tool_complete',
        toolName: 'Grep',
        outcome: 'failure',
      }),
      obs({
        id: 'o1',
        event: 'tool_complete',
        toolName: 'Grep',
        outcome: 'success',
      }),
    ])
    const resolution = instincts.find(i => i.domain === 'debugging')
    expect(resolution?.evidenceOutcome).toBe('success')
  })

  test('leaves evidenceOutcome undefined when no prior tool_complete exists', () => {
    const [instinct] = analyzeObservations([
      obs({
        id: 'o0',
        event: 'user_message',
        messageText: '不要直接 mock，用 testing-library',
      }),
    ])
    expect(instinct?.evidenceOutcome).toBeUndefined()
  })

  test('single "always/must" convention message gets confidence <= 0.4', () => {
    const instincts = analyzeObservations([
      obs({ messageText: 'always use pnpm' }),
    ])

    expect(instincts.length).toBeGreaterThan(0)
    for (const instinct of instincts) {
      expect(instinct.confidence).toBeLessThanOrEqual(0.4)
    }
  })
})
