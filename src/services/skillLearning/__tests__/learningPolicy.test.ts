import { describe, expect, test } from 'bun:test'
import { createInstinct } from '../instinctParser.js'
import {
  buildLearnedSkillName,
  decideDefaultScope,
  isGenericSkillName,
  isValidLearnedSkillName,
  normalizeSkillName,
  shouldGenerateSkillFromInstincts,
} from '../learningPolicy.js'

describe('learningPolicy', () => {
  test('normalizes learned skill names to lowercase kebab-case with length cap', () => {
    const name = normalizeSkillName('Testing React Testing Library!!!')

    expect(name).toBe('testing-react-testing-library')
    expect(name.length).toBeLessThanOrEqual(64)
  })

  test('rejects generic learned skill names', () => {
    expect(isGenericSkillName('learned-skill')).toBe(true)
    expect(isValidLearnedSkillName('learned-skill')).toBe(false)
  })

  test('builds domain-prefixed names from instincts', () => {
    const instinct = createInstinct({
      trigger: 'when writing React tests',
      action: 'use testing-library and avoid implementation mocks',
      confidence: 0.85,
      domain: 'testing',
      source: 'session-observation',
      scope: 'project',
      evidence: ['user correction'],
    })

    const name = buildLearnedSkillName([instinct])

    expect(name.startsWith('testing-')).toBe(true)
    expect(isValidLearnedSkillName(name)).toBe(true)
  })

  test('uses confidence threshold before generating skills', () => {
    const low = createInstinct({
      trigger: 'when testing',
      action: 'try a tentative pattern',
      confidence: 0.3,
      domain: 'testing',
      source: 'session-observation',
      scope: 'project',
      evidence: ['weak signal'],
    })
    const high = { ...low, confidence: 0.8 }

    expect(shouldGenerateSkillFromInstincts([low])).toBe(false)
    expect(shouldGenerateSkillFromInstincts([high])).toBe(true)
  })

  test('promotes only global-friendly repeated instinct groups by default', () => {
    const workflow = createInstinct({
      trigger: 'when modifying code',
      action: 'Grep then Read then Edit',
      confidence: 0.8,
      domain: 'workflow',
      source: 'session-observation',
      scope: 'project',
      evidence: ['repeated workflow'],
    })
    const testing = createInstinct({
      trigger: 'when writing React tests',
      action: 'use testing-library',
      confidence: 0.8,
      domain: 'testing',
      source: 'session-observation',
      scope: 'project',
      evidence: ['project convention'],
    })

    expect(decideDefaultScope([workflow, workflow])).toBe('global')
    expect(decideDefaultScope([testing])).toBe('project')
  })
})
