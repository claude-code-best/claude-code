import { feature } from 'bun:bundle'

export function isSkillLearningEnabled(): boolean {
  if (process.env.SKILL_LEARNING_ENABLED === '0') return false
  if (process.env.SKILL_LEARNING_ENABLED === '1') return true
  if (process.env.FEATURE_SKILL_LEARNING === '0') return false
  if (process.env.FEATURE_SKILL_LEARNING === '1') return true
  if (feature('SKILL_LEARNING')) {
    return true
  }
  return false
}
