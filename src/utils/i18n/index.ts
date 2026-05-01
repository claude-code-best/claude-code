import { getResolvedLanguage } from '../language.js'
import { zhCN } from '../../locales/zh-CN.js'

const translations: Record<string, Record<string, string>> = {
  zh: zhCN,
}

/**
 * Translation function. Returns the translated string for the current
 * resolved language, or falls back to defaultValue / key if no translation
 * exists or the current language is English.
 */
export function t(key: string, defaultValue?: string): string {
  const lang = getResolvedLanguage()
  if (lang === 'en') return defaultValue ?? key
  const value = translations[lang]?.[key]
  return value ?? defaultValue ?? key
}

/**
 * Check if the current resolved language is Chinese.
 * Useful for conditional rendering (e.g., showing Chinese annotations).
 */
export function isChinese(): boolean {
  return getResolvedLanguage() === 'zh'
}
