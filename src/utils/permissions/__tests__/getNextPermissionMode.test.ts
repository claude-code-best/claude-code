/**
 * Tests for src/utils/permissions/getNextPermissionMode.ts
 *
 * Covers the unified permission mode cycling logic:
 *   default → acceptEdits → plan → auto → bypassPermissions → default
 *
 * After the "open auto/bypass to all users" change, there is no USER_TYPE
 * distinction — all users share the same cycle order.
 */
import { describe, expect, test } from 'bun:test'
import type { ToolPermissionContext } from '../../../Tool.js'
import type { PermissionMode } from '../PermissionMode.js'

// Inline getNextPermissionMode to avoid importing the heavy permissionSetup
// dependency chain (growthbook, settings, etc.).
// The function under test is small and pure enough to copy for testing.
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

describe('getNextPermissionMode', () => {
  // ── Full cycle ──────────────────────────────────────────────────────────

  describe('unified cycle order', () => {
    test('default → acceptEdits', () => {
      expect(getNextPermissionMode(makeContext('default'))).toBe('acceptEdits')
    })

    test('acceptEdits → plan', () => {
      expect(getNextPermissionMode(makeContext('acceptEdits'))).toBe('plan')
    })

    test('plan → auto', () => {
      expect(getNextPermissionMode(makeContext('plan'))).toBe('auto')
    })

    test('auto → bypassPermissions (when bypass available)', () => {
      expect(getNextPermissionMode(makeContext('auto'))).toBe(
        'bypassPermissions',
      )
    })

    test('bypassPermissions → default', () => {
      expect(getNextPermissionMode(makeContext('bypassPermissions'))).toBe(
        'default',
      )
    })

    test('full cycle completes back to default', () => {
      const cycle: PermissionMode[] = []
      let ctx = makeContext('default')
      for (let i = 0; i < 5; i++) {
        const next = getNextPermissionMode(ctx)
        cycle.push(next)
        ctx = makeContext(next)
      }
      expect(cycle).toEqual([
        'acceptEdits',
        'plan',
        'auto',
        'bypassPermissions',
        'default',
      ])
    })
  })

  // ── auto → default when bypass unavailable ─────────────────────────────

  describe('auto mode with bypass unavailable', () => {
    test('auto → default when isBypassPermissionsModeAvailable is false', () => {
      const ctx = makeContext('auto', {
        isBypassPermissionsModeAvailable: false,
      })
      expect(getNextPermissionMode(ctx)).toBe('default')
    })
  })

  // ── dontAsk mode ────────────────────────────────────────────────────────

  describe('dontAsk mode', () => {
    test('dontAsk → default', () => {
      expect(getNextPermissionMode(makeContext('dontAsk'))).toBe('default')
    })
  })

  // ── USER_TYPE independence ──────────────────────────────────────────────

  describe('no USER_TYPE distinction', () => {
    test('cycle order is the same regardless of USER_TYPE', () => {
      // Save original
      const originalUserType = process.env.USER_TYPE

      // Test with no USER_TYPE
      delete process.env.USER_TYPE
      const cycleNoType: PermissionMode[] = []
      let ctx = makeContext('default')
      for (let i = 0; i < 5; i++) {
        const next = getNextPermissionMode(ctx)
        cycleNoType.push(next)
        ctx = makeContext(next)
      }

      // Test with USER_TYPE=ant
      process.env.USER_TYPE = 'ant'
      const cycleAnt: PermissionMode[] = []
      ctx = makeContext('default')
      for (let i = 0; i < 5; i++) {
        const next = getNextPermissionMode(ctx)
        cycleAnt.push(next)
        ctx = makeContext(next)
      }

      // Restore
      if (originalUserType !== undefined) {
        process.env.USER_TYPE = originalUserType
      } else {
        delete process.env.USER_TYPE
      }

      // Both should produce the same cycle
      expect(cycleNoType).toEqual(cycleAnt)
      expect(cycleNoType).toEqual([
        'acceptEdits',
        'plan',
        'auto',
        'bypassPermissions',
        'default',
      ])
    })
  })

  // ── teamContext parameter ───────────────────────────────────────────────

  describe('teamContext parameter', () => {
    test('does not affect cycle when provided', () => {
      const ctx = makeContext('default')
      const teamCtx = { leadAgentId: 'agent-123' }
      expect(getNextPermissionMode(ctx, teamCtx)).toBe('acceptEdits')
    })

    test('does not affect cycle for plan mode', () => {
      const ctx = makeContext('plan')
      const teamCtx = { leadAgentId: 'agent-456' }
      expect(getNextPermissionMode(ctx, teamCtx)).toBe('auto')
    })
  })

  // ── cycle stability (no infinite loops) ─────────────────────────────────

  describe('cycle stability', () => {
    test('all modes return to default within 6 steps', () => {
      const modes: PermissionMode[] = [
        'default',
        'acceptEdits',
        'plan',
        'auto',
        'bypassPermissions',
        'dontAsk',
      ]
      for (const startMode of modes) {
        let current = startMode
        let returnedToDefault = false
        for (let i = 0; i < 6; i++) {
          current = getNextPermissionMode(makeContext(current))
          if (current === 'default') {
            returnedToDefault = true
            break
          }
        }
        expect(returnedToDefault).toBe(true)
      }
    })

    test('cycling 100 times never produces an invalid mode', () => {
      const validModes = new Set<string>([
        'default',
        'acceptEdits',
        'plan',
        'auto',
        'bypassPermissions',
        'dontAsk',
      ])
      let ctx = makeContext('default')
      for (let i = 0; i < 100; i++) {
        const next = getNextPermissionMode(ctx)
        expect(validModes.has(next)).toBe(true)
        ctx = makeContext(next)
      }
    })
  })
})
