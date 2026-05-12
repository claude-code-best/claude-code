/**
 * L2 regression tests for prepareWorkspaceApiRequest (codecov-100 audit #12):
 * pins the cleared-vs-never-set predicate that distinguishes the two error
 * messages.
 *
 * NOTE on isolation: several other test files in this repo
 * (`src/commands/vault/__tests__/api.test.ts`,
 * `src/commands/agents-platform/__tests__/agentsApi.test.ts`, etc.) call
 * `mock.module('src/utils/teleport/api.js', ...)` to stub
 * `prepareWorkspaceApiRequest`. Bun's mock registry is process-wide, so
 * full-suite imports of `../api.js` from this test file return the stubbed
 * module — we cannot exercise the real prepareWorkspaceApiRequest here.
 *
 * Workaround: we replicate the predicate logic from api.ts and pin it as
 * a pure unit test. The predicate is small and self-contained; if api.ts
 * ever changes the cleared-vs-never-set logic, both this replicated
 * function and the test must be updated together. End-to-end coverage of
 * the message text continues to come through the prepareWorkspaceApiRequest
 * call sites in the wider integration tests.
 */
import { describe, test, expect } from 'bun:test'

// ── Replicated from src/utils/teleport/api.ts (keep in sync) ────────────────
// L2 fix: detect "was cleared" (null / empty / whitespace) vs "never set"
// (undefined / missing field) so the user gets an actionable error message.
function isWorkspaceKeyCleared(rawValue: unknown): boolean {
  return (
    rawValue === null ||
    (typeof rawValue === 'string' && rawValue.trim() === '')
  )
}

describe('isWorkspaceKeyCleared (audit #12: cleared vs never-set predicate)', () => {
  test('undefined → not cleared (never set)', () => {
    expect(isWorkspaceKeyCleared(undefined)).toBe(false)
  })

  test('missing field on config object → not cleared (never set)', () => {
    const config: { workspaceApiKey?: string | null } = {}
    expect(isWorkspaceKeyCleared(config.workspaceApiKey)).toBe(false)
  })

  test('null → cleared', () => {
    expect(isWorkspaceKeyCleared(null)).toBe(true)
  })

  test('empty string → cleared', () => {
    expect(isWorkspaceKeyCleared('')).toBe(true)
  })

  test('whitespace-only string → cleared', () => {
    expect(isWorkspaceKeyCleared('   ')).toBe(true)
    expect(isWorkspaceKeyCleared('\t\n  \r')).toBe(true)
  })

  test('valid key string → not cleared', () => {
    expect(isWorkspaceKeyCleared('sk-ant-api03-validkey')).toBe(false)
  })

  test('whitespace-padded valid key → not cleared (real prepare trims and uses it)', () => {
    // The function only tests the trimmed value; non-empty after trim
    // means a usable key exists, not a cleared one.
    expect(isWorkspaceKeyCleared('  sk-ant-api03-key  ')).toBe(false)
  })

  test('non-string non-null types are conservatively treated as not-cleared', () => {
    // Defensive: only literal null + empty/whitespace strings count as
    // "cleared". Other unexpected types fall through to the standard
    // "required" message rather than misleading the user with
    // "was cleared" when the underlying state is corrupt.
    expect(isWorkspaceKeyCleared(0)).toBe(false)
    expect(isWorkspaceKeyCleared(false)).toBe(false)
    expect(isWorkspaceKeyCleared({})).toBe(false)
    expect(isWorkspaceKeyCleared([])).toBe(false)
  })
})
