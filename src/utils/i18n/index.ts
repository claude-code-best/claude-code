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

function isValidTranslationPayload(
  value: unknown,
): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every(v => typeof v === 'string')
}

function getPersistedTranslations(): Record<string, string> {
  if (persistedTranslations !== null) return persistedTranslations
  let result: Record<string, string> = {}
  try {
    const configDir = getClaudeConfigHomeDir()
    const filePath = join(configDir, 'translations', 'zh.json')
    if (existsSync(filePath)) {
      const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf-8'))
      if (isValidTranslationPayload(parsed)) {
        result = parsed
      }
    }
  } catch {
    // ignore
  }
  persistedTranslations = result
  return result
}

/**
 * Interpolate `{key}` placeholders in a string with provided params.
 * e.g. interpolate("Hello {name}", { name: "World" }) → "Hello World"
 */
function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in params ? String(params[key]) : match,
  )
}

/**
 * Translation function. Returns the translated string for the current
 * resolved language, or falls back to autoTranslate / defaultValue / key
 * if no explicit translation exists.
 *
 * Lookup priority: builtin translations → persisted translations → autoTranslate(defaultValue) → key.
 *
 * Supports `{key}` interpolation via the optional `params` argument.
 * e.g. t('settings.fastMode.label', 'Fast mode ({model})', { model: 'Sonnet' })
 */
export function t(
  key: string,
  defaultValue?: string,
  params?: Record<string, string | number>,
): string {
  const lang = getResolvedLanguage()
  if (lang === 'en') return interpolate(defaultValue ?? key, params)

  // Check builtin translations
  const value = builtinTranslations[lang]?.[key]
  if (value !== undefined) return interpolate(value, params)

  // Check persisted translations (from /translate command)
  const persisted = getPersistedTranslations()[key]
  if (persisted !== undefined) return interpolate(persisted, params)

  // No explicit translation — try auto-translation for third-party content
  if (defaultValue) return interpolate(autoTranslate(defaultValue), params)
  return interpolate(key, params)
}

/**
 * Check if the current resolved language is Chinese.
 * Useful for conditional rendering (e.g., showing Chinese annotations).
 */
export function isChinese(): boolean {
  return getResolvedLanguage() === 'zh'
}
