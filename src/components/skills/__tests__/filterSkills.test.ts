import { describe, expect, test } from 'bun:test'
import { filterSkills } from '../filterSkills.js'
import type { SkillItem } from '../filterSkills.js'

function makeSkill(name: string, description = ''): SkillItem {
  return { name, description }
}

describe('filterSkills', () => {
  const skills: SkillItem[] = [
    makeSkill('tdd-guide', 'Test-driven development guide'),
    makeSkill('code-reviewer', 'Review code quality and patterns'),
    makeSkill('security-reviewer', 'Security vulnerability analysis'),
    makeSkill('refactor-cleaner', 'Dead code cleanup and refactoring'),
    makeSkill('planner', 'Implementation planning for complex features'),
    makeSkill('architect', 'System design and architecture decisions'),
  ]

  test('empty query returns all skills', () => {
    const result = filterSkills(skills, '')
    expect(result).toEqual(skills)
  })

  test('partial name match returns matching skills', () => {
    const result = filterSkills(skills, 'review')
    const names = result.map(s => s.name)
    expect(names).toContain('code-reviewer')
    expect(names).toContain('security-reviewer')
    expect(names).not.toContain('planner')
  })

  test('no match returns empty array', () => {
    const result = filterSkills(skills, 'zzznomatch')
    expect(result).toHaveLength(0)
  })

  test('case insensitive match', () => {
    const result = filterSkills(skills, 'TDD')
    expect(result.map(s => s.name)).toContain('tdd-guide')
  })

  test('matches description when name does not match', () => {
    const result = filterSkills(skills, 'dead code')
    expect(result.map(s => s.name)).toContain('refactor-cleaner')
  })

  test('multi-word query matches skills containing any word', () => {
    // "code review" should match both code-reviewer (name) and tdd-guide (description has "Test" but not code review)
    const result = filterSkills(skills, 'code review')
    const names = result.map(s => s.name)
    // code-reviewer matches both "code" and "review"
    expect(names).toContain('code-reviewer')
  })

  test('clear query (reset to empty) returns all skills again', () => {
    // First filter
    const filtered = filterSkills(skills, 'security')
    expect(filtered).toHaveLength(1)
    // Then clear
    const all = filterSkills(skills, '')
    expect(all).toHaveLength(skills.length)
  })

  test('whitespace-only query returns all skills', () => {
    const result = filterSkills(skills, '   ')
    expect(result).toEqual(skills)
  })
})
