import { registerBundledSkill } from 'src/skills/bundledSkills.js'
import { BUNDLED_SKILLS } from './builtin.js'

export function registerCodeReviewSecuritySkill(): void {
  const files = BUNDLED_SKILLS['security-review'] ?? {}
  const skillMd = files['SKILL.md'] ?? ''

  registerBundledSkill({
    name: 'security-review',
    description: 'CoStrict Security — identifies code vulnerabilities including SQL injection, XSS, command injection, SSRF, path traversal, deserialization, and business logic flaws',
    whenToUse:
      'Use when the user requests a code audit, security audit, vulnerability scan, or wants to review vulnerabilities before deployment. Also triggers on /security-review.',
    userInvocable: true,
    files,
    async getPromptForCommand() {
      return [{ type: 'text', text: skillMd }]
    },
  })
}
