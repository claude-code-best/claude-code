export function isSkillSearchEnabled(): boolean {
  if (process.env.SKILL_SEARCH_ENABLED === '0') return false
  if (process.env.SKILL_SEARCH_ENABLED === '1') return true
  return false
}
