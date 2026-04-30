import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getActiveObserverBackend,
  listObserverBackends,
  registerObserverBackend,
  resolveDefaultObserverBackend,
  setActiveObserverBackend,
  analyzeWithActiveBackend,
  type ObserverBackend,
} from '../observerBackend.js'
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

const originalBackendName = getActiveObserverBackend().name

afterEach(() => {
  setActiveObserverBackend(originalBackendName)
})

describe('observerBackend', () => {
  test('registers heuristic and llm backends by default', () => {
    const names = listObserverBackends()
    expect(names).toContain('heuristic')
    expect(names).toContain('llm')
  })

  test('resolveDefaultObserverBackend honours SKILL_LEARNING_OBSERVER_BACKEND env', () => {
    // Adversarial probe for the env switch — if this regresses, the LLM
    // backend would be silently unreachable in production even with the env
    // variable set, which was the original AC2 gap.
    const original = process.env.SKILL_LEARNING_OBSERVER_BACKEND
    try {
      process.env.SKILL_LEARNING_OBSERVER_BACKEND = 'llm'
      resolveDefaultObserverBackend()
      expect(getActiveObserverBackend().name).toBe('llm')

      // Unknown backend names must not crash; the current active stays.
      process.env.SKILL_LEARNING_OBSERVER_BACKEND = 'nonexistent'
      resolveDefaultObserverBackend()
      expect(getActiveObserverBackend().name).toBe('llm')

      // Clearing the env leaves whatever was active — explicit opt-out is
      // setActiveObserverBackend, not clearing the env.
      delete process.env.SKILL_LEARNING_OBSERVER_BACKEND
      resolveDefaultObserverBackend()
      expect(getActiveObserverBackend().name).toBe('llm')
    } finally {
      if (original === undefined) {
        delete process.env.SKILL_LEARNING_OBSERVER_BACKEND
      } else {
        process.env.SKILL_LEARNING_OBSERVER_BACKEND = original
      }
    }
  })

  test('heuristic backend preserves existing correction detection', async () => {
    setActiveObserverBackend('heuristic')
    const candidates = await analyzeWithActiveBackend([
      obs({ messageText: '不要直接 mock，用 testing-library' }),
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.action).toContain('testing-library')
  })

  test('llm backend short-circuits to [] on empty observations', async () => {
    // With the real Haiku-backed implementation the backend only calls
    // queryHaiku when there are observations to analyse. Empty-input short
    // circuit guarantees the no-cost path needed for hot loops.
    setActiveObserverBackend('llm')
    const candidates = await analyzeWithActiveBackend([])
    expect(candidates).toEqual([])
  })

  test('analyzeObservations routes to active backend (sync path throws for async backends)', () => {
    // Heuristic backend is sync — analyzeObservations works directly.
    const previousCount = analyzeObservations([
      obs({ messageText: '不要直接 mock，用 testing-library' }),
    ]).length
    expect(previousCount).toBe(1)

    // The LLM backend is now a real async implementation (queryHaiku). The
    // sync `analyzeObservations` helper refuses to return a pending Promise
    // and throws with a clear instruction to use `analyzeWithActiveBackend`
    // instead — prove the routing reached the async backend by catching
    // that exact error.
    setActiveObserverBackend('llm')
    expect(() =>
      analyzeObservations([
        obs({ messageText: '不要直接 mock，用 testing-library' }),
      ]),
    ).toThrow(/Promise/)
  })

  test('custom backends can be registered and switched', async () => {
    const custom: ObserverBackend = {
      name: 'custom-test',
      analyze() {
        return [
          {
            trigger: 'custom trigger',
            action: 'custom action',
            confidence: 0.9,
            domain: 'project',
            source: 'session-observation',
            scope: 'project',
            evidence: ['custom evidence'],
          },
        ]
      },
    }
    registerObserverBackend(custom)
    setActiveObserverBackend('custom-test')

    const candidates = await analyzeWithActiveBackend([])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.trigger).toBe('custom trigger')
  })

  test('switching to an unknown backend throws', () => {
    expect(() => setActiveObserverBackend('does-not-exist')).toThrow()
  })
})
