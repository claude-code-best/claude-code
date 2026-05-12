import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getClaudeConfigHomeDir } from 'src/utils/envUtils.js'
import { getResolvedLanguage } from 'src/utils/language.js'
import {
  extractBundledSkill,
  getBuiltinSkillVersion,
  listBuiltinSkillNames,
} from './skill/builtin.js'

const LOCALE_MAP: Record<string, string> = { zh: 'zh-CN', en: 'en' }

function getLocale(): string {
  const lang = getResolvedLanguage()
  return LOCALE_MAP[lang] ?? 'zh-CN'
}

function getReviewSkillsDir(): string {
  return join(getClaudeConfigHomeDir(), 'skills')
}

function getVersionFilePath(skillDir: string): string {
  return join(skillDir, '.version')
}

async function getInstalledVersion(skillDir: string): Promise<string | null> {
  try {
    return await readFile(getVersionFilePath(skillDir), 'utf-8')
  } catch {
    return null
  }
}

async function writeVersionFile(
  skillDir: string,
  skillName: string,
  locale: string,
): Promise<void> {
  const builtinVersion = getBuiltinSkillVersion(skillName)
  if (!builtinVersion) return
  await writeFile(getVersionFilePath(skillDir), `${builtinVersion}:${locale}`, 'utf-8')
}

async function needsUpdate(
  skillDir: string,
  skillName: string,
  locale: string,
): Promise<boolean> {
  const builtinVersion = getBuiltinSkillVersion(skillName)
  if (!builtinVersion) return true
  const installed = await getInstalledVersion(skillDir)
  return installed !== `${builtinVersion}:${locale}`
}

export async function initializeBuiltinSkills(): Promise<void> {
  const locale = getLocale()
  const skillsDir = getReviewSkillsDir()
  const skillNames = listBuiltinSkillNames()

  for (const skillName of skillNames) {
    const skillDir = join(skillsDir, skillName)
    if (!(await needsUpdate(skillDir, skillName, locale))) continue

    await mkdir(skillDir, { recursive: true })
    await extractBundledSkill(skillName, skillDir, locale)
    await writeVersionFile(skillDir, skillName, locale)
  }
}

export function getBuiltinSkillsDir(): string {
  return getReviewSkillsDir()
}
