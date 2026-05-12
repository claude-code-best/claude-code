import { getResolvedLanguage } from 'src/utils/language.js'
import ZH_CN_REVIEW from './zh-CN/review.txt'
import EN_REVIEW from './en/review.txt'
import ZH_CN_SECURITY_REVIEW from './zh-CN/security-review.txt'
import EN_SECURITY_REVIEW from './en/security-review.txt'

const LOCALE_MAP: Record<string, string> = { zh: 'zh-CN', en: 'en' }

const TEMPLATES: Record<string, Record<string, string>> = {
  review: { 'zh-CN': ZH_CN_REVIEW, en: EN_REVIEW },
  'security-review': { 'zh-CN': ZH_CN_SECURITY_REVIEW, en: EN_SECURITY_REVIEW },
}

export namespace CommandLocale {
  export function get(name: string): string {
    const lang = getResolvedLanguage()
    const locale = LOCALE_MAP[lang] ?? 'zh-CN'
    return TEMPLATES[name]?.[locale] ?? TEMPLATES[name]?.en ?? ''
  }
}
