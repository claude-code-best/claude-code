import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getResolvedLanguage } from '../language.js'
import { zhCN } from '../../locales/zh-CN.js'
import { autoTranslate } from './autoTranslate.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'

const builtinTranslations: Record<string, Record<string, string>> = {
  zh: zhCN,
}

/**
 * Persisted translations from /translate command.
 * Loaded once at startup from ~/.claude/translations/zh.json.
 */
let persistedTranslations: Record<string, string> | null = null

function getPersistedTranslations(): Record<string, string> {
  if (persistedTranslations !== null) return persistedTranslations
  let result: Record<string, string> = {}
  try {
    const configDir = getClaudeConfigHomeDir()
    const filePath = join(configDir, 'translations', 'zh.json')
    if (existsSync(filePath)) {
      result = JSON.parse(readFileSync(filePath, 'utf-8'))
    }
  } catch {
    // ignore
  }
  persistedTranslations = result
  return result
}

/**
 * Translation function. Returns the translated string for the current
 * resolved language, or falls back to autoTranslate / defaultValue / key
 * if no explicit translation exists.
 *
 * Lookup priority: builtin translations → persisted translations → autoTranslate(defaultValue) → key.
 */
export function t(key: string, defaultValue?: string): string {
  const lang = getResolvedLanguage()
  if (lang === 'en') return defaultValue ?? key

  // Check builtin translations
  const value = builtinTranslations[lang]?.[key]
  if (value !== undefined) return value

  // Check persisted translations (from /translate command)
  const persisted = getPersistedTranslations()[key]
  if (persisted !== undefined) return persisted

  // No explicit translation — try auto-translation for third-party content
  if (defaultValue) return autoTranslate(defaultValue)
  return key
}

/**
 * Check if the current resolved language is Chinese.
 * Useful for conditional rendering (e.g., showing Chinese annotations).
 */
export function isChinese(): boolean {
  return getResolvedLanguage() === 'zh'
}
