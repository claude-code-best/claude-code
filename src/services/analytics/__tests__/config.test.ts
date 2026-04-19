import { afterEach, describe, expect, mock, test } from 'bun:test'

let mockedProvider: 'firstParty' | 'openai' = 'firstParty'

mock.module('../../../utils/model/providers.js', () => ({
  getAPIProvider: () => mockedProvider,
}))

const { isAnalyticsDisabled } = await import('../config.js')

describe('isAnalyticsDisabled', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalDisableTelemetry = process.env.DISABLE_TELEMETRY

  afterEach(() => {
    mockedProvider = 'firstParty'
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
    if (originalDisableTelemetry === undefined) {
      delete process.env.DISABLE_TELEMETRY
    } else {
      process.env.DISABLE_TELEMETRY = originalDisableTelemetry
    }
  })

  test('returns true for openai provider', () => {
    mockedProvider = 'openai'
    expect(isAnalyticsDisabled()).toBe(true)
  })

  test('returns false for firstParty provider with default privacy settings', () => {
    mockedProvider = 'firstParty'
    process.env.NODE_ENV = 'development'
    delete process.env.DISABLE_TELEMETRY
    expect(isAnalyticsDisabled()).toBe(false)
  })
})
