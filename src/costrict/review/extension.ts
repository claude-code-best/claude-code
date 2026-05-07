/**
 * CoStrict Skill Extension
 *
 * Initializes builtin review skills by extracting them from embedded
 * SKILL_FILES to a cache directory on disk.
 *
 * Version tracking uses commit SHA + locale in a .version file.
 * Skills are re-extracted when version or locale changes.
 */

import path from 'path'
import { writeFile, readFile, rm, mkdir, stat } from 'fs/promises'
import { getResolvedLanguage } from 'src/utils/language.js'
import * as Builtin from './skill/builtin.js'

const LOCALE_MAP: Record<string, string> = { zh: 'zh-CN', en: 'en' }

function getSkillCacheDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
  return path.join(home, '.claude', 'skills')
}

function getVersionFilePath(skillDir: string): string {
  return path.join(skillDir, '.version')
}

async function getInstalledVersion(skillDir: string): Promise<string | null> {
  try {
    const content = await readFile(getVersionFilePath(skillDir), 'utf-8')
    return content.trim()
  } catch {
    return null
  }
}

async function needsUpdate(skillDir: string, skillName: string, locale: string): Promise<boolean> {
  const builtinVersion = Builtin.getBuiltinSkillVersion(skillName)
  if (!builtinVersion) return true

  const installedVersion = await getInstalledVersion(skillDir)
  const expectedVersion = `${builtinVersion}:${locale}`
  return installedVersion !== expectedVersion
}

async function writeVersionFile(skillDir: string, skillName: string, locale: string): Promise<void> {
  const builtinVersion = Builtin.getBuiltinSkillVersion(skillName)
  if (!builtinVersion) return

  await mkdir(skillDir, { recursive: true })
  await writeFile(getVersionFilePath(skillDir), `${builtinVersion}:${locale}`, 'utf-8')
}

export async function initializeBuiltinSkills(): Promise<void> {
  const lang = getResolvedLanguage()
  const locale = LOCALE_MAP[lang] ?? 'zh-CN'

  const cacheDir = getSkillCacheDir()
  const skillNames = Builtin.listBuiltinSkills()

  for (const name of skillNames) {
    const skillDir = path.join(cacheDir, name)

    const dirExists = await stat(skillDir).then(s => s.isDirectory()).catch(() => false)

    if (dirExists) {
      const updateNeeded = await needsUpdate(skillDir, name, locale)
      if (!updateNeeded) continue

      try {
        await rm(skillDir, { recursive: true, force: true })
      } catch {
        // Continue with copy over existing files
      }
    }

    await Builtin.extractBundledSkill(name, skillDir, locale)
    await writeVersionFile(skillDir, name, locale)

    const skillFiles = Builtin.listSkillFiles(name, locale)
    const builtinVersion = Builtin.getBuiltinSkillVersion(name)
    console.log(`  [review] initialized skill "${name}" (${locale}, ${skillFiles.length} files, v${builtinVersion?.slice(0, 7)})`)
  }
}

export function getBuiltinSkillsDir(): string {
  return getSkillCacheDir()
}
