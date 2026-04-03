/**
 * i18n initialization for Claude Code.
 * Loads translation data and initializes the i18n system.
 */

import { initI18n, type Locale } from './index.js';

// Lazy-loaded translation data
let initialized = false;

// Import translation files
import enUS from './locales/en-US.json' with { type: 'json' };
import zhCN from './locales/zh-CN.json' with { type: 'json' };

/**
 * Detect the system locale from environment variables.
 * Returns a supported Locale or undefined (falls back to default).
 */
function detectLocale(): Locale | undefined {
  const lang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '';

  // Common locale patterns: zh_CN.UTF-8, zh-CN, en_US.UTF-8, en-US, etc.
  if (lang.toLowerCase().startsWith('zh')) {
    return 'zh-CN';
  }
  if (lang.toLowerCase().startsWith('en')) {
    return 'en-US';
  }

  return undefined;
}

/**
 * Initialize i18n system.
 * Should be called early in app startup.
 * Detects system language from environment variables (LANG, LC_ALL, etc.)
 */
export function initializeI18n(): void {
  if (initialized) return;

  const detected = detectLocale();
  initI18n({
    'en-US': enUS,
    'zh-CN': zhCN,
  }, detected);

  initialized = true;
}

/**
 * Get available locales
 */
export function getAvailableLocales(): Locale[] {
  return ['en-US', 'zh-CN'];
}

/**
 * Check if a locale is available
 */
export function isLocaleAvailable(locale: string): boolean {
  return locale === 'en-US' || locale === 'zh-CN';
}
