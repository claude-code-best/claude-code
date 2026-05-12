import { describe, test, expect } from 'bun:test'
import {
  getAutomationStateSnapshot,
  getAutomationStateEventPayload,
  automationStatesEqual,
} from '../services/automationState'
import type { AutomationStateResponse } from '../types/api'

// =============================================================================
// normalizeAutomationState (via getAutomationStateSnapshot)
// =============================================================================

describe('normalizeAutomationState', () => {
  test('returns undefined when metadata has no automation_state key', () => {
    expect(getAutomationStateSnapshot({})).toBeUndefined()
    expect(getAutomationStateSnapshot({ other: true })).toBeUndefined()
    expect(getAutomationStateSnapshot(null)).toBeUndefined()
    expect(getAutomationStateSnapshot(undefined)).toBeUndefined()
  })

  test('returns disabled state for null automation_state', () => {
    const result = getAutomationStateSnapshot({ automation_state: null })
    expect(result).toEqual({
      enabled: false,
      phase: null,
      next_tick_at: null,
      sleep_until: null,
    })
  })

  test('returns disabled state for non-object automation_state', () => {
    for (const val of ['string', 123, true, []]) {
      const result = getAutomationStateSnapshot({ automation_state: val })
      expect(result?.enabled).toBe(false)
    }
  })

  test('normalizes enabled: true correctly', () => {
    const result = getAutomationStateSnapshot({
      automation_state: { enabled: true },
    })
    expect(result?.enabled).toBe(true)
  })

  test('normalizes enabled to false for non-true values', () => {
    const result = getAutomationStateSnapshot({
      automation_state: { enabled: 'yes' },
    })
    expect(result?.enabled).toBe(false)
  })

  test('accepts phase: standby', () => {
    const result = getAutomationStateSnapshot({
      automation_state: { enabled: true, phase: 'standby' },
    })
    expect(result?.phase).toBe('standby')
  })

  test('accepts phase: sleeping', () => {
    const result = getAutomationStateSnapshot({
      automation_state: { enabled: true, phase: 'sleeping' },
    })
    expect(result?.phase).toBe('sleeping')
  })

  test('rejects invalid phase values', () => {
    for (const phase of ['running', 'idle', 'active', '', null]) {
      const result = getAutomationStateSnapshot({
        automation_state: { enabled: true, phase },
      })
      expect(result?.phase).toBeNull()
    }
  })

  test('normalizes next_tick_at as number', () => {
    const result = getAutomationStateSnapshot({
      automation_state: { enabled: true, next_tick_at: 12345 },
    })
    expect(result?.next_tick_at).toBe(12345)
  })

  test('normalizes next_tick_at as null for non-number', () => {
    const result = getAutomationStateSnapshot({
      automation_state: { enabled: true, next_tick_at: 'soon' },
    })
    expect(result?.next_tick_at).toBeNull()
  })

  test('normalizes sleep_until as number', () => {
    const result = getAutomationStateSnapshot({
      automation_state: { enabled: true, sleep_until: 99999 },
    })
    expect(result?.sleep_until).toBe(99999)
  })

  test('normalizes sleep_until as null for non-number', () => {
    const result = getAutomationStateSnapshot({
      automation_state: { enabled: true, sleep_until: false },
    })
    expect(result?.sleep_until).toBeNull()
  })

  test('fully normalizes a complete valid state', () => {
    const result = getAutomationStateSnapshot({
      automation_state: {
        enabled: true,
        phase: 'sleeping',
        next_tick_at: 100,
        sleep_until: 200,
      },
    })
    expect(result).toEqual({
      enabled: true,
      phase: 'sleeping',
      next_tick_at: 100,
      sleep_until: 200,
    })
  })
})

// =============================================================================
// getAutomationStateEventPayload
// =============================================================================

describe('getAutomationStateEventPayload', () => {
  test('returns disabled default when no automation_state in metadata', () => {
    const result = getAutomationStateEventPayload({})
    expect(result).toEqual({
      enabled: false,
      phase: null,
      next_tick_at: null,
      sleep_until: null,
    })
  })

  test('returns disabled default for null metadata', () => {
    const result = getAutomationStateEventPayload(null)
    expect(result).toEqual({
      enabled: false,
      phase: null,
      next_tick_at: null,
      sleep_until: null,
    })
  })

  test('returns normalized state when automation_state present', () => {
    const result = getAutomationStateEventPayload({
      automation_state: {
        enabled: true,
        phase: 'standby',
        next_tick_at: 50,
        sleep_until: 60,
      },
    })
    expect(result).toEqual({
      enabled: true,
      phase: 'standby',
      next_tick_at: 50,
      sleep_until: 60,
    })
  })

  test('returns a new object each call (not frozen reference)', () => {
    const a = getAutomationStateEventPayload({})
    const b = getAutomationStateEventPayload({})
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })
})

// =============================================================================
// automationStatesEqual
// =============================================================================

describe('automationStatesEqual', () => {
  const base: AutomationStateResponse = {
    enabled: true,
    phase: 'standby',
    next_tick_at: 100,
    sleep_until: 200,
  }

  test('returns true for identical states', () => {
    expect(automationStatesEqual(base, { ...base })).toBe(true)
  })

  test('returns false when enabled differs', () => {
    expect(automationStatesEqual(base, { ...base, enabled: false })).toBe(false)
  })

  test('returns false when phase differs', () => {
    expect(automationStatesEqual(base, { ...base, phase: 'sleeping' })).toBe(
      false,
    )
    expect(automationStatesEqual(base, { ...base, phase: null })).toBe(false)
  })

  test('returns false when next_tick_at differs', () => {
    expect(automationStatesEqual(base, { ...base, next_tick_at: 999 })).toBe(
      false,
    )
    expect(automationStatesEqual(base, { ...base, next_tick_at: null })).toBe(
      false,
    )
  })

  test('returns false when sleep_until differs', () => {
    expect(automationStatesEqual(base, { ...base, sleep_until: 999 })).toBe(
      false,
    )
    expect(automationStatesEqual(base, { ...base, sleep_until: null })).toBe(
      false,
    )
  })

  test('returns true when both are disabled defaults', () => {
    const disabled: AutomationStateResponse = {
      enabled: false,
      phase: null,
      next_tick_at: null,
      sleep_until: null,
    }
    expect(automationStatesEqual(disabled, { ...disabled })).toBe(true)
  })
})
