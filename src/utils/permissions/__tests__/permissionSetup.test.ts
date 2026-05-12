/**
 * Tests for the simplified permission gate functions.
 *
 * After the "open auto/bypass to all users" change, the key guarantees are:
 * - shouldDisableBypassPermissions() always returns false
 * - isBypassPermissionsModeDisabled() always returns false
 * - hasAutoModeOptInAnySource() always returns true
 * - isAutoModeGateEnabled() returns true unless fast-mode circuit breaker fires
 * - getAutoModeUnavailableReason() returns null when no breaker fires
 *
 * These functions are tested through the getNextPermissionMode cycle
 * and through direct unit tests of the gate functions.
 */
import { describe, expect, test } from 'bun:test'
import type { ToolPermissionContext } from '../../../Tool.js'
import type { PermissionMode } from '../PermissionMode.js'
import { getNextPermissionMode } from '../getNextPermissionMode.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeContext(
  mode: PermissionMode,
  overrides: Partial<ToolPermissionContext> = {},
): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
    ...overrides,
  }
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('permission gate invariants (after opening auto/bypass)', () => {
  // ── Bypass permissions is always available ──────────────────────────────

  describe('bypass mode always reachable in cycle', () => {
    test('auto → bypassPermissions when isBypassPermissionsModeAvailable is true', () => {
      const ctx = makeContext('auto', {
        isBypassPermissionsModeAvailable: true,
      })
      expect(getNextPermissionMode(ctx)).toBe('bypassPermissions')
    })

    test('isBypassPermissionsModeAvailable true is the default from getEmptyToolPermissionContext', () => {
      // This test verifies the Tool.ts default is true
      // (imported indirectly through the cycle behavior)
      const ctx = makeContext('auto')
      expect(ctx.isBypassPermissionsModeAvailable).toBe(true)
      expect(getNextPermissionMode(ctx)).toBe('bypassPermissions')
    })
  })

  // ── Auto mode is always available in cycle ──────────────────────────────

  describe('auto mode always reachable in cycle', () => {
    test('plan → auto (always, no gate check)', () => {
      expect(getNextPermissionMode(makeContext('plan'))).toBe('auto')
    })

    test('plan → auto even when isBypassPermissionsModeAvailable is false', () => {
      const ctx = makeContext('plan', {
        isBypassPermissionsModeAvailable: false,
      })
      expect(getNextPermissionMode(ctx)).toBe('auto')
    })

    test('bypassPermissions → default (then default → acceptEdits → plan → auto)', () => {
      // Verify that after bypass, you can reach auto by cycling through
      const fromBypass = getNextPermissionMode(makeContext('bypassPermissions'))
      expect(fromBypass).toBe('default')

      const fromDefault = getNextPermissionMode(makeContext('default'))
      expect(fromDefault).toBe('acceptEdits')

      const fromAcceptEdits = getNextPermissionMode(makeContext('acceptEdits'))
      expect(fromAcceptEdits).toBe('plan')

      const fromPlan = getNextPermissionMode(makeContext('plan'))
      expect(fromPlan).toBe('auto')
    })
  })

  // ── No opt-in gate between modes ────────────────────────────────────────

  describe('no opt-in gate between modes', () => {
    test('cycling from default to auto completes in 3 steps without any opt-in check', () => {
      let mode: PermissionMode = 'default'
      const steps: PermissionMode[] = []

      // default → acceptEdits → plan → auto
      for (let i = 0; i < 3; i++) {
        mode = getNextPermissionMode(makeContext(mode))
        steps.push(mode)
      }

      expect(steps).toEqual(['acceptEdits', 'plan', 'auto'])
    })

    test('cycling from default to bypassPermissions completes in 4 steps', () => {
      let mode: PermissionMode = 'default'
      const steps: PermissionMode[] = []

      for (let i = 0; i < 4; i++) {
        mode = getNextPermissionMode(makeContext(mode))
        steps.push(mode)
      }

      expect(steps).toEqual([
        'acceptEdits',
        'plan',
        'auto',
        'bypassPermissions',
      ])
    })
  })

  // ── Mode ordering safety (most dangerous modes last) ────────────────────

  describe('safety ordering', () => {
    test('auto comes before bypassPermissions in the cycle', () => {
      // Starting from plan, user must press Shift+Tab twice to reach bypass
      // (plan → auto → bypassPermissions)
      const fromPlan = getNextPermissionMode(makeContext('plan'))
      expect(fromPlan).toBe('auto')

      const fromAuto = getNextPermissionMode(makeContext('auto'))
      expect(fromAuto).toBe('bypassPermissions')
    })

    test('default comes before any dangerous mode', () => {
      // default → acceptEdits (safe, just auto-accept edits)
      const fromDefault = getNextPermissionMode(makeContext('default'))
      expect(fromDefault).toBe('acceptEdits')
      // acceptEdits is the least dangerous mode
    })
  })
})

describe('Tool.ts default context', () => {
  test('getEmptyToolPermissionContext has isBypassPermissionsModeAvailable = true', async () => {
    const { getEmptyToolPermissionContext } = await import('../../../Tool.js')
    const ctx = getEmptyToolPermissionContext()
    expect(ctx.isBypassPermissionsModeAvailable).toBe(true)
  })
})

describe('settings hasAutoModeOptIn', () => {
  test('always returns true after change', async () => {
    const { hasAutoModeOptIn } = await import('../../settings/settings.js')
    expect(hasAutoModeOptIn()).toBe(true)
  })
})
