import { describe, test, expect, mock } from 'bun:test'

// Mock dependencies before importing the module under test
let mockPreferredLanguage: string | undefined
let mockSystemLocale: string | undefined

mock.module('src/utils/config.js', () => ({
  getGlobalConfig: () => ({
    preferredLanguage: mockPreferredLanguage,
  }),
}))

mock.module('src/utils/intl.js', () => ({
  getSystemLocaleLanguage: () => mockSystemLocale,
}))

const { getResolvedLanguage, getLanguageDisplayName } = await import(
  'src/utils/language.js'
)

describe('getResolvedLanguage', () => {
  test('returns en when config is explicitly en', () => {
    mockPreferredLanguage = 'en'
    mockSystemLocale = 'zh'
    expect(getResolvedLanguage()).toBe('en')
  })

  test('returns zh when config is explicitly zh', () => {
    mockPreferredLanguage = 'zh'
    mockSystemLocale = 'en'
    expect(getResolvedLanguage()).toBe('zh')
  })

  test('falls back to system locale zh when config is auto', () => {
    mockPreferredLanguage = 'auto'
    mockSystemLocale = 'zh'
    expect(getResolvedLanguage()).toBe('zh')
  })

  test('falls back to en when config is auto and system locale is not zh', () => {
    mockPreferredLanguage = 'auto'
    mockSystemLocale = 'en'
    expect(getResolvedLanguage()).toBe('en')
  })

  test('falls back to en when config is auto and system locale is undefined', () => {
    mockPreferredLanguage = 'auto'
    mockSystemLocale = undefined
    expect(getResolvedLanguage()).toBe('en')
  })

  test('falls back to auto behavior when config preferredLanguage is undefined', () => {
    mockPreferredLanguage = undefined
    mockSystemLocale = 'zh'
    expect(getResolvedLanguage()).toBe('zh')
  })

  test('defaults to en when both config and locale are undefined', () => {
    mockPreferredLanguage = undefined
    mockSystemLocale = undefined
    expect(getResolvedLanguage()).toBe('en')
  })
})

describe('getLanguageDisplayName', () => {
  test('returns Auto (follow system) for auto', () => {
    expect(getLanguageDisplayName('auto')).toBe('Auto (follow system)')
  })

  test('returns English for en', () => {
    expect(getLanguageDisplayName('en')).toBe('English')
  })

  test('returns 中文 for zh', () => {
    expect(getLanguageDisplayName('zh')).toBe('中文')
  })

  test('returns the input string for unknown language codes', () => {
    expect(getLanguageDisplayName('fr')).toBe('fr')
    expect(getLanguageDisplayName('unknown')).toBe('unknown')
  })
})
