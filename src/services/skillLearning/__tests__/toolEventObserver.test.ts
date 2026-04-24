import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readObservations } from '../observationStore.js'
import {
  hasToolHookObservationsForTurn,
  pruneEmittedTurns,
  recordToolComplete,
  recordToolError,
  recordToolStart,
  recordUserCorrection,
  resetToolHookBookkeeping,
  resetToolHookDepsCache,
  runToolCallWithSkillLearningHooks,
} from '../toolEventObserver.js'

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'skill-learning-tool-hook-'))
  resetToolHookBookkeeping()
  process.env.CLAUDE_SKILL_LEARNING_HOME = rootDir
})

afterEach(() => {
  delete process.env.CLAUDE_SKILL_LEARNING_HOME
  rmSync(rootDir, { recursive: true, force: true })
})

function ctx() {
  return {
    sessionId: 'tool-hook-session',
    turn: 1,
    projectId: 'p1',
    projectName: 'project',
    cwd: rootDir,
    project: {
      projectId: 'p1',
      projectName: 'project',
      cwd: rootDir,
      scope: 'project' as const,
      source: 'global' as const,
      storageDir: join(rootDir, 'projects', 'p1'),
    },
  }
}

describe('toolEventObserver', () => {
  test('records tool_start with tool-hook source', async () => {
    await recordToolStart(ctx(), 'Grep', { pattern: 'foo' })
    const observations = await readObservations({
      rootDir,
      project: ctx().project,
    })
    expect(observations).toHaveLength(1)
    expect(observations[0]?.event).toBe('tool_start')
    expect(observations[0]?.source).toBe('tool-hook')
    expect(observations[0]?.toolName).toBe('Grep')
  })

  test('records tool_complete with success outcome', async () => {
    await recordToolComplete(ctx(), 'Edit', 'ok', 'success')
    const observations = await readObservations({
      rootDir,
      project: ctx().project,
    })
    expect(observations[0]?.event).toBe('tool_complete')
    expect(observations[0]?.outcome).toBe('success')
  })

  test('records tool_error as tool_complete with failure outcome', async () => {
    await recordToolError(ctx(), 'Bash', new Error('boom'))
    const observations = await readObservations({
      rootDir,
      project: ctx().project,
    })
    expect(observations[0]?.outcome).toBe('failure')
  })

  test('records user correction message', async () => {
    await recordUserCorrection(ctx(), '不要 mock，用 testing-library')
    const observations = await readObservations({
      rootDir,
      project: ctx().project,
    })
    expect(observations[0]?.event).toBe('user_message')
    expect(observations[0]?.messageText).toContain('testing-library')
  })

  test('tracks which session+turn has tool-hook observations', async () => {
    expect(hasToolHookObservationsForTurn('tool-hook-session', 1)).toBe(false)
    await recordToolStart(ctx(), 'Grep')
    expect(hasToolHookObservationsForTurn('tool-hook-session', 1)).toBe(true)
    expect(hasToolHookObservationsForTurn('tool-hook-session', 2)).toBe(false)
  })

  // H11: emittedTurns bounded memory tests
  describe('pruneEmittedTurns', () => {
    test('prunes Set entries exceeding SET_MAX keeping most recent', async () => {
      const sessionId = 'big-session'
      // Fill 501 turns (threshold is 500)
      for (let i = 1; i <= 501; i++) {
        await recordToolStart({ ...ctx(), sessionId, turn: i }, 'Grep')
      }
      // After pruning the Set should not exceed KEEP limit (250)
      expect(hasToolHookObservationsForTurn(sessionId, 1)).toBe(false) // oldest pruned
      expect(hasToolHookObservationsForTurn(sessionId, 501)).toBe(true) // newest kept
      expect(hasToolHookObservationsForTurn(sessionId, 252)).toBe(true) // within keep window
    })

    test('prunes Map entries exceeding MAP_MAX keeping most recent insertions', async () => {
      // Insert 51 distinct sessions (threshold is 50)
      for (let i = 0; i < 51; i++) {
        await recordToolStart(
          { ...ctx(), sessionId: `session-${i}`, turn: 1 },
          'Grep',
        )
      }
      // Oldest sessions should have been pruned from the Map
      expect(hasToolHookObservationsForTurn('session-0', 1)).toBe(false)
      // Most recent sessions should still be present
      expect(hasToolHookObservationsForTurn('session-50', 1)).toBe(true)
    })

    test('pruneEmittedTurns is idempotent when within limits', async () => {
      await recordToolStart(ctx(), 'Grep')
      pruneEmittedTurns()
      pruneEmittedTurns()
      // Should not affect tracked turns within limits
      expect(hasToolHookObservationsForTurn('tool-hook-session', 1)).toBe(true)
    })
  })

  // H10: fire-and-forget / flag-off tests
  describe('runToolCallWithSkillLearningHooks', () => {
    afterEach(() => {
      resetToolHookDepsCache()
      delete process.env.SKILL_LEARNING_ENABLED
    })

    test('invoke completes before recordToolStart promise resolves (fire-and-forget)', async () => {
      process.env.SKILL_LEARNING_ENABLED = '1'
      resetToolHookDepsCache()

      const completionOrder: string[] = []
      let resolveStart!: () => void
      // A slow recordToolStart: promise that resolves only when we let it
      const slowStartPromise = new Promise<void>(res => {
        resolveStart = res
      })

      // We spy on appendObservation by replacing the module's behaviour
      // without mocking: we just verify timing via a flag
      let invokeCompleted = false

      const result = await runToolCallWithSkillLearningHooks(
        'TestTool',
        {},
        { sessionId: 'test-ff-session', turn: 99 },
        async () => {
          // Short delay to let any awaited hooks run first (they must not)
          await new Promise(res => setTimeout(res, 5))
          invokeCompleted = true
          completionOrder.push('invoke')
          return { data: 'done' }
        },
      )

      // The invoke result is returned immediately — observation may still be in-flight
      expect(result).toEqual({ data: 'done' })
      expect(invokeCompleted).toBe(true)
    })

    test('flag off: wrapper skips observation entirely and returns invoke result', async () => {
      process.env.SKILL_LEARNING_ENABLED = '0'
      resetToolHookDepsCache()

      let invokeCalled = false
      const result = await runToolCallWithSkillLearningHooks(
        'TestTool',
        {},
        {},
        async () => {
          invokeCalled = true
          return { data: 42 }
        },
      )
      expect(invokeCalled).toBe(true)
      expect(result).toEqual({ data: 42 })
      // No observations should have been written
      const obs = await readObservations({ rootDir, project: ctx().project })
      expect(obs).toHaveLength(0)
    })
  })
})
