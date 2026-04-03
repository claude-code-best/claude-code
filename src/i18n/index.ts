/**
 * Lightweight i18n system for Claude Code CLI.
 *
 * Usage:
 *   import { t } from 'src/i18n';
 *   const text = t('common.loading');
 */

// Type for translation keys
export type TranslationKey = string;

// Available languages
export type Locale = 'en-US' | 'zh-CN';

// Default locale - used as fallback when detection fails
const DEFAULT_LOCALE: Locale = 'en-US';

// Current locale (can be changed at runtime)
let currentLocale: Locale = DEFAULT_LOCALE;

// Translation data - lazily loaded
let translations: Record<string, Record<string, string>> = {};

/**
 * Initialize i18n with translation data and detected locale
 */
export function initI18n(localeData: Record<Locale, Record<string, string>>, detectedLocale?: Locale): void {
  translations = localeData;

  // Use detected locale if provided and available, otherwise fall back to DEFAULT_LOCALE
  if (detectedLocale && localeData[detectedLocale]) {
    currentLocale = detectedLocale;
  } else {
    currentLocale = DEFAULT_LOCALE;
  }
}

/**
 * Set the current locale
 */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

/**
 * Get the current locale
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Translate a key to the current locale.
 * Falls back to English if translation is missing.
 *
 * @param key - Translation key in dot notation (e.g., 'common.loading')
 * @param params - Optional parameters for interpolation
 * @returns Translated string
 */
export function t(key: TranslationKey, params?: Record<string, string>): string {
  const localeData = translations[currentLocale] || translations[DEFAULT_LOCALE];
  let value = localeData?.[key];

  // Fallback to English
  if (!value && currentLocale !== DEFAULT_LOCALE) {
    value = translations[DEFAULT_LOCALE]?.[key];
  }

  // If still no value, return the key itself (helps identify missing translations)
  if (!value) {
    return key;
  }

  // Interpolate parameters
  if (params) {
    for (const [param, replacement] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${param}\\}`, 'g'), replacement);
    }
  }

  return value;
}

/**
 * Check if a translation key exists
 */
export function has(key: TranslationKey): boolean {
  return !!(translations[currentLocale]?.[key] || translations[DEFAULT_LOCALE]?.[key]);
}

// Re-export types (they are already exported above)
