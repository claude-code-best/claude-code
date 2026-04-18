import { afterEach, describe, expect, test } from 'bun:test'
import { isSkillImprovementEnabled } from '../skillImprovement.js'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('skillImprovement', () => {
  test('is enabled when skill learning is enabled', () => {
    process.env = { ...originalEnv }
    process.env.SKILL_LEARNING_ENABLED = '1'
    delete process.env.SKILL_IMPROVEMENT_ENABLED

    expect(isSkillImprovementEnabled()).toBe(true)
  })

  test('explicit skill improvement opt-out wins', () => {
    process.env = { ...originalEnv }
    process.env.SKILL_LEARNING_ENABLED = '1'
    process.env.SKILL_IMPROVEMENT_ENABLED = '0'

    expect(isSkillImprovementEnabled()).toBe(false)
  })
})
