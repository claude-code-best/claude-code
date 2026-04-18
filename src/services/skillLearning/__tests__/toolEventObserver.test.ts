import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readObservations } from '../observationStore.js'
import {
  hasToolHookObservationsForTurn,
  recordToolComplete,
  recordToolError,
  recordToolStart,
  recordUserCorrection,
  resetToolHookBookkeeping,
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
})
