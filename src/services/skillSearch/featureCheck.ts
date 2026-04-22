import { feature } from 'bun:bundle'

export function isSkillSearchEnabled(): boolean {
  if (process.env.SKILL_SEARCH_ENABLED === '0') return false
  if (process.env.SKILL_SEARCH_ENABLED === '1') return true
  if (feature('EXPERIMENTAL_SKILL_SEARCH')) {
    return true
  }
  return false
}
