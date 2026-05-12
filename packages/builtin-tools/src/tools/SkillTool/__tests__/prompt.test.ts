import { describe, expect, test } from 'bun:test'
import {
  MAX_LISTING_DESC_CHARS,
  formatCommandsWithinBudget,
} from '../prompt.js'
import type { Command } from 'src/types/command.js'

// Helper to build a minimal prompt Command
function makeCmd(
  name: string,
  description: string,
  whenToUse?: string,
): Command {
  return {
    type: 'prompt',
    name,
    description,
    whenToUse,
    hasUserSpecifiedDescription: false,
    allowedTools: [],
    disableModelInvocation: false,
    userInvocable: true,
    isHidden: false,
    progressMessage: 'running',
    userFacingName: () => name,
    source: 'userSettings',
    loadedFrom: 'skills',
    async getPromptForCommand() {
      return [{ type: 'text' as const, text: '' }]
    },
  } as unknown as Command
}

describe('MAX_LISTING_DESC_CHARS', () => {
  test('cap is 1536 (not the old 250)', () => {
    // Regression: v2.1.117 upgraded the per-entry description cap from 250 → 1536
    expect(MAX_LISTING_DESC_CHARS).toBe(1536)
  })

  test('description longer than 1536 chars is truncated', () => {
    const longDesc = 'x'.repeat(2000)
    const cmd = makeCmd('test-skill', longDesc)
    const result = formatCommandsWithinBudget([cmd], 200_000)
    // Should contain truncation ellipsis and must not contain the full 2000-char desc
    expect(result).toContain('…')
    // The entry itself should not exceed 1536 chars of description content
    // (the - name: prefix adds overhead we ignore here)
    expect(result.length).toBeLessThan(2000)
  })

  test('description of exactly 1536 chars is NOT truncated', () => {
    const desc = 'a'.repeat(1536)
    const cmd = makeCmd('my-skill', desc)
    const result = formatCommandsWithinBudget([cmd], 200_000)
    expect(result).not.toContain('…')
    expect(result).toContain(desc)
  })

  test('description longer than 250 but shorter than 1536 is NOT truncated by the cap', () => {
    // Regression: with old cap=250, a 300-char description would be truncated.
    // With cap=1536 it must pass through intact.
    const desc = 'b'.repeat(300)
    const cmd = makeCmd('another-skill', desc)
    const result = formatCommandsWithinBudget([cmd], 200_000)
    expect(result).toContain(desc)
  })
})
