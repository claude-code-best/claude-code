import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInstinct } from '../instinctParser.js'
import { saveInstinct, loadInstincts } from '../instinctStore.js'
import {
  checkPromotion,
  findPromotionCandidates,
  resetPromotionBookkeeping,
} from '../promotion.js'
import type { SkillLearningProjectContext } from '../types.js'

let rootDir: string

function projectCtx(projectId: string): SkillLearningProjectContext {
  return {
    projectId,
    projectName: projectId,
    scope: 'project',
    source: 'git_root',
    cwd: rootDir,
    storageDir: join(rootDir, 'projects', projectId),
  }
}

function globalCtx(): SkillLearningProjectContext {
  return {
    projectId: 'global',
    projectName: 'Global',
    scope: 'global',
    source: 'global',
    cwd: rootDir,
    storageDir: join(rootDir, 'global'),
  }
}

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'skill-learning-promote-'))
  resetPromotionBookkeeping()
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

describe('promotion', () => {
  test('findPromotionCandidates returns instincts with 2+ projects and avg>=0.8', () => {
    const mk = (projectId: string) =>
      createInstinct({
        id: 'shared-trigger',
        trigger: 'shared',
        action: 'shared',
        confidence: 0.85,
        domain: 'workflow',
        source: 'session-observation',
        scope: 'project',
        projectId,
        projectName: projectId,
        evidence: ['ev'],
        status: 'active',
      })
    const candidates = findPromotionCandidates([mk('alpha'), mk('beta')])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.projectIds.sort()).toEqual(['alpha', 'beta'])
  })

  test('checkPromotion writes a global copy for cross-project instincts', async () => {
    const mk = (projectId: string) =>
      createInstinct({
        id: 'shared-id',
        trigger: 'shared',
        action: 'shared',
        confidence: 0.85,
        domain: 'workflow',
        source: 'session-observation',
        scope: 'project',
        projectId,
        projectName: projectId,
        evidence: ['ev'],
        status: 'active',
      })
    await saveInstinct(mk('alpha'), { rootDir, project: projectCtx('alpha') })
    await saveInstinct(mk('beta'), { rootDir, project: projectCtx('beta') })

    const promoted = await checkPromotion({ rootDir })
    expect(promoted.map(p => p.instinctId)).toContain('shared-id')

    const globalInstincts = await loadInstincts({
      rootDir,
      scope: 'global',
      project: globalCtx(),
    })
    const global = globalInstincts.find(i => i.id === 'shared-id')
    expect(global).toBeDefined()
    expect(global?.scope).toBe('global')
    expect(global?.confidence).toBeGreaterThanOrEqual(0.8)
  })

  test('checkPromotion is idempotent within a session', async () => {
    const mk = (projectId: string) =>
      createInstinct({
        id: 'repeat-id',
        trigger: 'repeat',
        action: 'repeat',
        confidence: 0.85,
        domain: 'workflow',
        source: 'session-observation',
        scope: 'project',
        projectId,
        projectName: projectId,
        evidence: ['ev'],
        status: 'active',
      })
    await saveInstinct(mk('alpha'), { rootDir, project: projectCtx('alpha') })
    await saveInstinct(mk('beta'), { rootDir, project: projectCtx('beta') })

    const first = await checkPromotion({ rootDir })
    const second = await checkPromotion({ rootDir })

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(0)
  })

  test('does not promote when only one project has the instinct', async () => {
    const instinct = createInstinct({
      id: 'solo',
      trigger: 'solo',
      action: 'solo',
      confidence: 0.9,
      domain: 'workflow',
      source: 'session-observation',
      scope: 'project',
      projectId: 'alpha',
      projectName: 'alpha',
      evidence: ['ev'],
      status: 'active',
    })
    await saveInstinct(instinct, { rootDir, project: projectCtx('alpha') })

    const promoted = await checkPromotion({ rootDir })
    expect(promoted).toEqual([])
  })
})
