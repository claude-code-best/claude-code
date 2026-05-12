/**
 * Regression tests for /usage command — v2.1.118 upstream alignment.
 * Verifies:
 *   - /usage is primary command with aliases ["cost", "stats"]
 *   - description covers cost + stats
 *   - availability restriction removed (not claude-ai only)
 *   - cost/stats index files emit commands with matching name
 */

import { mock, describe, test, expect } from 'bun:test'

// Must mock before importing anything that pulls in bootstrap/state
import { logMock } from '../../../../tests/mocks/log.js'
mock.module('src/utils/log.ts', logMock)

import { debugMock } from '../../../../tests/mocks/debug.js'
mock.module('src/utils/debug.ts', debugMock)

mock.module('bun:bundle', () => ({ feature: () => false }))

mock.module('src/utils/auth.ts', () => ({
  isClaudeAISubscriber: () => false,
  getOAuthAccount: () => null,
}))

mock.module('src/services/claudeAiLimits.ts', () => ({
  currentLimits: { isUsingOverage: false },
}))

mock.module('src/cost-tracker.ts', () => ({
  formatTotalCost: () => 'Total cost: $0.0012',
}))

mock.module('src/utils/config.ts', () => ({
  getCurrentProjectConfig: () => ({}),
  saveCurrentProjectConfig: () => {},
  getGlobalConfig: () => ({}),
}))

// ── helpers ──────────────────────────────────────────────────────────────────

async function loadUsageCommand() {
  const mod = await import('../index.js')
  return mod.default
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('usage command — metadata', () => {
  test('name is "usage"', async () => {
    const cmd = await loadUsageCommand()
    expect(cmd.name).toBe('usage')
  })

  test('has aliases containing "cost"', async () => {
    const cmd = await loadUsageCommand()
    expect(cmd.aliases?.includes('cost')).toBe(true)
  })

  test('has aliases containing "stats"', async () => {
    const cmd = await loadUsageCommand()
    expect(cmd.aliases?.includes('stats')).toBe(true)
  })

  test('has exactly two aliases', async () => {
    const cmd = await loadUsageCommand()
    expect(cmd.aliases?.length).toBe(2)
  })

  test('aliases are ["cost", "stats"] in that order', async () => {
    const cmd = await loadUsageCommand()
    expect(cmd.aliases).toEqual(['cost', 'stats'])
  })

  test('description mentions cost', async () => {
    const cmd = await loadUsageCommand()
    expect(cmd.description.toLowerCase()).toContain('cost')
  })

  test('description mentions stat', async () => {
    const cmd = await loadUsageCommand()
    expect(cmd.description.toLowerCase()).toContain('stat')
  })

  test('is NOT restricted exclusively to claude-ai subscribers', async () => {
    const cmd = await loadUsageCommand()
    const avail = (cmd as { availability?: string[] }).availability
    const isExclusivelyClaudeAi =
      Array.isArray(avail) && avail.length === 1 && avail[0] === 'claude-ai'
    expect(isExclusivelyClaudeAi).toBe(false)
  })

  test('description mentions usage or plan', async () => {
    const cmd = await loadUsageCommand()
    const desc = cmd.description.toLowerCase()
    expect(desc.includes('usage') || desc.includes('plan')).toBe(true)
  })
})

describe('usage command — cost index is no longer standalone', () => {
  test('cost/index default name is "usage" (delegated) OR it has aliases', async () => {
    const mod = await import('../../cost/index.js')
    const cmd = mod.default
    // After the fix: cost/index either exports name='usage' with aliases,
    // or the cost command has aliases set (it's been demoted to alias)
    const isUnifiedOrAliased =
      cmd.name === 'usage' || (cmd.aliases?.includes('cost') ?? false)
    expect(isUnifiedOrAliased).toBe(true)
  })
})

describe('usage command — stats index is no longer standalone', () => {
  test('stats/index default name is "usage" (delegated) OR it has aliases', async () => {
    const mod = await import('../../stats/index.js')
    const cmd = mod.default
    const isUnifiedOrAliased =
      cmd.name === 'usage' || (cmd.aliases?.includes('stats') ?? false)
    expect(isUnifiedOrAliased).toBe(true)
  })
})
