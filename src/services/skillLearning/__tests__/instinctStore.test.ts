import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadInstincts,
  prunePendingInstincts,
  saveInstinct,
  upsertInstinct,
} from '../instinctStore.js'
import { createInstinct } from '../instinctParser.js'

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'skill-learning-instinct-'))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

describe('instinctStore', () => {
  test('saves and loads instincts', async () => {
    await saveInstinct(
      createInstinct({
        trigger: 'when testing',
        action: 'use testing-library',
        confidence: 0.7,
        domain: 'testing',
        source: 'session-observation',
        scope: 'project',
        evidence: ['user correction'],
      }),
      { rootDir, project: projectContext() },
    )

    const instincts = await loadInstincts({
      rootDir,
      project: projectContext(),
    })
    expect(instincts).toHaveLength(1)
    expect(instincts[0]?.action).toContain('testing-library')
  })

  test('upsert increases confidence for confirming instincts', async () => {
    const first = createInstinct({
      id: 'test-instinct',
      trigger: 'when testing',
      action: 'prefer testing-library',
      confidence: 0.7,
      domain: 'testing',
      source: 'session-observation',
      scope: 'project',
      evidence: ['one'],
    })
    await upsertInstinct(first, { rootDir, project: projectContext() })
    const second = { ...first, evidence: ['two'] }
    const updated = await upsertInstinct(second, {
      rootDir,
      project: projectContext(),
    })

    expect(updated.confidence).toBeGreaterThan(first.confidence)
    expect(updated.evidence).toContain('one')
    expect(updated.evidence).toContain('two')
  })

  test('outcome-aware upsert: failure evidence reduces confidence', async () => {
    const first = createInstinct({
      id: 'outcome-aware',
      trigger: 'when writing tests',
      action: 'use testing-library',
      confidence: 0.7,
      domain: 'testing',
      source: 'session-observation',
      scope: 'project',
      evidence: ['one'],
      evidenceOutcome: 'success',
    })
    const afterSuccess = await upsertInstinct(first, {
      rootDir,
      project: projectContext(),
    })
    await upsertInstinct(first, { rootDir, project: projectContext() })
    const afterAnotherSuccess = (
      await loadInstincts({ rootDir, project: projectContext() })
    ).find(i => i.id === 'outcome-aware')!

    const failure = {
      ...first,
      evidence: ['two'],
      evidenceOutcome: 'failure' as const,
    }
    const afterFailure = await upsertInstinct(failure, {
      rootDir,
      project: projectContext(),
    })

    expect(afterSuccess.confidence).toBe(0.7)
    expect(afterAnotherSuccess.confidence).toBeGreaterThan(
      afterSuccess.confidence,
    )
    expect(afterFailure.confidence).toBeLessThan(afterAnotherSuccess.confidence)
  })

  test('prunes old pending instincts', async () => {
    const old = createInstinct(
      {
        id: 'old-instinct',
        trigger: 'old',
        action: 'old',
        confidence: 0.3,
        domain: 'project',
        source: 'session-observation',
        scope: 'project',
        evidence: ['old'],
      },
      '2020-01-01T00:00:00.000Z',
    )
    await saveInstinct(old, { rootDir, project: projectContext() })

    const pruned = await prunePendingInstincts(30, {
      rootDir,
      project: projectContext(),
    })
    expect(pruned.map(instinct => instinct.id)).toContain('old-instinct')
    expect(await loadInstincts({ rootDir, project: projectContext() })).toEqual(
      [],
    )
  })
})

function projectContext() {
  return {
    projectId: 'p1',
    projectName: 'project',
    cwd: rootDir,
    scope: 'project' as const,
    source: 'global' as const,
    storageDir: join(rootDir, 'projects', 'p1'),
  }
}
