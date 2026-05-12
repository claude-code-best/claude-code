import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function detectAutofixSkills(cwd: string): string[] {
  const candidates = [
    'AUTOFIX.md',
    '.claude/skills/autofix.md',
    '.claude/skills/autofix-pr/SKILL.md',
  ]
  return candidates.filter(rel => existsSync(join(cwd, rel)))
}

export function formatSkillsHint(skills: string[]): string {
  if (skills.length === 0) return ''
  return ` Run ${skills.join(' and ')} for custom instructions on how to autofix.`
}
