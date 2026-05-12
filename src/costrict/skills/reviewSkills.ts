import { registerBundledSkill } from 'src/skills/bundledSkills.js'
import { getResolvedLanguage } from 'src/utils/language.js'
import { CommandLocale } from 'src/costrict/command/locales/index.js'
import {
  SKILL_FILES,
  SKILL_METADATA,
} from 'src/costrict/review/skill/builtin.js'

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

function registerReviewSkill(
  name: string,
  skillKey: string,
  files: Record<string, string>,
  description: string,
): void {
  registerBundledSkill({
    name,
    description,
    whenToUse: description,
    userInvocable: true,
    disableModelInvocation: true,
    allowedTools: ALLOWED_TOOLS,
    files,
    async getPromptForCommand(args) {
      const template = CommandLocale.get(skillKey)
      const text = template
        ? template.replace('$ARGUMENTS', args.trim())
        : args.trim() || `Please perform a ${skillKey}.`
      return [{ type: 'text', text }]
    },
  })
}

export function registerReviewSkills(): void {
  const locale = getLocale()
  const localeFiles = SKILL_FILES[locale]
  const localeMetadata = SKILL_METADATA[locale]
  if (!localeFiles || !localeMetadata) return

  for (const [skillKey, files] of Object.entries(localeFiles)) {
    const meta = localeMetadata[skillKey]
    if (!meta || !files) continue

    registerReviewSkill(meta.name, skillKey, files, meta.description)
    registerReviewSkill(`strict:${skillKey}`, skillKey, files, meta.description)
  }
}
