import { afterEach, describe, expect, test } from 'bun:test'
import {
  getPrivacyLevel,
  isEssentialTrafficOnly,
  isTelemetryDisabled,
  getEssentialTrafficOnlyReason,
} from '../privacyLevel'

describe('getPrivacyLevel', () => {
  const originalDisableNonessential =
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  const originalDisableTelemetry = process.env.DISABLE_TELEMETRY

  afterEach(() => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    delete process.env.DISABLE_TELEMETRY
    if (originalDisableNonessential !== undefined) {
      process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC =
        originalDisableNonessential
    }
    if (originalDisableTelemetry !== undefined) {
      process.env.DISABLE_TELEMETRY = originalDisableTelemetry
    }
  })

  test("returns 'default' when no env vars set", () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    delete process.env.DISABLE_TELEMETRY
    expect(getPrivacyLevel()).toBe('default')
  })

  test("returns 'essential-traffic' when CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC is set", () => {
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    delete process.env.DISABLE_TELEMETRY
    expect(getPrivacyLevel()).toBe('essential-traffic')
  })

  test("returns 'no-telemetry' when DISABLE_TELEMETRY is set", () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    process.env.DISABLE_TELEMETRY = '1'
    expect(getPrivacyLevel()).toBe('no-telemetry')
  })

  test("'essential-traffic' takes priority over 'no-telemetry'", () => {
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    process.env.DISABLE_TELEMETRY = '1'
    expect(getPrivacyLevel()).toBe('essential-traffic')
  })
})

describe('isEssentialTrafficOnly', () => {
  const original = process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC

  afterEach(() => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    if (original !== undefined)
      process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = original
  })

  test("returns true for 'essential-traffic' level", () => {
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    expect(isEssentialTrafficOnly()).toBe(true)
  })

  test("returns false for 'default' level", () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    delete process.env.DISABLE_TELEMETRY
    expect(isEssentialTrafficOnly()).toBe(false)
  })

  test("returns false for 'no-telemetry' level", () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    process.env.DISABLE_TELEMETRY = '1'
    expect(isEssentialTrafficOnly()).toBe(false)
  })
})

describe('isTelemetryDisabled', () => {
  afterEach(() => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    delete process.env.DISABLE_TELEMETRY
  })

  test("returns true for 'no-telemetry' level", () => {
    process.env.DISABLE_TELEMETRY = '1'
    expect(isTelemetryDisabled()).toBe(true)
  })

  test("returns true for 'essential-traffic' level", () => {
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    expect(isTelemetryDisabled()).toBe(true)
  })

  test("returns false for 'default' level", () => {
    expect(isTelemetryDisabled()).toBe(false)
  })
})

describe('getEssentialTrafficOnlyReason', () => {
  afterEach(() => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  })

  test('returns env var name when restricted', () => {
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    expect(getEssentialTrafficOnlyReason()).toBe(
      'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
    )
  })

  test('returns null when unrestricted', () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    expect(getEssentialTrafficOnlyReason()).toBeNull()
  })
})
