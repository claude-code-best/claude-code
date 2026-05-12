import type { ToolUseContext } from '../../Tool.js'
import { clearCommandsCache } from '../../commands.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import {
  type PreferredLanguage,
  getLanguageDisplayName,
  getResolvedLanguage,
} from '../../utils/language.js'
import { Extension as ReviewExtension } from '../../costrict/review/index.js'

const VALID_LANGS: readonly PreferredLanguage[] = ['en', 'zh', 'auto']

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const arg = args.trim().toLowerCase()

  if (!arg) {
    const pref = getGlobalConfig().preferredLanguage ?? 'auto'
    const resolved = getResolvedLanguage()
    const suffix =
      pref === 'auto' ? ` → ${getLanguageDisplayName(resolved)}` : ''
    onDone(`Language: ${getLanguageDisplayName(pref)}${suffix}`, {
      display: 'system',
    })
    return null
  }

  if (!VALID_LANGS.includes(arg as PreferredLanguage)) {
    onDone(`Invalid language "${arg}". Use: en, zh, or auto`, {
      display: 'system',
    })
    return null
  }

  const lang = arg as PreferredLanguage
  saveGlobalConfig(current => ({ ...current, preferredLanguage: lang }))

  // Re-extract review skills for the new locale and refresh skill caches
  await ReviewExtension.initializeBuiltinSkills().catch(() => {})
  clearCommandsCache()

  const resolved = getResolvedLanguage()
  const suffix = lang === 'auto' ? ` → ${getLanguageDisplayName(resolved)}` : ''
  onDone(`Language set to ${getLanguageDisplayName(lang)}${suffix}`, {
    display: 'system',
  })
  return null
}
