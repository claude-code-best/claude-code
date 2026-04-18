import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInstinct } from '../instinctParser.js'
import { generateSkillDraft, writeLearnedSkill } from '../skillGenerator.js'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'skill-learning-generator-'))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

describe('skillGenerator', () => {
  test('generates a valid SKILL.md draft from instincts', () => {
    const instinct = createInstinct({
      trigger: 'when writing React tests',
      action: 'use testing-library and avoid implementation mocks',
      confidence: 0.85,
      domain: 'testing',
      source: 'session-observation',
      scope: 'project',
      evidence: ['user correction'],
    })

    const draft = generateSkillDraft([instinct], { cwd })

    expect(draft.name).toContain('testing')
    expect(draft.content).toContain('name:')
    expect(draft.content).toContain('description:')
    expect(draft.content).toContain('## Trigger')
    expect(draft.content).toContain('## Evidence')
  })

  test('writes learned skills to project scope', async () => {
    const instinct = createInstinct({
      trigger: 'when writing React tests',
      action: 'use testing-library',
      confidence: 0.85,
      domain: 'testing',
      source: 'session-observation',
      scope: 'project',
      evidence: ['user correction'],
    })
    const draft = generateSkillDraft([instinct], { cwd })

    const file = await writeLearnedSkill(draft)

    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('use testing-library')
  })
})
