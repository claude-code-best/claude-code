import { registerBundledSkill } from 'src/skills/bundledSkills.js'
import {
  SKILL_METADATA,
} from 'src/costrict/review/skill/builtin.js'
import { getResolvedLanguage } from 'src/utils/language.js'

const LOCALE_MAP: Record<string, string> = { zh: 'zh-CN', en: 'en' }

function getLocale(): string {
  const lang = getResolvedLanguage()
  return LOCALE_MAP[lang] ?? 'zh-CN'
}

const ALLOWED_TOOLS = [
  'Skill',
  'Glob',
  'Grep',
  'Read',
  'TodoWrite',
  'Bash',
  'Agent',
]

function registerStrictReviewSkill(
  name: string,
  skillKey: string,
  description: string,
): void {
  registerBundledSkill({
    name,
    description,
    whenToUse: description,
    userInvocable: true,
    disableModelInvocation: false,
    allowedTools: ALLOWED_TOOLS,
    async getPromptForCommand(args) {
      return [{ type: 'text', text: `Please use the Skill tool to load the \`${skillKey}\` skill.\n\n${args.trim()}` }]
    },
  })
}

export function registerStrictReviewSkills(): void {
  const locale = getLocale()
  const localeMetadata = SKILL_METADATA[locale]
  if (!localeMetadata) return

  for (const [skillKey, meta] of Object.entries(localeMetadata)) {
    registerStrictReviewSkill(`strict:${skillKey}`, skillKey, meta.description)
  }
}
