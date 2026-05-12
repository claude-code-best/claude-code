import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const promptSource = readFileSync(join(__dirname, '..', 'prompt.ts'), 'utf-8')

describe('prompt.ts fork-related text verification', () => {
  test('does not contain "omit `subagent_type`" guidance', () => {
    expect(promptSource).not.toMatch(/omit.*subagent_type/)
  })

  test('contains `fork: true` in at least 3 locations (shared + whenToFork + forkExamples)', () => {
    const matches = promptSource.match(/fork: true/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(3)
  })

  test('all forkEnabled references are ternary conditions, not negated', () => {
    const lines = promptSource.split('\n')
    for (const line of lines) {
      if (
        line.includes('forkEnabled') &&
        !line.includes('const forkEnabled') &&
        !line.includes('forkEnabled =')
      ) {
        expect(line).not.toContain('!forkEnabled')
      }
    }
  })

  test('uses "non-fork" terminology instead of "fresh agent"', () => {
    expect(promptSource).toContain('non-fork')
    // "fresh agent" should not appear in fork-aware conditional text
    const freshAgentMatches = promptSource.match(/fresh agent/g)
    if (freshAgentMatches) {
      // Only allowed in comments explaining behavior, not in prompt text
      const linesWithFreshAgent = promptSource
        .split('\n')
        .filter(line => line.includes('fresh agent'))
        .map(line => line.trim())
      for (const line of linesWithFreshAgent) {
        // "fresh agent" in the context of "starts fresh" (not fork-aware) is ok
        // but "fresh agent" in forkEnabled conditional should not appear
        expect(line).not.toMatch(/fresh agent.*subagent_type/)
      }
    }
  })

  test('background task condition does not include !forkEnabled', () => {
    // The condition for showing background task instructions should not exclude fork
    const bgCondition = promptSource.match(
      /!isEnvTruthy.*isInProcessTeammate[\s\S]*?run_in_background/,
    )
    if (bgCondition) {
      expect(bgCondition[0]).not.toContain('!forkEnabled')
    }
  })
})
