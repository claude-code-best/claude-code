import { describe, expect, test } from 'bun:test'
import {
  searchSkills,
  tokenize,
  tokenizeAndStem,
  type SkillIndexEntry,
} from '../localSearch.js'

function makeEntry(overrides: Partial<SkillIndexEntry>): SkillIndexEntry {
  const tokens = overrides.tokens ?? []
  const tfVector = overrides.tfVector ?? buildTfVector(tokens)
  const name = overrides.name ?? 'test-skill'
  return {
    name,
    normalizedName:
      overrides.normalizedName ?? name.toLowerCase().replace(/[-_]/g, ' '),
    description: overrides.description ?? '',
    whenToUse: overrides.whenToUse,
    source: overrides.source ?? 'test',
    loadedFrom: overrides.loadedFrom,
    skillRoot: overrides.skillRoot,
    contentLength: overrides.contentLength,
    tokens,
    tfVector,
  }
}

function buildTfVector(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  const max = Math.max(...freq.values(), 1)
  const tf = new Map<string, number>()
  for (const [term, count] of freq) tf.set(term, count / max)
  return tf
}

describe('tokenize — CJK bi-gram + ASCII', () => {
  test('优化重构流程 produces five overlapping bi-grams', () => {
    const tokens = tokenize('优化重构流程')
    expect(tokens).toContain('优化')
    expect(tokens).toContain('化重')
    expect(tokens).toContain('重构')
    expect(tokens).toContain('构流')
    expect(tokens).toContain('流程')
    expect(tokens.length).toBe(5)
  })

  test('pure ASCII input retains prior behaviour (regression)', () => {
    const tokens = tokenize('Refactor TypeScript helpers')
    expect(tokens).toContain('refactor')
    expect(tokens).toContain('typescript')
    expect(tokens).toContain('helpers')
  })

  test('mixed Chinese + English is segmented on both sides', () => {
    const tokens = tokenize('优化 refactor 流程')
    expect(tokens).toContain('优化')
    expect(tokens).toContain('流程')
    expect(tokens).toContain('refactor')
    // Adjacent CJK segments are separated by ASCII content, so no cross-segment
    // bi-gram should appear.
    expect(tokens).not.toContain('化流')
  })

  test('isolated single Chinese character produces no bi-gram', () => {
    const tokens = tokenize('优 is lonely')
    expect(tokens.some(t => /[\u4e00-\u9fff]/.test(t))).toBe(false)
    expect(tokens).toContain('lonely')
  })

  test('ASCII stop words still filtered in mixed input', () => {
    const tokens = tokenize('the 优化 is fast')
    expect(tokens).not.toContain('the')
    expect(tokens).not.toContain('is')
    expect(tokens).toContain('优化')
    expect(tokens).toContain('fast')
  })
})

describe('tokenizeAndStem — CJK passes through, ASCII stemmed', () => {
  test('CJK bi-grams are not stemmed', () => {
    const tokens = tokenizeAndStem('优化流程')
    expect(tokens).toContain('优化')
    expect(tokens).toContain('化流')
    expect(tokens).toContain('流程')
  })

  test('ASCII words are stemmed while CJK survives', () => {
    const tokens = tokenizeAndStem('refactoring 重构 helpers')
    expect(tokens).toContain('refactor')
    expect(tokens).toContain('重构')
    expect(tokens).toContain('helper')
  })
})

describe('searchSkills — CJK query against skill index', () => {
  test('Chinese query against Chinese-metadata skill produces positive score', () => {
    const chineseSkillTokens = tokenizeAndStem(
      'refactor-cleaner 清理 重构 流程 的工具',
    )
    const unrelatedTokens = tokenizeAndStem(
      'database-migration tool for schema upgrades',
    )
    const index: SkillIndexEntry[] = [
      makeEntry({
        name: 'refactor-cleaner',
        description: '清理和重构流程辅助',
        tokens: chineseSkillTokens,
      }),
      makeEntry({
        name: 'database-migration',
        description: 'schema upgrade',
        tokens: unrelatedTokens,
      }),
    ]

    const results = searchSkills('优化重构流程', index, 5)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.name).toBe('refactor-cleaner')
    expect(results[0]?.score).toBeGreaterThan(0)
  })

  test('pure English query still ranks English skill first (regression)', () => {
    const refactorTokens = tokenizeAndStem(
      'refactor clean typescript code helper',
    )
    const unrelatedTokens = tokenizeAndStem(
      'security review audit vulnerabilities',
    )
    const index: SkillIndexEntry[] = [
      makeEntry({
        name: 'refactor-helper',
        description: 'refactor typescript',
        tokens: refactorTokens,
      }),
      makeEntry({
        name: 'security-review',
        description: 'security audit',
        tokens: unrelatedTokens,
      }),
    ]

    const results = searchSkills('refactor typescript', index, 5)

    expect(results[0]?.name).toBe('refactor-helper')
  })

  test('CJK query with only 1 matching bi-gram is filtered out (Proposal D)', () => {
    const promptOptTokens = tokenizeAndStem(
      'prompt-optimizer optimize prompts for better performance 当前最佳实践',
    )
    const otherTokens = tokenizeAndStem(
      'database-migration tool for schema upgrades',
    )
    const index: SkillIndexEntry[] = [
      makeEntry({
        name: 'prompt-optimizer',
        description: 'optimize prompts',
        tokens: promptOptTokens,
      }),
      makeEntry({
        name: 'database-migration',
        description: 'schema upgrade',
        tokens: otherTokens,
      }),
    ]

    const results = searchSkills('研究当前代码', index, 5)

    expect(results.length).toBe(0)
  })

  test('CJK query with 2+ matching bi-grams passes the gate', () => {
    const refactorTokens = tokenizeAndStem(
      'refactor-cleaner 代码重构 清理冗余代码',
    )
    const unrelatedTokens = tokenizeAndStem(
      'database-migration tool for schema upgrades',
    )
    const index: SkillIndexEntry[] = [
      makeEntry({
        name: 'refactor-cleaner',
        description: '代码重构清理',
        tokens: refactorTokens,
      }),
      makeEntry({
        name: 'database-migration',
        description: 'schema upgrade',
        tokens: unrelatedTokens,
      }),
    ]

    const results = searchSkills('重构代码', index, 5)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.name).toBe('refactor-cleaner')
  })

  test('exact skill name in query boosts score (Proposal C)', () => {
    const codeReviewTokens = tokenizeAndStem('code-review review code quality')
    const securityTokens = tokenizeAndStem('security-review review security')
    const index: SkillIndexEntry[] = [
      makeEntry({
        name: 'code-review',
        description: 'review code quality',
        tokens: codeReviewTokens,
      }),
      makeEntry({
        name: 'security-review',
        description: 'review security',
        tokens: securityTokens,
      }),
    ]

    const results = searchSkills('code review', index, 5)

    expect(results[0]?.name).toBe('code-review')
    expect(results[0]!.score).toBeGreaterThanOrEqual(0.75)
  })
})
